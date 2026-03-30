import db from '../db';
import { logAction } from './audit';

export async function getSettings() {
  return db('allowance_settings').first();
}

export async function processDailyAllowance(dateStr?: string): Promise<void> {
  const settings = await getSettings();
  if (!settings || !settings.enabled) return;

  const date = dateStr || new Date().toISOString().split('T')[0];
  const rate = parseFloat(settings.rate_per_point);

  // Get all members who had tasks assigned today
  const members = await db('task_instances')
    .where('due_date', date)
    .whereNotNull('assigned_to')
    .select('assigned_to')
    .groupBy('assigned_to')
    .distinct();

  for (const row of members) {
    const memberId = row.assigned_to;

    // Check if already processed for this date
    const existing = await db('allowance_ledger')
      .where({ member_id: memberId, date, type: 'earned' })
      .first();
    if (existing) continue;

    // Get all tasks for this member on this date
    const tasks = await db('task_instances')
      .where({ assigned_to: memberId, due_date: date });

    const total = tasks.length;
    const completed = tasks.filter((t: { status: string }) => t.status === 'completed');
    const totalPoints = completed.reduce((sum: number, t: { points_awarded: number }) => sum + (t.points_awarded || 0), 0);

    let amount = 0;

    if (settings.all_or_nothing) {
      // All assigned tasks must be completed
      if (total > 0 && completed.length === total) {
        amount = totalPoints * rate;
      }
      // Otherwise $0
    } else {
      // Normal mode: earn per completed task
      amount = totalPoints * rate;
    }

    if (amount > 0) {
      await db('allowance_ledger').insert({
        member_id: memberId,
        date,
        type: 'earned',
        amount,
        points_basis: totalPoints,
        note: settings.all_or_nothing
          ? `All ${total} tasks completed (all-or-nothing)`
          : `${completed.length}/${total} tasks completed`,
      });

      await db('household_members')
        .where({ id: memberId })
        .increment('allowance_balance', amount);

      await logAction('allowance_earned', 'allowance', memberId, memberId, {
        date, amount, points: totalPoints, all_or_nothing: settings.all_or_nothing,
      });
    } else if (settings.all_or_nothing && total > 0 && completed.length < total) {
      // Log the forfeiture for visibility
      await db('allowance_ledger').insert({
        member_id: memberId,
        date,
        type: 'earned',
        amount: 0,
        points_basis: totalPoints,
        note: `${completed.length}/${total} tasks completed — forfeited (all-or-nothing)`,
      });
    }
  }

  console.log(`Processed daily allowance for ${date}: ${members.length} member(s).`);
}

export async function recordPayout(memberId: number, amount: number, note: string, parentId: number): Promise<void> {
  const payoutAmount = Math.abs(amount);

  await db('allowance_ledger').insert({
    member_id: memberId,
    date: new Date().toISOString().split('T')[0],
    type: 'payout',
    amount: -payoutAmount,
    note: note || 'Allowance payout',
  });

  await db('household_members')
    .where({ id: memberId })
    .decrement('allowance_balance', payoutAmount);

  await logAction('allowance_payout', 'allowance', memberId, parentId, {
    amount: payoutAmount, note,
  });
}
