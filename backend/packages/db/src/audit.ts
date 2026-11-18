import { auditLog } from './schema.js';
import type { Tx } from './client.js';

export type AuditEntry = {
  orgId: string | null;
  actorId: string | null;
  accion: string;
  entidad?: string;
  entidadId?: string;
  /** Solo ids y metadatos no personales. */
  detalle?: Record<string, string | number | boolean | null>;
};

/** Registra en la bitácora. Debe llamarse dentro de `withOrg`/`withSuper` del mismo org. */
export async function audit(tx: Tx, e: AuditEntry) {
  await tx.insert(auditLog).values(e);
}
