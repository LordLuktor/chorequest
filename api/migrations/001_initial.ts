import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('household_members', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable().unique();
    t.string('avatar_color', 7).notNullable().defaultTo('#3B82F6');
    t.integer('points_total').notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('task_templates', (t) => {
    t.increments('id').primary();
    t.string('title', 255).notNullable();
    t.text('description');
    t.string('icon', 50);
    t.integer('points').notNullable().defaultTo(1);
    t.integer('assigned_to').references('id').inTable('household_members').onDelete('SET NULL');
    t.text('recurrence_rule').notNullable();
    t.date('start_date').notNullable();
    t.date('end_date');
    t.integer('created_by').references('id').inTable('household_members');
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('task_instances', (t) => {
    t.increments('id').primary();
    t.integer('template_id').notNullable().references('id').inTable('task_templates').onDelete('CASCADE');
    t.date('due_date').notNullable();
    t.integer('assigned_to').references('id').inTable('household_members').onDelete('SET NULL');
    t.string('status', 20).notNullable().defaultTo('pending');
    t.integer('completed_by').references('id').inTable('household_members');
    t.timestamp('completed_at', { useTz: true });
    t.integer('points_awarded').defaultTo(0);
    t.text('notes');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['template_id', 'due_date']);
  });

  await knex.schema.createTable('achievements', (t) => {
    t.increments('id').primary();
    t.string('key', 100).notNullable().unique();
    t.string('title', 255).notNullable();
    t.text('description');
    t.string('icon', 50);
    t.integer('threshold').notNullable();
    t.string('category', 50).notNullable();
  });

  await knex.schema.createTable('member_achievements', (t) => {
    t.increments('id').primary();
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.integer('achievement_id').notNullable().references('id').inTable('achievements').onDelete('CASCADE');
    t.timestamp('unlocked_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['member_id', 'achievement_id']);
  });

  await knex.schema.createTable('push_subscriptions', (t) => {
    t.increments('id').primary();
    t.integer('member_id').references('id').inTable('household_members').onDelete('CASCADE');
    t.text('endpoint').notNullable();
    t.text('keys_p256dh').notNullable();
    t.text('keys_auth').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('push_subscriptions');
  await knex.schema.dropTableIfExists('member_achievements');
  await knex.schema.dropTableIfExists('achievements');
  await knex.schema.dropTableIfExists('task_instances');
  await knex.schema.dropTableIfExists('task_templates');
  await knex.schema.dropTableIfExists('household_members');
}
