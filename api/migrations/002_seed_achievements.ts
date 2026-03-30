import type { Knex } from 'knex';

const ACHIEVEMENTS = [
  { key: 'first_task', title: 'First Step', description: 'Complete your first task', icon: '👣', threshold: 1, category: 'total' },
  { key: 'tasks_10', title: 'Getting Started', description: 'Complete 10 tasks', icon: '🌱', threshold: 10, category: 'total' },
  { key: 'tasks_50', title: 'Halfway Hero', description: 'Complete 50 tasks', icon: '⚡', threshold: 50, category: 'total' },
  { key: 'tasks_100', title: 'Centurion', description: 'Complete 100 tasks', icon: '💯', threshold: 100, category: 'total' },
  { key: 'tasks_500', title: 'Legend', description: 'Complete 500 tasks', icon: '👑', threshold: 500, category: 'total' },
  { key: 'streak_3', title: 'Hat Trick', description: 'Maintain a 3-day streak', icon: '🎯', threshold: 3, category: 'streak' },
  { key: 'streak_7', title: 'On Fire', description: 'Maintain a 7-day streak', icon: '🔥', threshold: 7, category: 'streak' },
  { key: 'streak_30', title: 'Unstoppable', description: 'Maintain a 30-day streak', icon: '🏆', threshold: 30, category: 'streak' },
  { key: 'early_bird_10', title: 'Early Bird', description: 'Complete 10 tasks before noon', icon: '🌅', threshold: 10, category: 'special' },
  { key: 'zero_skip_week', title: 'Perfect Week', description: 'Complete a week with zero skips', icon: '✨', threshold: 1, category: 'special' },
];

export async function up(knex: Knex): Promise<void> {
  await knex('achievements').insert(ACHIEVEMENTS);
}

export async function down(knex: Knex): Promise<void> {
  await knex('achievements').whereIn('key', ACHIEVEMENTS.map(a => a.key)).delete();
}
