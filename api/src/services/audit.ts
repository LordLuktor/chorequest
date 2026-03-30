import db from '../db';

export async function logAction(
  action: string,
  entityType: string,
  entityId: number,
  memberId: number | null,
  details?: Record<string, unknown>,
  householdId?: string
): Promise<void> {
  await db('audit_log').insert({
    action,
    entity_type: entityType,
    entity_id: entityId,
    member_id: memberId,
    details: details ? JSON.stringify(details) : null,
    household_id: householdId || null,
  });
}
