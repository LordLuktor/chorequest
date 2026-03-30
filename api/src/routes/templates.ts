import { Router } from 'express';
import db from '../db';
import { generateInstances } from '../scheduler';
import { requireAuth } from '../middleware/auth';

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

// List all templates
templatesRouter.get('/', async (req, res) => {
  try {
    const templates = await db('task_templates as t')
      .leftJoin('household_members as m', 't.assigned_to', 'm.id')
      .where('t.household_id', req.householdId)
      .select('t.*', 'm.name as assignee_name', 'm.avatar_color as assignee_color')
      .orderBy('t.created_at', 'desc');
    res.json(templates);
  } catch (err) {
    console.error('GET /templates error:', err);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
});

// Create template
templatesRouter.post('/', async (req, res) => {
  try {
    const { title, description, icon, points, assigned_to, recurrence_rule, start_date, end_date, created_by, is_active, weekly_assignments, repeat_interval } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    if (!start_date) {
      res.status(400).json({ message: 'Start date is required' });
      return;
    }
    // Either weekly_assignments or recurrence_rule is required
    if (!weekly_assignments && (!recurrence_rule || typeof recurrence_rule !== 'string')) {
      res.status(400).json({ message: 'Schedule is required' });
      return;
    }

    const insertData: Record<string, any> = {
      title: title.trim().slice(0, 255),
      description: description || null,
      icon: icon ? String(icon).slice(0, 50) : null,
      points: Math.max(1, Math.min(100, parseInt(points) || 1)),
      start_date,
      end_date: end_date || null,
      created_by: created_by || null,
      is_active: is_active !== false,
      household_id: req.householdId,
    };

    if (weekly_assignments && typeof weekly_assignments === 'object') {
      // Normalize to array format: { "0": [2, 5] }
      const normalized: Record<string, number[]> = {};
      for (const [dow, val] of Object.entries(weekly_assignments)) {
        if (val === null || val === undefined) {
          normalized[dow] = [];
        } else if (Array.isArray(val)) {
          normalized[dow] = val;
        } else {
          normalized[dow] = [val as number];
        }
      }
      insertData.weekly_assignments = JSON.stringify(normalized);
      insertData.repeat_interval = repeat_interval === 2 ? 2 : 1;
      insertData.assigned_to = null;
      insertData.recurrence_rule = 'WEEKLY_ASSIGNMENTS';
    } else {
      insertData.assigned_to = assigned_to || null;
      insertData.recurrence_rule = recurrence_rule;
      insertData.weekly_assignments = null;
      insertData.repeat_interval = 1;
    }

    const [template] = await db('task_templates')
      .insert(insertData)
      .returning('*');

    await generateInstances(template.id);

    res.status(201).json(template);
  } catch (err) {
    console.error('POST /templates error:', err);
    res.status(500).json({ message: 'Failed to create template' });
  }
});

// Update template
templatesRouter.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const allowed = ['title', 'description', 'icon', 'points', 'assigned_to', 'recurrence_rule', 'start_date', 'end_date', 'is_active', 'weekly_assignments', 'repeat_interval'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    if (updates.title) updates.title = String(updates.title).trim().slice(0, 255);
    if (updates.points) updates.points = Math.max(1, Math.min(100, parseInt(updates.points) || 1));
    if (updates.weekly_assignments && typeof updates.weekly_assignments === 'object') {
      // Normalize to array format
      const normalized: Record<string, number[]> = {};
      for (const [dow, val] of Object.entries(updates.weekly_assignments as Record<string, any>)) {
        if (val === null || val === undefined) {
          normalized[dow] = [];
        } else if (Array.isArray(val)) {
          normalized[dow] = val;
        } else {
          normalized[dow] = [val as number];
        }
      }
      updates.weekly_assignments = JSON.stringify(normalized);
    }
    updates.updated_at = db.fn.now();

    const [template] = await db('task_templates').where({ id, household_id: req.householdId }).update(updates).returning('*');
    if (!template) { res.status(404).json({ message: 'Template not found' }); return; }

    // Regenerate future instances if schedule changed
    const scheduleChanged = updates.recurrence_rule || updates.start_date || updates.end_date ||
      updates.assigned_to !== undefined || updates.weekly_assignments || updates.repeat_interval;
    if (scheduleChanged) {
      await db('task_instances')
        .where({ template_id: id, status: 'pending' })
        .where('due_date', '>=', new Date().toISOString().split('T')[0])
        .delete();
      await generateInstances(id);
    }

    res.json(template);
  } catch (err) {
    console.error('PUT /templates error:', err);
    res.status(500).json({ message: 'Failed to update template' });
  }
});

// Delete template
templatesRouter.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const deleted = await db('task_templates').where({ id, household_id: req.householdId }).delete();
    if (!deleted) { res.status(404).json({ message: 'Template not found' }); return; }
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /templates error:', err);
    res.status(500).json({ message: 'Failed to delete template' });
  }
});
