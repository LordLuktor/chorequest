import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.boolean('bonus_early_bird').defaultTo(false);       // +1 point for completing before noon
    t.integer('bonus_early_bird_amount').defaultTo(1);
    t.boolean('bonus_daily_completion').defaultTo(false);  // bonus for completing ALL tasks in a day
    t.integer('bonus_daily_completion_amount').defaultTo(1);
    t.boolean('bonus_weekly_streak').defaultTo(false);     // bonus for completing all tasks every day for a full week
    t.integer('bonus_weekly_streak_amount').defaultTo(3);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.dropColumn('bonus_early_bird');
    t.dropColumn('bonus_early_bird_amount');
    t.dropColumn('bonus_daily_completion');
    t.dropColumn('bonus_daily_completion_amount');
    t.dropColumn('bonus_weekly_streak');
    t.dropColumn('bonus_weekly_streak_amount');
  });
}
