import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db';
import fs from 'fs';

// ── JWT Secret ───────────────────────────────────────────────────
function getJwtSecret(): string {
  const secretPath = '/run/secrets/chorequest_jwt_secret';
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf8').trim();
  }
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';
}

const JWT_SECRET = getJwtSecret();
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;

// ── Types ────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;   // user id
  hid: string;   // household id
  role: string;  // 'parent' | 'child'
  mid: number;   // member id
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    username: string | null;
    displayName: string;
  };
  household: {
    id: string;
    name: string;
  };
  member: {
    id: number;
    role: string;
  };
}

// ── Helpers ──────────────────────────────────────────────────────
function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

async function generateRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await db('refresh_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return token;
}

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function buildAuthResult(user: any, member: any, household: any): Promise<AuthResult> {
  const payload: JwtPayload = {
    sub: user.id,
    hid: household.id,
    role: member.role,
    mid: member.id,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
    },
    household: {
      id: household.id,
      name: household.name,
    },
    member: {
      id: member.id,
      role: member.role,
    },
  };
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Sign up a new parent user + create household
 */
export async function signup(params: {
  email?: string;
  username?: string;
  password: string;
  displayName: string;
  householdName: string;
}): Promise<AuthResult> {
  const { email, username, password, displayName, householdName } = params;

  if (!email && !username) {
    throw new Error('Either email or username is required');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!displayName || displayName.trim().length === 0) {
    throw new Error('Display name is required');
  }
  if (!householdName || householdName.trim().length === 0) {
    throw new Error('Household name is required');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const [user] = await db('users')
    .insert({
      email: email?.toLowerCase().trim() || null,
      username: username?.toLowerCase().trim() || null,
      password_hash: passwordHash,
      display_name: displayName.trim(),
      is_managed: false,
    })
    .returning('*');

  // Create household
  const [household] = await db('households')
    .insert({
      name: householdName.trim(),
      invite_code: generateInviteCode(),
      invite_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning('*');

  // Create member linked to user and household
  const [member] = await db('household_members')
    .insert({
      name: displayName.trim(),
      household_id: household.id,
      user_id: user.id,
      role: 'parent',
      avatar_color: '#3B82F6',
    })
    .returning('*');

  // Create default allowance settings for household
  await db('allowance_settings')
    .insert({
      household_id: household.id,
      rate_per_point: 0,
      all_or_nothing: false,
      enabled: false,
    })
    .onConflict(['household_id'])
    .ignore();

  return buildAuthResult(user, member, household);
}

/**
 * Login with email/username + password
 */
export async function login(params: {
  identifier: string;  // email or username
  password: string;
}): Promise<AuthResult> {
  const { identifier, password } = params;
  const id = identifier.toLowerCase().trim();

  // Look up user by email or username
  const user = await db('users')
    .where('email', id)
    .orWhere('username', id)
    .first();

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw new Error('Invalid credentials');
  }

  // Get member + household
  const member = await db('household_members')
    .where('user_id', user.id)
    .first();

  if (!member) {
    throw new Error('User is not a member of any household');
  }

  const household = await db('households')
    .where('id', member.household_id)
    .first();

  if (!household) {
    throw new Error('Household not found');
  }

  return buildAuthResult(user, member, household);
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const stored = await db('refresh_tokens')
    .where('token_hash', tokenHash)
    .where('expires_at', '>', new Date())
    .first();

  if (!stored) {
    throw new Error('Invalid or expired refresh token');
  }

  // Get user, member, household
  const user = await db('users').where('id', stored.user_id).first();
  if (!user) throw new Error('User not found');

  const member = await db('household_members').where('user_id', user.id).first();
  if (!member) throw new Error('Member not found');

  const household = await db('households').where('id', member.household_id).first();
  if (!household) throw new Error('Household not found');

  const payload: JwtPayload = {
    sub: user.id,
    hid: household.id,
    role: member.role,
    mid: member.id,
  };

  return { accessToken: generateAccessToken(payload) };
}

/**
 * Join a household via invite code
 */
export async function joinHousehold(params: {
  inviteCode: string;
  email?: string;
  username?: string;
  password: string;
  displayName: string;
}): Promise<AuthResult> {
  const { inviteCode, email, username, password, displayName } = params;

  if (!email && !username) {
    throw new Error('Either email or username is required');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Find household by invite code
  const household = await db('households')
    .where('invite_code', inviteCode.toUpperCase().trim())
    .where('invite_expires_at', '>', new Date())
    .first();

  if (!household) {
    throw new Error('Invalid or expired invite code');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db('users')
    .insert({
      email: email?.toLowerCase().trim() || null,
      username: username?.toLowerCase().trim() || null,
      password_hash: passwordHash,
      display_name: displayName.trim(),
      is_managed: false,
    })
    .returning('*');

  const [member] = await db('household_members')
    .insert({
      name: displayName.trim(),
      household_id: household.id,
      user_id: user.id,
      role: 'child',
      avatar_color: ['#F97316', '#8B5CF6', '#22C55E', '#EF4444', '#3B82F6'][
        Math.floor(Math.random() * 5)
      ],
    })
    .returning('*');

  return buildAuthResult(user, member, household);
}

/**
 * Parent creates a managed child account (no email required)
 */
export async function createChildAccount(params: {
  parentUserId: string;
  householdId: string;
  username: string;
  password: string;
  displayName: string;
  avatarColor?: string;
}): Promise<{ user: any; member: any }> {
  const { parentUserId, householdId, username, password, displayName, avatarColor } = params;

  // Verify parent belongs to this household and is a parent
  const parentMember = await db('household_members')
    .where({ user_id: parentUserId, household_id: householdId, role: 'parent' })
    .first();

  if (!parentMember) {
    throw new Error('Only parents can create child accounts');
  }

  if (!username || username.trim().length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db('users')
    .insert({
      username: username.toLowerCase().trim(),
      password_hash: passwordHash,
      display_name: displayName.trim(),
      is_managed: true,
    })
    .returning('*');

  const colorRegex = /^#[0-9A-Fa-f]{6}$/;
  const color = avatarColor && colorRegex.test(avatarColor) ? avatarColor : '#8B5CF6';

  const [member] = await db('household_members')
    .insert({
      name: displayName.trim(),
      household_id: householdId,
      user_id: user.id,
      role: 'child',
      avatar_color: color,
    })
    .returning('*');

  return { user, member };
}

/**
 * Invalidate a refresh token (logout)
 */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db('refresh_tokens').where('token_hash', tokenHash).delete();
}

/**
 * Clean up expired refresh tokens (called periodically)
 */
export async function cleanExpiredTokens(): Promise<void> {
  await db('refresh_tokens').where('expires_at', '<', new Date()).delete();
}

/**
 * Verify a JWT and return the payload
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Regenerate invite code for a household
 */
export async function regenerateInviteCode(householdId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db('households')
    .where('id', householdId)
    .update({ invite_code: code, invite_expires_at: expiresAt });

  return { code, expiresAt };
}
