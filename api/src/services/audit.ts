import type { DbOrTx } from "../db/client.js";
import { auditLog } from "../db/schema.js";

/** Records a write. Call inside the same transaction as the write. */
export async function audit(
  db: DbOrTx,
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  diff?: unknown,
): Promise<void> {
  await db.insert(auditLog).values({ actorId, action, entity, entityId, diff: diff ?? null });
}
