import { sql } from 'drizzle-orm';
import { outbox, withSuper, type Db, type Tx } from '@turnoextra/db';
import { SendError, type Channel, type ChannelName, type OutMessage } from './types.js';

export const MAX_ATTEMPTS = 5;

/** El driver devuelve un arreglo (postgres-js) o `{ rows }` (PGlite). */
export const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

/** Quita celulares de un texto de error antes de guardarlo. */
const scrub = (s: string) => s.replace(/\+?\d[\d\s-]{6,}\d/g, '***').slice(0, 300);

/** Encola un mensaje dentro de la transacción del cambio de estado (todo o nada). Requiere contexto de sistema. */
export async function enqueue(
  tx: Tx,
  e: { canal: ChannelName; to: string; msg: OutMessage; workerId?: string | null; orgId?: string | null; offerId?: string | null },
) {
  await tx.insert(outbox).values({
    canal: e.canal,
    destinatario: e.to,
    payload: e.msg,
    workerId: e.workerId ?? null,
    orgId: e.orgId ?? null,
    offerId: e.offerId ?? null,
  });
}

type Claimed = { id: number; canal: string; destinatario: string; payload: OutMessage; attempts: number; offerId: string | null };

/**
 * Toma hasta `batch` mensajes vencidos con FOR UPDATE SKIP LOCKED (varios workers no se pisan) y los reserva
 * por 60 s; si el proceso muere a mitad del envío, otro los recupera cuando vence la reserva.
 */
async function claim(db: Db, batch: number, canales: string[]): Promise<Claimed[]> {
  return withSuper(db, async (tx) =>
    rowsOf<Claimed>(
      await tx.execute(sql`
        UPDATE outbox SET estado = 'sending', attempts = attempts + 1, locked_until = now() + interval '60 seconds'
        WHERE id IN (
          SELECT id FROM outbox
          WHERE canal IN (${sql.join(canales.map((c) => sql`${c}`), sql`, `)})
            AND ((estado = 'pending' AND next_attempt_at <= now()) OR (estado = 'sending' AND locked_until < now()))
          ORDER BY id LIMIT ${batch} FOR UPDATE SKIP LOCKED)
        RETURNING id, canal, destinatario, payload, attempts, offer_id AS "offerId"`),
    ),
  );
}

/** Procesa un lote. Devuelve cuántos se enviaron y cuántos fallaron (definitivo o para reintento). */
export async function dispatchOnce(db: Db, channels: Map<string, Channel>, batch = 10) {
  // Solo toma mensajes de canales configurados: los demás esperan en cola en vez de fallar.
  if (!channels.size) return { sent: 0, failed: 0, claimed: 0 };
  const jobs = await claim(db, batch, [...channels.keys()]);
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const channel = channels.get(job.canal);
    try {
      // Una oferta solo sale si sigue en cola y por el canal elegido (si ya se respondió o se escaló, no sale).
      if (job.offerId && !(await offerStillQueued(db, job.offerId, job.canal))) {
        await withSuper(db, (tx) =>
          tx.execute(sql`UPDATE outbox SET estado = 'failed', destinatario = '***', payload = '{}'::jsonb, locked_until = null,
            last_error = 'oferta no vigente' WHERE id = ${job.id}`),
        );
        continue;
      }
      if (!channel) throw new SendError(`canal ${job.canal} no configurado`, false);
      const r = await channel.send(job.destinatario, job.payload);
      // Enviado: se borran destinatario y contenido; la cola no conserva datos personales.
      await withSuper(db, (tx) =>
        tx.execute(sql`UPDATE outbox SET estado = 'sent', sent_at = now(), external_id = ${r.externalId ?? null},
          destinatario = '***', payload = '{}'::jsonb, locked_until = null, last_error = null WHERE id = ${job.id}`),
      );
      if (job.offerId) await markOfferSent(db, job.offerId, job.canal, r.externalId ?? null);
      sent++;
    } catch (err) {
      failed++;
      const retryable = err instanceof SendError ? err.retryable : true;
      const message = scrub(err instanceof Error ? err.message : 'error');
      const final = !retryable || job.attempts >= MAX_ATTEMPTS;
      await withSuper(db, (tx) =>
        final
          ? tx.execute(sql`UPDATE outbox SET estado = 'failed', destinatario = '***', payload = '{}'::jsonb,
              locked_until = null, last_error = ${message} WHERE id = ${job.id}`)
          : // Espera exponencial: 10 s, 20 s, 40 s, 80 s.
            tx.execute(sql`UPDATE outbox SET estado = 'pending', locked_until = null, last_error = ${message},
              next_attempt_at = now() + make_interval(secs => ${10 * 2 ** (job.attempts - 1)}) WHERE id = ${job.id}`),
      );
      if (final && job.offerId) await markDelivery(db, job.offerId, job.canal, 'failed');
    }
  }
  return { sent, failed, claimed: jobs.length };
}

async function offerStillQueued(db: Db, offerId: string, canal: string) {
  const r = await withSuper(db, (tx) =>
    tx.execute(sql`SELECT 1 FROM shift_offers WHERE id = ${offerId} AND status = 'queued' AND canal_usado = ${canal}`),
  );
  return rowsOf(r).length > 0;
}

/** La oferta salió: pasa de 'queued' a 'sent' y se guarda el id externo del canal. */
async function markOfferSent(db: Db, offerId: string, canal: string, externalId: string | null) {
  await withSuper(db, async (tx) => {
    await tx.execute(sql`UPDATE shift_offers SET status = 'sent' WHERE id = ${offerId} AND status = 'queued'`);
    await tx.execute(sql`UPDATE offer_deliveries SET estado = 'sent', external_id = ${externalId}
      WHERE id = (SELECT max(id) FROM offer_deliveries WHERE offer_id = ${offerId} AND canal = ${canal})`);
  });
}

async function markDelivery(db: Db, offerId: string, canal: string, estado: string) {
  await withSuper(db, (tx) =>
    tx.execute(sql`UPDATE offer_deliveries SET estado = ${estado}
      WHERE id = (SELECT max(id) FROM offer_deliveries WHERE offer_id = ${offerId} AND canal = ${canal})`),
  );
}
