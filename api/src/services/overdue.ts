import db from '../db';
import { logAction } from './audit';

export async function processOverdueEscalation(): Promise<void> {
  // Check if overdue escalation is enabled
  const setting = await db('app_settings').where({ key: 'overdue_escalation' }).first();
  if (!setting) return;

  const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
  if (!config.enabled) return;

  const daysThreshold = config.days || 2;
  const action = config.action || 'flag'; // 'flag' or 'reassign'
  const reassignTo = config.reassign_to || null;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const overdueTasks = await db('task_instances')
    .where('status', 'pending')
    .where('due_date', '<=', cutoffStr)
    .whereNotNull('assigned_to');

  for (const task of overdueTasks) {
    if (action === 'reassign' && reassignTo) {
      await db('task_instances')
        .where({ id: task.id })
        .update({ assigned_to: reassignTo });

      await logAction('task_reassigned_overdue', 'task_instance', task.id, null, {
        previous_assignee: task.assigned_to,
        new_assignee: reassignTo,
        days_overdue: daysThreshold,
      });
    } else {
      // Flag by logging (the frontend can show flagged tasks from audit_log)
      await logAction('task_flagged_overdue', 'task_instance', task.id, null, {
        assigned_to: task.assigned_to,
        due_date: task.due_date,
        days_overdue: daysThreshold,
      });
    }
  }

  if (overdueTasks.length > 0) {
    console.log(`Overdue escalation: processed ${overdueTasks.length} task(s) (action: ${action}).`);
  }
}
