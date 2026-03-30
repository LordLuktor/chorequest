import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_log', (t) => {
    t.increments('id').primary();
    t.string('action', 50).notNullable();
    t.string('entity_type', 50).notNullable();
    t.integer('entity_id').notNullable();
    t.integer('member_id').references('id').inTable('household_members').onDelete('SET NULL');
    t.jsonb('details');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('app_settings', (t) => {
    t.increments('id').primary();
    t.string('key', 100).notNullable().unique();
    t.jsonb('value').notNullable();
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('task_instances', (t) => {
    t.timestamp('undone_at', { useTz: true });
    t.string('previous_status', 20);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('task_instances', (t) => {
    t.dropColumn('undone_at');
    t.dropColumn('previous_status');
  });
  await knex.schema.dropTableIfExists('app_settings');
  await knex.schema.dropTableIfExists('audit_log');
}
