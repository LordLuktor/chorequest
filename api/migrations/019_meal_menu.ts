import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('menu_items', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    // null member_id = available to every kid; set = only that kid can select it
    t.integer('member_id').references('id').inTable('household_members').onDelete('CASCADE');
    t.string('meal_slot', 10).notNullable(); // 'breakfast' | 'lunch'
    t.string('name', 100).notNullable();
    t.integer('weekly_limit'); // null = unlimited
    t.string('limit_scope', 10).notNullable().defaultTo('per_kid'); // 'per_kid' | 'shared'
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('created_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['household_id', 'meal_slot', 'is_active']);
  });

  await knex.schema.createTable('menu_selections', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.date('date').notNullable();
    t.string('meal_slot', 10).notNullable(); // 'breakfast' | 'lunch'
    t.integer('menu_item_id').notNullable().references('id').inTable('menu_items').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['household_id', 'member_id', 'date', 'meal_slot']);
    t.index(['household_id', 'member_id', 'date']);
  });

  await knex.schema.createTable('menu_item_requests', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.integer('requested_by').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.string('meal_slot', 10).notNullable();
    t.string('name', 100).notNullable();
    t.string('status', 20).notNullable().defaultTo('pending'); // pending, approved, denied
    t.integer('resolved_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('resolved_at', { useTz: true });
    t.index(['household_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('menu_item_requests');
  await knex.schema.dropTableIfExists('menu_selections');
  await knex.schema.dropTableIfExists('menu_items');
}
