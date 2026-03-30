import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('allowance_settings', (t) => {
    t.increments('id').primary();
    t.decimal('rate_per_point', 5, 2).notNullable().defaultTo(1.00);
    t.boolean('all_or_nothing').notNullable().defaultTo(false);
    t.boolean('enabled').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Seed default settings
  await knex('allowance_settings').insert({
    rate_per_point: 1.00,
    all_or_nothing: false,
    enabled: true,
  });

  await knex.schema.createTable('allowance_ledger', (t) => {
    t.increments('id').primary();
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.date('date').notNullable();
    t.string('type', 20).notNullable(); // earned, payout, adjustment
    t.decimal('amount', 8, 2).notNullable();
    t.integer('points_basis');
    t.text('note');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('household_members', (t) => {
    t.decimal('allowance_balance', 8, 2).notNullable().defaultTo(0.00);
    t.boolean('is_parent').notNullable().defaultTo(false);
  });

  // Scott (id=3) and Heather (id=4) are parents
  await knex('household_members').whereIn('id', [3, 4]).update({ is_parent: true });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('household_members', (t) => {
    t.dropColumn('allowance_balance');
    t.dropColumn('is_parent');
  });
  await knex.schema.dropTableIfExists('allowance_ledger');
  await knex.schema.dropTableIfExists('allowance_settings');
}
