import { Router } from 'express';
import db from '../db';
import { getSettings, recordPayout } from '../services/allowance';
import { requireAuth } from '../middleware/auth';

export const allowanceRouter = Router();
allowanceRouter.use(requireAuth);

// Get allowance settings
allowanceRouter.get('/settings', async (req, res) => {
  try {
    const settings = await db('allowance_settings').where('household_id', req.householdId).first();
    res.json(settings || { rate_per_point: 1.00, all_or_nothing: false, enabled: true });
  } catch (err) {
    console.error('GET /allowance/settings error:', err);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// Update allowance settings (parent only)
allowanceRouter.put('/settings', async (req, res) => {
  try {
    const { member_id } = req.body;
    if (member_id) {
      const member = await db('household_members').where({ id: member_id, household_id: req.householdId }).first();
      if (!member?.is_parent) {
        res.status(403).json({ message: 'Only parents can modify allowance settings' });
        return;
      }
    }

    const allowed = ['rate_per_point', 'all_or_nothing', 'enabled'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (updates.rate_per_point !== undefined) {
      updates.rate_per_point = Math.max(0, Math.min(100, parseFloat(updates.rate_per_point) || 1));
    }
    updates.updated_at = db.fn.now();

    await db('allowance_settings').where({ household_id: req.householdId }).update(updates);
    const settings = await db('allowance_settings').where('household_id', req.householdId).first();
    res.json(settings);
  } catch (err) {
    console.error('PUT /allowance/settings error:', err);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

// Get all members' balances
allowanceRouter.get('/balances', async (req, res) => {
  try {
    const members = await db('household_members')
      .where('household_id', req.householdId)
      .select('id', 'name', 'avatar_color', 'allowance_balance', 'is_parent')
      .orderBy('name');
    res.json(members);
  } catch (err) {
    console.error('GET /allowance/balances error:', err);
    res.status(500).json({ message: 'Failed to fetch balances' });
  }
});

// Get ledger entries
allowanceRouter.get('/ledger', async (req, res) => {
  try {
    const { member, start, end, type, limit } = req.query;

    let query = db('allowance_ledger as al')
      .join('household_members as m', 'al.member_id', 'm.id')
      .where('al.household_id', req.householdId)
      .select('al.*', 'm.name as member_name', 'm.avatar_color as member_color')
      .orderBy('al.created_at', 'desc');

    if (member) query = query.where('al.member_id', parseInt(member as string));
    if (start) query = query.where('al.date', '>=', start as string);
    if (end) query = query.where('al.date', '<=', end as string);
    if (type) query = query.where('al.type', type as string);
    query = query.limit(Math.min(parseInt(limit as string) || 50, 200));

    const entries = await query;
    res.json(entries);
  } catch (err) {
    console.error('GET /allowance/ledger error:', err);
    res.status(500).json({ message: 'Failed to fetch ledger' });
  }
});

// Record a payout (parent only)
allowanceRouter.post('/payout', async (req, res) => {
  try {
    const { member_id, amount, note, parent_id } = req.body;
    if (!member_id || !amount || !parent_id) {
      res.status(400).json({ message: 'member_id, amount, and parent_id are required' });
      return;
    }

    const parent = await db('household_members').where({ id: parent_id, household_id: req.householdId }).first();
    if (!parent?.is_parent) {
      res.status(403).json({ message: 'Only parents can record payouts' });
      return;
    }

    const payoutAmount = Math.abs(parseFloat(amount));
    if (payoutAmount <= 0) {
      res.status(400).json({ message: 'Amount must be positive' });
      return;
    }

    await recordPayout(member_id, payoutAmount, note || '', parent_id);

    const member = await db('household_members').where({ id: member_id, household_id: req.householdId }).first();
    res.json({ message: 'Payout recorded', balance: member.allowance_balance });
  } catch (err) {
    console.error('POST /allowance/payout error:', err);
    res.status(500).json({ message: 'Failed to record payout' });
  }
});
