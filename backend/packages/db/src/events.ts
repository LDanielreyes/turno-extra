import { sql } from 'drizzle-orm';
import type { Tx } from './client.js';

export const EVENTS_CHANNEL = 'turnoextra_events';

/**
 * Evento de tiempo real. Solo ids y tipo: nunca nombres, celulares ni texto (el cliente vuelve a pedir lo que cambió
 * con su propia sesión). Cabe de sobra en el límite de 8 000 bytes de NOTIFY.
 */
export type DomainEvent = {
  org: string;
  type: 'shift.created' | 'shift.changed' | 'alert.created' | 'alert.updated' | 'org.changed';
  shift?: string;
  id?: string;
};

/** `listen(canal, cb)` devuelve la función que deja de escuchar. La implementa cada driver (postgres-js o PGlite). */
export type Listen = (channel: string, cb: (payload: string) => void) => Promise<() => Promise<void>>;

/**
 * NOTIFY dentro de la transacción del cambio: Postgres lo entrega solo si la transacción confirma
 * y al hacer rollback no sale nada.
 */
export async function emit(tx: Tx, ev: DomainEvent): Promise<void> {
  await tx.execute(sql`SELECT pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify(ev)})`);
}
