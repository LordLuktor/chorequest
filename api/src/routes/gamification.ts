import { Router } from 'express';
import db from '../db';
import { calculateStreak } from '../services/streaks';
import { requireAuth } from '../middleware/auth';

export const gamificationRouter = Router();
gamificationRouter.use(requireAuth);

// Leaderboard
gamificationRouter.get('/leaderboard', async (req, res) => {
  try {
    const period = req.query.period as string || 'all';

    let query = db('task_instances as ti')
      .join('household_members as m', 'ti.assigned_to', 'm.id')
      .where('ti.household_id', req.householdId)
      .where('ti.status', 'completed')
      .select(
        'm.id as member_id',
        'm.name',
        'm.avatar_color',
        db.raw('COALESCE(SUM(ti.points_awarded), 0)::int as points'),
        db.raw('COUNT(ti.id)::int as tasks_completed')
      )
      .groupBy('m.id', 'm.name', 'm.avatar_color')
      .orderBy('points', 'desc');

    const now = new Date();
    if (period === 'week') {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      query = query.where('ti.completed_at', '>=', weekStart.toISOString());
    } else if (period === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      query = query.where('ti.completed_at', '>=', monthStart.toISOString());
    }

    const leaderboard = await query;
    res.json(leaderboard);
  } catch (err) {
    console.error('GET /leaderboard error:', err);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
});

// Member stats
gamificationRouter.get('/members/:id/stats', async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    if (isNaN(memberId)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    // Basic counts
    const counts = await db('task_instances')
      .where('household_id', req.householdId)
      .where('completed_by', memberId)
      .select(
        db.raw("COUNT(*) FILTER (WHERE status = 'completed')::int as total_completed"),
        db.raw("COALESCE(SUM(points_awarded) FILTER (WHERE status = 'completed'), 0)::int as total_points"),
        db.raw("COUNT(*) FILTER (WHERE status = 'completed' AND EXTRACT(HOUR FROM completed_at) < 12)::int as early_bird_count")
      )
      .first();

    const skipCount = await db('task_instances')
      .where('household_id', req.householdId)
      .where('assigned_to', memberId)
      .where('status', 'skipped')
      .count('id as count')
      .first();

    // Streak
    const streakData = await calculateStreak(memberId);

    // Achievements
    const achievements = await db('achievements as a')
      .leftJoin('member_achievements as ma', function () {
        this.on('a.id', 'ma.achievement_id').andOn('ma.member_id', db.raw('?', [memberId]));
      })
      .select('a.*', 'ma.unlocked_at')
      .orderBy('a.category')
      .orderBy('a.threshold');

    res.json({
      current_streak: streakData.current,
      longest_streak: streakData.longest,
      total_completed: counts?.total_completed || 0,
      total_skipped: parseInt(String(skipCount?.count || 0)),
      total_points: counts?.total_points || 0,
      early_bird_count: counts?.early_bird_count || 0,
      achievements,
    });
  } catch (err) {
    console.error('GET /members/:id/stats error:', err);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// List achievements
gamificationRouter.get('/achievements', async (_req, res) => {
  try {
    const achievements = await db('achievements').orderBy('category').orderBy('threshold');
    res.json(achievements);
  } catch (err) {
    console.error('GET /achievements error:', err);
    res.status(500).json({ message: 'Failed to fetch achievements' });
  }
});
