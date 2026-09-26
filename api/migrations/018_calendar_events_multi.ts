import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('calendar_event_assignees', (t) => {
    t.increments('id').primary();
    t.integer('event_id').notNullable().references('id').inTable('calendar_events').onDelete('CASCADE');
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.unique(['event_id', 'member_id']);
  });

  await knex.schema.createTable('calendar_event_reminders', (t) => {
    t.increments('id').primary();
    t.integer('event_id').notNullable().references('id').inTable('calendar_events').onDelete('CASCADE');
    t.integer('minutes_before').notNullable();
    t.unique(['event_id', 'minutes_before']);
  });

  await knex.schema.createTable('calendar_event_reminder_log', (t) => {
    t.increments('id').primary();
    t.integer('instance_id').notNullable().references('id').inTable('calendar_event_instances').onDelete('CASCADE');
    t.integer('minutes_before').notNullable();
    t.timestamp('sent_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['instance_id', 'minutes_before']);
  });

  await knex.schema.alterTable('calendar_event_instances', (t) => {
    t.dropColumn('reminder_sent');
  });

  await knex.schema.alterTable('calendar_events', (t) => {
    t.dropColumn('assigned_to');
    t.dropColumn('reminder_minutes_before');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('calendar_events', (t) => {
    t.integer('assigned_to').references('id').inTable('household_members').onDelete('SET NULL');
    t.integer('reminder_minutes_before');
  });

  await knex.schema.alterTable('calendar_event_instances', (t) => {
    t.boolean('reminder_sent').defaultTo(false);
  });

  await knex.schema.dropTableIfExists('calendar_event_reminder_log');
  await knex.schema.dropTableIfExists('calendar_event_reminders');
  await knex.schema.dropTableIfExists('calendar_event_assignees');
}
