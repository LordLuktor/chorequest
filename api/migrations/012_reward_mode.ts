import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('allowance_settings', (t) => {
    // 'allowance' = auto-convert on daily completion (all-or-nothing applies)
    // 'points_economy' = earn points, manually spend on rewards or cash out
    t.string('reward_mode', 20).defaultTo('allowance');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.dropColumn('reward_mode');
  });
}
