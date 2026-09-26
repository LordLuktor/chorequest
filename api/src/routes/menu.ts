import { Router } from 'express';
import db from '../db';
import { requireAuth, requireParent } from '../middleware/auth';
import { getIO } from '../websocket';

export const menuRouter = Router();
menuRouter.use(requireAuth);

// ── Helpers ─────────────────────────────────────────────────────

function emitMenuUpdated(householdId: string) {
  const io = getIO();
  if (io) io.to(`household:${householdId}`).emit('menu:updated');
}

const NAME_MAX = 100;
const MEAL_SLOTS = ['breakfast', 'lunch'] as const;
const LIMIT_SCOPES = ['per_kid', 'shared'] as const;

function isValidMealSlot(v: unknown): v is (typeof MEAL_SLOTS)[number] {
  return typeof v === 'string' && (MEAL_SLOTS as readonly string[]).includes(v);
}

function isValidDateStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Sunday-start week containing `dateStr`, as [start, end] yyyy-mm-dd strings (inclusive).
function weekRangeFor(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - d.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 0=Sun..6=Sat, matching JS Date#getUTCDay() and how available_days (1=Mon..5=Fri) is stored.
function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function parseAvailableDays(v: unknown): { ok: true; value: number[] | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (!Array.isArray(v) || !v.every((d) => Number.isInteger(d) && d >= 1 && d <= 5)) {
    return { ok: false };
  }
  const uniq = Array.from(new Set(v as number[])).sort((a, b) => a - b);
  return { ok: true, value: uniq.length > 0 ? uniq : null };
}

// How far ahead lunch assignments auto-fill — covers this week and next, so next week's
// lunches are already in place before it arrives instead of waiting on someone to touch the item.
const LUNCH_AUTOFILL_DAYS_AHEAD = 13;

// When a lunch item is scoped to a specific kid and restricted to certain weekdays, that
// combination of (kid, day) fully specifies the intended assignment every week — no separate
// "Set" step should be needed, and no re-confirmation once a week rolls over. Fills in the
// next ~2 weeks' worth of matching days for that kid, but never overwrites a day that already
// has *any* selection (manual pick, swap, or earlier auto-fill) — that's what "unless it's
// changed" means: any existing row, however it got there, wins.
async function autoAssignLunchSelections(
  householdId: string,
  item: { id: number; member_id: number | null; meal_slot: string; available_days: number[] | null; weekly_limit: number | null; limit_scope: string }
): Promise<void> {
  if (item.meal_slot !== 'lunch' || item.member_id === null || !item.available_days || item.available_days.length === 0) {
    return;
  }

  const today = todayStr();
  const targetDates: string[] = [];
  for (let d = new Date(`${today}T00:00:00Z`), i = 0; i <= LUNCH_AUTOFILL_DAYS_AHEAD; d.setUTCDate(d.getUTCDate() + 1), i++) {
    const ds = d.toISOString().slice(0, 10);
    if (item.available_days.includes(d.getUTCDay())) targetDates.push(ds);
  }

  for (const date of targetDates) {
    const existing = await db('menu_selections')
      .where({ household_id: householdId, member_id: item.member_id, date, meal_slot: 'lunch' })
      .first();
    if (existing) continue;

    if (item.weekly_limit !== null && item.weekly_limit !== undefined) {
      const weekRange = weekRangeFor(date);
      let countQuery = db('menu_selections')
        .where({ household_id: householdId, menu_item_id: item.id })
        .andWhereBetween('date', [weekRange.start, weekRange.end]);
      if (item.limit_scope === 'per_kid') {
        countQuery = countQuery.andWhere('member_id', item.member_id);
      }
      const [{ count }] = await countQuery.count('* as count');
      if (Number(count) >= item.weekly_limit) continue;
    }

    await db('menu_selections')
      .insert({ household_id: householdId, member_id: item.member_id, date, meal_slot: 'lunch', menu_item_id: item.id })
      .onConflict(['household_id', 'member_id', 'date', 'meal_slot'])
      .ignore();
  }
}

// Daily sweep (called from the scheduler, not the request path) so lunch schedules keep
// repeating week over week on their own — without this, autoAssignLunchSelections only ever
// ran when a parent created/edited the item, so a week nobody touched the catalog would arrive
// with no lunches filled in. Safe to call repeatedly: existing rows (including swaps/manual
// picks/clears) are never touched, so nothing here can undo a "change" someone made.
export async function runLunchAutoAssignment(): Promise<void> {
  try {
    const items = await db('menu_items')
      .where({ meal_slot: 'lunch', is_active: true })
      .whereNotNull('member_id')
      .whereNotNull('available_days');

    const touchedHouseholds = new Set<string>();
    for (const item of items) {
      try {
        await autoAssignLunchSelections(item.household_id, item);
        touchedHouseholds.add(item.household_id);
      } catch (err) {
        console.error(`Lunch auto-assignment failed for menu item ${item.id}:`, err);
      }
    }

    for (const householdId of touchedHouseholds) {
      emitMenuUpdated(householdId);
    }
  } catch (err) {
    console.error('Lunch auto-assignment sweep error:', err);
  }
}

// ── GET /items — catalog ─────────────────────────────────────────
menuRouter.get('/items', async (req, res) => {
  try {
    const canActForOthers = req.user!.role === 'parent' || req.user!.role === 'display';
    const mealSlot = req.query.meal_slot;

    // null = full unfiltered catalog (parent/display management view).
    // set = apply kid-style visibility + remaining-count filtering for that member
    // (always the caller's own id for kids; an explicit ?member= for parent/display
    // previewing a specific kid's options, e.g. the display's breakfast picker).
    let viewerMemberId: number | null = null;
    if (!canActForOthers) {
      viewerMemberId = req.user!.mid;
    } else if (req.query.member !== undefined) {
      const parsed = parseInt(String(req.query.member), 10);
      if (!Number.isFinite(parsed)) {
        res.status(400).json({ message: 'Invalid member' });
        return;
      }
      const member = await db('household_members').where({ id: parsed, household_id: req.householdId }).first();
      if (!member) {
        res.status(404).json({ message: 'Member not found' });
        return;
      }
      viewerMemberId = parsed;
    }

    let query = db('menu_items as mi')
      .leftJoin('household_members as m', 'mi.member_id', 'm.id')
      .where('mi.household_id', req.householdId)
      .select('mi.*', 'm.name as member_name');

    if (viewerMemberId !== null) {
      query = query
        .where('mi.is_active', true)
        .andWhere((qb) => qb.whereNull('mi.member_id').orWhere('mi.member_id', viewerMemberId));
    } else if (req.query.include_inactive !== '1') {
      query = query.where('mi.is_active', true);
    }

    if (mealSlot !== undefined) {
      if (!isValidMealSlot(mealSlot)) {
        res.status(400).json({ message: 'Invalid meal_slot' });
        return;
      }
      query = query.andWhere('mi.meal_slot', mealSlot);
    }

    const items = await query.orderBy('mi.name', 'asc');

    // Attach remaining-this-week count for the viewer (kids/previewed-kid only need
    // this to grey out exhausted options; the full catalog view manages limits directly).
    if (viewerMemberId !== null) {
      const { start, end } = weekRangeFor(todayStr());
      const withRemaining = await Promise.all(
        items.map(async (item) => {
          if (item.weekly_limit === null || item.weekly_limit === undefined) {
            return { ...item, remaining: null };
          }
          let countQuery = db('menu_selections')
            .where({ household_id: req.householdId, menu_item_id: item.id })
            .andWhereBetween('date', [start, end]);
          if (item.limit_scope === 'per_kid') {
            countQuery = countQuery.andWhere('member_id', viewerMemberId);
          }
          const [{ count }] = await countQuery.count('* as count');
          return { ...item, remaining: Math.max(0, item.weekly_limit - Number(count)) };
        })
      );
      res.json(withRemaining);
      return;
    }

    res.json(items);
  } catch (err) {
    console.error('GET /menu/items error:', err);
    res.status(500).json({ message: 'Failed to fetch menu items' });
  }
});

// ── POST /items — create item (parent only) ─────────────────────
menuRouter.post('/items', requireParent, async (req, res) => {
  try {
    const { member_id, meal_slot, name, weekly_limit, limit_scope, available_days } = req.body;

    if (!isValidMealSlot(meal_slot)) {
      res.status(400).json({ message: 'meal_slot must be "breakfast" or "lunch"' });
      return;
    }
    const parsedDays = parseAvailableDays(available_days);
    if (!parsedDays.ok) {
      res.status(400).json({ message: 'available_days must be an array of integers 1-5 (Mon-Fri)' });
      return;
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.trim().length > NAME_MAX) {
      res.status(400).json({ message: `Name is required and must be ${NAME_MAX} characters or less` });
      return;
    }
    let scope = 'per_kid';
    if (limit_scope !== undefined) {
      if (!(LIMIT_SCOPES as readonly string[]).includes(limit_scope)) {
        res.status(400).json({ message: 'limit_scope must be "per_kid" or "shared"' });
        return;
      }
      scope = limit_scope;
    }
    let limit: number | null = null;
    if (weekly_limit !== null && weekly_limit !== undefined) {
      const parsed = parseInt(String(weekly_limit), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        res.status(400).json({ message: 'weekly_limit must be a positive number, or omitted for unlimited' });
        return;
      }
      limit = parsed;
    }
    let memberIdVal: number | null = null;
    if (member_id !== null && member_id !== undefined) {
      const member = await db('household_members')
        .where({ id: member_id, household_id: req.householdId })
        .first();
      if (!member) {
        res.status(404).json({ message: 'Member not found' });
        return;
      }
      memberIdVal = member.id;
    }

    const [item] = await db('menu_items')
      .insert({
        household_id: req.householdId,
        member_id: memberIdVal,
        meal_slot,
        name: name.trim(),
        weekly_limit: limit,
        limit_scope: scope,
        available_days: meal_slot === 'lunch' ? parsedDays.value : null,
        created_by: req.user!.mid,
      })
      .returning('*');

    await autoAssignLunchSelections(req.householdId!, item);

    emitMenuUpdated(req.householdId!);
    res.status(201).json(item);
  } catch (err) {
    console.error('POST /menu/items error:', err);
    res.status(500).json({ message: 'Failed to create menu item' });
  }
});

// ── PUT /items/:id — update item (parent only) ──────────────────
menuRouter.put('/items/:id', requireParent, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ message: 'Invalid item ID' });
      return;
    }

    const existing = await db('menu_items').where({ id, household_id: req.householdId }).first();
    if (!existing) {
      res.status(404).json({ message: 'Menu item not found' });
      return;
    }

    const updates: Record<string, unknown> = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length === 0 || name.length > NAME_MAX) {
        res.status(400).json({ message: `Name must be 1-${NAME_MAX} characters` });
        return;
      }
      updates.name = name;
    }
    if (req.body.weekly_limit !== undefined) {
      if (req.body.weekly_limit === null) {
        updates.weekly_limit = null;
      } else {
        const parsed = parseInt(String(req.body.weekly_limit), 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
          res.status(400).json({ message: 'weekly_limit must be a positive number, or null for unlimited' });
          return;
        }
        updates.weekly_limit = parsed;
      }
    }
    if (req.body.limit_scope !== undefined) {
      if (!(LIMIT_SCOPES as readonly string[]).includes(req.body.limit_scope)) {
        res.status(400).json({ message: 'limit_scope must be "per_kid" or "shared"' });
        return;
      }
      updates.limit_scope = req.body.limit_scope;
    }
    if (req.body.available_days !== undefined) {
      const parsedDays = parseAvailableDays(req.body.available_days);
      if (!parsedDays.ok) {
        res.status(400).json({ message: 'available_days must be an array of integers 1-5 (Mon-Fri)' });
        return;
      }
      updates.available_days = existing.meal_slot === 'lunch' ? parsedDays.value : null;
    }
    if (req.body.member_id !== undefined) {
      if (req.body.member_id === null) {
        updates.member_id = null;
      } else {
        const member = await db('household_members')
          .where({ id: req.body.member_id, household_id: req.householdId })
          .first();
        if (!member) {
          res.status(404).json({ message: 'Member not found' });
          return;
        }
        updates.member_id = member.id;
      }
    }
    if (req.body.is_active !== undefined) {
      updates.is_active = !!req.body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: 'No valid fields to update' });
      return;
    }

    await db('menu_items').where({ id }).update(updates);
    const item = await db('menu_items').where({ id }).first();

    await autoAssignLunchSelections(req.householdId!, item);

    emitMenuUpdated(req.householdId!);
    res.json(item);
  } catch (err) {
    console.error('PUT /menu/items/:id error:', err);
    res.status(500).json({ message: 'Failed to update menu item' });
  }
});

// ── DELETE /items/:id — deactivate item (parent only) ───────────
menuRouter.delete('/items/:id', requireParent, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ message: 'Invalid item ID' });
      return;
    }

    const existing = await db('menu_items').where({ id, household_id: req.householdId }).first();
    if (!existing) {
      res.status(404).json({ message: 'Menu item not found' });
      return;
    }

    await db('menu_items').where({ id }).update({ is_active: false });

    emitMenuUpdated(req.householdId!);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /menu/items/:id error:', err);
    res.status(500).json({ message: 'Failed to deactivate menu item' });
  }
});

// ── GET /selections — a member's picks over a date range ────────
menuRouter.get('/selections', async (req, res) => {
  try {
    const isParent = req.user!.role === 'parent';
    // Displays show the whole household's board, so they need the same "all members" view parents get.
    const canViewAll = isParent || req.user!.role === 'display';
    const { start, end } = req.query;

    if (!isValidDateStr(start) || !isValidDateStr(end)) {
      res.status(400).json({ message: 'start and end (yyyy-mm-dd) are required' });
      return;
    }

    let targetMember = req.user!.mid;
    if (canViewAll && req.query.member !== undefined) {
      const parsed = parseInt(String(req.query.member), 10);
      if (!Number.isFinite(parsed)) {
        res.status(400).json({ message: 'Invalid member' });
        return;
      }
      targetMember = parsed;
    }

    let query = db('menu_selections as ms')
      .join('menu_items as mi', 'ms.menu_item_id', 'mi.id')
      .where('ms.household_id', req.householdId)
      .andWhereBetween('ms.date', [start, end])
      // pg returns `date` columns as JS Date objects, which JSON.stringify serializes as full
      // ISO timestamps (e.g. "2026-08-03T00:00:00.000Z") — that breaks every frontend
      // `s.date === "2026-08-03"` comparison. Cast explicitly to a plain date string here.
      .select('ms.id', 'ms.member_id', db.raw("to_char(ms.date, 'YYYY-MM-DD') as date"), 'ms.meal_slot', 'ms.menu_item_id', 'mi.name as item_name');

    if (canViewAll && req.query.member === undefined) {
      // no filter — all kids' selections in range
    } else {
      query = query.andWhere('ms.member_id', targetMember);
    }

    const selections = await query.orderBy('ms.date', 'asc');
    res.json(selections);
  } catch (err) {
    console.error('GET /menu/selections error:', err);
    res.status(500).json({ message: 'Failed to fetch selections' });
  }
});

// ── PUT /selections — set/replace a day's pick ──────────────────
menuRouter.put('/selections', async (req, res) => {
  try {
    const canActForOthers = req.user!.role === 'parent' || req.user!.role === 'display';
    const { date, meal_slot, menu_item_id } = req.body;
    let memberId = req.body.member_id;

    if (!isValidDateStr(date)) {
      res.status(400).json({ message: 'date (yyyy-mm-dd) is required' });
      return;
    }
    if (!isValidMealSlot(meal_slot)) {
      res.status(400).json({ message: 'meal_slot must be "breakfast" or "lunch"' });
      return;
    }
    if (!canActForOthers) {
      memberId = req.user!.mid; // kids can only set their own picks
    } else if (memberId === undefined || memberId === null) {
      res.status(400).json({ message: 'member_id is required' });
      return;
    }

    const member = await db('household_members')
      .where({ id: memberId, household_id: req.householdId })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const item = await db('menu_items')
      .where({ id: menu_item_id, household_id: req.householdId, meal_slot, is_active: true })
      .first();
    if (!item) {
      res.status(404).json({ message: 'Menu item not found or inactive' });
      return;
    }
    if (item.member_id !== null && item.member_id !== member.id) {
      res.status(403).json({ message: 'This item is not available to this member' });
      return;
    }
    if (meal_slot === 'lunch' && item.available_days && item.available_days.length > 0) {
      const wd = weekdayOf(date);
      if (!item.available_days.includes(wd)) {
        res.status(400).json({ message: `"${item.name}" isn't available on ${WEEKDAY_NAMES[wd]}` });
        return;
      }
    }

    if (item.weekly_limit !== null && item.weekly_limit !== undefined) {
      const { start, end } = weekRangeFor(date);
      let countQuery = db('menu_selections')
        .where({ household_id: req.householdId, menu_item_id: item.id })
        .andWhereBetween('date', [start, end])
        .andWhereNot({ member_id: member.id, date, meal_slot }); // don't double-count the row we're replacing
      if (item.limit_scope === 'per_kid') {
        countQuery = countQuery.andWhere('member_id', member.id);
      }
      const [{ count }] = await countQuery.count('* as count');
      if (Number(count) >= item.weekly_limit) {
        res.status(400).json({ message: `Weekly limit reached for "${item.name}"` });
        return;
      }
    }

    const [selection] = await db('menu_selections')
      .insert({
        household_id: req.householdId,
        member_id: member.id,
        date,
        meal_slot,
        menu_item_id: item.id,
      })
      .onConflict(['household_id', 'member_id', 'date', 'meal_slot'])
      .merge({ menu_item_id: item.id, updated_at: db.fn.now() })
      .returning('*');

    emitMenuUpdated(req.householdId!);
    res.status(201).json(selection);
  } catch (err) {
    console.error('PUT /menu/selections error:', err);
    res.status(500).json({ message: 'Failed to set selection' });
  }
});

// ── POST /selections/swap — flip two lunch days ─────────────────
menuRouter.post('/selections/swap', async (req, res) => {
  try {
    const isParent = req.user!.role === 'parent';
    const { date_a, date_b } = req.body;
    let memberId = req.body.member_id;

    if (!isValidDateStr(date_a) || !isValidDateStr(date_b)) {
      res.status(400).json({ message: 'date_a and date_b (yyyy-mm-dd) are required' });
      return;
    }
    if (date_a === date_b) {
      res.status(400).json({ message: 'Cannot swap a day with itself' });
      return;
    }
    if (!isParent) {
      memberId = req.user!.mid;
    } else if (memberId === undefined || memberId === null) {
      res.status(400).json({ message: 'member_id is required' });
      return;
    }

    const today = todayStr();
    if (date_a < today || date_b < today) {
      res.status(400).json({ message: 'Cannot swap a day that has already passed' });
      return;
    }

    const member = await db('household_members')
      .where({ id: memberId, household_id: req.householdId })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const rowA = await db('menu_selections')
      .where({ household_id: req.householdId, member_id: member.id, date: date_a, meal_slot: 'lunch' })
      .first();
    const rowB = await db('menu_selections')
      .where({ household_id: req.householdId, member_id: member.id, date: date_b, meal_slot: 'lunch' })
      .first();

    if (!rowA || !rowB) {
      res.status(400).json({ message: 'Both days must already have a lunch assigned to swap them' });
      return;
    }

    // After the swap, rowA's item lands on date_b and rowB's item lands on date_a —
    // both must still be allowed on the day they're moving to.
    const [itemA, itemB] = await Promise.all([
      db('menu_items').where({ id: rowA.menu_item_id }).first(),
      db('menu_items').where({ id: rowB.menu_item_id }).first(),
    ]);
    const wdA = weekdayOf(date_a);
    const wdB = weekdayOf(date_b);
    if (itemB.available_days && itemB.available_days.length > 0 && !itemB.available_days.includes(wdA)) {
      res.status(400).json({ message: `"${itemB.name}" isn't available on ${WEEKDAY_NAMES[wdA]}` });
      return;
    }
    if (itemA.available_days && itemA.available_days.length > 0 && !itemA.available_days.includes(wdB)) {
      res.status(400).json({ message: `"${itemA.name}" isn't available on ${WEEKDAY_NAMES[wdB]}` });
      return;
    }

    await db.transaction(async (trx) => {
      await trx('menu_selections').where({ id: rowA.id }).update({ menu_item_id: rowB.menu_item_id, updated_at: trx.fn.now() });
      await trx('menu_selections').where({ id: rowB.id }).update({ menu_item_id: rowA.menu_item_id, updated_at: trx.fn.now() });
    });

    emitMenuUpdated(req.householdId!);
    res.json({ message: 'Lunches swapped' });
  } catch (err) {
    console.error('POST /menu/selections/swap error:', err);
    res.status(500).json({ message: 'Failed to swap lunches' });
  }
});

// ── DELETE /selections — clear a day's pick (frees up its weekly-limit slot) ──
menuRouter.delete('/selections', async (req, res) => {
  try {
    const canActForOthers = req.user!.role === 'parent' || req.user!.role === 'display';
    const { date, meal_slot } = req.query;

    if (!isValidDateStr(date)) {
      res.status(400).json({ message: 'date (yyyy-mm-dd) is required' });
      return;
    }
    if (!isValidMealSlot(meal_slot)) {
      res.status(400).json({ message: 'meal_slot must be "breakfast" or "lunch"' });
      return;
    }

    let memberId: number;
    if (!canActForOthers) {
      memberId = req.user!.mid;
    } else {
      if (req.query.member_id === undefined) {
        res.status(400).json({ message: 'member_id is required' });
        return;
      }
      const parsed = parseInt(String(req.query.member_id), 10);
      if (!Number.isFinite(parsed)) {
        res.status(400).json({ message: 'Invalid member_id' });
        return;
      }
      memberId = parsed;
    }

    await db('menu_selections')
      .where({ household_id: req.householdId, member_id: memberId, date, meal_slot })
      .delete();

    emitMenuUpdated(req.householdId!);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /menu/selections error:', err);
    res.status(500).json({ message: 'Failed to clear selection' });
  }
});

// ── POST /requests — kid asks for a new item ────────────────────
menuRouter.post('/requests', async (req, res) => {
  try {
    const { meal_slot, name } = req.body;
    if (!isValidMealSlot(meal_slot)) {
      res.status(400).json({ message: 'meal_slot must be "breakfast" or "lunch"' });
      return;
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'Name is required' });
      return;
    }

    const [request] = await db('menu_item_requests')
      .insert({
        household_id: req.householdId,
        requested_by: req.user!.mid,
        meal_slot,
        name: name.trim().slice(0, NAME_MAX),
      })
      .returning('*');

    emitMenuUpdated(req.householdId!);
    res.status(201).json(request);
  } catch (err) {
    console.error('POST /menu/requests error:', err);
    res.status(500).json({ message: 'Failed to submit request' });
  }
});

// ── GET /requests — list item requests ──────────────────────────
menuRouter.get('/requests', async (req, res) => {
  try {
    const requests = await db('menu_item_requests as mr')
      .join('household_members as m', 'mr.requested_by', 'm.id')
      .where('mr.household_id', req.householdId)
      .select('mr.*', 'm.name as requested_by_name', 'm.avatar_color')
      .orderBy('mr.created_at', 'desc')
      .limit(50);

    res.json(requests);
  } catch (err) {
    console.error('GET /menu/requests error:', err);
    res.status(500).json({ message: 'Failed to fetch requests' });
  }
});

// ── PUT /requests/:id — parent approves/denies ──────────────────
menuRouter.put('/requests/:id', requireParent, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, weekly_limit, limit_scope } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      res.status(400).json({ message: 'Status must be approved or denied' });
      return;
    }

    const request = await db('menu_item_requests')
      .where({ id, household_id: req.householdId, status: 'pending' })
      .first();
    if (!request) {
      res.status(404).json({ message: 'Request not found or already resolved' });
      return;
    }

    let scope = 'per_kid';
    if (limit_scope !== undefined) {
      if (!(LIMIT_SCOPES as readonly string[]).includes(limit_scope)) {
        res.status(400).json({ message: 'limit_scope must be "per_kid" or "shared"' });
        return;
      }
      scope = limit_scope;
    }
    let limit: number | null = null;
    if (weekly_limit !== null && weekly_limit !== undefined) {
      const parsed = parseInt(String(weekly_limit), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        res.status(400).json({ message: 'weekly_limit must be a positive number, or omitted for unlimited' });
        return;
      }
      limit = parsed;
    }

    await db('menu_item_requests').where({ id }).update({
      status,
      resolved_by: req.user!.mid,
      resolved_at: db.fn.now(),
    });

    if (status === 'approved') {
      await db('menu_items').insert({
        household_id: req.householdId,
        member_id: request.requested_by,
        meal_slot: request.meal_slot,
        name: request.name,
        weekly_limit: limit,
        limit_scope: scope,
        created_by: req.user!.mid,
        is_active: true,
      });
    }

    emitMenuUpdated(req.householdId!);
    res.json({ message: `Request ${status}` });
  } catch (err) {
    console.error('PUT /menu/requests/:id error:', err);
    res.status(500).json({ message: 'Failed to resolve request' });
  }
});
