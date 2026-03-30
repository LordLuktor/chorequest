import { Router } from 'express';
import db from '../db';
import { getVapidPublicKey, isPushEnabled } from '../services/push';
import { requireAuth } from '../middleware/auth';

export const pushRouter = Router();
pushRouter.use(requireAuth);

// Get VAPID public key (needed by frontend to subscribe)
pushRouter.get('/vapid-key', (_req, res) => {
  if (!isPushEnabled()) {
    res.status(503).json({ message: 'Push notifications not configured' });
    return;
  }
  res.json({ publicKey: getVapidPublicKey() });
});

// Subscribe to push notifications
pushRouter.post('/subscribe', async (req, res) => {
  try {
    const { member_id, subscription } = req.body;
    if (!member_id || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ message: 'Invalid subscription data' });
      return;
    }

    // Upsert by endpoint
    const existing = await db('push_subscriptions').where({ endpoint: subscription.endpoint, household_id: req.householdId }).first();
    if (existing) {
      await db('push_subscriptions').where({ id: existing.id, household_id: req.householdId }).update({
        member_id,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
      });
    } else {
      await db('push_subscriptions').insert({
        member_id,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        household_id: req.householdId,
      });
    }

    res.json({ message: 'Subscribed' });
  } catch (err) {
    console.error('POST /push/subscribe error:', err);
    res.status(500).json({ message: 'Failed to subscribe' });
  }
});

// Unsubscribe
pushRouter.delete('/subscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) { res.status(400).json({ message: 'Endpoint required' }); return; }

    await db('push_subscriptions').where({ endpoint, household_id: req.householdId }).delete();
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /push/subscribe error:', err);
    res.status(500).json({ message: 'Failed to unsubscribe' });
  }
});
