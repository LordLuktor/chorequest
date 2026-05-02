import { Router } from 'express';
import db from '../db';
import { requireAuth, requireParent } from '../middleware/auth';
import { getIO } from '../websocket';
import { sendSOSNotification } from '../services/email';

export const safetyRouter = Router();
safetyRouter.use(requireAuth);

// ── Haversine helper ────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Exported geofence check (called from locations route) ───────
export async function checkGeofences(
  householdId: string,
  memberId: number,
  lat: number,
  lng: number,
): Promise<void> {
  // Get all active geofences where this member is monitored
  const geofences = await db('geofences as g')
    .join('geofence_members as gm', 'g.id', 'gm.geofence_id')
    .where('g.household_id', householdId)
    .where('g.is_active', true)
    .where('gm.member_id', memberId)
    .select('g.id', 'g.name', 'g.latitude', 'g.longitude', 'g.radius_meters', 'g.notify_on_enter', 'g.notify_on_exit');

  if (geofences.length === 0) return;

  // Get member name for the event
  const member = await db('household_members')
    .where({ id: memberId, household_id: householdId })
    .select('name')
    .first();
  const memberName = member?.name || 'Unknown';

  // Get previous location to determine enter/exit
  const prevLocation = await db('member_locations')
    .where({ member_id: memberId })
    .select('latitude', 'longitude')
    .first();

  const io = getIO();

  for (const fence of geofences) {
    const currentDist = haversineMeters(lat, lng, fence.latitude, fence.longitude);
    const isInside = currentDist <= fence.radius_meters;

    // If we have a previous location, determine if this is an enter or exit event
    if (prevLocation) {
      const prevDist = haversineMeters(
        prevLocation.latitude,
        prevLocation.longitude,
        fence.latitude,
        fence.longitude,
      );
      const wasInside = prevDist <= fence.radius_meters;

      if (!wasInside && isInside && fence.notify_on_enter) {
        // Entered the geofence
        if (io) {
          io.to(`household:${householdId}`).emit('geofence:triggered', {
            geofenceName: fence.name,
            memberName,
            type: 'enter',
          });
        }
      } else if (wasInside && !isInside && fence.notify_on_exit) {
        // Exited the geofence
        if (io) {
          io.to(`household:${householdId}`).emit('geofence:triggered', {
            geofenceName: fence.name,
            memberName,
            type: 'exit',
          });
        }
      }
    } else if (isInside && fence.notify_on_enter) {
      // No previous location — first report inside a geofence counts as enter
      if (io) {
        io.to(`household:${householdId}`).emit('geofence:triggered', {
          geofenceName: fence.name,
          memberName,
          type: 'enter',
        });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  SOS ALERTS
// ═══════════════════════════════════════════════════════════════

// POST /sos — trigger SOS alert (any member)
safetyRouter.post('/sos', async (req, res) => {
  try {
    const memberId = req.user!.mid;
    const householdId = req.user!.hid;
    const { latitude, longitude, message } = req.body;

    // Validate optional coordinates
    if (latitude !== undefined && (typeof latitude !== 'number' || latitude < -90 || latitude > 90)) {
      res.status(400).json({ message: 'Invalid latitude' });
      return;
    }
    if (longitude !== undefined && (typeof longitude !== 'number' || longitude < -180 || longitude > 180)) {
      res.status(400).json({ message: 'Invalid longitude' });
      return;
    }
    // Validate optional message
    const sanitizedMessage = typeof message === 'string' ? message.slice(0, 500).trim() : null;

    const [alert] = await db('sos_alerts')
      .insert({
        household_id: householdId,
        member_id: memberId,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        message: sanitizedMessage,
        is_resolved: false,
        created_at: new Date(),
      })
      .returning('*');

    // Get member name for the WebSocket event
    const member = await db('household_members')
      .where({ id: memberId, household_id: householdId })
      .select('name')
      .first();

    const io = getIO();
    if (io) {
      io.to(`household:${householdId}`).emit('sos:alert', {
        memberId,
        memberName: member?.name || 'Unknown',
        latitude: alert.latitude,
        longitude: alert.longitude,
        message: alert.message,
      });
    }

    // Send SOS email notifications to all parents in the household
    try {
      const household = await db('households').where('id', householdId).select('name').first();
      const parentMembers = await db('household_members')
        .where({ household_id: householdId, role: 'parent' })
        .select('user_id');
      const parentUserIds = parentMembers.map((m: any) => m.user_id);

      if (parentUserIds.length > 0) {
        const parentUsers = await db('users')
          .whereIn('id', parentUserIds)
          .whereNotNull('email')
          .select('email');

        const memberName = member?.name || 'Unknown';
        const householdName = household?.name || 'Your household';

        await Promise.allSettled(
          parentUsers.map((u: any) =>
            sendSOSNotification(u.email, memberName, householdName),
          ),
        );
      }
    } catch (emailErr) {
      console.error('Failed to send SOS email notifications:', emailErr);
    }

    res.status(201).json(alert);
  } catch (err) {
    console.error('POST /sos error:', err);
    res.status(500).json({ message: 'Failed to create SOS alert' });
  }
});

// GET /sos — list recent SOS alerts (last 30 days)
safetyRouter.get('/sos', async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const alerts = await db('sos_alerts as s')
      .join('household_members as m', 's.member_id', 'm.id')
      .where('s.household_id', householdId)
      .where('s.created_at', '>=', thirtyDaysAgo)
      .orderBy('s.created_at', 'desc')
      .select(
        's.id',
        's.member_id',
        'm.name as member_name',
        's.latitude',
        's.longitude',
        's.message',
        's.is_resolved',
        's.resolved_by',
        's.created_at',
        's.resolved_at',
      );

    res.json(alerts);
  } catch (err) {
    console.error('GET /sos error:', err);
    res.status(500).json({ message: 'Failed to fetch SOS alerts' });
  }
});

// PUT /sos/:id/resolve — mark as resolved (parent only)
safetyRouter.put('/sos/:id/resolve', requireParent, async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const alertId = parseInt(req.params.id, 10);
    if (isNaN(alertId)) {
      res.status(400).json({ message: 'Invalid alert ID' });
      return;
    }

    const updated = await db('sos_alerts')
      .where({ id: alertId, household_id: householdId })
      .update({
        is_resolved: true,
        resolved_by: req.user!.mid,
        resolved_at: new Date(),
      });

    if (!updated) {
      res.status(404).json({ message: 'SOS alert not found' });
      return;
    }

    const alert = await db('sos_alerts').where({ id: alertId }).first();
    res.json(alert);
  } catch (err) {
    console.error('PUT /sos/:id/resolve error:', err);
    res.status(500).json({ message: 'Failed to resolve SOS alert' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  CHECK-IN REQUESTS
// ═══════════════════════════════════════════════════════════════

// POST /checkin/request — parent requests check-in from member
safetyRouter.post('/checkin/request', requireParent, async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const requestedBy = req.user!.mid;
    const { memberId } = req.body;

    if (!memberId || typeof memberId !== 'number') {
      res.status(400).json({ message: 'memberId is required and must be a number' });
      return;
    }

    // Verify target member belongs to same household and is not a display account
    const targetMember = await db('household_members')
      .where({ id: memberId, household_id: householdId })
      .first();
    if (!targetMember) {
      res.status(404).json({ message: 'Member not found in household' });
      return;
    }
    if (targetMember.role === 'display') {
      res.status(400).json({ message: 'Cannot request check-in from a display account' });
      return;
    }

    const [checkin] = await db('checkin_requests')
      .insert({
        household_id: householdId,
        requested_by: requestedBy,
        requested_of: memberId,
        status: 'pending',
        created_at: new Date(),
      })
      .returning('*');

    const io = getIO();
    if (io) {
      io.to(`household:${householdId}`).emit('checkin:requested', {
        requestId: checkin.id,
        requestedBy,
        requestedOfId: memberId,
      });
    }

    res.status(201).json(checkin);
  } catch (err) {
    console.error('POST /checkin/request error:', err);
    res.status(500).json({ message: 'Failed to create check-in request' });
  }
});

// POST /checkin/respond — member responds with location
safetyRouter.post('/checkin/respond', async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const memberId = req.user!.mid;
    const { requestId, latitude, longitude } = req.body;

    if (!requestId || typeof requestId !== 'number') {
      res.status(400).json({ message: 'requestId is required' });
      return;
    }
    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      res.status(400).json({ message: 'Valid latitude is required' });
      return;
    }
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      res.status(400).json({ message: 'Valid longitude is required' });
      return;
    }

    // Verify this check-in request exists and is for this member
    const checkin = await db('checkin_requests')
      .where({ id: requestId, household_id: householdId, requested_of: memberId, status: 'pending' })
      .first();
    if (!checkin) {
      res.status(404).json({ message: 'Pending check-in request not found' });
      return;
    }

    await db('checkin_requests')
      .where({ id: requestId })
      .update({
        status: 'responded',
        response_latitude: latitude,
        response_longitude: longitude,
        responded_at: new Date(),
      });

    const io = getIO();
    if (io) {
      io.to(`household:${householdId}`).emit('checkin:responded', {
        requestId,
        memberId,
        latitude,
        longitude,
      });
    }

    const updated = await db('checkin_requests').where({ id: requestId }).first();
    res.json(updated);
  } catch (err) {
    console.error('POST /checkin/respond error:', err);
    res.status(500).json({ message: 'Failed to respond to check-in' });
  }
});

// GET /checkin — list recent check-in requests (last 7 days)
safetyRouter.get('/checkin', async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const requests = await db('checkin_requests as c')
      .join('household_members as requester', 'c.requested_by', 'requester.id')
      .join('household_members as target', 'c.requested_of', 'target.id')
      .where('c.household_id', householdId)
      .where('c.created_at', '>=', sevenDaysAgo)
      .orderBy('c.created_at', 'desc')
      .select(
        'c.id',
        'c.requested_by',
        'requester.name as requested_by_name',
        'c.requested_of',
        'target.name as requested_of_name',
        'c.status',
        'c.response_latitude',
        'c.response_longitude',
        'c.created_at',
        'c.responded_at',
      );

    res.json(requests);
  } catch (err) {
    console.error('GET /checkin error:', err);
    res.status(500).json({ message: 'Failed to fetch check-in requests' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  GEOFENCES (parent only for management)
// ═══════════════════════════════════════════════════════════════

// GET /geofences — list all for household
safetyRouter.get('/geofences', async (req, res) => {
  try {
    const householdId = req.user!.hid;

    const geofences = await db('geofences')
      .where({ household_id: householdId })
      .orderBy('created_at', 'desc');

    // Attach member IDs to each geofence
    const geofenceIds = geofences.map((g: any) => g.id);
    const memberLinks = geofenceIds.length > 0
      ? await db('geofence_members').whereIn('geofence_id', geofenceIds)
      : [];

    const result = geofences.map((g: any) => ({
      ...g,
      member_ids: memberLinks
        .filter((ml: any) => ml.geofence_id === g.id)
        .map((ml: any) => ml.member_id),
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /geofences error:', err);
    res.status(500).json({ message: 'Failed to fetch geofences' });
  }
});

// POST /geofences — create geofence (parent only)
safetyRouter.post('/geofences', requireParent, async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const { name, latitude, longitude, radius_meters, notify_on_enter, notify_on_exit, memberIds } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      res.status(400).json({ message: 'Valid latitude is required' });
      return;
    }
    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      res.status(400).json({ message: 'Valid longitude is required' });
      return;
    }

    const sanitizedName = name.trim().slice(0, 100);
    const radiusVal = typeof radius_meters === 'number' && radius_meters > 0 && radius_meters <= 10000
      ? Math.round(radius_meters)
      : 200;

    const [geofence] = await db('geofences')
      .insert({
        household_id: householdId,
        name: sanitizedName,
        latitude,
        longitude,
        radius_meters: radiusVal,
        created_by: req.user!.mid,
        notify_on_enter: notify_on_enter !== false,
        notify_on_exit: notify_on_exit !== false,
        is_active: true,
        created_at: new Date(),
      })
      .returning('*');

    // Link members
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      // Verify all member IDs belong to the household
      const validMembers = await db('household_members')
        .where('household_id', householdId)
        .whereIn('id', memberIds)
        .select('id');
      const validIds = validMembers.map((m: any) => m.id);

      if (validIds.length > 0) {
        await db('geofence_members').insert(
          validIds.map((mid: number) => ({ geofence_id: geofence.id, member_id: mid })),
        );
      }
    }

    res.status(201).json({ ...geofence, member_ids: memberIds || [] });
  } catch (err) {
    console.error('POST /geofences error:', err);
    res.status(500).json({ message: 'Failed to create geofence' });
  }
});

// PUT /geofences/:id — update geofence (parent only)
safetyRouter.put('/geofences/:id', requireParent, async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const geofenceId = parseInt(req.params.id, 10);
    if (isNaN(geofenceId)) {
      res.status(400).json({ message: 'Invalid geofence ID' });
      return;
    }

    const existing = await db('geofences').where({ id: geofenceId, household_id: householdId }).first();
    if (!existing) {
      res.status(404).json({ message: 'Geofence not found' });
      return;
    }

    const { name, latitude, longitude, radius_meters, notify_on_enter, notify_on_exit, is_active, memberIds } = req.body;

    const updates: Record<string, any> = {};
    if (typeof name === 'string' && name.trim().length > 0) updates.name = name.trim().slice(0, 100);
    if (typeof latitude === 'number' && latitude >= -90 && latitude <= 90) updates.latitude = latitude;
    if (typeof longitude === 'number' && longitude >= -180 && longitude <= 180) updates.longitude = longitude;
    if (typeof radius_meters === 'number' && radius_meters > 0 && radius_meters <= 10000) updates.radius_meters = Math.round(radius_meters);
    if (typeof notify_on_enter === 'boolean') updates.notify_on_enter = notify_on_enter;
    if (typeof notify_on_exit === 'boolean') updates.notify_on_exit = notify_on_exit;
    if (typeof is_active === 'boolean') updates.is_active = is_active;

    if (Object.keys(updates).length > 0) {
      await db('geofences').where({ id: geofenceId }).update(updates);
    }

    // Update member links if provided
    if (Array.isArray(memberIds)) {
      await db('geofence_members').where({ geofence_id: geofenceId }).delete();

      if (memberIds.length > 0) {
        const validMembers = await db('household_members')
          .where('household_id', householdId)
          .whereIn('id', memberIds)
          .select('id');
        const validIds = validMembers.map((m: any) => m.id);

        if (validIds.length > 0) {
          await db('geofence_members').insert(
            validIds.map((mid: number) => ({ geofence_id: geofenceId, member_id: mid })),
          );
        }
      }
    }

    const updated = await db('geofences').where({ id: geofenceId }).first();
    const links = await db('geofence_members').where({ geofence_id: geofenceId });
    res.json({ ...updated, member_ids: links.map((l: any) => l.member_id) });
  } catch (err) {
    console.error('PUT /geofences/:id error:', err);
    res.status(500).json({ message: 'Failed to update geofence' });
  }
});

// DELETE /geofences/:id — delete geofence (parent only)
safetyRouter.delete('/geofences/:id', requireParent, async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const geofenceId = parseInt(req.params.id, 10);
    if (isNaN(geofenceId)) {
      res.status(400).json({ message: 'Invalid geofence ID' });
      return;
    }

    const deleted = await db('geofences')
      .where({ id: geofenceId, household_id: householdId })
      .delete();

    if (!deleted) {
      res.status(404).json({ message: 'Geofence not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /geofences/:id error:', err);
    res.status(500).json({ message: 'Failed to delete geofence' });
  }
});

// POST /geofences/check — check if member is inside any geofence
// Used internally from location updates; also available as an endpoint
safetyRouter.post('/geofences/check', async (req, res) => {
  try {
    const householdId = req.user!.hid;
    const { memberId, latitude, longitude } = req.body;

    if (typeof memberId !== 'number' || typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ message: 'memberId, latitude, and longitude are required numbers' });
      return;
    }

    await checkGeofences(householdId, memberId, latitude, longitude);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /geofences/check error:', err);
    res.status(500).json({ message: 'Failed to check geofences' });
  }
});
