import { randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import {
  assignments, audit, channelLinkCodes, orgWorkers, shiftOffers, shifts, workerChannels, withSuper,
  type Db, type Tx,
} from '@turnoextra/db';
import { enqueue } from './outbox.js';
import { msg, slotLabel } from './messages.js';
import { releaseSeat, respondOffer } from './offers.js';
import type { OutMessage } from './types.js';

export type Reply = (m: OutMessage, orgId?: string) => Promise<void>;
export type Handled = { handled: string };
type WorkerRef = { id: string } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_TTL_MIN = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newCode = () => randomBytes(5).toString('hex').toUpperCase();

async function hasActiveLink(tx: Tx, workerId: string) {
  const r = await tx.select({ id: orgWorkers.id }).from(orgWorkers)
    .where(and(eq(orgWorkers.workerId, workerId), eq(orgWorkers.estado, 'activo'))).limit(1);
  return r.length > 0;
}

/** NO PUEDO IR: libera el único turno próximo del candidato, o le pide elegir si tiene varios. */
export async function release(tx: Tx, w: WorkerRef, reply: Reply): Promise<Handled> {
  const rows = w
    ? await tx
        .select({ id: assignments.id, inicio: shifts.inicio })
        .from(assignments)
        .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
        .where(and(
          eq(assignments.workerId, w.id),
          inArray(assignments.status, ['confirmed', 'standby']),
          inArray(shifts.estado, ['abierto', 'cubierto']),
          sql`${shifts.fin} > now()`,
        ))
        .orderBy(shifts.inicio)
        .limit(4)
    : [];
  if (!w || !rows.length) {
    await reply(msg.w14bNothingToRelease());
    return { handled: 'release_none' };
  }
  if (rows.length === 1) {
    await releaseSeat(tx, rows[0]!.id, w.id);
    await reply(msg.w14Released());
    return { handled: 'released' };
  }
  await reply(msg.w14cChoose(rows.map((r) => ({ assignmentId: r.id, title: slotLabel(r.inicio) }))));
  return { handled: 'release_choose' };
}

/** Comando TELEGRAM: genera un código de un solo uso para que el candidato active el canal desde su cuenta. */
export async function requestTelegram(tx: Tx, telegramBot: string | undefined, w: WorkerRef, reply: Reply): Promise<Handled> {
  if (!w || !(await hasActiveLink(tx, w.id))) {
    await reply(msg.w22cNeedActive());
    return { handled: 'channel_need_active' };
  }
  if (!telegramBot) {
    await reply(msg.w20bTelegramOff());
    return { handled: 'telegram_off' };
  }
  const code = newCode();
  await tx.delete(channelLinkCodes).where(and(eq(channelLinkCodes.workerId, w.id), eq(channelLinkCodes.canal, 'telegram')));
  await tx.insert(channelLinkCodes).values({ code, workerId: w.id, canal: 'telegram', expiresAt: sql`now() + make_interval(mins => ${LINK_TTL_MIN})` });
  await reply(msg.w20TelegramLink(telegramBot, code));
  return { handled: 'telegram_code' };
}

/** Comando CORREO x@y.z: manda un enlace de verificación a esa dirección; el canal se habilita al tocarlo. */
export async function requestEmail(tx: Tx, address: string, w: WorkerRef, reply: Reply): Promise<Handled> {
  if (!w || !(await hasActiveLink(tx, w.id))) {
    await reply(msg.w22cNeedActive());
    return { handled: 'channel_need_active' };
  }
  if (address.length > 254 || !EMAIL_RE.test(address)) {
    await reply(msg.w22bEmailInvalid());
    return { handled: 'email_invalid' };
  }
  const to = address.toLowerCase();
  const code = newCode();
  await tx.delete(channelLinkCodes).where(and(eq(channelLinkCodes.workerId, w.id), eq(channelLinkCodes.canal, 'email')));
  await tx.insert(channelLinkCodes).values({ code, workerId: w.id, canal: 'email', identificador: to, expiresAt: sql`now() + interval '24 hours'` });
  await enqueue(tx, { canal: 'email', to, msg: msg.emailVerify(code), workerId: w.id });
  await reply(msg.w22EmailSent());
  return { handled: 'email_verification_sent' };
}

/** Consume un código de vinculación (un solo uso, con vencimiento) y habilita el canal para ese candidato. */
export async function linkChannel(tx: Tx, code: string, canal: 'telegram' | 'email', identifier: string): Promise<'linked' | 'invalid' | 'taken'> {
  const [row] = await tx.delete(channelLinkCodes)
    .where(and(eq(channelLinkCodes.code, code.toUpperCase()), eq(channelLinkCodes.canal, canal), gt(channelLinkCodes.expiresAt, sql`now()`)))
    .returning();
  if (!row || !(await hasActiveLink(tx, row.workerId))) return 'invalid';
  const ident = canal === 'email' ? row.identificador! : identifier;
  const [other] = await tx.select({ w: workerChannels.workerId }).from(workerChannels)
    .where(and(eq(workerChannels.canal, canal), eq(workerChannels.identificador, ident), ne(workerChannels.workerId, row.workerId)));
  if (other) return 'taken';
  await tx.insert(workerChannels)
    .values({ workerId: row.workerId, canal, identificador: ident, habilitado: true, prioridad: canal === 'telegram' ? 20 : 30, verificadoAt: sql`now()` })
    .onConflictDoUpdate({ target: [workerChannels.workerId, workerChannels.canal], set: { identificador: ident, habilitado: true, verificadoAt: sql`now()` } });
  const links = await tx.select({ orgId: orgWorkers.orgId }).from(orgWorkers)
    .where(and(eq(orgWorkers.workerId, row.workerId), eq(orgWorkers.estado, 'activo')));
  for (const l of links) {
    await audit(tx, { orgId: l.orgId, actorId: `worker:${row.workerId}`, accion: 'worker.channel_enabled', entidad: 'worker', entidadId: row.workerId, detalle: { canal } });
  }
  return 'linked';
}

/**
 * Botón tocado desde un enlace de correo (firma ya verificada): oferta o verificación de correo.
 * Devuelve el texto para mostrar en la página; las respuestas por correo no se reenvían a otros canales.
 */
export function handleLinkButton(db: Db, buttonId: string): Promise<{ text: string }> {
  return withSuper(db, async (tx) => {
    const [kind, arg] = buttonId.split(':');
    if (kind === 'VERIFY_EMAIL' && arg) {
      const r = await linkChannel(tx, arg, 'email', '');
      return { text: r === 'linked' ? msg.w23EmailLinked().text : r === 'taken' ? msg.w21cLinkTaken().text : msg.w21bLinkInvalid().text };
    }
    if ((kind === 'OFFER_ACCEPT' || kind === 'OFFER_DECLINE') && arg && UUID.test(arg)) {
      const [o] = await tx.select({ workerId: shiftOffers.workerId }).from(shiftOffers).where(eq(shiftOffers.id, arg));
      if (!o) return { text: msg.w13Unavailable().text };
      // El correo debe seguir habilitado: si el candidato hizo BAJA, el enlace ya no responde nada.
      const [ch] = await tx.select({ h: workerChannels.habilitado }).from(workerChannels)
        .where(and(eq(workerChannels.workerId, o.workerId), eq(workerChannels.canal, 'email')));
      if (!ch?.h) return { text: msg.w13Unavailable().text };
      const r = await respondOffer(tx, arg, o.workerId, kind === 'OFFER_ACCEPT' ? 'accept' : 'decline', 'email');
      return { text: r.reply.text };
    }
    return { text: msg.w13Unavailable().text };
  });
}
