import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// Get all settings
settingsRouter.get('/', async (req, res) => {
  try {
    const rows = await db('app_settings').where('household_id', req.householdId);
    const settings: Record<string, unknown> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error('GET /settings error:', err);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// Update a setting
settingsRouter.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    if (!key || key.length > 100) {
      res.status(400).json({ message: 'Invalid key' });
      return;
    }
    const { value } = req.body;
    if (value === undefined) {
      res.status(400).json({ message: 'Value is required' });
      return;
    }

    const existing = await db('app_settings').where({ key, household_id: req.householdId }).first();
    if (existing) {
      await db('app_settings').where({ key, household_id: req.householdId }).update({
        value: JSON.stringify(value),
        updated_at: db.fn.now(),
      });
    } else {
      await db('app_settings').insert({
        key,
        value: JSON.stringify(value),
        household_id: req.householdId,
      });
    }

    res.json({ key, value });
  } catch (err) {
    console.error('PUT /settings error:', err);
    res.status(500).json({ message: 'Failed to update setting' });
  }
});
