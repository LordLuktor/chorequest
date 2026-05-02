import { Router } from 'express';
import db from '../db';
import { requireAuth } from '../middleware/auth';
import { getIO } from '../websocket';

export const shoppingRouter = Router();
shoppingRouter.use(requireAuth);

// Allowed categories (allowlist)
const VALID_CATEGORIES = ['General', 'Groceries', 'Household', 'Personal'];

/**
 * GET / — list all shopping items for the household.
 * Unchecked items first (newest first), then checked items (most recently checked first).
 * Joins with household_members to get added_by_name and checked_by_name.
 */
shoppingRouter.get('/', async (req, res) => {
  try {
    const householdId = req.householdId;

    const items = await db('shopping_items as si')
      .leftJoin('household_members as adder', 'si.added_by', 'adder.id')
      .leftJoin('household_members as checker', 'si.checked_by', 'checker.id')
      .where('si.household_id', householdId)
      .select(
        'si.id',
        'si.text',
        'si.category',
        'si.added_by',
        'adder.name as added_by_name',
        'si.is_checked',
        'si.checked_by',
        'checker.name as checked_by_name',
        'si.created_at',
        'si.checked_at'
      )
      .orderByRaw('si.is_checked ASC, CASE WHEN si.is_checked THEN si.checked_at END DESC NULLS LAST, si.created_at DESC');

    res.json(items);
  } catch (err) {
    console.error('GET /shopping error:', err);
    res.status(500).json({ message: 'Failed to fetch shopping items' });
  }
});

/**
 * POST / — add a new shopping item.
 * Body: { text: string, category?: string }
 */
shoppingRouter.post('/', async (req, res) => {
  try {
    const householdId = req.householdId;
    const memberId = req.user!.mid;
    const { text, category } = req.body;

    // Validate text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ message: 'Item text is required' });
      return;
    }
    const trimmedText = text.trim();
    if (trimmedText.length > 200) {
      res.status(400).json({ message: 'Item text must be 200 characters or fewer' });
      return;
    }

    // Validate category against allowlist
    let validCategory = 'General';
    if (category && typeof category === 'string') {
      if (VALID_CATEGORIES.includes(category)) {
        validCategory = category;
      } else {
        res.status(400).json({ message: `Invalid category. Allowed: ${VALID_CATEGORIES.join(', ')}` });
        return;
      }
    }

    const [item] = await db('shopping_items')
      .insert({
        household_id: householdId,
        text: trimmedText,
        category: validCategory,
        added_by: memberId,
        is_checked: false,
      })
      .returning('*');

    // Fetch with joined names for consistent response shape
    const [result] = await db('shopping_items as si')
      .leftJoin('household_members as adder', 'si.added_by', 'adder.id')
      .leftJoin('household_members as checker', 'si.checked_by', 'checker.id')
      .where('si.id', item.id)
      .select(
        'si.id', 'si.text', 'si.category', 'si.added_by',
        'adder.name as added_by_name', 'si.is_checked', 'si.checked_by',
        'checker.name as checked_by_name', 'si.created_at', 'si.checked_at'
      );

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('shopping:updated');

    res.status(201).json(result);
  } catch (err) {
    console.error('POST /shopping error:', err);
    res.status(500).json({ message: 'Failed to add shopping item' });
  }
});

/**
 * PUT /:id/check — toggle check/uncheck on a shopping item.
 * When checking: sets checked_by and checked_at.
 * When unchecking: clears checked_by and checked_at.
 */
shoppingRouter.put('/:id/check', async (req, res) => {
  try {
    const householdId = req.householdId;
    const memberId = req.user!.mid;
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId) || itemId <= 0) {
      res.status(400).json({ message: 'Invalid item ID' });
      return;
    }

    // Fetch item — verify household ownership
    const existing = await db('shopping_items')
      .where({ id: itemId, household_id: householdId })
      .first();

    if (!existing) {
      res.status(404).json({ message: 'Shopping item not found' });
      return;
    }

    const nowChecked = !existing.is_checked;

    await db('shopping_items')
      .where({ id: itemId })
      .update({
        is_checked: nowChecked,
        checked_by: nowChecked ? memberId : null,
        checked_at: nowChecked ? new Date() : null,
      });

    // Return updated item with joined names
    const [result] = await db('shopping_items as si')
      .leftJoin('household_members as adder', 'si.added_by', 'adder.id')
      .leftJoin('household_members as checker', 'si.checked_by', 'checker.id')
      .where('si.id', itemId)
      .select(
        'si.id', 'si.text', 'si.category', 'si.added_by',
        'adder.name as added_by_name', 'si.is_checked', 'si.checked_by',
        'checker.name as checked_by_name', 'si.created_at', 'si.checked_at'
      );

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('shopping:updated');

    res.json(result);
  } catch (err) {
    console.error('PUT /shopping/:id/check error:', err);
    res.status(500).json({ message: 'Failed to toggle shopping item' });
  }
});

/**
 * DELETE /checked — delete all checked items for the household.
 * MUST be registered before /:id to avoid Express matching "checked" as an id param.
 */
shoppingRouter.delete('/checked', async (req, res) => {
  try {
    const householdId = req.householdId;

    const deleted = await db('shopping_items')
      .where({ household_id: householdId, is_checked: true })
      .delete();

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('shopping:updated');

    res.json({ deleted });
  } catch (err) {
    console.error('DELETE /shopping/checked error:', err);
    res.status(500).json({ message: 'Failed to clear checked items' });
  }
});

/**
 * DELETE /:id — delete a single shopping item. Verifies household ownership.
 */
shoppingRouter.delete('/:id', async (req, res) => {
  try {
    const householdId = req.householdId;
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId) || itemId <= 0) {
      res.status(400).json({ message: 'Invalid item ID' });
      return;
    }

    const deleted = await db('shopping_items')
      .where({ id: itemId, household_id: householdId })
      .delete();

    if (deleted === 0) {
      res.status(404).json({ message: 'Shopping item not found' });
      return;
    }

    const io = getIO();
    if (io) io.to(`household:${householdId}`).emit('shopping:updated');

    res.status(204).send();
  } catch (err) {
    console.error('DELETE /shopping/:id error:', err);
    res.status(500).json({ message: 'Failed to delete shopping item' });
  }
});
