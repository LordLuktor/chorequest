import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Update any existing "Wallscreen" accounts to use the display role
  await knex('household_members')
    .where('name', 'Wallscreen')
    .update({ role: 'display', is_parent: false });
}

export async function down(knex: Knex): Promise<void> {
  // Revert display accounts back to child role
  await knex('household_members')
    .where('role', 'display')
    .update({ role: 'child' });
}
