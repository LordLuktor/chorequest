import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';

export const membersRouter = Router();
membersRouter.use(requireAuth);

// List all members
membersRouter.get('/', async (req, res) => {
  try {
    const members = await db('household_members').where('household_id', req.householdId).orderBy('name');
    res.json(members);
  } catch (err) {
    console.error('GET /members error:', err);
    res.status(500).json({ message: 'Failed to fetch members' });
  }
});

// Create member
membersRouter.post('/', async (req, res) => {
  try {
    const { name, avatar_color } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
      res.status(400).json({ message: 'Name is required (max 100 characters)' });
      return;
    }
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    const color = avatar_color && colorRegex.test(avatar_color) ? avatar_color : '#3B82F6';

    const [member] = await db('household_members')
      .insert({ name: name.trim(), avatar_color: color, household_id: req.householdId })
      .returning('*');
    res.status(201).json(member);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'A member with that name already exists' });
      return;
    }
    console.error('POST /members error:', err);
    res.status(500).json({ message: 'Failed to create member' });
  }
});

// Update member
membersRouter.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const updates: Record<string, string> = {};
    if (req.body.name && typeof req.body.name === 'string' && req.body.name.trim().length > 0) {
      updates.name = req.body.name.trim().slice(0, 100);
    }
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (req.body.avatar_color && colorRegex.test(req.body.avatar_color)) {
      updates.avatar_color = req.body.avatar_color;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: 'No valid fields to update' });
      return;
    }

    const [member] = await db('household_members').where({ id, household_id: req.householdId }).update(updates).returning('*');
    if (!member) { res.status(404).json({ message: 'Member not found' }); return; }
    res.json(member);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ message: 'A member with that name already exists' });
      return;
    }
    console.error('PUT /members error:', err);
    res.status(500).json({ message: 'Failed to update member' });
  }
});

// Delete member
membersRouter.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ message: 'Invalid ID' }); return; }

    const deleted = await db('household_members').where({ id, household_id: req.householdId }).delete();
    if (!deleted) { res.status(404).json({ message: 'Member not found' }); return; }
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /members error:', err);
    res.status(500).json({ message: 'Failed to delete member' });
  }
});
