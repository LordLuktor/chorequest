import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  signup,
  login,
  pinLogin,
  refreshAccessToken,
  joinHousehold,
  createChildAccount,
  logout,
  regenerateInviteCode,
} from '../services/auth';
import { sendPasswordResetEmail } from '../services/email';
import { requireAuth, requireParent } from '../middleware/auth';
import rateLimit from 'express-rate-limit';
import db from '../db';

export const authRouter = Router();

// Stricter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

authRouter.use(authLimiter);

// ── Signup (creates user + household) ────────────────────────────
authRouter.post('/signup', async (req, res) => {
  try {
    const { email, username, password, displayName, householdName } = req.body;
    const result = await signup({ email, username, password, displayName, householdName });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'Email or username already exists' });
      return;
    }
    console.error('POST /auth/signup error:', err);
    res.status(400).json({ message: err.message || 'Signup failed' });
  }
});

// ── Login ────────────────────────────────────────────────────────
authRouter.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      res.status(400).json({ message: 'Email/username and password are required' });
      return;
    }
    const result = await login({ identifier, password });
    res.json(result);
  } catch (err: any) {
    console.error('POST /auth/login error:', err);
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// ── Refresh token ────────────────────────────────────────────────
authRouter.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ message: 'Refresh token is required' });
      return;
    }
    const result = await refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

// ── Join household via invite code ───────────────────────────────
authRouter.post('/join', async (req, res) => {
  try {
    const { inviteCode, email, username, password, displayName } = req.body;
    if (!inviteCode) {
      res.status(400).json({ message: 'Invite code is required' });
      return;
    }
    const result = await joinHousehold({ inviteCode, email, username, password, displayName });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'Email or username already exists' });
      return;
    }
    console.error('POST /auth/join error:', err);
    res.status(400).json({ message: err.message || 'Failed to join household' });
  }
});

// ── Create child account (parent only) ───────────────────────────
authRouter.post('/create-child', requireAuth, requireParent, async (req, res) => {
  try {
    const { username, password, displayName, avatarColor } = req.body;
    const result = await createChildAccount({
      parentUserId: req.user!.sub,
      householdId: req.user!.hid,
      username,
      password,
      displayName,
      avatarColor,
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'Username already exists' });
      return;
    }
    console.error('POST /auth/create-child error:', err);
    res.status(400).json({ message: err.message || 'Failed to create child account' });
  }
});

// ── Update member email (parent only) ───────────────────────────
authRouter.post('/update-email', requireAuth, requireParent, async (req, res) => {
  try {
    const { memberId, email } = req.body;
    if (!memberId) {
      res.status(400).json({ message: 'memberId is required' });
      return;
    }
    const member = await db('household_members')
      .where({ id: memberId, household_id: req.user!.hid })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }
    const trimmed = email ? email.trim().toLowerCase() : null;
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      res.status(400).json({ message: 'Invalid email format' });
      return;
    }
    await db('users').where('id', member.user_id).update({ email: trimmed, updated_at: db.fn.now() });
    res.json({ message: 'Email updated' });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }
    console.error('POST /auth/update-email error:', err);
    res.status(500).json({ message: 'Failed to update email' });
  }
});

// ── Reset member password (parent only) ─────────────────────────
authRouter.post('/reset-password', requireAuth, requireParent, async (req, res) => {
  try {
    const { memberId, newPassword } = req.body;
    if (!memberId || !newPassword) {
      res.status(400).json({ message: 'memberId and newPassword are required' });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ message: 'Password must be at least 4 characters' });
      return;
    }
    // Verify member belongs to this household
    const member = await db('household_members')
      .where({ id: memberId, household_id: req.user!.hid })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(newPassword, 12);
    await db('users').where('id', member.user_id).update({ password_hash: hash });
    res.json({ message: 'Password updated' });
  } catch (err: any) {
    console.error('POST /auth/reset-password error:', err);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ── Forgot password (unauthenticated) ───────────────────────────
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // strict limit to prevent abuse
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many password reset requests, please try again later' },
});

authRouter.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      // Always return success to prevent email enumeration
      res.json({ message: 'If that email is registered, a reset link has been sent.' });
      return;
    }

    const trimmedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      res.json({ message: 'If that email is registered, a reset link has been sent.' });
      return;
    }

    const db = (await import('../db')).default;

    // Look up user — but always return the same response regardless
    const user = await db('users').where('email', trimmedEmail).first();

    if (user) {
      // Delete any existing tokens for this user
      await db('password_reset_tokens').where('user_id', user.id).delete();

      // Generate a random token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db('password_reset_tokens').insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      // Send email — don't let failure leak to the client
      try {
        await sendPasswordResetEmail(trimmedEmail, rawToken, user.display_name);
      } catch (emailErr) {
        console.error('Failed to send password reset email:', emailErr);
      }
    }

    // Always same response — no email enumeration
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error('POST /auth/forgot-password error:', err);
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  }
});

// ── Reset password via token (unauthenticated) ─────────────────
const resetTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

authRouter.post('/reset-password-token', resetTokenLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ message: 'Reset token is required' });
      return;
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters' });
      return;
    }

    const db = (await import('../db')).default;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Look up the token
    const stored = await db('password_reset_tokens')
      .where('token_hash', tokenHash)
      .where('expires_at', '>', new Date())
      .first();

    if (!stored) {
      res.status(400).json({ message: 'Invalid or expired reset link. Please request a new one.' });
      return;
    }

    // Update the user's password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db('users').where('id', stored.user_id).update({
      password_hash: passwordHash,
      updated_at: db.fn.now(),
    });

    // Delete the used token (and any others for this user)
    await db('password_reset_tokens').where('user_id', stored.user_id).delete();

    // Also invalidate all refresh tokens so they must re-login
    await db('refresh_tokens').where('user_id', stored.user_id).delete();

    res.json({ message: 'Password has been reset. You can now sign in with your new password.' });
  } catch (err) {
    console.error('POST /auth/reset-password-token error:', err);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// ── PIN login (display accounts) ────────────────────────────────
const pinLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many PIN attempts, please try again later' },
});

authRouter.post('/pin-login', pinLoginLimiter, async (req, res) => {
  try {
    const { householdId, pin } = req.body;

    if (!householdId || typeof householdId !== 'string') {
      res.status(400).json({ message: 'householdId is required' });
      return;
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ message: 'A 4-digit PIN is required' });
      return;
    }

    const result = await pinLogin({ householdCode: householdId, pin });
    res.json(result);
  } catch (err: any) {
    console.error('POST /auth/pin-login error:', err);
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// ── Create display account (parent only) ────────────────────────
authRouter.post('/create-display', requireAuth, requireParent, async (req, res) => {
  try {
    const { name, pin } = req.body;
    const householdId = req.user!.hid;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'Name is required' });
      return;
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ message: 'A 4-digit PIN is required' });
      return;
    }

    const sanitizedName = name.trim().slice(0, 50);
    const pinHash = await bcrypt.hash(pin, 12);

    // Generate a unique username for the display account
    const slug = sanitizedName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'display';
    const username = `display-${slug}-${Date.now().toString(36)}`;

    // Use a transaction to ensure user + member are created atomically
    const result = await db.transaction(async (trx) => {
      const [user] = await trx('users')
        .insert({
          username,
          password_hash: pinHash,
          display_name: sanitizedName,
          is_managed: true,
        })
        .returning('*');

      const [member] = await trx('household_members')
        .insert({
          name: sanitizedName,
          household_id: householdId,
          user_id: user.id,
          role: 'display',
          avatar_color: '#64748b', // slate gray for display accounts
        })
        .returning('*');

      return { user, member };
    });

    res.status(201).json({ user: { id: result.user.id, username: result.user.username }, member: result.member });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'Username already exists' });
      return;
    }
    console.error('POST /auth/create-display error:', err);
    res.status(400).json({ message: err.message || 'Failed to create display account' });
  }
});

// ── Reset display PIN (parent only) ─────────────────────────────
authRouter.post('/reset-display-pin', requireAuth, requireParent, async (req, res) => {
  try {
    const { memberId, pin } = req.body;
    if (!memberId || typeof memberId !== 'number') {
      res.status(400).json({ message: 'memberId is required' });
      return;
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ message: 'A 4-digit PIN is required' });
      return;
    }

    // Verify member belongs to this household and is a display account
    const member = await db('household_members')
      .where({ id: memberId, household_id: req.user!.hid, role: 'display' })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Display account not found' });
      return;
    }

    const pinHash = await bcrypt.hash(pin, 12);

    if (member.user_id) {
      // Normal path: update existing user's password
      await db('users').where('id', member.user_id).update({ password_hash: pinHash });
    } else {
      // Self-heal: display member has no backing user — create one
      const slug = member.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'display';
      const username = `display-${slug}-${Date.now().toString(36)}`;

      await db.transaction(async (trx) => {
        const [user] = await trx('users')
          .insert({
            username,
            password_hash: pinHash,
            display_name: member.name,
            is_managed: true,
          })
          .returning('*');

        await trx('household_members')
          .where({ id: memberId })
          .update({ user_id: user.id });
      });
    }

    res.json({ message: 'PIN updated' });
  } catch (err: any) {
    console.error('POST /auth/reset-display-pin error:', err);
    res.status(500).json({ message: 'Failed to reset PIN' });
  }
});

// ── Logout ───────────────────────────────────────────────────────
authRouter.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await logout(refreshToken);
    res.json({ message: 'Logged out' });
  } catch {
    res.json({ message: 'Logged out' });
  }
});

// ── Regenerate invite code (parent only) ─────────────────────────
authRouter.post('/invite', requireAuth, requireParent, async (req, res) => {
  try {
    const result = await regenerateInviteCode(req.user!.hid);
    res.json(result);
  } catch (err) {
    console.error('POST /auth/invite error:', err);
    res.status(500).json({ message: 'Failed to regenerate invite code' });
  }
});

// ── Get current user info ────────────────────────────────────────
authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const db = (await import('../db')).default;
    const user = await db('users').where('id', req.user!.sub).first();
    const member = await db('household_members').where('id', req.user!.mid).first();
    const household = await db('households').where('id', req.user!.hid).first();

    if (!user || !member || !household) {
      res.status(404).json({ message: 'User data not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        isManaged: user.is_managed,
      },
      household: {
        id: household.id,
        name: household.name,
        inviteCode: member.role === 'parent' ? household.invite_code : undefined,
        inviteExpiresAt: member.role === 'parent' ? household.invite_expires_at : undefined,
      },
      member: {
        id: member.id,
        name: member.name,
        role: member.role,
        avatarColor: member.avatar_color,
        easyMode: member.easy_mode || false,
      },
    });
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ message: 'Failed to fetch user info' });
  }
});

// ── Export user data ────────────────────────────────────────────
authRouter.get('/export', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.sub;
    const householdId = req.user!.hid;
    const memberId = req.user!.mid;

    const user = await db('users')
      .where('id', userId)
      .select('email', 'username', 'display_name', 'created_at')
      .first();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const household = await db('households')
      .where('id', householdId)
      .select('id', 'name', 'timezone', 'created_at')
      .first();

    const members = await db('household_members')
      .where('household_id', householdId)
      .select('id', 'name', 'role', 'avatar_color', 'points_total', 'allowance_balance', 'created_at');

    const taskTemplates = await db('task_templates')
      .where('household_id', householdId)
      .select('*');

    const taskInstances = await db('task_instances')
      .where('household_id', householdId)
      .select('*');

    const allowanceSettings = await db('allowance_settings')
      .where('household_id', householdId)
      .first();

    const allowanceLedger = await db('allowance_ledger')
      .where('household_id', householdId)
      .select('*');

    const shoppingItems = await db('shopping_items')
      .where('household_id', householdId)
      .select('*');

    const rewards = await db('rewards')
      .where('household_id', householdId)
      .select('*');

    const rewardRedemptions = await db('reward_redemptions')
      .where('household_id', householdId)
      .select('*');

    const rewardRequests = await db('reward_requests')
      .where('household_id', householdId)
      .select('*');

    const sosAlerts = await db('sos_alerts')
      .where('household_id', householdId)
      .select('*');

    const checkinRequests = await db('checkin_requests')
      .where('household_id', householdId)
      .select('*');

    const memberLocations = await db('member_locations')
      .where('household_id', householdId)
      .select('*');

    const memberIds = members.map((m: any) => m.id);
    const memberAchievements = await db('member_achievements')
      .whereIn('member_id', memberIds)
      .select('member_id', 'achievement_id', 'unlocked_at');

    const achievementIds = memberAchievements.map((a: any) => a.achievement_id);
    const achievements = achievementIds.length > 0
      ? await db('achievements').whereIn('id', achievementIds).select('*')
      : [];

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: {
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        createdAt: user.created_at,
      },
      household: {
        ...household,
        members,
      },
      taskTemplates,
      taskInstances,
      allowanceSettings: allowanceSettings || null,
      allowanceLedger,
      shoppingItems,
      rewards,
      rewardRedemptions,
      rewardRequests,
      sosAlerts,
      checkinRequests,
      memberLocations,
      achievements: {
        definitions: achievements,
        memberProgress: memberAchievements,
      },
    };

    res.setHeader('Content-Disposition', 'attachment; filename=chorequest-export.json');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    console.error('GET /auth/export error:', err);
    res.status(500).json({ message: 'Failed to export data' });
  }
});

// ── Delete account ──────────────────────────────────────────────
authRouter.delete('/account', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.sub;
    const householdId = req.user!.hid;
    const { confirmPassword } = req.body;

    if (!confirmPassword || typeof confirmPassword !== 'string') {
      res.status(400).json({ message: 'Password confirmation is required' });
      return;
    }

    // Verify password
    const user = await db('users').where('id', userId).first();
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const validPassword = await bcrypt.compare(confirmPassword, user.password_hash);
    if (!validPassword) {
      res.status(401).json({ message: 'Incorrect password' });
      return;
    }

    // Check if user is the last parent in the household
    const parentCount = await db('household_members')
      .where({ household_id: householdId, role: 'parent' })
      .count('id as count')
      .first();

    const myMember = await db('household_members')
      .where({ user_id: userId, household_id: householdId })
      .first();

    const isLastParent =
      myMember?.role === 'parent' &&
      parseInt(String(parentCount?.count || '0'), 10) <= 1;

    await db.transaction(async (trx) => {
      if (isLastParent) {
        // Delete ALL household data in correct FK order
        const householdMemberIds = (
          await trx('household_members')
            .where('household_id', householdId)
            .select('id')
        ).map((m: any) => m.id);

        const householdUserIds = (
          await trx('household_members')
            .where('household_id', householdId)
            .whereNotNull('user_id')
            .select('user_id')
        ).map((m: any) => m.user_id);

        // Tables referencing household_members (by member_id or similar FK)
        await trx('member_achievements')
          .whereIn('member_id', householdMemberIds)
          .delete();
        await trx('member_locations')
          .where('household_id', householdId)
          .delete();
        await trx('push_subscriptions')
          .where('household_id', householdId)
          .delete();
        await trx('audit_log')
          .where('household_id', householdId)
          .delete();

        // Safety tables
        await trx('sos_alerts')
          .where('household_id', householdId)
          .delete();
        await trx('checkin_requests')
          .where('household_id', householdId)
          .delete();

        // Geofences
        const geofenceIds = (
          await trx('geofences')
            .where('household_id', householdId)
            .select('id')
        ).map((g: any) => g.id);
        if (geofenceIds.length > 0) {
          await trx('geofence_members')
            .whereIn('geofence_id', geofenceIds)
            .delete();
        }
        await trx('geofences')
          .where('household_id', householdId)
          .delete();

        // Rewards
        const rewardIds = (
          await trx('rewards')
            .where('household_id', householdId)
            .select('id')
        ).map((r: any) => r.id);
        if (rewardIds.length > 0) {
          await trx('reward_redemptions')
            .whereIn('reward_id', rewardIds)
            .delete();
        }
        await trx('reward_requests')
          .where('household_id', householdId)
          .delete();
        await trx('rewards')
          .where('household_id', householdId)
          .delete();

        // Shopping
        await trx('shopping_items')
          .where('household_id', householdId)
          .delete();

        // Tasks (instances first due to FK to templates)
        await trx('task_instances')
          .where('household_id', householdId)
          .delete();
        await trx('task_templates')
          .where('household_id', householdId)
          .delete();

        // Allowance
        await trx('allowance_ledger')
          .where('household_id', householdId)
          .delete();
        await trx('allowance_settings')
          .where('household_id', householdId)
          .delete();

        // Refresh tokens for all household users
        if (householdUserIds.length > 0) {
          await trx('refresh_tokens')
            .whereIn('user_id', householdUserIds)
            .delete();
          // Password reset tokens
          const hasResetTokens = await trx.schema.hasTable('password_reset_tokens');
          if (hasResetTokens) {
            await trx('password_reset_tokens')
              .whereIn('user_id', householdUserIds)
              .delete();
          }
        }

        // Household members then users
        await trx('household_members')
          .where('household_id', householdId)
          .delete();
        if (householdUserIds.length > 0) {
          await trx('users')
            .whereIn('id', householdUserIds)
            .delete();
        }

        // Finally the household itself
        await trx('households')
          .where('id', householdId)
          .delete();
      } else {
        // Non-last-parent: delete only this user's account + member entry
        await trx('refresh_tokens')
          .where('user_id', userId)
          .delete();
        const hasResetTokens = await trx.schema.hasTable('password_reset_tokens');
        if (hasResetTokens) {
          await trx('password_reset_tokens')
            .where('user_id', userId)
            .delete();
        }

        if (myMember) {
          await trx('member_achievements')
            .where('member_id', myMember.id)
            .delete();
          await trx('member_locations')
            .where('member_id', myMember.id)
            .delete();
          await trx('push_subscriptions')
            .where('member_id', myMember.id)
            .delete();
          await trx('household_members')
            .where('id', myMember.id)
            .delete();
        }

        await trx('users')
          .where('id', userId)
          .delete();
      }
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('DELETE /auth/account error:', err);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// ── Set user PIN (parent sets for any member) ───────────────────
authRouter.post('/set-user-pin', requireAuth, requireParent, async (req, res) => {
  try {
    const { memberId, pin } = req.body;
    if (!memberId || !pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ message: 'memberId and a 4-digit PIN are required' });
      return;
    }
    const member = await db('household_members')
      .where({ id: memberId, household_id: req.user!.hid })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }
    const pinHash = await bcrypt.hash(pin, 12);
    await db('household_members').where({ id: memberId }).update({ pin_hash: pinHash });
    res.json({ message: 'PIN set' });
  } catch (err) {
    console.error('POST /auth/set-user-pin error:', err);
    res.status(500).json({ message: 'Failed to set PIN' });
  }
});

// ── Verify user PIN (display device verifies a member's PIN) ────
authRouter.post('/verify-pin', requireAuth, async (req, res) => {
  try {
    const { memberId, pin } = req.body;
    if (!memberId || !pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ message: 'memberId and PIN are required' });
      return;
    }
    const member = await db('household_members')
      .where({ id: memberId, household_id: req.user!.hid })
      .first();
    if (!member || !member.pin_hash) {
      res.status(400).json({ message: 'Member has no PIN set' });
      return;
    }
    const valid = await bcrypt.compare(pin, member.pin_hash);
    if (!valid) {
      res.status(401).json({ message: 'Incorrect PIN' });
      return;
    }
    res.json({ message: 'PIN verified', memberId: member.id, memberName: member.name });
  } catch (err) {
    console.error('POST /auth/verify-pin error:', err);
    res.status(500).json({ message: 'Failed to verify PIN' });
  }
});

// ── Get members with PIN status (for display mode) ──────────────
authRouter.get('/pin-status', requireAuth, async (req, res) => {
  try {
    const members = await db('household_members')
      .where({ household_id: req.user!.hid })
      .whereNot('role', 'display')
      .select('id', 'name', 'avatar_color', 'role', db.raw("CASE WHEN pin_hash IS NOT NULL THEN true ELSE false END as has_pin"));
    res.json(members);
  } catch (err) {
    console.error('GET /auth/pin-status error:', err);
    res.status(500).json({ message: 'Failed to fetch PIN status' });
  }
});
