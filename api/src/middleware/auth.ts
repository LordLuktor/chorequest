import { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from '../services/auth';

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      householdId?: string;
    }
  }
}

/**
 * Requires a valid JWT in the Authorization header.
 * Sets req.user and req.householdId.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    req.householdId = payload.hid;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Requires the authenticated user to be a parent.
 * Must be used AFTER requireAuth.
 */
export function requireParent(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'parent') {
    res.status(403).json({ message: 'Parent access required' });
    return;
  }
  next();
}
