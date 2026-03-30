import cron from 'node-cron';
import { RRule } from 'rrule';
import db from './db';
import { sendDailyReminders, sendOverdueReminders, isPushEnabled } from './services/push';
import { processDailyAllowance } from './services/allowance';
import { processOverdueEscalation } from './services/overdue';
import { acquireLock, releaseLock } from './redis';

const GENERATE_DAYS_AHEAD = 30;

export async function generateInstances(templateId?: number, householdId?: string): Promise<void> {
  try {
    const query = db('task_templates').where('is_active', true);
    if (templateId) query.where('id', templateId);
    if (householdId) query.where('household_id', householdId);
    const templates = await query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureLimit = new Date(today);
    futureLimit.setDate(futureLimit.getDate() + GENERATE_DAYS_AHEAD);

    for (const template of templates) {
      try {
        if (template.weekly_assignments) {
          await generateWeeklyInstances(template, today, futureLimit);
        } else {
          await generateRRuleInstances(template, today, futureLimit);
        }
      } catch (err) {
        console.error(`Error generating instances for template ${template.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Instance generation error:', err);
  }
}

async function generateWeeklyInstances(
  template: any,
  today: Date,
  futureLimit: Date
): Promise<void> {
  const rawAssignments: Record<string, number | number[] | null> =
    typeof template.weekly_assignments === 'string'
      ? JSON.parse(template.weekly_assignments)
      : template.weekly_assignments;

  // Normalize to array format: { "0": [2, 5], "1": [3] }
  const assignments: Record<string, number[]> = {};
  for (const [dow, val] of Object.entries(rawAssignments)) {
    if (val === null || val === undefined) {
      assignments[dow] = [];
    } else if (Array.isArray(val)) {
      assignments[dow] = val;
    } else {
      assignments[dow] = [val];
    }
  }

  const interval = template.repeat_interval || 1;

  const rawStart = template.start_date instanceof Date
    ? template.start_date
    : new Date(String(template.start_date).split('T')[0] + 'T00:00:00Z');
  const startStr = rawStart.toISOString().split('T')[0];

  const rawEnd = template.end_date
    ? (template.end_date instanceof Date
        ? template.end_date
        : new Date(String(template.end_date).split('T')[0] + 'T23:59:59Z'))
    : null;

  // Calculate the week number relative to start_date for biweekly support
  const startMs = rawStart.getTime();
  const weekMs = 7 * 86400000;

  let day = new Date(today.getTime() - 86400000); // include today
  while (day <= futureLimit) {
    const dueDate = day.toISOString().split('T')[0];
    const dow = day.getUTCDay().toString(); // 0=Sun, 1=Mon, etc.

    if (dueDate >= startStr && (!rawEnd || day <= rawEnd)) {
      const memberIds = assignments[dow] || [];
      if (memberIds.length > 0) {
        // For biweekly: check if this is an "on" week
        let shouldSchedule = true;
        if (interval === 2) {
          const weeksSinceStart = Math.floor((day.getTime() - startMs) / weekMs);
          shouldSchedule = weeksSinceStart % 2 === 0;
        }

        if (shouldSchedule) {
          for (const memberId of memberIds) {
            try {
              await db('task_instances')
                .insert({
                  template_id: template.id,
                  due_date: dueDate,
                  assigned_to: memberId,
                  status: 'pending',
                  household_id: template.household_id,
                })
                .onConflict(['template_id', 'due_date', 'assigned_to'])
                .ignore();
            } catch {
              // Ignore duplicates
            }
          }
        }
      }
    }

    day = new Date(day.getTime() + 86400000);
  }
}

async function generateRRuleInstances(
  template: any,
  today: Date,
  futureLimit: Date
): Promise<void> {
  const rruleStr = template.recurrence_rule;
  const rawStart = template.start_date instanceof Date
    ? template.start_date
    : new Date(String(template.start_date).split('T')[0] + 'T00:00:00Z');
  const rule = RRule.fromString(`DTSTART:${formatRRuleDate(rawStart)}\nRRULE:${rruleStr}`);

  const occurrences = rule.between(
    new Date(today.getTime() - 86400000),
    futureLimit,
    true
  );

  const rawEnd = template.end_date
    ? (template.end_date instanceof Date
        ? template.end_date
        : new Date(String(template.end_date).split('T')[0] + 'T23:59:59Z'))
    : null;

  const startStr = rawStart.toISOString().split('T')[0];

  for (const occurrence of occurrences) {
    const dueDate = occurrence.toISOString().split('T')[0];
    if (dueDate < startStr) continue;
    if (rawEnd && occurrence > rawEnd) continue;

    try {
      await db('task_instances')
        .insert({
          template_id: template.id,
          due_date: dueDate,
          assigned_to: template.assigned_to,
          status: 'pending',
          household_id: template.household_id,
        })
        .onConflict(['template_id', 'due_date', 'assigned_to'])
        .ignore();
    } catch {
      // Ignore duplicates
    }
  }
}

function formatRRuleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function startScheduler(): void {
  // Generate task instances daily at midnight + overdue check
  cron.schedule('0 0 * * *', async () => {
    const lockKey = 'cron:generate-instances';
    const acquired = await acquireLock(lockKey, 300);
    if (!acquired) { console.log('Skipping instance generation — another instance holds the lock'); return; }
    try {
      console.log('Running scheduled instance generation...');
      await generateInstances();
      console.log('Instance generation complete.');
      await processOverdueEscalation();
    } finally {
      await releaseLock(lockKey);
    }
  });

  // Morning reminder at 8 AM
  cron.schedule('0 8 * * *', async () => {
    if (!isPushEnabled()) return;
    const lockKey = 'cron:morning-reminders';
    const acquired = await acquireLock(lockKey, 300);
    if (!acquired) { console.log('Skipping morning reminders — another instance holds the lock'); return; }
    try {
      console.log('Sending morning reminders...');
      await sendDailyReminders();
    } finally {
      await releaseLock(lockKey);
    }
  });

  // Overdue check at 8 PM
  cron.schedule('0 20 * * *', async () => {
    if (!isPushEnabled()) return;
    const lockKey = 'cron:overdue-reminders';
    const acquired = await acquireLock(lockKey, 300);
    if (!acquired) { console.log('Skipping overdue reminders — another instance holds the lock'); return; }
    try {
      console.log('Sending overdue reminders...');
      await sendOverdueReminders();
    } finally {
      await releaseLock(lockKey);
    }
  });

  // Process daily allowance at 11:59 PM
  cron.schedule('59 23 * * *', async () => {
    const lockKey = 'cron:daily-allowance';
    const acquired = await acquireLock(lockKey, 300);
    if (!acquired) { console.log('Skipping daily allowance — another instance holds the lock'); return; }
    try {
      console.log('Processing daily allowance...');
      await processDailyAllowance();
    } finally {
      await releaseLock(lockKey);
    }
  });

  // Run on startup
  console.log('Generating initial task instances...');
  generateInstances().then(() => {
    console.log('Initial instance generation complete.');
  });
}
