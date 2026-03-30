import webpush from 'web-push';
import fs from 'fs';
import db from '../db';

function readSecret(name: string, envFallback: string): string {
  const path = `/run/secrets/${name}`;
  if (fs.existsSync(path)) {
    return fs.readFileSync(path, 'utf8').trim();
  }
  return process.env[envFallback] || '';
}

const vapidPublic = readSecret('chorequest_vapid_public', 'VAPID_PUBLIC_KEY');
const vapidPrivate = readSecret('chorequest_vapid_private', 'VAPID_PRIVATE_KEY');
const vapidEmail = readSecret('chorequest_vapid_email', 'VAPID_EMAIL');

let pushEnabled = false;

if (vapidPublic && vapidPrivate && vapidEmail) {
  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
  pushEnabled = true;
  console.log('Web Push enabled.');
} else {
  console.warn('Web Push disabled — VAPID keys not configured.');
}

export function getVapidPublicKey(): string {
  return vapidPublic;
}

export function isPushEnabled(): boolean {
  return pushEnabled;
}

export async function sendNotification(memberId: number, payload: { title: string; body: string; icon?: string }): Promise<void> {
  if (!pushEnabled) return;

  const subscriptions = await db('push_subscriptions').where({ member_id: memberId });
  const message = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys_p256dh,
            auth: sub.keys_auth,
          },
        },
        message
      );
    } catch (err: any) {
      // Remove expired/invalid subscriptions
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db('push_subscriptions').where({ id: sub.id }).delete();
        console.log(`Removed expired push subscription ${sub.id}`);
      } else {
        console.error(`Push to subscription ${sub.id} failed:`, err.message);
      }
    }
  }
}

export async function sendDailyReminders(): Promise<void> {
  if (!pushEnabled) return;

  const today = new Date().toISOString().split('T')[0];

  // Get members with pending tasks today
  const memberTasks = await db('task_instances as ti')
    .join('household_members as m', 'ti.assigned_to', 'm.id')
    .where('ti.due_date', today)
    .where('ti.status', 'pending')
    .select('m.id as member_id', 'm.name')
    .count('ti.id as task_count')
    .groupBy('m.id', 'm.name');

  for (const entry of memberTasks) {
    const count = parseInt(String(entry.task_count));
    if (count > 0) {
      await sendNotification(entry.member_id, {
        title: 'ChoreQuest',
        body: `Hey ${entry.name}! You have ${count} chore${count > 1 ? 's' : ''} today.`,
        icon: '✅',
      });
    }
  }

  console.log(`Sent daily reminders to ${memberTasks.length} member(s).`);
}

export async function sendOverdueReminders(): Promise<void> {
  if (!pushEnabled) return;

  const today = new Date().toISOString().split('T')[0];

  // Get members with overdue tasks (past due_date, still pending)
  const memberOverdue = await db('task_instances as ti')
    .join('household_members as m', 'ti.assigned_to', 'm.id')
    .where('ti.due_date', '<', today)
    .where('ti.status', 'pending')
    .select('m.id as member_id', 'm.name')
    .count('ti.id as task_count')
    .groupBy('m.id', 'm.name');

  for (const entry of memberOverdue) {
    const count = parseInt(String(entry.task_count));
    if (count > 0) {
      await sendNotification(entry.member_id, {
        title: 'ChoreQuest - Overdue!',
        body: `${entry.name}, you have ${count} overdue chore${count > 1 ? 's' : ''}!`,
        icon: '⚠️',
      });
    }
  }

  if (memberOverdue.length > 0) {
    console.log(`Sent overdue reminders to ${memberOverdue.length} member(s).`);
  }
}
