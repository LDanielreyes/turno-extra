import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  assignments, audit, emit, offerDeliveries, orgWorkers, orgs, roles, shiftOffers, shifts, workerChannels, withSuper,
  type Db, type Tx,
} from '@turnoextra/db';
import { eligibleWorkers } from './eligibility.js';
import { raiseAlert, startsSoon } from './alerts.js';
import { enqueue, rowsOf } from './outbox.js';
import { msg, shiftInfo, type ShiftInfo } from './messages.js';
import type { ChannelName, OutMessage } from './types.js';

/** Por defecto cada oleada ofrece a `cupos libres × wave_factor` candidatos; la org lo ajusta (orgs.wave_factor). */
/** Si una oferta no salió por su canal en este tiempo, se escala al siguiente canal habilitado. */
export const ESCALATE_AFTER_SECONDS = 90;
/** Estados en los que una oferta aún puede responderse. */
export const OPEN_OFFER = ['queued', 'sent', 'delivered', 'read'] as const;

type Channel = { canal: ChannelName; identificador: string };
const actor = 'system:offers';

/** Canales apagados por configuración (p. ej. WHATSAPP_ENABLED=false): nunca se eligen para enviar. */
const channelOff = (canal: string) => canal === 'whatsapp' && process.env.WHATSAPP_ENABLED === 'false';

/** Canal habilitado de mejor prioridad que no esté en `exclude` ni apagado por configuración. */
export async function pickChannel(tx: Tx, workerId: string, exclude: string[] = []): Promise<Channel | undefined> {
  const rows = await tx
    .select({ canal: workerChannels.canal, identificador: workerChannels.identificador })
    .from(workerChannels)
    .where(and(eq(workerChannels.workerId, workerId), eq(workerChannels.habilitado, true)))
    .orderBy(asc(workerChannels.prioridad));
  return rows.find((r) => !exclude.includes(r.canal) && !channelOff(r.canal)) as Channel | undefined;
}

/** Datos del turno de una oferta, formateados para los mensajes. */
export async function shiftInfoOf(tx: Tx, shiftId: string): Promise<ShiftInfo> {
  const [r] = await tx
    .select({ inicio: shifts.inicio, fin: shifts.fin, pago: shifts.pagoTotal, notas: shifts.notas, org: orgs.nombre, rol: roles.nombre })
    .from(shifts)
    .innerJoin(orgs, eq(orgs.id, shifts.orgId))
    .innerJoin(roles, eq(roles.id, shifts.roleId))
    .where(eq(shifts.id, shiftId));
  return shiftInfo(r!);
}

/** Avisa a un candidato por su mejor canal habilitado. Sin canal, no se envía nada (nunca se escribe por uno no iniciado). */
export async function notifyWorker(tx: Tx, workerId: string, orgId: string, m: OutMessage) {
  const ch = await pickChannel(tx, workerId);
  if (ch) await enqueue(tx, { canal: ch.canal, to: ch.identificador, msg: m, workerId, orgId });
}

async function queueOffer(tx: Tx, o: { id: string; orgId: string; workerId: string; shiftId: string }, ch: Channel) {
  const m = msg.w5Offer(await shiftInfoOf(tx, o.shiftId), o.id);
  await tx.update(shiftOffers).set({ canalUsado: ch.canal }).where(eq(shiftOffers.id, o.id));
  await tx.insert(offerDeliveries).values({ orgId: o.orgId, offerId: o.id, canal: ch.canal, estado: 'queued' });
  await enqueue(tx, { canal: ch.canal, to: ch.identificador, msg: m, workerId: o.workerId, orgId: o.orgId, offerId: o.id });
}

const confirmedCount = async (tx: Tx, shiftId: string) =>
  (await tx.select({ n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.shiftId, shiftId), eq(assignments.status, 'confirmed'))))[0]!.n;

/**
 * Envía una oleada: ofrece el turno a los elegibles que aún no tienen oferta y tienen algún canal habilitado.
 * Bloquea el turno (FOR UPDATE) para que dos procesos no lancen la misma oleada. Contexto de sistema.
 */
export async function launchWave(tx: Tx, shiftId: string): Promise<{ sent: number }> {
  const [s] = rowsOf<{ orgId: string; cupos: number; estado: string; waveCount: number; factor: number }>(
    await tx.execute(sql`SELECT s.org_id AS "orgId", s.cupos, s.estado, s.wave_count AS "waveCount", o.wave_factor AS factor FROM shifts s JOIN orgs o ON o.id = s.org_id WHERE s.id = ${shiftId} FOR UPDATE OF s`),
  );
  if (!s || s.estado !== 'abierto') return { sent: 0 };
  const free = s.cupos - (await confirmedCount(tx, shiftId));
  if (free <= 0) return { sent: 0 };

  const offered = new Set((await tx.select({ w: shiftOffers.workerId }).from(shiftOffers).where(eq(shiftOffers.shiftId, shiftId))).map((r) => r.w));
  const wave = s.waveCount + 1;
  let sent = 0;
  for (const e of await eligibleWorkers(tx, s.orgId, shiftId)) {
    if (sent >= free * s.factor) break;
    if (offered.has(e.workerId)) continue;
    const ch = await pickChannel(tx, e.workerId);
    if (!ch) continue;
    const [o] = await tx.insert(shiftOffers).values({ orgId: s.orgId, shiftId, workerId: e.workerId, wave }).returning({ id: shiftOffers.id });
    await queueOffer(tx, { id: o!.id, orgId: s.orgId, workerId: e.workerId, shiftId }, ch);
    sent++;
  }
  // Una oleada vacía solo cuenta si es la primera (para no repetirla en cada ciclo); siempre marca la hora para espaciar.
  await tx.update(shifts).set({ waveCount: sent > 0 || s.waveCount === 0 ? wave : s.waveCount, lastWaveAt: sql`now()` }).where(eq(shifts.id, shiftId));
  if (sent > 0) {
    await audit(tx, { orgId: s.orgId, actorId: actor, accion: 'shift.wave_sent', entidad: 'shift', entidadId: shiftId, detalle: { wave, ofertas: sent } });
    await emit(tx, { org: s.orgId, type: 'shift.changed', shift: shiftId });
  }
  return { sent };
}

export type OfferOutcome = 'confirmed' | 'standby' | 'full' | 'declined' | 'already' | 'unavailable';

/**
 * Respuesta del candidato a una oferta (cualquier canal). La primera respuesta válida es la que cuenta:
 * `UPDATE … WHERE status IN (abiertos)` y el turno bloqueado para contar cupos sin carreras (50 aceptaciones
 * simultáneas no pueden pasar de `cupos`). Devuelve el mensaje para quien respondió.
 */
export async function respondOffer(
  tx: Tx, offerId: string, workerId: string, action: 'accept' | 'decline', canal: ChannelName,
): Promise<{ outcome: OfferOutcome; reply: OutMessage }> {
  const r = await respondOfferInner(tx, offerId, workerId, action, canal);
  if (r.outcome === 'confirmed' || r.outcome === 'standby' || r.outcome === 'declined' || r.outcome === 'full') {
    const [o] = await tx.select({ orgId: shiftOffers.orgId, shiftId: shiftOffers.shiftId }).from(shiftOffers).where(eq(shiftOffers.id, offerId));
    if (o) await emit(tx, { org: o.orgId, type: 'shift.changed', shift: o.shiftId });
  }
  return r;
}

async function respondOfferInner(
  tx: Tx, offerId: string, workerId: string, action: 'accept' | 'decline', canal: ChannelName,
): Promise<{ outcome: OfferOutcome; reply: OutMessage }> {
  const [offer] = await tx.select().from(shiftOffers).where(and(eq(shiftOffers.id, offerId), eq(shiftOffers.workerId, workerId)));
  if (!offer) return { outcome: 'unavailable', reply: msg.w13Unavailable() };

  // Bloquea el turno: serializa las respuestas a este turno.
  const [s] = rowsOf<{ cupos: number; estado: string; inicioOk: boolean; standbyMax: number }>(
    await tx.execute(sql`SELECT s.cupos, s.estado, s.inicio > now() AS "inicioOk", o.standby_max AS "standbyMax"
      FROM shifts s JOIN orgs o ON o.id = s.org_id WHERE s.id = ${offer.shiftId} FOR UPDATE OF s`),
  );
  const closeOffer = (status: string) =>
    tx.update(shiftOffers).set({ status, respondedAt: sql`now()`, respondedCanal: canal })
      .where(and(eq(shiftOffers.id, offerId), inArray(shiftOffers.status, [...OPEN_OFFER]))).returning({ id: shiftOffers.id });

  if (!(OPEN_OFFER as readonly string[]).includes(offer.status)) {
    // Ya se respondió (otro canal o el mismo) → «Ya respondiste»; si venció o se canceló → no disponible.
    const answered = offer.status === 'accepted' || offer.status === 'declined';
    return { outcome: answered ? 'already' : 'unavailable', reply: answered ? msg.w15AlreadyAnswered() : msg.w13Unavailable() };
  }
  if (!s || s.estado === 'cancelado' || s.estado === 'vencido' || s.estado === 'completado' || !s.inicioOk) {
    await closeOffer('expired');
    return { outcome: 'unavailable', reply: msg.w13Unavailable() };
  }

  if (action === 'decline') {
    await closeOffer('declined');
    await audit(tx, { orgId: offer.orgId, actorId: `worker:${workerId}`, accion: 'offer.declined', entidad: 'shift_offer', entidadId: offerId, detalle: { canal } });
    return { outcome: 'declined', reply: msg.w10Declined() };
  }

  // Aceptar: el candidato debe seguir activo en la org y sin choque con otro turno confirmado.
  const [link] = await tx.select({ estado: orgWorkers.estado, nombre: orgWorkers.nombre }).from(orgWorkers)
    .where(and(eq(orgWorkers.orgId, offer.orgId), eq(orgWorkers.workerId, workerId)));
  const busy = rowsOf<{ busy: boolean }>(
    await tx.execute(sql`SELECT worker_is_busy(${workerId}, s.inicio, s.fin, o.descanso_min_h) AS busy
      FROM shifts s JOIN orgs o ON o.id = s.org_id WHERE s.id = ${offer.shiftId}`),
  )[0]?.busy;
  if (link?.estado !== 'activo' || busy) {
    await closeOffer('cancelled');
    return { outcome: 'unavailable', reply: msg.w13Unavailable() };
  }

  const won = await closeOffer('accepted');
  if (!won.length) return { outcome: 'already', reply: msg.w15AlreadyAnswered() }; // otra respuesta ganó
  const info = await shiftInfoOf(tx, offer.shiftId);
  const confirmed = await confirmedCount(tx, offer.shiftId);

  if (confirmed < s.cupos) {
    await tx.insert(assignments).values({ orgId: offer.orgId, shiftId: offer.shiftId, workerId, status: 'confirmed' })
      .onConflictDoUpdate({ target: [assignments.shiftId, assignments.workerId], set: { status: 'confirmed', acceptedAt: sql`now()` } });
    if (confirmed + 1 >= s.cupos) await tx.update(shifts).set({ estado: 'cubierto' }).where(eq(shifts.id, offer.shiftId));
    await audit(tx, { orgId: offer.orgId, actorId: `worker:${workerId}`, accion: 'assignment.confirmed', entidad: 'shift', entidadId: offer.shiftId, detalle: { canal } });
    return { outcome: 'confirmed', reply: msg.w6Confirmed(link.nombre, info) };
  }

  const [{ n: standby } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(assignments)
    .where(and(eq(assignments.shiftId, offer.shiftId), eq(assignments.status, 'standby')));
  if (standby < s.standbyMax) {
    await tx.insert(assignments).values({ orgId: offer.orgId, shiftId: offer.shiftId, workerId, status: 'standby' })
      .onConflictDoUpdate({ target: [assignments.shiftId, assignments.workerId], set: { status: 'standby', acceptedAt: sql`now()` } });
    await audit(tx, { orgId: offer.orgId, actorId: `worker:${workerId}`, accion: 'assignment.standby', entidad: 'shift', entidadId: offer.shiftId, detalle: { canal } });
    return { outcome: 'standby', reply: msg.w7Standby(info) };
  }

  // Sin cupo ni reserva: la oferta queda cerrada.
  await tx.update(shiftOffers).set({ status: 'expired' }).where(eq(shiftOffers.id, offerId));
  return { outcome: 'full', reply: msg.w8Full() };
}

/**
 * El candidato libera su cupo (NO PUEDO IR) o cae una reserva. Si era un cupo confirmado, sube la reserva más antigua
 * (W9); si no hay reserva y el turno estaba cubierto, vuelve a `abierto` para que el worker busque reemplazo.
 */
export async function releaseSeat(tx: Tx, assignmentId: string, workerId: string): Promise<boolean> {
  const [before] = await tx.select({ status: assignments.status }).from(assignments).where(eq(assignments.id, assignmentId));
  const [a] = await tx
    .update(assignments).set({ status: 'cancelled' })
    .where(and(eq(assignments.id, assignmentId), eq(assignments.workerId, workerId), inArray(assignments.status, ['confirmed', 'standby'])))
    .returning({ shiftId: assignments.shiftId, orgId: assignments.orgId });
  if (!a) return false;
  await audit(tx, { orgId: a.orgId, actorId: `worker:${workerId}`, accion: 'assignment.released', entidad: 'shift', entidadId: a.shiftId });
  await promoteStandby(tx, a.shiftId, a.orgId);
  await emit(tx, { org: a.orgId, type: 'shift.changed', shift: a.shiftId });
  // Si quien se cae tenía el cupo confirmado, el gerente debe saberlo (urgente si faltan menos de 3 h).
  if (before?.status === 'confirmed') {
    await raiseAlert(tx, { orgId: a.orgId, tipo: 'cancelacion_asistencia', shiftId: a.shiftId, workerId, urgente: await startsSoon(tx, a.shiftId) });
  }
  return true;
}

/** Sube la reserva más antigua a un cupo libre; si no hay a quién subir y el turno estaba cubierto, lo reabre. */
export async function promoteStandby(tx: Tx, shiftId: string, orgId: string) {
  const [s] = rowsOf<{ cupos: number; estado: string }>(await tx.execute(sql`SELECT cupos, estado FROM shifts WHERE id = ${shiftId} FOR UPDATE`));
  if (!s || (s.estado !== 'abierto' && s.estado !== 'cubierto')) return;
  if ((await confirmedCount(tx, shiftId)) >= s.cupos) return;
  const [next] = await tx.select({ id: assignments.id, workerId: assignments.workerId }).from(assignments)
    .where(and(eq(assignments.shiftId, shiftId), eq(assignments.status, 'standby')))
    .orderBy(asc(assignments.acceptedAt), asc(assignments.id)).limit(1);
  if (next) {
    await tx.update(assignments).set({ status: 'confirmed' }).where(eq(assignments.id, next.id));
    await audit(tx, { orgId, actorId: actor, accion: 'assignment.promoted', entidad: 'shift', entidadId: shiftId });
    await notifyWorker(tx, next.workerId, orgId, msg.w9Promoted(await shiftInfoOf(tx, shiftId)));
  } else if (s.estado === 'cubierto') {
    await tx.update(shifts).set({ estado: 'abierto' }).where(eq(shifts.id, shiftId));
  }
}

/** La empresa cancela el turno: cierra ofertas y asignaciones y avisa a cada persona afectada (W11). */
export async function cancelShift(tx: Tx, orgId: string, shiftId: string, actorId: string): Promise<boolean> {
  const [s] = await tx.update(shifts).set({ estado: 'cancelado' })
    .where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId), inArray(shifts.estado, ['abierto', 'cubierto']))).returning({ id: shifts.id });
  if (!s) return false;
  const affected = await tx.update(assignments).set({ status: 'cancelled' })
    .where(and(eq(assignments.shiftId, shiftId), inArray(assignments.status, ['confirmed', 'standby']))).returning({ workerId: assignments.workerId });
  await tx.update(shiftOffers).set({ status: 'cancelled' }).where(and(eq(shiftOffers.shiftId, shiftId), inArray(shiftOffers.status, [...OPEN_OFFER])));
  const info = await shiftInfoOf(tx, shiftId);
  for (const a of affected) await notifyWorker(tx, a.workerId, orgId, msg.w11ShiftCancelled(info));
  await audit(tx, { orgId, actorId, accion: 'shift.cancelled', entidad: 'shift', entidadId: shiftId, detalle: { afectados: affected.length } });
  await emit(tx, { org: orgId, type: 'shift.changed', shift: shiftId });
  return true;
}

/** Una oferta sin salir por su canal pasa al siguiente canal habilitado; solo mientras no tenga respuesta. */
async function escalate(tx: Tx): Promise<number> {
  const stuck = rowsOf<{ id: string; orgId: string; workerId: string; shiftId: string; canal: string | null; outboxId: number; ox: string }>(
    await tx.execute(sql`
      SELECT o.id, o.org_id AS "orgId", o.worker_id AS "workerId", o.shift_id AS "shiftId", o.canal_usado AS canal, x.id AS "outboxId", x.estado AS ox
      FROM shift_offers o
      JOIN LATERAL (SELECT id, estado, created_at FROM outbox WHERE offer_id = o.id ORDER BY id DESC LIMIT 1) x ON true
      WHERE o.status = 'queued'
        AND (x.estado = 'failed' OR (x.estado = 'pending' AND x.created_at <= now() - make_interval(secs => ${ESCALATE_AFTER_SECONDS})))`),
  );
  let moved = 0;
  for (const o of stuck) {
    // Si el mensaje sigue en cola se anula con un UPDATE condicionado: si un worker ya lo tomó, gana el envío y no se escala.
    if (o.ox === 'pending') {
      const cancelled = rowsOf(
        await tx.execute(sql`UPDATE outbox SET estado = 'failed', destinatario = '***', payload = '{}'::jsonb, last_error = 'escalada'
          WHERE id = ${o.outboxId} AND estado = 'pending' RETURNING id`),
      );
      if (!cancelled.length) continue;
      await tx.execute(sql`UPDATE offer_deliveries SET estado = 'failed'
        WHERE id = (SELECT max(id) FROM offer_deliveries WHERE offer_id = ${o.id})`);
    }
    const tried = (await tx.select({ canal: offerDeliveries.canal }).from(offerDeliveries).where(eq(offerDeliveries.offerId, o.id))).map((d) => d.canal);
    const next = await pickChannel(tx, o.workerId, tried);
    if (!next) {
      await tx.update(shiftOffers).set({ status: 'undeliverable' }).where(and(eq(shiftOffers.id, o.id), eq(shiftOffers.status, 'queued')));
      await audit(tx, { orgId: o.orgId, actorId: actor, accion: 'offer.undeliverable', entidad: 'shift_offer', entidadId: o.id, detalle: { canales_probados: tried.join(',') } });
      continue;
    }
    await queueOffer(tx, o, next);
    await audit(tx, { orgId: o.orgId, actorId: actor, accion: 'offer.escalated', entidad: 'shift_offer', entidadId: o.id, detalle: { de: o.canal, a: next.canal } });
    moved++;
  }
  return moved;
}

/**
 * Un ciclo del motor de turnos (lo corre el worker): vence turnos pasados, lanza primeras oleadas, espacia las
 * siguientes por `wave_minutes`, relanza la búsqueda hasta el límite de la org y escala ofertas que no salieron.
 */
export async function tick(db: Db): Promise<{ expired: number; waves: number; relaunches: number; escalated: number }> {
  return withSuper(db, async (tx) => {
    // 1) Turnos que ya empezaron sin cubrirse: vencen y cierran sus ofertas.
    const expired = await tx.execute(sql`UPDATE shifts SET estado = 'vencido' WHERE estado = 'abierto' AND inicio <= now() RETURNING id, org_id AS "orgId"`);
    const exp = rowsOf<{ id: string; orgId: string }>(expired);
    for (const e of exp) {
      await tx.update(shiftOffers).set({ status: 'expired' }).where(and(eq(shiftOffers.shiftId, e.id), inArray(shiftOffers.status, [...OPEN_OFFER])));
      await audit(tx, { orgId: e.orgId, actorId: actor, accion: 'shift.expired', entidad: 'shift', entidadId: e.id });
      await emit(tx, { org: e.orgId, type: 'shift.changed', shift: e.id });
      await raiseAlert(tx, { orgId: e.orgId, tipo: 'turno_vencido', shiftId: e.id });
    }

    // 2) Primeras oleadas y oleadas siguientes / relanzamientos.
    const due = rowsOf<{ id: string; waveCount: number; relaunches: number; limit: number; pending: number; standby: number }>(
      await tx.execute(sql`
        SELECT s.id, s.wave_count AS "waveCount", s.relaunches, o.relaunch_limit AS "limit",
          (SELECT count(*)::int FROM shift_offers f WHERE f.shift_id = s.id AND f.status IN ('queued','sent','delivered','read')) AS pending,
          (SELECT count(*)::int FROM assignments a WHERE a.shift_id = s.id AND a.status = 'standby') AS standby
        FROM shifts s JOIN orgs o ON o.id = s.org_id
        WHERE s.estado = 'abierto'
          AND (s.wave_count = 0 OR s.last_wave_at <= now() - make_interval(mins => o.wave_minutes))
        ORDER BY s.inicio, s.id`),
    );
    let waves = 0;
    let relaunches = 0;
    for (const s of due) {
      if (s.waveCount === 0) {
        waves += (await launchWave(tx, s.id)).sent ? 1 : 0;
      } else if (s.pending > 0) {
        // Hay ofertas esperando respuesta: la siguiente oleada va a quienes aún no tienen oferta.
        waves += (await launchWave(tx, s.id)).sent ? 1 : 0;
      } else if (s.standby === 0 && s.relaunches < s.limit) {
        // Nadie pendiente ni en reserva y quedan cupos: relanza la búsqueda (cuenta contra el límite de la org).
        await tx.update(shifts).set({ relaunches: sql`${shifts.relaunches} + 1` }).where(eq(shifts.id, s.id));
        const r = await launchWave(tx, s.id);
        await audit(tx, { orgId: (await orgOf(tx, s.id)), actorId: actor, accion: 'shift.relaunched', entidad: 'shift', entidadId: s.id, detalle: { relanzamiento: s.relaunches + 1, ofertas: r.sent } });
        relaunches++;
      }
    }

    // 3) Escalada entre canales.
    const escalated = await escalate(tx);
    return { expired: exp.length, waves, relaunches, escalated };
  });
}

async function orgOf(tx: Tx, shiftId: string): Promise<string> {
  return (await tx.select({ o: shifts.orgId }).from(shifts).where(eq(shifts.id, shiftId)))[0]!.o;
}
