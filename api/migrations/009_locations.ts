import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('member_locations', (t) => {
    t.increments('id').primary();
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.double('latitude').notNullable();
    t.double('longitude').notNullable();
    t.float('accuracy').nullable();
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['member_id']); // Only store latest location per member
    t.index(['household_id'], 'idx_member_locations_household');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('member_locations');
}
