import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Display mode for display devices: 'open', 'easy', 'verify'
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.string('display_mode', 20).defaultTo('open');
  });

  // Per-user PIN and Easy Mode flag
  await knex.schema.alterTable('household_members', (t) => {
    t.string('pin_hash', 255);
    t.boolean('easy_mode').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.dropColumn('display_mode');
  });
  await knex.schema.alterTable('household_members', (t) => {
    t.dropColumn('pin_hash');
    t.dropColumn('easy_mode');
  });
}
