import db from '../db';

export interface StreakData {
  current: number;
  longest: number;
}

export async function calculateStreak(memberId: number): Promise<StreakData> {
  // Get all distinct dates where this member completed at least one task, ordered desc
  const completedDays = await db('task_instances')
    .where('completed_by', memberId)
    .where('status', 'completed')
    .select(db.raw("DISTINCT DATE(completed_at) as day"))
    .orderBy('day', 'desc');

  if (completedDays.length === 0) {
    return { current: 0, longest: 0 };
  }

  const days = completedDays.map((r: { day: string }) => {
    const d = new Date(r.day);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

  const ONE_DAY = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Current streak: starts from today or yesterday
  let current = 0;
  let checkDate = todayMs;

  // Allow streak to start from today or yesterday
  if (days[0] === todayMs) {
    current = 1;
    checkDate = todayMs - ONE_DAY;
  } else if (days[0] === todayMs - ONE_DAY) {
    current = 1;
    checkDate = todayMs - 2 * ONE_DAY;
  } else {
    return { current: 0, longest: calculateLongest(days) };
  }

  // Count consecutive days backwards
  const daySet = new Set(days);
  while (daySet.has(checkDate)) {
    current++;
    checkDate -= ONE_DAY;
  }

  return { current, longest: Math.max(current, calculateLongest(days)) };
}

function calculateLongest(days: number[]): number {
  if (days.length === 0) return 0;

  const ONE_DAY = 86400000;
  let longest = 1;
  let streak = 1;

  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] - days[i] === ONE_DAY) {
      streak++;
      longest = Math.max(longest, streak);
    } else {
      streak = 1;
    }
  }

  return longest;
}
