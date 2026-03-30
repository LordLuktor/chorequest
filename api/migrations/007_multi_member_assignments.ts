import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Drop the old unique constraint (template_id, due_date) and replace with
  //    (template_id, due_date, assigned_to) so multiple members can have
  //    instances from the same template on the same day.
  await knex.schema.alterTable('task_instances', (t) => {
    t.dropUnique(['template_id', 'due_date']);
    t.unique(['template_id', 'due_date', 'assigned_to']);
  });

  // 2. Convert existing weekly_assignments from single-ID format { "0": 5 }
  //    to array format { "0": [5] } for consistency.
  const templates = await knex('task_templates')
    .whereNotNull('weekly_assignments');

  for (const tpl of templates) {
    const raw = typeof tpl.weekly_assignments === 'string'
      ? JSON.parse(tpl.weekly_assignments)
      : tpl.weekly_assignments;

    const converted: Record<string, number[]> = {};
    for (const [day, val] of Object.entries(raw)) {
      if (val === null || val === undefined) {
        converted[day] = [];
      } else if (Array.isArray(val)) {
        converted[day] = val; // already array format
      } else {
        converted[day] = [val as number];
      }
    }

    await knex('task_templates')
      .where({ id: tpl.id })
      .update({ weekly_assignments: JSON.stringify(converted) });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert unique constraint
  await knex.schema.alterTable('task_instances', (t) => {
    t.dropUnique(['template_id', 'due_date', 'assigned_to']);
    t.unique(['template_id', 'due_date']);
  });

  // Revert weekly_assignments back to single-ID format (take first element)
  const templates = await knex('task_templates')
    .whereNotNull('weekly_assignments');

  for (const tpl of templates) {
    const raw = typeof tpl.weekly_assignments === 'string'
      ? JSON.parse(tpl.weekly_assignments)
      : tpl.weekly_assignments;

    const reverted: Record<string, number | null> = {};
    for (const [day, val] of Object.entries(raw)) {
      if (Array.isArray(val) && val.length > 0) {
        reverted[day] = val[0];
      } else {
        reverted[day] = null;
      }
    }

    await knex('task_templates')
      .where({ id: tpl.id })
      .update({ weekly_assignments: JSON.stringify(reverted) });
  }
}
