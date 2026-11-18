import { and, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import {
  orgWorkers, orgs, pendingConfirmations, inboundMessages, telegramAltaPending, termsVersions, workerChannels, workerConsents, workers,
  audit, withSuper, type Db, type Tx,
} from '@turnoextra/db';
import { linkChannel, release, requestEmail, requestTelegram } from './commands.js';
import { normalizeCoPhone } from '@turnoextra/shared';
import { enqueue } from './outbox.js';
import { msg } from './messages.js';
import { releaseSeat, respondOffer } from './offers.js';
import { openDispute } from './attendance.js';
import { linkManagerTelegram } from './manager-telegram.js';
export { linkChannel, handleLinkButton } from './commands.js';
import { deleteWorkerData, workerBaja, workerSalir } from './services.js';
import type { InboundEvent, OutMessage } from './types.js';

/** Minúsculas, sin tildes, espacios colapsados y sin puntuación final. */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?¡¿]+$/g, '').trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETE_TTL_MIN = 10;
/** Tiempo para compartir el celular después de abrir `/start ALTA-<código>`. */
const TG_ALTA_TTL_MIN = 15;

export type EngineDeps = {
  policyUrl: string;
  /** Usuario del bot de Telegram (sin @); sin él, el comando TELEGRAM responde que no está disponible. */
  telegramBot?: string;
};
/** Resultado sin datos personales; sirve para logs y pruebas. */
export type Handled = { handled: string };

/**
 * Único camino de entrada de mensajes (webhook real y simulador). Corre en contexto de sistema porque el remitente
 * no pertenece a ninguna org todavía; todo lo que escribe queda atado a org_id y en bitácora.
 */
export function handleInbound(db: Db, deps: EngineDeps, ev: InboundEvent): Promise<Handled> {
  return withSuper(db, (tx) => process(tx, deps, ev));
}

async function process(tx: Tx, deps: EngineDeps, ev: InboundEvent): Promise<Handled> {
  // WhatsApp y simulador identifican por celular; Telegram por el chat que el candidato vinculó él mismo.
  let w: typeof workers.$inferSelect | undefined;
  if (ev.canal === 'telegram') {
    const rows = await tx
      .select({ w: workers })
      .from(workers)
      .innerJoin(workerChannels, eq(workerChannels.workerId, workers.id))
      .where(and(eq(workerChannels.canal, 'telegram'), eq(workerChannels.identificador, ev.from), eq(workerChannels.habilitado, true)));
    w = rows[0]?.w;
  } else {
    const phone = normalizeCoPhone(ev.from);
    if (!phone) return { handled: 'ignored_invalid_sender' };
    [w] = await tx.select().from(workers).where(eq(workers.celular, phone));
  }

  const fresh = await tx
    .insert(inboundMessages)
    .values({ canal: ev.canal, externalId: ev.externalId, workerId: w?.id ?? null })
    .onConflictDoNothing()
    .returning({ id: inboundMessages.id });
  if (!fresh.length) return { handled: 'duplicate' };

  const reply = (m: OutMessage, orgId?: string) =>
    enqueue(tx, { canal: ev.canal, to: ev.from, msg: m, workerId: w?.id ?? null, orgId: orgId ?? null });
  const text = norm(ev.text ?? '');

  // BAJA se atiende antes que cualquier otra regla.
  if (text === 'baja') {
    if (w) await workerBaja(tx, w.id, { actorId: `worker:${w.id}` });
    await reply(msg.w12Baja());
    return { handled: 'baja' };
  }

  // Tras borrar, el último mensaje no puede quedar atado al candidato (sus filas de la cola se eliminan).
  const replyAnon = (m: OutMessage) => enqueue(tx, { canal: ev.canal, to: ev.from, msg: m, workerId: null, orgId: null });
  if (ev.buttonId) return button(tx, ev, ev.buttonId, w, reply, replyAnon);

  // Telegram: el celular compartido con el botón completa un alta directa por Telegram.
  if (ev.canal === 'telegram' && ev.contact) return telegramContact(tx, deps, ev, ev.contact);

  // Telegram: «/start CÓDIGO» vincula el chat al candidato que pidió el código (lo inició él).
  // «/start ALTA-<código org>» es el alta directa (QR del afiche) y «/start G-<código>» vincula el Telegram de un gerente.
  const start = ev.canal === 'telegram' ? /^\/start(?:\s+([A-Za-z0-9_-]+))?$/.exec((ev.text ?? '').trim()) : null;
  if (start) {
    const arg = start[1] ?? '';
    if (/^G-/i.test(arg)) return linkManagerTelegram(tx, arg.slice(2), ev.from, replyAnon);
    if (/^ALTA-/i.test(arg)) return telegramAltaStart(tx, deps, arg.slice(5), ev, w, reply);
    const r = /^[A-Za-z0-9]+$/.test(arg) ? await linkChannel(tx, arg, 'telegram', ev.from) : 'invalid';
    await reply(r === 'linked' ? msg.w21TelegramLinked() : r === 'taken' ? msg.w21cLinkTaken() : msg.w21bLinkInvalid());
    return { handled: `telegram_${r}` };
  }

  if (text === 'telegram') return requestTelegram(tx, deps.telegramBot, w, reply);
  const mail = /^(?:correo|email)\s+(\S+)$/.exec(text);
  if (mail) return requestEmail(tx, mail[1]!, w, reply);
  if (text === 'no puedo ir') return release(tx, w, reply);

  if (text.startsWith('borrar mis datos')) {
    if (!w) {
      await reply(msg.w4Help(ev.canal));
      return { handled: 'help' };
    }
    await tx.insert(pendingConfirmations)
      .values({ workerId: w.id, accion: 'delete', expiresAt: sql`now() + make_interval(mins => ${DELETE_TTL_MIN})` })
      .onConflictDoUpdate({ target: pendingConfirmations.workerId, set: { accion: 'delete', expiresAt: sql`now() + make_interval(mins => ${DELETE_TTL_MIN})` } });
    await reply(msg.w17ConfirmDelete());
    return { handled: 'delete_requested' };
  }

  if (text === 'salir' || text.startsWith('salir ')) return salir(tx, text.slice(5).trim(), w, reply);

  if (text === 'hola' || text === 'alta' || /^alta [a-z0-9]+$/.test(text)) {
    return alta(tx, deps, text.split(' ')[1], w, reply, ev.canal);
  }

  // Texto libre de quien tiene un no_show reciente: es su explicación (disputa, W19).
  if (w && !ev.buttonId) {
    const d = await openDispute(tx, w.id, ev.text ?? '');
    if (d.outcome === 'opened') {
      await reply(d.reply!, d.orgId);
      return { handled: 'dispute_opened' };
    }
  }

  await reply(msg.w4Help(ev.canal));
  return { handled: 'help' };
}

type Reply = (m: OutMessage, orgId?: string) => Promise<void>;
type Worker = typeof workers.$inferSelect | undefined;

async function alta(tx: Tx, deps: EngineDeps, code: string | undefined, w: Worker, reply: Reply, canal: InboundEvent['canal']): Promise<Handled> {
  let orgId: string | undefined;
  if (code) {
    const [o] = await tx.select({ id: orgs.id }).from(orgs).where(eq(orgs.inviteCode, code.toUpperCase()));
    if (!o) {
      await reply(msg.w4Help(canal));
      return { handled: 'help' };
    }
    orgId = o.id;
  } else if (w) {
    // «ALTA» u «Hola» sin código: solo se completa si el celular está pendiente en una única org.
    const pend = await tx.select({ orgId: orgWorkers.orgId }).from(orgWorkers)
      .where(and(eq(orgWorkers.workerId, w.id), eq(orgWorkers.estado, 'pendiente')));
    if (pend.length === 1) orgId = pend[0]!.orgId;
  }
  if (!orgId) {
    await reply(msg.w4Help(canal));
    return { handled: 'help' };
  }

  const [o] = await tx.select({ nombre: orgs.nombre }).from(orgs).where(eq(orgs.id, orgId));
  const [link] = w
    ? await tx.select().from(orgWorkers).where(and(eq(orgWorkers.workerId, w.id), eq(orgWorkers.orgId, orgId)))
    : [];
  if (!link || link.estado === 'baja' || link.estado === 'baja_org') {
    await reply(msg.w3NotFound(o!.nombre));
    return { handled: 'alta_not_found' };
  }
  if (link.estado === 'activo') {
    await reply(msg.w2bAlready(o!.nombre), orgId);
    return { handled: 'alta_already' };
  }
  await reply(msg.w1Consent(o!.nombre, orgId, deps.policyUrl, canal === 'telegram' ? 'Telegram' : 'WhatsApp'), orgId);
  return { handled: 'consent_requested' };
}

async function button(tx: Tx, ev: InboundEvent, id: string, w: Worker, reply: Reply, replyAnon: (m: OutMessage) => Promise<void>): Promise<Handled> {
  if (!w) {
    await reply(msg.w4Help(ev.canal));
    return { handled: 'help' };
  }
  const [kind, arg] = id.split(':');

  if (kind === 'OFFER_ACCEPT' || kind === 'OFFER_DECLINE') {
    if (!arg || !UUID.test(arg)) {
      await reply(msg.w4Help(ev.canal));
      return { handled: 'help' };
    }
    const r = await respondOffer(tx, arg, w.id, kind === 'OFFER_ACCEPT' ? 'accept' : 'decline', ev.canal);
    await reply(r.reply);
    return { handled: `offer_${r.outcome}` };
  }

  if (kind === 'RELEASE') {
    const ok = arg && UUID.test(arg) ? await releaseSeat(tx, arg, w.id) : false;
    await reply(ok ? msg.w14Released() : msg.w14bNothingToRelease());
    return { handled: ok ? 'released' : 'release_none' };
  }

  if (kind === 'CONSENT_YES' || kind === 'CONSENT_NO') {
    if (!arg || !UUID.test(arg)) {
      await reply(msg.w4Help(ev.canal));
      return { handled: 'help' };
    }
    const [o] = await tx.select({ nombre: orgs.nombre }).from(orgs).where(eq(orgs.id, arg));
    const [link] = await tx.select().from(orgWorkers).where(and(eq(orgWorkers.workerId, w.id), eq(orgWorkers.orgId, arg)));
    if (!o || !link) {
      await reply(msg.w4Help(ev.canal));
      return { handled: 'help' };
    }
    if (link.estado === 'activo') {
      await reply(msg.w2bAlready(o.nombre), arg);
      return { handled: 'alta_already' };
    }
    // Solo se puede responder mientras la relación siga pendiente (BAJA/SALIR posteriores no se revierten por un botón viejo).
    if (link.estado !== 'pendiente') {
      await reply(msg.w3NotFound(o.nombre), arg);
      return { handled: 'consent_stale' };
    }
    if (kind === 'CONSENT_NO') {
      await tx.update(orgWorkers).set({ estado: 'baja_org' }).where(eq(orgWorkers.id, link.id));
      await audit(tx, { orgId: arg, actorId: `worker:${w.id}`, accion: 'worker.consent_declined', entidad: 'worker', entidadId: w.id });
      await reply(msg.w2cDeclined(o.nombre), arg);
      return { handled: 'consent_declined' };
    }
    const [terms] = await tx.select({ id: termsVersions.id }).from(termsVersions)
      .where(eq(termsVersions.audience, 'candidato')).orderBy(desc(termsVersions.version)).limit(1);
    // El candidato aceptó por este canal (WhatsApp, o Telegram si se dio de alta desde el QR de Telegram).
    const via = ev.canal === 'telegram' ? 'telegram' : 'whatsapp';
    await tx.update(orgWorkers).set({ estado: 'activo' }).where(eq(orgWorkers.id, link.id));
    await tx.insert(workerConsents).values({ orgId: arg, workerId: w.id, termsVersionId: terms?.id ?? null, canal: via });
    // El candidato inició el contacto por este canal: queda habilitado y prioritario.
    await tx.insert(workerChannels)
      .values({ workerId: w.id, canal: via, identificador: via === 'telegram' ? ev.from : w.celular!, habilitado: true, prioridad: 10, verificadoAt: sql`now()` })
      .onConflictDoUpdate({ target: [workerChannels.workerId, workerChannels.canal], set: { habilitado: true, prioridad: 10, verificadoAt: sql`now()` } });
    await audit(tx, { orgId: arg, actorId: `worker:${w.id}`, accion: 'worker.consent_accepted', entidad: 'worker', entidadId: w.id });
    await reply(msg.w2Joined(o.nombre), arg);
    return { handled: 'consent_accepted' };
  }

  if (kind === 'DELETE_YES' || kind === 'DELETE_NO') {
    const [pending] = await tx.select().from(pendingConfirmations)
      .where(and(eq(pendingConfirmations.workerId, w.id), eq(pendingConfirmations.accion, 'delete'), gt(pendingConfirmations.expiresAt, sql`now()`)));
    await tx.delete(pendingConfirmations).where(eq(pendingConfirmations.workerId, w.id));
    if (!pending) {
      await reply(msg.w17cDeleteExpired());
      return { handled: 'delete_expired' };
    }
    if (kind === 'DELETE_NO') {
      await reply(msg.w17bDeleteCancelled());
      return { handled: 'delete_cancelled' };
    }
    await deleteWorkerData(tx, w.id, { actorId: `worker:${w.id}` });
    await replyAnon(msg.w18Deleted());
    return { handled: 'delete_confirmed' };
  }

  await reply(msg.w4Help(ev.canal));
  return { handled: 'help' };
}

async function salir(tx: Tx, name: string, w: Worker, reply: Reply): Promise<Handled> {
  if (!w) {
    await reply(msg.w16bSalirHelp());
    return { handled: 'salir_help' };
  }
  const links = await tx
    .select({ orgId: orgWorkers.orgId, nombre: orgs.nombre })
    .from(orgWorkers)
    .innerJoin(orgs, eq(orgs.id, orgWorkers.orgId))
    .where(and(eq(orgWorkers.workerId, w.id), inArray(orgWorkers.estado, ['activo', 'pendiente'])));
  const n = norm(name);
  const exact = links.filter((l) => norm(l.nombre) === n);
  const partial = links.filter((l) => n && norm(l.nombre).startsWith(n));
  const match = exact.length === 1 ? exact[0] : exact.length === 0 && partial.length === 1 ? partial[0] : !n && links.length === 1 ? links[0] : undefined;
  if (!match) {
    await reply(msg.w16bSalirHelp());
    return { handled: 'salir_help' };
  }
  await workerSalir(tx, w.id, match.orgId, { actorId: `worker:${w.id}` });
  await reply(msg.w16Salir(match.nombre), match.orgId);
  return { handled: 'salir' };
}

/**
 * `/start ALTA-<código>`: alta directa por Telegram. Un chat ya vinculado sigue el camino de un ALTA normal;
 * uno nuevo debe compartir el celular de su propia cuenta para encontrarlo en la lista de la empresa.
 */
async function telegramAltaStart(tx: Tx, deps: EngineDeps, code: string, ev: InboundEvent, w: Worker, reply: Reply): Promise<Handled> {
  if (w) return alta(tx, deps, code, w, reply, 'telegram');
  const [o] = /^[A-Za-z0-9]+$/.test(code)
    ? await tx.select({ nombre: orgs.nombre }).from(orgs).where(eq(orgs.inviteCode, code.toUpperCase()))
    : [];
  if (!o) {
    await reply(msg.w4Help(ev.canal));
    return { handled: 'help' };
  }
  const expiresAt = sql`now() + make_interval(mins => ${TG_ALTA_TTL_MIN})`;
  await tx.insert(telegramAltaPending)
    .values({ chatId: ev.from, inviteCode: code.toUpperCase(), expiresAt })
    .onConflictDoUpdate({ target: telegramAltaPending.chatId, set: { inviteCode: code.toUpperCase(), expiresAt } });
  await reply(msg.w23AskContact(o.nombre));
  return { handled: 'telegram_alta_contact_requested' };
}

/**
 * Celular compartido tras `/start ALTA-<código>`. Solo vale el de la propia cuenta (Telegram lo verificó por SMS):
 * con él se encuentra a la persona registrada por la empresa, se vincula este chat y sigue el mismo alta que por WhatsApp.
 */
async function telegramContact(tx: Tx, deps: EngineDeps, ev: InboundEvent, contact: { phone: string; own: boolean }): Promise<Handled> {
  const send = (m: OutMessage, workerId: string | null = null, orgId: string | null = null) =>
    enqueue(tx, { canal: 'telegram', to: ev.from, msg: m, workerId, orgId });
  const [p] = await tx.select().from(telegramAltaPending)
    .where(and(eq(telegramAltaPending.chatId, ev.from), gt(telegramAltaPending.expiresAt, sql`now()`)));
  if (!p) {
    await tx.delete(telegramAltaPending).where(eq(telegramAltaPending.chatId, ev.from));
    await send(msg.w23dAltaExpired());
    return { handled: 'telegram_alta_expired' };
  }
  if (!contact.own) {
    await send(msg.w23bContactNotOwn());
    return { handled: 'telegram_contact_not_own' };
  }
  await tx.delete(telegramAltaPending).where(eq(telegramAltaPending.chatId, ev.from));
  const phone = normalizeCoPhone(contact.phone);
  if (!phone) {
    await send(msg.w23eInvalidPhone());
    return { handled: 'telegram_contact_invalid' };
  }
  const [person] = await tx.select().from(workers).where(eq(workers.celular, phone));
  await send(msg.w23cContactReceived(), person?.id ?? null);

  const [o] = await tx.select({ id: orgs.id }).from(orgs).where(eq(orgs.inviteCode, p.inviteCode));
  const [link] = person && o
    ? await tx.select({ estado: orgWorkers.estado }).from(orgWorkers).where(and(eq(orgWorkers.workerId, person.id), eq(orgWorkers.orgId, o.id)))
    : [];
  if (person && o && link && (link.estado === 'pendiente' || link.estado === 'activo')) {
    const [other] = await tx.select({ w: workerChannels.workerId }).from(workerChannels)
      .where(and(eq(workerChannels.canal, 'telegram'), eq(workerChannels.identificador, ev.from), ne(workerChannels.workerId, person.id)));
    if (other) {
      await send(msg.w21cLinkTaken(), person.id);
      return { handled: 'telegram_taken' };
    }
    // Su Telegram queda habilitado ya: el «Acepto» que sigue llega por este chat y debe reconocerlo.
    await tx.insert(workerChannels)
      .values({ workerId: person.id, canal: 'telegram', identificador: ev.from, habilitado: true, prioridad: 20, verificadoAt: sql`now()` })
      .onConflictDoUpdate({ target: [workerChannels.workerId, workerChannels.canal], set: { identificador: ev.from, habilitado: true, verificadoAt: sql`now()` } });
    await audit(tx, { orgId: o.id, actorId: `worker:${person.id}`, accion: 'worker.channel_enabled', entidad: 'worker', entidadId: person.id, detalle: { canal: 'telegram' } });
  }
  const reply: Reply = (m, orgId) => send(m, person?.id ?? null, orgId ?? null);
  return alta(tx, deps, p.inviteCode, person, reply, 'telegram');
}
