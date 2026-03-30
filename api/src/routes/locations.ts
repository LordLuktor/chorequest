import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';
import { getIO } from '../websocket';

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

// Report current location (from native app)
locationsRouter.post('/', async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;
    const memberId = req.user!.mid;
    const householdId = req.user!.hid;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ message: 'latitude and longitude are required numbers' });
      return;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      res.status(400).json({ message: 'Invalid coordinates' });
      return;
    }

    // Upsert — only keep latest location per member
    await db('member_locations')
      .insert({
        member_id: memberId,
        household_id: householdId,
        latitude,
        longitude,
        accuracy: typeof accuracy === 'number' ? accuracy : null,
        updated_at: new Date(),
      })
      .onConflict('member_id')
      .merge(['latitude', 'longitude', 'accuracy', 'updated_at']);

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('location:updated', { memberId });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /locations error:', err);
    res.status(500).json({ message: 'Failed to update location' });
  }
});

// Get all household members' latest locations
locationsRouter.get('/', async (req, res) => {
  try {
    const householdId = req.user!.hid;

    const locations = await db('member_locations as ml')
      .join('household_members as m', 'ml.member_id', 'm.id')
      .where('ml.household_id', householdId)
      .select(
        'ml.member_id',
        'm.name as member_name',
        'm.avatar_color',
        'ml.latitude',
        'ml.longitude',
        'ml.accuracy',
        'ml.updated_at'
      );

    res.json(locations);
  } catch (err) {
    console.error('GET /locations error:', err);
    res.status(500).json({ message: 'Failed to fetch locations' });
  }
});

// Delete own location (stop sharing)
locationsRouter.delete('/', async (req, res) => {
  try {
    await db('member_locations')
      .where({ member_id: req.user!.mid })
      .delete();
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /locations error:', err);
    res.status(500).json({ message: 'Failed to delete location' });
  }
});
