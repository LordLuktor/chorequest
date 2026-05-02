import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reward_requests', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.integer('requested_by').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.string('title', 100).notNullable();
    t.string('description', 500);
    t.string('icon', 10);
    t.integer('suggested_points');
    t.string('status', 20).defaultTo('pending'); // pending, approved, denied
    t.integer('resolved_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('resolved_at');
    t.index(['household_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reward_requests');
}
