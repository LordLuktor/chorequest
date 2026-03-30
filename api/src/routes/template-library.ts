import { Router } from 'express';
import db from '../db';
import { generateInstances } from '../scheduler';
import { requireAuth } from '../middleware/auth';

export const templateLibraryRouter = Router();
templateLibraryRouter.use(requireAuth);

// List all packs
templateLibraryRouter.get('/', async (_req, res) => {
  try {
    const rows = await db('task_template_library').orderBy('pack_name').orderBy('title');
    // Group by pack
    const packs: Record<string, { name: string; description: string; tasks: any[] }> = {};
    for (const row of rows) {
      if (!packs[row.pack_name]) {
        packs[row.pack_name] = { name: row.pack_name, description: row.pack_description || '', tasks: [] };
      }
      packs[row.pack_name].tasks.push(row);
    }
    res.json(Object.values(packs));
  } catch (err) {
    console.error('GET /template-library error:', err);
    res.status(500).json({ message: 'Failed to fetch template library' });
  }
});

// Import a pack
templateLibraryRouter.post('/import', async (req, res) => {
  try {
    const { pack_name, default_member_id, created_by } = req.body;
    if (!pack_name) { res.status(400).json({ message: 'pack_name is required' }); return; }

    const templates = await db('task_template_library').where({ pack_name });
    if (templates.length === 0) { res.status(404).json({ message: 'Pack not found' }); return; }

    const created = [];
    for (const tpl of templates) {
      const suggestedDays: number[] = typeof tpl.suggested_days === 'string'
        ? JSON.parse(tpl.suggested_days)
        : tpl.suggested_days || [];

      // Build weekly_assignments from suggested days
      const wa: Record<string, number | null> = {};
      for (let i = 0; i < 7; i++) {
        wa[String(i)] = suggestedDays.includes(i) ? (default_member_id || null) : null;
      }

      const [inserted] = await db('task_templates')
        .insert({
          title: tpl.title,
          description: tpl.description,
          icon: tpl.icon,
          points: tpl.points,
          weekly_assignments: JSON.stringify(wa),
          repeat_interval: 1,
          recurrence_rule: 'WEEKLY_ASSIGNMENTS',
          start_date: new Date().toISOString().split('T')[0],
          created_by: created_by || null,
          is_active: true,
          household_id: req.householdId,
        })
        .returning('*');

      await generateInstances(inserted.id);
      created.push(inserted);
    }

    res.status(201).json({ message: `Imported ${created.length} tasks from "${pack_name}"`, templates: created });
  } catch (err) {
    console.error('POST /template-library/import error:', err);
    res.status(500).json({ message: 'Failed to import pack' });
  }
});
