import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('task_template_library', (t) => {
    t.increments('id').primary();
    t.string('pack_name', 100).notNullable();
    t.text('pack_description');
    t.string('title', 255).notNullable();
    t.text('description');
    t.string('icon', 50);
    t.integer('points').notNullable().defaultTo(1);
    t.jsonb('suggested_days');
    t.string('category', 50);
  });

  await knex('task_template_library').insert([
    // Daily Basics
    { pack_name: 'Daily Basics', pack_description: 'Essential daily tasks for kids', title: 'Make Bed', description: 'Make your bed neatly', icon: '🛏️', points: 1, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'daily_basics' },
    { pack_name: 'Daily Basics', pack_description: 'Essential daily tasks for kids', title: 'Brush Teeth', description: 'Morning and evening brushing', icon: '🦷', points: 1, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'daily_basics' },
    { pack_name: 'Daily Basics', pack_description: 'Essential daily tasks for kids', title: 'Pick Up Room', description: 'Put away toys and clothes', icon: '🧹', points: 1, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'daily_basics' },
    { pack_name: 'Daily Basics', pack_description: 'Essential daily tasks for kids', title: 'Set Table', description: 'Set the table for dinner', icon: '🍽️', points: 1, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'daily_basics' },
    { pack_name: 'Daily Basics', pack_description: 'Essential daily tasks for kids', title: 'Clear Table', description: 'Clear your dishes after meals', icon: '🧹', points: 1, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'daily_basics' },
    { pack_name: 'Daily Basics', pack_description: 'Essential daily tasks for kids', title: 'Put Away Backpack', description: 'Hang up backpack and empty lunch box', icon: '🎒', points: 1, suggested_days: JSON.stringify([1,2,3,4,5]), category: 'daily_basics' },
    // Weekly Deep Clean
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Vacuum Floors', description: 'Vacuum all carpeted areas', icon: '🧹', points: 3, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Mop Floors', description: 'Mop hard floors', icon: '🧹', points: 3, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Deep Clean Bathroom', description: 'Scrub toilet, tub, sink, mirrors', icon: '🚿', points: 4, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Dust Furniture', description: 'Dust all surfaces and shelves', icon: '✨', points: 2, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Clean Windows', description: 'Wipe down windows and glass', icon: '🪟', points: 3, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Organize Closet', description: 'Tidy closet and put away clothes', icon: '👕', points: 2, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    { pack_name: 'Weekly Deep Clean', pack_description: 'Thorough weekly cleaning tasks', title: 'Laundry', description: 'Wash, dry, and fold clothes', icon: '🧺', points: 3, suggested_days: JSON.stringify([6]), category: 'deep_clean' },
    // Starter Pack for Teens
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Dishes', description: 'Wash dishes or load/unload dishwasher', icon: '🍽️', points: 2, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Take Out Trash', description: 'Empty all trash cans', icon: '🗑️', points: 1, suggested_days: JSON.stringify([1,4]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Walk Dog', description: 'Walk the dog for at least 15 minutes', icon: '🐕', points: 2, suggested_days: JSON.stringify([0,1,2,3,4,5,6]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Mow Lawn', description: 'Mow front and back yard', icon: '🌿', points: 5, suggested_days: JSON.stringify([6]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Clean Kitchen', description: 'Wipe counters, clean appliances, sweep', icon: '🧹', points: 3, suggested_days: JSON.stringify([3,0]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Do Laundry', description: 'Wash, dry, fold, and put away', icon: '🧺', points: 3, suggested_days: JSON.stringify([2,5]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Vacuum Room', description: 'Vacuum your bedroom and common areas', icon: '🧹', points: 2, suggested_days: JSON.stringify([3,6]), category: 'teen_starter' },
    { pack_name: 'Starter Pack for Teens', pack_description: 'Age-appropriate chores for teenagers', title: 'Clean Bathroom', description: 'Clean toilet, sink, mirror, floor', icon: '🚿', points: 3, suggested_days: JSON.stringify([0]), category: 'teen_starter' },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('task_template_library');
}
