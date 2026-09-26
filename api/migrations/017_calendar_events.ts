import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('calendar_events', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.string('title', 150).notNullable();
    t.string('description', 500);
    t.string('icon', 10);
    t.integer('assigned_to').references('id').inTable('household_members').onDelete('SET NULL');
    t.date('event_date').notNullable();
    t.time('event_time');
    t.time('end_time');
    t.text('recurrence_rule');
    t.date('recurrence_end_date');
    t.integer('reminder_minutes_before');
    t.integer('created_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['household_id', 'event_date']);
  });

  await knex.schema.createTable('calendar_event_instances', (t) => {
    t.increments('id').primary();
    t.integer('event_id').notNullable().references('id').inTable('calendar_events').onDelete('CASCADE');
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.date('occurrence_date').notNullable();
    t.boolean('is_cancelled').defaultTo(false);
    t.boolean('reminder_sent').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['event_id', 'occurrence_date']);
    t.index(['household_id', 'occurrence_date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('calendar_event_instances');
  await knex.schema.dropTableIfExists('calendar_events');
}
