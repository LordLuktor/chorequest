import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('menu_items', (t) => {
    // 1=Mon .. 5=Fri (matches JS Date#getDay()); null/empty = available every day.
    // Only meaningful for meal_slot='lunch' — breakfast items ignore this.
    t.specificType('available_days', 'integer[]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('menu_items', (t) => {
    t.dropColumn('available_days');
  });
}
