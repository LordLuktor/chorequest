import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';
import { getIO } from '../websocket';
import { generateEventInstances } from '../scheduler';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

function clampReminder(value: any): number | null {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return null;
  return Math.max(0, Math.min(10080, parsed));
}

function parseMemberIds(value: any): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseReminderOffsets(value: any): number[] {
  if (!Array.isArray(value)) return [];
  const offsets = value.map(clampReminder).filter((n): n is number => n !== null);
  return [...new Set(offsets)];
}

async function replaceAssignees(eventId: number, memberIds: number[]): Promise<void> {
  await db('calendar_event_assignees').where({ event_id: eventId }).delete();
  if (memberIds.length > 0) {
    await db('calendar_event_assignees').insert(memberIds.map((member_id) => ({ event_id: eventId, member_id })));
  }
}

async function replaceReminders(eventId: number, offsets: number[]): Promise<void> {
  await db('calendar_event_reminders').where({ event_id: eventId }).delete();
  if (offsets.length > 0) {
    await db('calendar_event_reminders').insert(offsets.map((minutes_before) => ({ event_id: eventId, minutes_before })));
  }
}

const ASSIGNEES_SUBQUERY = `(
  SELECT COALESCE(json_agg(json_build_object('id', m.id, 'name', m.name, 'color', m.avatar_color)), '[]'::json)
  FROM calendar_event_assignees cea
  JOIN household_members m ON m.id = cea.member_id
  WHERE cea.event_id = ce.id
) as assignees`;

const REMINDERS_SUBQUERY = `(
  SELECT COALESCE(json_agg(cer.minutes_before ORDER BY cer.minutes_before), '[]'::json)
  FROM calendar_event_reminders cer
  WHERE cer.event_id = ce.id
) as reminder_minutes_before`;

/**
 * GET /?start&end — list event occurrences for the household, optionally
 * restricted to a date range. Flattens calendar_event_instances + calendar_events
 * into one row per occurrence, mirroring how GET /tasks flattens task_instances + task_templates.
 * Assignees and reminder offsets are aggregated per event via correlated subqueries
 * since an event can now have many of each.
 */
eventsRouter.get('/', async (req, res) => {
  try {
    const householdId = req.householdId;
    const { start, end } = req.query as { start?: string; end?: string };

    const query = db('calendar_event_instances as ci')
      .join('calendar_events as ce', 'ci.event_id', 'ce.id')
      .where('ci.household_id', householdId)
      .select(
        'ci.id as instance_id',
        'ce.id as event_id',
        'ce.title',
        'ce.icon',
        'ce.description',
        'ci.occurrence_date',
        'ce.event_date as series_start_date',
        'ce.event_time',
        'ce.end_time',
        'ci.is_cancelled',
        'ce.recurrence_rule',
        'ce.recurrence_end_date',
        db.raw(ASSIGNEES_SUBQUERY),
        db.raw(REMINDERS_SUBQUERY),
        db.raw('(ce.recurrence_rule IS NOT NULL) as is_recurring')
      )
      .orderBy('ci.occurrence_date', 'asc');

    if (start) query.where('ci.occurrence_date', '>=', start);
    if (end) query.where('ci.occurrence_date', '<', end);

    const occurrences = await query;
    res.json(occurrences);
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ message: 'Failed to fetch events' });
  }
});

/**
 * POST / — create a calendar event. One-off events (no recurrence_rule) get a
 * single instance inserted directly; recurring events go through the same
 * RRULE expansion chores use (generateEventInstances). Assignees and reminders
 * are written to their join tables after the event row exists.
 */
eventsRouter.post('/', async (req, res) => {
  try {
    const householdId = req.householdId;
    const memberId = req.user!.mid;
    const {
      title, description, icon, assigned_to, event_date, event_time, end_time,
      recurrence_rule, recurrence_end_date, reminder_minutes_before,
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    if (!event_date || typeof event_date !== 'string' || !DATE_PATTERN.test(event_date)) {
      res.status(400).json({ message: 'A valid event date (YYYY-MM-DD) is required' });
      return;
    }
    if (event_time && !TIME_PATTERN.test(event_time)) {
      res.status(400).json({ message: 'Invalid event time format' });
      return;
    }
    if (end_time && !TIME_PATTERN.test(end_time)) {
      res.status(400).json({ message: 'Invalid end time format' });
      return;
    }
    if (recurrence_end_date && !DATE_PATTERN.test(recurrence_end_date)) {
      res.status(400).json({ message: 'Invalid recurrence end date format' });
      return;
    }

    const insertData: Record<string, any> = {
      household_id: householdId,
      title: title.trim().slice(0, 150),
      description: description ? String(description).trim().slice(0, 500) : null,
      icon: icon ? String(icon).slice(0, 10) : null,
      event_date,
      event_time: event_time || null,
      end_time: end_time || null,
      recurrence_rule: recurrence_rule && typeof recurrence_rule === 'string' ? recurrence_rule : null,
      recurrence_end_date: recurrence_end_date || null,
      created_by: memberId || null,
    };

    const [event] = await db('calendar_events').insert(insertData).returning('*');

    await replaceAssignees(event.id, parseMemberIds(assigned_to));
    await replaceReminders(event.id, parseReminderOffsets(reminder_minutes_before));

    if (event.recurrence_rule) {
      await generateEventInstances(event.id);
    } else {
      await db('calendar_event_instances')
        .insert({ event_id: event.id, household_id: householdId, occurrence_date: event.event_date })
        .onConflict(['event_id', 'occurrence_date'])
        .ignore();
    }

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('events:updated');

    res.status(201).json(event);
  } catch (err) {
    console.error('POST /events error:', err);
    res.status(500).json({ message: 'Failed to create event' });
  }
});

/**
 * PUT /:id — update an event. If schedule-relevant fields changed, future
 * non-cancelled instances are regenerated (cancelled occurrences are preserved,
 * same pattern PUT /templates/:id uses for pending vs. completed/skipped instances).
 * assigned_to / reminder_minutes_before, when provided, replace the join-table rows.
 */
eventsRouter.put('/:id', async (req, res) => {
  try {
    const householdId = req.householdId;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const allowed = ['title', 'description', 'icon', 'event_date', 'event_time', 'end_time', 'recurrence_rule', 'recurrence_end_date'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
        res.status(400).json({ message: 'Title cannot be empty' });
        return;
      }
      updates.title = updates.title.trim().slice(0, 150);
    }
    if (updates.description !== undefined) {
      updates.description = updates.description ? String(updates.description).trim().slice(0, 500) : null;
    }
    if (updates.icon !== undefined) {
      updates.icon = updates.icon ? String(updates.icon).slice(0, 10) : null;
    }
    if (updates.event_date !== undefined && !DATE_PATTERN.test(updates.event_date)) {
      res.status(400).json({ message: 'Invalid event date format' });
      return;
    }
    if (updates.event_time !== undefined && updates.event_time !== null && !TIME_PATTERN.test(updates.event_time)) {
      res.status(400).json({ message: 'Invalid event time format' });
      return;
    }
    if (updates.end_time !== undefined && updates.end_time !== null && !TIME_PATTERN.test(updates.end_time)) {
      res.status(400).json({ message: 'Invalid end time format' });
      return;
    }
    if (updates.recurrence_end_date !== undefined && updates.recurrence_end_date !== null && !DATE_PATTERN.test(updates.recurrence_end_date)) {
      res.status(400).json({ message: 'Invalid recurrence end date format' });
      return;
    }

    const [event] = await db('calendar_events').where({ id, household_id: householdId }).update(updates).returning('*');
    if (!event) { res.status(404).json({ message: 'Event not found' }); return; }

    if (req.body.assigned_to !== undefined) {
      await replaceAssignees(id, parseMemberIds(req.body.assigned_to));
    }
    if (req.body.reminder_minutes_before !== undefined) {
      await replaceReminders(id, parseReminderOffsets(req.body.reminder_minutes_before));
    }

    const scheduleChanged = updates.event_date !== undefined || updates.event_time !== undefined ||
      updates.recurrence_rule !== undefined || updates.recurrence_end_date !== undefined;

    if (scheduleChanged) {
      const today = new Date().toISOString().split('T')[0];
      await db('calendar_event_instances')
        .where({ event_id: id, is_cancelled: false })
        .where('occurrence_date', '>=', today)
        .delete();

      if (event.recurrence_rule) {
        await generateEventInstances(id);
      } else {
        await db('calendar_event_instances')
          .insert({ event_id: id, household_id: householdId, occurrence_date: event.event_date })
          .onConflict(['event_id', 'occurrence_date'])
          .ignore();
      }
    }

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('events:updated');

    res.json(event);
  } catch (err) {
    console.error('PUT /events error:', err);
    res.status(500).json({ message: 'Failed to update event' });
  }
});

/**
 * PUT /instances/:instanceId/cancel — toggle is_cancelled on a single occurrence.
 * This is "skip just this one" for a recurring event, without touching the series.
 */
eventsRouter.put('/instances/:instanceId/cancel', async (req, res) => {
  try {
    const householdId = req.householdId;
    const instanceId = parseInt(req.params.instanceId, 10);
    if (isNaN(instanceId)) { res.status(400).json({ message: 'Invalid instance ID' }); return; }

    const existing = await db('calendar_event_instances').where({ id: instanceId, household_id: householdId }).first();
    if (!existing) { res.status(404).json({ message: 'Event occurrence not found' }); return; }

    const [updated] = await db('calendar_event_instances')
      .where({ id: instanceId })
      .update({ is_cancelled: !existing.is_cancelled })
      .returning('*');

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('events:updated');

    res.json(updated);
  } catch (err) {
    console.error('PUT /events/instances/:instanceId/cancel error:', err);
    res.status(500).json({ message: 'Failed to update event occurrence' });
  }
});

/**
 * DELETE /:id — delete the whole event series; instances and join-table rows cascade via FK.
 */
eventsRouter.delete('/:id', async (req, res) => {
  try {
    const householdId = req.householdId;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const deleted = await db('calendar_events').where({ id, household_id: householdId }).delete();
    if (!deleted) { res.status(404).json({ message: 'Event not found' }); return; }

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('events:updated');

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /events error:', err);
    res.status(500).json({ message: 'Failed to delete event' });
  }
});
