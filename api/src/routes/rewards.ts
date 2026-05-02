import { Router } from 'express';
import db from '../db';
import { requireAuth, requireParent } from '../middleware/auth';
import { getIO } from '../websocket';

export const rewardsRouter = Router();
rewardsRouter.use(requireAuth);

// ── Helpers ─────────────────────────────────────────────────────

function emitRewardsUpdated(householdId: string) {
  const io = getIO();
  if (io) io.to(`household:${householdId}`).emit('rewards:updated');
}

const TITLE_MAX = 100;
const DESC_MAX = 500;
const ICON_MAX = 10;
const COST_MIN = 1;
const COST_MAX = 1_000_000;

// ── GET / — list active rewards for household ───────────────────
rewardsRouter.get('/', async (req, res) => {
  try {
    const rewards = await db('rewards')
      .where({ household_id: req.householdId, is_active: true })
      .orderBy('cost_points', 'asc');
    res.json(rewards);
  } catch (err) {
    console.error('GET /rewards error:', err);
    res.status(500).json({ message: 'Failed to fetch rewards' });
  }
});

// ── POST / — create reward (parent only) ────────────────────────
rewardsRouter.post('/', requireParent, async (req, res) => {
  try {
    const { title, description, icon, cost_points } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    if (title.trim().length > TITLE_MAX) {
      res.status(400).json({ message: `Title must be ${TITLE_MAX} characters or less` });
      return;
    }
    if (description && (typeof description !== 'string' || description.length > DESC_MAX)) {
      res.status(400).json({ message: `Description must be ${DESC_MAX} characters or less` });
      return;
    }
    if (icon && (typeof icon !== 'string' || icon.length > ICON_MAX)) {
      res.status(400).json({ message: `Icon must be ${ICON_MAX} characters or less` });
      return;
    }

    const cost = parseInt(String(cost_points), 10);
    if (!Number.isFinite(cost) || cost < COST_MIN || cost > COST_MAX) {
      res.status(400).json({ message: `Cost must be between ${COST_MIN} and ${COST_MAX}` });
      return;
    }

    const [reward] = await db('rewards')
      .insert({
        household_id: req.householdId,
        title: title.trim(),
        description: description?.trim() || null,
        icon: icon?.trim() || null,
        cost_points: cost,
        created_by: req.user!.mid,
      })
      .returning('*');

    emitRewardsUpdated(req.householdId!);
    res.status(201).json(reward);
  } catch (err) {
    console.error('POST /rewards error:', err);
    res.status(500).json({ message: 'Failed to create reward' });
  }
});

// ── PUT /:id — update reward (parent only) ──────────────────────
rewardsRouter.put('/:id', requireParent, async (req, res) => {
  try {
    const rewardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(rewardId)) {
      res.status(400).json({ message: 'Invalid reward ID' });
      return;
    }

    const existing = await db('rewards')
      .where({ id: rewardId, household_id: req.householdId })
      .first();
    if (!existing) {
      res.status(404).json({ message: 'Reward not found' });
      return;
    }

    const allowed = ['title', 'description', 'icon', 'cost_points', 'is_active'] as const;
    const updates: Record<string, any> = {};

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (title.length === 0 || title.length > TITLE_MAX) {
        res.status(400).json({ message: `Title must be 1-${TITLE_MAX} characters` });
        return;
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) {
      const desc = req.body.description === null ? null : String(req.body.description).trim();
      if (desc && desc.length > DESC_MAX) {
        res.status(400).json({ message: `Description must be ${DESC_MAX} characters or less` });
        return;
      }
      updates.description = desc;
    }
    if (req.body.icon !== undefined) {
      const ic = req.body.icon === null ? null : String(req.body.icon).trim();
      if (ic && ic.length > ICON_MAX) {
        res.status(400).json({ message: `Icon must be ${ICON_MAX} characters or less` });
        return;
      }
      updates.icon = ic;
    }
    if (req.body.cost_points !== undefined) {
      const cost = parseInt(String(req.body.cost_points), 10);
      if (!Number.isFinite(cost) || cost < COST_MIN || cost > COST_MAX) {
        res.status(400).json({ message: `Cost must be between ${COST_MIN} and ${COST_MAX}` });
        return;
      }
      updates.cost_points = cost;
    }
    if (req.body.is_active !== undefined) {
      updates.is_active = !!req.body.is_active;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: 'No valid fields to update' });
      return;
    }

    await db('rewards').where({ id: rewardId, household_id: req.householdId }).update(updates);
    const reward = await db('rewards').where({ id: rewardId }).first();

    emitRewardsUpdated(req.householdId!);
    res.json(reward);
  } catch (err) {
    console.error('PUT /rewards/:id error:', err);
    res.status(500).json({ message: 'Failed to update reward' });
  }
});

// ── DELETE /:id — deactivate reward (parent only) ───────────────
rewardsRouter.delete('/:id', requireParent, async (req, res) => {
  try {
    const rewardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(rewardId)) {
      res.status(400).json({ message: 'Invalid reward ID' });
      return;
    }

    const existing = await db('rewards')
      .where({ id: rewardId, household_id: req.householdId })
      .first();
    if (!existing) {
      res.status(404).json({ message: 'Reward not found' });
      return;
    }

    await db('rewards')
      .where({ id: rewardId, household_id: req.householdId })
      .update({ is_active: false });

    emitRewardsUpdated(req.householdId!);
    res.status(204).send();
  } catch (err) {
    console.error('DELETE /rewards/:id error:', err);
    res.status(500).json({ message: 'Failed to deactivate reward' });
  }
});

// ── POST /:id/redeem — kid redeems a reward ─────────────────────
rewardsRouter.post('/:id/redeem', async (req, res) => {
  try {
    // Only available in points_economy mode
    const settings = await db('allowance_settings').where('household_id', req.householdId).first();
    if (settings?.reward_mode !== 'points_economy') {
      res.status(400).json({ message: 'Reward redemption is only available in Points Economy mode.' });
      return;
    }

    const rewardId = parseInt(req.params.id, 10);
    if (!Number.isFinite(rewardId)) {
      res.status(400).json({ message: 'Invalid reward ID' });
      return;
    }

    const memberId = req.user!.mid;

    const reward = await db('rewards')
      .where({ id: rewardId, household_id: req.householdId, is_active: true })
      .first();
    if (!reward) {
      res.status(404).json({ message: 'Reward not found or inactive' });
      return;
    }

    // Check member has enough points
    const member = await db('household_members')
      .where({ id: memberId, household_id: req.householdId })
      .first();
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    if (member.points_total < reward.cost_points) {
      res.status(400).json({
        message: 'Not enough points',
        required: reward.cost_points,
        available: member.points_total,
      });
      return;
    }

    // Deduct points and create redemption in a transaction
    await db.transaction(async (trx) => {
      await trx('household_members')
        .where({ id: memberId })
        .decrement('points_total', reward.cost_points);

      await trx('reward_redemptions').insert({
        reward_id: rewardId,
        member_id: memberId,
        household_id: req.householdId,
        points_spent: reward.cost_points,
        status: 'pending',
      });
    });

    const updatedMember = await db('household_members').where({ id: memberId }).first();

    emitRewardsUpdated(req.householdId!);
    res.status(201).json({
      message: 'Reward redeemed successfully',
      points_remaining: updatedMember.points_total,
    });
  } catch (err) {
    console.error('POST /rewards/:id/redeem error:', err);
    res.status(500).json({ message: 'Failed to redeem reward' });
  }
});

// ── GET /redemptions — list redemptions ─────────────────────────
rewardsRouter.get('/redemptions', async (req, res) => {
  try {
    const isParent = req.user!.role === 'parent';
    const memberId = req.user!.mid;

    let query = db('reward_redemptions as rr')
      .join('rewards as r', 'rr.reward_id', 'r.id')
      .join('household_members as m', 'rr.member_id', 'm.id')
      .where('rr.household_id', req.householdId)
      .select(
        'rr.id',
        'rr.reward_id',
        'r.title as reward_title',
        'rr.member_id',
        'm.name as member_name',
        'rr.points_spent',
        'rr.status',
        'rr.redeemed_at',
        'rr.resolved_at',
        'rr.approved_by',
      )
      .orderBy('rr.redeemed_at', 'desc')
      .limit(100);

    // Kids only see their own redemptions
    if (!isParent) {
      query = query.where('rr.member_id', memberId);
    }

    const redemptions = await query;
    res.json(redemptions);
  } catch (err) {
    console.error('GET /rewards/redemptions error:', err);
    res.status(500).json({ message: 'Failed to fetch redemptions' });
  }
});

// ── PUT /redemptions/:id/approve — approve or deny ──────────────
rewardsRouter.put('/redemptions/:id/approve', requireParent, async (req, res) => {
  try {
    const redemptionId = parseInt(req.params.id, 10);
    if (!Number.isFinite(redemptionId)) {
      res.status(400).json({ message: 'Invalid redemption ID' });
      return;
    }

    const { status } = req.body;
    if (!status || !['approved', 'denied'].includes(status)) {
      res.status(400).json({ message: 'Status must be "approved" or "denied"' });
      return;
    }

    const redemption = await db('reward_redemptions')
      .where({ id: redemptionId, household_id: req.householdId })
      .first();
    if (!redemption) {
      res.status(404).json({ message: 'Redemption not found' });
      return;
    }

    if (redemption.status !== 'pending') {
      res.status(400).json({ message: `Redemption already ${redemption.status}` });
      return;
    }

    await db.transaction(async (trx) => {
      // If denied, refund points
      if (status === 'denied') {
        await trx('household_members')
          .where({ id: redemption.member_id })
          .increment('points_total', redemption.points_spent);
      }

      await trx('reward_redemptions')
        .where({ id: redemptionId })
        .update({
          status,
          approved_by: req.user!.mid,
          resolved_at: db.fn.now(),
        });
    });

    emitRewardsUpdated(req.householdId!);
    res.json({ message: `Redemption ${status}` });
  } catch (err) {
    console.error('PUT /rewards/redemptions/:id/approve error:', err);
    res.status(500).json({ message: 'Failed to update redemption' });
  }
});

// ── POST /requests — kid requests a new reward ──────────────────
rewardsRouter.post('/requests', async (req, res) => {
  try {
    const { title, description, icon, suggested_points } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    const [request] = await db('reward_requests')
      .insert({
        household_id: req.householdId,
        requested_by: req.user!.mid,
        title: title.trim().slice(0, 100),
        description: description ? String(description).trim().slice(0, 500) : null,
        icon: icon ? String(icon).slice(0, 10) : null,
        suggested_points: suggested_points ? Math.max(1, Math.min(10000, parseInt(suggested_points))) : null,
      })
      .returning('*');

    emitRewardsUpdated(req.householdId!);
    res.status(201).json(request);
  } catch (err) {
    console.error('POST /rewards/requests error:', err);
    res.status(500).json({ message: 'Failed to submit request' });
  }
});

// ── GET /requests — list reward requests ────────────────────────
rewardsRouter.get('/requests', async (req, res) => {
  try {
    const requests = await db('reward_requests as rr')
      .join('household_members as m', 'rr.requested_by', 'm.id')
      .where('rr.household_id', req.householdId)
      .select('rr.*', 'm.name as requested_by_name', 'm.avatar_color')
      .orderBy('rr.created_at', 'desc')
      .limit(50);

    res.json(requests);
  } catch (err) {
    console.error('GET /rewards/requests error:', err);
    res.status(500).json({ message: 'Failed to fetch requests' });
  }
});

// ── PUT /requests/:id — parent approves/denies request ──────────
rewardsRouter.put('/requests/:id', requireParent, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, cost_points } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      res.status(400).json({ message: 'Status must be approved or denied' });
      return;
    }

    const request = await db('reward_requests')
      .where({ id, household_id: req.householdId, status: 'pending' })
      .first();
    if (!request) {
      res.status(404).json({ message: 'Request not found or already resolved' });
      return;
    }

    await db('reward_requests').where({ id }).update({
      status,
      resolved_by: req.user!.mid,
      resolved_at: db.fn.now(),
    });

    // If approved, create the reward in the catalog
    if (status === 'approved') {
      const points = cost_points ? Math.max(1, parseInt(cost_points)) : (request.suggested_points || 10);
      await db('rewards').insert({
        household_id: req.householdId,
        title: request.title,
        description: request.description,
        icon: request.icon,
        cost_points: points,
        created_by: req.user!.mid,
        is_active: true,
      });
    }

    emitRewardsUpdated(req.householdId!);
    res.json({ message: `Request ${status}` });
  } catch (err) {
    console.error('PUT /rewards/requests/:id error:', err);
    res.status(500).json({ message: 'Failed to resolve request' });
  }
});
