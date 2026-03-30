import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

// Completion rates per member
analyticsRouter.get('/completion-rates', async (req, res) => {
  try {
    const period = parseInt(req.query.period as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    const startStr = startDate.toISOString().split('T')[0];

    const rates = await db('task_instances as ti')
      .join('household_members as m', 'ti.assigned_to', 'm.id')
      .where('ti.household_id', req.householdId)
      .where('ti.due_date', '>=', startStr)
      .where('ti.due_date', '<=', new Date().toISOString().split('T')[0])
      .groupBy('m.id', 'm.name', 'm.avatar_color')
      .select(
        'm.id as member_id',
        'm.name',
        'm.avatar_color',
        db.raw("COUNT(*)::int as total"),
        db.raw("COUNT(*) FILTER (WHERE ti.status = 'completed')::int as completed"),
        db.raw("COUNT(*) FILTER (WHERE ti.status = 'skipped')::int as skipped"),
        db.raw("ROUND(COUNT(*) FILTER (WHERE ti.status = 'completed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as rate")
      )
      .orderBy('rate', 'desc');

    res.json(rates);
  } catch (err) {
    console.error('GET /analytics/completion-rates error:', err);
    res.status(500).json({ message: 'Failed to fetch completion rates' });
  }
});

// Daily trends for charting
analyticsRouter.get('/trends', async (req, res) => {
  try {
    const period = parseInt(req.query.period as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    const startStr = startDate.toISOString().split('T')[0];

    const trends = await db('task_instances as ti')
      .join('household_members as m', 'ti.assigned_to', 'm.id')
      .where('ti.household_id', req.householdId)
      .where('ti.due_date', '>=', startStr)
      .where('ti.due_date', '<=', new Date().toISOString().split('T')[0])
      .where('ti.status', 'completed')
      .groupBy('ti.due_date', 'm.id', 'm.name', 'm.avatar_color')
      .select(
        db.raw("DATE(ti.due_date) as date"),
        'm.id as member_id',
        'm.name',
        'm.avatar_color',
        db.raw("COALESCE(SUM(ti.points_awarded), 0)::int as points"),
        db.raw("COUNT(*)::int as tasks_completed")
      )
      .orderBy('date', 'asc');

    res.json(trends);
  } catch (err) {
    console.error('GET /analytics/trends error:', err);
    res.status(500).json({ message: 'Failed to fetch trends' });
  }
});

// Most skipped tasks
analyticsRouter.get('/most-skipped', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const skipped = await db('task_instances as ti')
      .join('task_templates as tt', 'ti.template_id', 'tt.id')
      .where('ti.household_id', req.householdId)
      .where('ti.status', 'skipped')
      .groupBy('tt.id', 'tt.title', 'tt.icon')
      .select(
        'tt.id as template_id',
        'tt.title',
        'tt.icon',
        db.raw("COUNT(*)::int as skip_count")
      )
      .orderBy('skip_count', 'desc')
      .limit(limit);

    res.json(skipped);
  } catch (err) {
    console.error('GET /analytics/most-skipped error:', err);
    res.status(500).json({ message: 'Failed to fetch most-skipped tasks' });
  }
});

// Daily breakdown for a specific date
analyticsRouter.get('/daily-breakdown', async (req, res) => {
  try {
    const date = req.query.date as string || new Date().toISOString().split('T')[0];

    const breakdown = await db('task_instances as ti')
      .join('household_members as m', 'ti.assigned_to', 'm.id')
      .where('ti.household_id', req.householdId)
      .where('ti.due_date', date)
      .groupBy('m.id', 'm.name', 'm.avatar_color')
      .select(
        'm.id as member_id',
        'm.name',
        'm.avatar_color',
        db.raw("COUNT(*)::int as total"),
        db.raw("COUNT(*) FILTER (WHERE ti.status = 'completed')::int as completed"),
        db.raw("COUNT(*) FILTER (WHERE ti.status = 'skipped')::int as skipped"),
        db.raw("COUNT(*) FILTER (WHERE ti.status = 'pending')::int as pending")
      );

    res.json(breakdown);
  } catch (err) {
    console.error('GET /analytics/daily-breakdown error:', err);
    res.status(500).json({ message: 'Failed to fetch daily breakdown' });
  }
});
