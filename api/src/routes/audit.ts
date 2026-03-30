import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get('/', async (req, res) => {
  try {
    const { member, action, start, end, limit, offset } = req.query;

    let query = db('audit_log as a')
      .leftJoin('household_members as m', 'a.member_id', 'm.id')
      .where('a.household_id', req.householdId)
      .select('a.*', 'm.name as member_name', 'm.avatar_color as member_color')
      .orderBy('a.created_at', 'desc');

    if (member) query = query.where('a.member_id', parseInt(member as string));
    if (action) query = query.where('a.action', action as string);
    if (start) query = query.where('a.created_at', '>=', start as string);
    if (end) query = query.where('a.created_at', '<=', end as string);
    query = query.limit(Math.min(parseInt(limit as string) || 50, 200));
    if (offset) query = query.offset(parseInt(offset as string));

    const entries = await query;
    res.json(entries);
  } catch (err) {
    console.error('GET /audit error:', err);
    res.status(500).json({ message: 'Failed to fetch audit log' });
  }
});
