import { Router } from 'express';
import db from '../db';
import { checkAchievements } from '../services/achievements';
import { logAction } from '../services/audit';
import { requireAuth } from '../middleware/auth';
import { getIO } from '../websocket';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

// Query task instances
tasksRouter.get('/', async (req, res) => {
  try {
    const { start, end, member, status } = req.query;

    let query = db('task_instances as ti')
      .join('task_templates as tt', 'ti.template_id', 'tt.id')
      .leftJoin('household_members as m', 'ti.assigned_to', 'm.id')
      .where('ti.household_id', req.householdId)
      .select(
        'ti.*',
        'tt.title',
        'tt.icon',
        'tt.description',
        'tt.points as template_points',
        'm.name as assignee_name',
        'm.avatar_color as assignee_color'
      )
      .orderBy('ti.due_date', 'asc')
      .orderBy('ti.id', 'asc');

    if (start) query = query.where('ti.due_date', '>=', start as string);
    if (end) query = query.where('ti.due_date', '<=', end as string);
    if (member) query = query.where('ti.assigned_to', parseInt(member as string));
    if (status) query = query.where('ti.status', status as string);

    const tasks = await query;
    res.json(tasks);
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// Update task instance
tasksRouter.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const allowed = ['assigned_to', 'notes', 'status'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const [task] = await db('task_instances').where({ id, household_id: req.householdId }).update(updates).returning('*');
    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }
    res.json(task);
  } catch (err) {
    console.error('PUT /tasks error:', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// Complete task
tasksRouter.post('/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const { member_id } = req.body;
    if (!member_id) { res.status(400).json({ message: 'member_id is required' }); return; }

    const task = await db('task_instances as ti')
      .join('task_templates as tt', 'ti.template_id', 'tt.id')
      .where('ti.id', id)
      .where('ti.household_id', req.householdId)
      .select('ti.*', 'tt.points as template_points')
      .first();

    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }
    if (task.status !== 'pending') { res.status(400).json({ message: 'Task is not pending' }); return; }

    const now = new Date();
    const isEarlyBird = now.getHours() < 12;
    const pointsAwarded = task.template_points + (isEarlyBird ? 1 : 0);

    const [updated] = await db('task_instances')
      .where({ id })
      .update({
        status: 'completed',
        completed_by: member_id,
        completed_at: now.toISOString(),
        points_awarded: pointsAwarded,
        previous_status: task.status,
        undone_at: null,
      })
      .returning('*');

    // Award points to the assigned member, not whoever clicked complete (e.g. wallscreen user)
    const pointsRecipient = task.assigned_to || member_id;

    await db('household_members')
      .where({ id: pointsRecipient })
      .increment('points_total', pointsAwarded);

    const newAchievements = await checkAchievements(pointsRecipient);

    await logAction('task_completed', 'task_instance', id, member_id, {
      points_awarded: pointsAwarded,
      early_bird: isEarlyBird,
      template_id: task.template_id,
    }, req.householdId);

    const io = getIO();
    if (io) io.to(`household:${req.householdId}`).emit('task:updated', { taskId: id });

    res.json({ ...updated, new_achievements: newAchievements });
  } catch (err) {
    console.error('POST /tasks/:id/complete error:', err);
    res.status(500).json({ message: 'Failed to complete task' });
  }
});

// Skip task
tasksRouter.post('/:id/skip', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const { member_id } = req.body;

    const task = await db('task_instances').where({ id, household_id: req.householdId }).first();
    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }
    if (task.status !== 'pending') { res.status(400).json({ message: 'Task is not pending' }); return; }

    const [updated] = await db('task_instances')
      .where({ id, household_id: req.householdId })
      .update({
        status: 'skipped',
        previous_status: task.status,
        undone_at: null,
      })
      .returning('*');

    await logAction('task_skipped', 'task_instance', id, member_id || null, {
      template_id: task.template_id,
    }, req.householdId);

    const io = getIO();
    if (io) io.to(`household:${req.householdId}`).emit('task:updated', { taskId: id });

    res.json(updated);
  } catch (err) {
    console.error('POST /tasks/:id/skip error:', err);
    res.status(500).json({ message: 'Failed to skip task' });
  }
});

// Undo complete or skip (within 30 seconds)
tasksRouter.post('/:id/undo', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const { member_id } = req.body;

    const task = await db('task_instances').where({ id, household_id: req.householdId }).first();
    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }
    if (task.status === 'pending') { res.status(400).json({ message: 'Task is already pending' }); return; }

    // Check 30-second window
    const actionTime = task.status === 'completed' ? task.completed_at : task.created_at;
    const elapsed = Date.now() - new Date(actionTime).getTime();
    if (elapsed > 30000) {
      res.status(400).json({ message: 'Undo window has expired (30 seconds)' });
      return;
    }

    const wasCompleted = task.status === 'completed';

    // Reverse points if it was completed
    if (wasCompleted && task.points_awarded > 0 && task.completed_by) {
      await db('household_members')
        .where({ id: task.completed_by })
        .decrement('points_total', task.points_awarded);
    }

    const [updated] = await db('task_instances')
      .where({ id, household_id: req.householdId })
      .update({
        status: 'pending',
        completed_by: null,
        completed_at: null,
        points_awarded: 0,
        undone_at: new Date().toISOString(),
        previous_status: task.status,
      })
      .returning('*');

    await logAction('task_undone', 'task_instance', id, member_id || null, {
      previous_status: task.status,
      points_reversed: wasCompleted ? task.points_awarded : 0,
      template_id: task.template_id,
    }, req.householdId);

    const io = getIO();
    if (io) io.to(`household:${req.householdId}`).emit('task:updated', { taskId: id });

    res.json(updated);
  } catch (err) {
    console.error('POST /tasks/:id/undo error:', err);
    res.status(500).json({ message: 'Failed to undo task' });
  }
});
