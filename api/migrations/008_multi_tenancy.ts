import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function up(knex: Knex): Promise<void> {
  // ── 1. Create new tables ──────────────────────────────────────────

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).nullable().unique();
    t.string('username', 100).nullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('display_name', 100).notNullable();
    t.boolean('is_managed').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // At least one of email or username must be set (enforced at app level)

  await knex.schema.createTable('households', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('timezone', 50).notNullable().defaultTo('America/New_York');
    t.string('invite_code', 20).nullable().unique();
    t.timestamp('invite_expires_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['user_id']);
  });

  // ── 2. Add household_id + user_id to household_members ────────────

  await knex.schema.alterTable('household_members', (t) => {
    t.uuid('household_id').nullable();
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('role', 20).notNullable().defaultTo('child');
  });

  // ── 3. Add household_id to all tenant-scoped tables ───────────────

  await knex.schema.alterTable('task_templates', (t) => {
    t.uuid('household_id').nullable();
  });

  await knex.schema.alterTable('task_instances', (t) => {
    t.uuid('household_id').nullable();
  });

  await knex.schema.alterTable('push_subscriptions', (t) => {
    t.uuid('household_id').nullable();
    t.string('platform', 10).notNullable().defaultTo('web');
    t.string('expo_push_token', 255).nullable();
  });

  await knex.schema.alterTable('audit_log', (t) => {
    t.uuid('household_id').nullable();
  });

  await knex.schema.alterTable('allowance_settings', (t) => {
    t.uuid('household_id').nullable();
  });

  await knex.schema.alterTable('allowance_ledger', (t) => {
    t.uuid('household_id').nullable();
  });

  // Check if app_settings table exists before altering
  const hasAppSettings = await knex.schema.hasTable('app_settings');
  if (hasAppSettings) {
    await knex.schema.alterTable('app_settings', (t) => {
      t.uuid('household_id').nullable();
    });
  }

  // ── 4. Migrate existing data ──────────────────────────────────────

  // Create default household for existing data
  const [household] = await knex('households')
    .insert({
      name: 'Steinmetz Family',
      timezone: 'America/New_York',
      invite_code: crypto.randomBytes(4).toString('hex').toUpperCase(),
      invite_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    })
    .returning('*');

  const householdId = household.id;

  // Create user accounts for existing members who are parents
  const existingMembers = await knex('household_members').select('*');

  for (const member of existingMembers) {
    // Create a user account for each human member (skip Wallscreen)
    if (member.name.toLowerCase() === 'wallscreen') {
      // Wallscreen is a shared display, not a user — just assign household
      await knex('household_members')
        .where({ id: member.id })
        .update({
          household_id: householdId,
          role: 'child',
        });
      continue;
    }

    const isParent = member.is_parent === true;
    const username = member.name.toLowerCase().replace(/\s+/g, '');
    // Generate a temporary password — user must change on first login
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [user] = await knex('users')
      .insert({
        username,
        display_name: member.name,
        password_hash: passwordHash,
        is_managed: !isParent,
      })
      .returning('*');

    await knex('household_members')
      .where({ id: member.id })
      .update({
        household_id: householdId,
        user_id: user.id,
        role: isParent ? 'parent' : 'child',
      });

    console.log(`  Created user "${username}" (${isParent ? 'parent' : 'child'}) — temp password: ${tempPassword}`);
  }

  // Update all tenant-scoped tables with the default household_id
  await knex('task_templates').update({ household_id: householdId });
  await knex('task_instances').update({ household_id: householdId });
  await knex('push_subscriptions').update({ household_id: householdId });
  await knex('audit_log').update({ household_id: householdId });
  await knex('allowance_settings').update({ household_id: householdId });
  await knex('allowance_ledger').update({ household_id: householdId });
  if (hasAppSettings) {
    await knex('app_settings').update({ household_id: householdId });
  }

  // ── 5. Make household_id NOT NULL + add foreign keys ──────────────

  await knex.schema.alterTable('household_members', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  await knex.schema.alterTable('task_templates', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  await knex.schema.alterTable('task_instances', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  await knex.schema.alterTable('push_subscriptions', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  await knex.schema.alterTable('audit_log', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  await knex.schema.alterTable('allowance_settings', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  await knex.schema.alterTable('allowance_ledger', (t) => {
    t.uuid('household_id').notNullable().alter();
    t.foreign('household_id').references('id').inTable('households').onDelete('CASCADE');
  });

  // ── 6. Update unique constraints ──────────────────────────────────

  // household_members: name unique within household, not globally
  await knex.schema.alterTable('household_members', (t) => {
    t.dropUnique(['name']);
    t.unique(['household_id', 'name']);
  });

  // allowance_settings: one per household
  // (check if there's an existing constraint to drop)
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.unique(['household_id']);
  });

  // ── 7. Add indexes for performance ────────────────────────────────

  await knex.schema.alterTable('task_instances', (t) => {
    t.index(['household_id', 'due_date'], 'idx_task_instances_household_date');
    t.index(['household_id', 'status', 'completed_at'], 'idx_task_instances_completed');
  });

  await knex.schema.alterTable('task_templates', (t) => {
    t.index(['household_id', 'is_active'], 'idx_task_templates_household_active');
  });

  await knex.schema.alterTable('audit_log', (t) => {
    t.index(['household_id', 'created_at'], 'idx_audit_log_household_created');
  });

  await knex.schema.alterTable('allowance_ledger', (t) => {
    t.index(['household_id', 'member_id', 'date'], 'idx_allowance_ledger_household_member');
  });

  await knex.schema.alterTable('household_members', (t) => {
    t.index(['household_id'], 'idx_household_members_household');
  });

  await knex.schema.alterTable('refresh_tokens', (t) => {
    t.index(['token_hash'], 'idx_refresh_tokens_hash');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes
  await knex.schema.alterTable('refresh_tokens', (t) => {
    t.dropIndex([], 'idx_refresh_tokens_hash');
  });
  await knex.schema.alterTable('household_members', (t) => {
    t.dropIndex([], 'idx_household_members_household');
  });
  await knex.schema.alterTable('allowance_ledger', (t) => {
    t.dropIndex([], 'idx_allowance_ledger_household_member');
  });
  await knex.schema.alterTable('audit_log', (t) => {
    t.dropIndex([], 'idx_audit_log_household_created');
  });
  await knex.schema.alterTable('task_templates', (t) => {
    t.dropIndex([], 'idx_task_templates_household_active');
  });
  await knex.schema.alterTable('task_instances', (t) => {
    t.dropIndex([], 'idx_task_instances_completed');
    t.dropIndex([], 'idx_task_instances_household_date');
  });

  // Revert unique constraints
  await knex.schema.alterTable('allowance_settings', (t) => {
    t.dropUnique(['household_id']);
  });
  await knex.schema.alterTable('household_members', (t) => {
    t.dropUnique(['household_id', 'name']);
    t.unique(['name']);
  });

  // Drop foreign keys and household_id columns
  const tables = ['household_members', 'task_templates', 'task_instances',
    'push_subscriptions', 'audit_log', 'allowance_settings', 'allowance_ledger'];

  for (const table of tables) {
    await knex.schema.alterTable(table, (t) => {
      t.dropForeign(['household_id']);
      t.dropColumn('household_id');
    });
  }

  // Drop additional columns from household_members
  await knex.schema.alterTable('household_members', (t) => {
    t.dropColumn('user_id');
    t.dropColumn('role');
  });

  // Drop push_subscriptions extra columns
  await knex.schema.alterTable('push_subscriptions', (t) => {
    t.dropColumn('platform');
    t.dropColumn('expo_push_token');
  });

  // Check and drop app_settings household_id if it exists
  const hasAppSettings = await knex.schema.hasTable('app_settings');
  if (hasAppSettings) {
    const hasCol = await knex.schema.hasColumn('app_settings', 'household_id');
    if (hasCol) {
      await knex.schema.alterTable('app_settings', (t) => {
        t.dropColumn('household_id');
      });
    }
  }

  // Drop new tables
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('households');
  await knex.schema.dropTableIfExists('users');
}
