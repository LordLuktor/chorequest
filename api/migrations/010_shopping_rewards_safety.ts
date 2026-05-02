import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Shopping List ──────────────────────────────────────────────
  await knex.schema.createTable('shopping_items', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.string('text', 200).notNullable();
    t.string('category', 50).defaultTo('General');
    t.integer('added_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.boolean('is_checked').defaultTo(false);
    t.integer('checked_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('checked_at');
    t.index(['household_id', 'is_checked']);
  });

  // ── Rewards Catalog ────────────────────────────────────────────
  await knex.schema.createTable('rewards', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.string('title', 100).notNullable();
    t.string('description', 500);
    t.string('icon', 10);
    t.integer('cost_points').notNullable();
    t.integer('created_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['household_id', 'is_active']);
  });

  await knex.schema.createTable('reward_redemptions', (t) => {
    t.increments('id').primary();
    t.integer('reward_id').notNullable().references('id').inTable('rewards').onDelete('CASCADE');
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.integer('points_spent').notNullable();
    t.string('status', 20).defaultTo('pending'); // pending, approved, denied
    t.integer('approved_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('redeemed_at').defaultTo(knex.fn.now());
    t.timestamp('resolved_at');
    t.index(['household_id', 'member_id']);
    t.index(['household_id', 'status']);
  });

  // ── Geofences ──────────────────────────────────────────────────
  await knex.schema.createTable('geofences', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.double('latitude').notNullable();
    t.double('longitude').notNullable();
    t.integer('radius_meters').defaultTo(200);
    t.integer('created_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.boolean('notify_on_enter').defaultTo(true);
    t.boolean('notify_on_exit').defaultTo(true);
    t.boolean('is_active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('household_id');
  });

  // Track which members are monitored by which geofences
  await knex.schema.createTable('geofence_members', (t) => {
    t.increments('id').primary();
    t.integer('geofence_id').notNullable().references('id').inTable('geofences').onDelete('CASCADE');
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.unique(['geofence_id', 'member_id']);
  });

  // ── SOS / Check-in ────────────────────────────────────────────
  await knex.schema.createTable('sos_alerts', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.integer('member_id').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.double('latitude');
    t.double('longitude');
    t.string('message', 500);
    t.boolean('is_resolved').defaultTo(false);
    t.integer('resolved_by').references('id').inTable('household_members').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('resolved_at');
    t.index(['household_id', 'is_resolved']);
  });

  await knex.schema.createTable('checkin_requests', (t) => {
    t.increments('id').primary();
    t.uuid('household_id').notNullable().references('id').inTable('households').onDelete('CASCADE');
    t.integer('requested_by').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.integer('requested_of').notNullable().references('id').inTable('household_members').onDelete('CASCADE');
    t.string('status', 20).defaultTo('pending'); // pending, responded, expired
    t.double('response_latitude');
    t.double('response_longitude');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('responded_at');
    t.index(['household_id', 'requested_of', 'status']);
  });

  // ── Theme preference ──────────────────────────────────────────
  await knex.schema.alterTable('household_members', (t) => {
    t.string('theme', 10).defaultTo('dark');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('household_members', (t) => {
    t.dropColumn('theme');
  });
  await knex.schema.dropTableIfExists('checkin_requests');
  await knex.schema.dropTableIfExists('sos_alerts');
  await knex.schema.dropTableIfExists('geofence_members');
  await knex.schema.dropTableIfExists('geofences');
  await knex.schema.dropTableIfExists('reward_redemptions');
  await knex.schema.dropTableIfExists('rewards');
  await knex.schema.dropTableIfExists('shopping_items');
}
