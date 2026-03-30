import { Router } from 'express';
import {
  signup,
  login,
  refreshAccessToken,
  joinHousehold,
  createChildAccount,
  logout,
  regenerateInviteCode,
} from '../services/auth';
import { requireAuth, requireParent } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

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
      },
    });
  } catch (err) {
    console.error('GET /auth/me error:', err);
    res.status(500).json({ message: 'Failed to fetch user info' });
  }
});
