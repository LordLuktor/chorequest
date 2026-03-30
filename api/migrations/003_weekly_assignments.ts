import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('task_templates', (t) => {
    t.jsonb('weekly_assignments').nullable(); // { "0": member_id, "1": null, ... } keyed by day-of-week (0=Sun)
    t.integer('repeat_interval').notNullable().defaultTo(1); // 1=weekly, 2=biweekly
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('task_templates', (t) => {
    t.dropColumn('weekly_assignments');
    t.dropColumn('repeat_interval');
  });
}
