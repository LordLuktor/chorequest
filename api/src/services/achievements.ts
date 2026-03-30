import db from '../db';
import { calculateStreak } from './streaks';

interface Achievement {
  id: number;
  key: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  category: string;
}

export async function checkAchievements(memberId: number): Promise<Achievement[]> {
  const newlyUnlocked: Achievement[] = [];

  // Get all achievements not yet unlocked by this member
  const locked = await db('achievements as a')
    .leftJoin('member_achievements as ma', function () {
      this.on('a.id', 'ma.achievement_id').andOn('ma.member_id', db.raw('?', [memberId]));
    })
    .whereNull('ma.id')
    .select('a.*');

  if (locked.length === 0) return [];

  // Get member stats
  const completedCount = await db('task_instances')
    .where('completed_by', memberId)
    .where('status', 'completed')
    .count('id as count')
    .first();
  const totalCompleted = parseInt(String(completedCount?.count || 0));

  const earlyBirdCount = await db('task_instances')
    .where('completed_by', memberId)
    .where('status', 'completed')
    .whereRaw("EXTRACT(HOUR FROM completed_at) < 12")
    .count('id as count')
    .first();
  const totalEarlyBird = parseInt(String(earlyBirdCount?.count || 0));

  const streak = await calculateStreak(memberId);

  // Check perfect week (last 7 days, no skips on assigned tasks)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const skipsThisWeek = await db('task_instances')
    .where('assigned_to', memberId)
    .where('status', 'skipped')
    .where('due_date', '>=', weekAgo.toISOString().split('T')[0])
    .count('id as count')
    .first();
  const hasSkipsThisWeek = parseInt(String(skipsThisWeek?.count || 0)) > 0;

  // Check completions this week for perfect week eligibility
  const completedThisWeek = await db('task_instances')
    .where('completed_by', memberId)
    .where('status', 'completed')
    .where('due_date', '>=', weekAgo.toISOString().split('T')[0])
    .count('id as count')
    .first();
  const completedThisWeekCount = parseInt(String(completedThisWeek?.count || 0));

  for (const achievement of locked) {
    let earned = false;

    switch (achievement.category) {
      case 'total':
        earned = totalCompleted >= achievement.threshold;
        break;
      case 'streak':
        earned = streak.current >= achievement.threshold || streak.longest >= achievement.threshold;
        break;
      case 'special':
        if (achievement.key === 'early_bird_10') {
          earned = totalEarlyBird >= achievement.threshold;
        } else if (achievement.key === 'zero_skip_week') {
          earned = !hasSkipsThisWeek && completedThisWeekCount >= 7;
        }
        break;
    }

    if (earned) {
      await db('member_achievements').insert({
        member_id: memberId,
        achievement_id: achievement.id,
      });
      newlyUnlocked.push(achievement);
    }
  }

  return newlyUnlocked;
}
