import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  ALERT_TYPES, alerts, emit, managerContacts, managerTelegram, notificationPrefs, orgWorkers, roles, shifts, withOrg, withSuper,
  type DomainEvent, type Db,
} from '@turnoextra/db';
import { MANAGER_TG_TTL_MIN, enqueue, managerTelegramCodeHash, newManagerTelegramCode } from '@turnoextra/channels';
import { normalizeCoPhone } from '@turnoextra/shared';
import type { Guards } from '../auth/guards.js';
import type { Realtime } from '../realtime.js';

type Gate = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

const uuid = z.string().uuid();
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
const eventoSchema = z.enum(ALERT_TYPES);

const HEARTBEAT_MS = 20_000;
/** Una conexión vive como máximo esto; el navegador reconecta solo y la sesión se vuelve a validar. */
export const STREAM_MAX_MS = 30 * 60_000;
const CODE_TTL_MS = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

const maskPhone = (p: string) => `***${p.replace(/\D/g, '').slice(-4)}`;
const hashCode = (userId: string, code: string) => createHash('sha256').update(`${userId}:${code}`).digest('hex');

/**
 * Tiempo real (SSE), alertas del gerente, preferencias de aviso y WhatsApp del gerente para alertas urgentes.
 * Los eventos SSE llevan solo ids y tipo; el panel vuelve a pedir los datos con su propia sesión.
 */
export function alertRoutes(app: FastifyInstance, deps: {
  db: Db; guards: Guards; gate: Gate; realtime?: Realtime;
  /** Usuario del bot de Telegram (sin @); sin él no se puede vincular Telegram. */ telegramBot?: string;
  /** Intentos por minuto en las rutas de código por WhatsApp y Telegram (5 por defecto). */ codeRateMax?: number;
}) {
  const { db, guards, gate, realtime } = deps;
  const pre = [guards.requireOrgAdmin, gate];
  const org = (req: FastifyRequest) => (req.params as { orgId: string }).orgId;

  // --- SSE ----------------------------------------------------------------------------------------
  const closers = new Set<() => void>();
  app.addHook('onClose', async () => {
    for (const close of [...closers]) close();
  });

  function openStream(req: FastifyRequest, reply: FastifyReply, orgId: string, shiftId?: string) {
    if (!realtime) return reply.status(503).send({ error: 'realtime_unavailable', message: 'Tiempo real no disponible' });
    const raw = reply.raw;
    let done = false;
    let unsubscribe: (() => void) | null = null;
    const timers: { heartbeat?: NodeJS.Timeout; lifetime?: NodeJS.Timeout } = {};

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timers.heartbeat);
      clearTimeout(timers.lifetime);
      unsubscribe?.();
      closers.delete(finish);
      if (!raw.writableEnded) raw.end();
    };
    const write = (chunk: string) => {
      if (done || raw.writableNeedDrain) return false; // cliente que no lee: se le corta, vuelve a conectar
      raw.write(chunk);
      return true;
    };

    unsubscribe = realtime.subscribe(orgId, {
      shiftId,
      push: (ev: DomainEvent) => {
        const ok = write(`event: ${ev.type}\ndata: ${JSON.stringify({ ...(ev.shift ? { shift: ev.shift } : {}), ...(ev.id ? { id: ev.id } : {}) })}\n\n`);
        if (!ok) finish();
        return ok;
      },
    });
    if (!unsubscribe) return reply.status(429).send({ error: 'too_many_streams', message: 'Demasiadas conexiones abiertas' });

    reply.hijack();
    // Se conservan las cabeceras que ya puso Fastify (CORS, seguridad) y se agregan las del stream.
    raw.writeHead(200, {
      ...reply.getHeaders(),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    } as Record<string, string>);
    write('retry: 5000\n\nevent: ready\ndata: {}\n\n');
    timers.heartbeat = setInterval(() => write(': ping\n\n') || finish(), HEARTBEAT_MS);
    timers.lifetime = setTimeout(finish, STREAM_MAX_MS);
    closers.add(finish);
    req.raw.on('close', finish);
  }

  app.get('/orgs/:orgId/stream', { preHandler: pre }, async (req, reply) => openStream(req, reply, org(req)));

  app.get('/orgs/:orgId/shifts/:shiftId/stream', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const shiftId = uuid.safeParse((req.params as { shiftId: string }).shiftId).data;
    if (!shiftId) return notFound(reply);
    const [s] = await withOrg(db, orgId, (tx) => tx.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId))));
    if (!s) return notFound(reply);
    return openStream(req, reply, orgId, shiftId);
  });

  // --- Alertas del panel --------------------------------------------------------------------------
  app.get('/orgs/:orgId/alerts', { preHandler: pre }, async (req) => {
    const orgId = org(req);
    const { solo } = z.object({ solo: z.enum(['pendientes']).optional() }).parse(req.query);
    return withOrg(db, orgId, async (tx) => {
      // Quien apagó el panel para un evento no lo ve en su lista.
      const visible = and(
        eq(alerts.orgId, orgId),
        sql`${alerts.tipo} NOT IN (SELECT evento FROM notification_prefs WHERE user_id = ${req.user!.id} AND panel = false)`,
      );
      const rows = await tx
        .select({
          id: alerts.id, tipo: alerts.tipo, urgente: alerts.urgente, shiftId: alerts.shiftId, createdAt: alerts.createdAt,
          atendidaAt: alerts.atendidaAt, rol: roles.nombre, inicio: shifts.inicio, candidato: orgWorkers.nombre,
        })
        .from(alerts)
        .leftJoin(shifts, eq(shifts.id, alerts.shiftId))
        .leftJoin(roles, eq(roles.id, shifts.roleId))
        .leftJoin(orgWorkers, and(eq(orgWorkers.orgId, alerts.orgId), eq(orgWorkers.workerId, alerts.workerId)))
        .where(solo ? and(visible, isNull(alerts.atendidaAt)) : visible)
        .orderBy(desc(alerts.createdAt))
        .limit(100);
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(alerts).where(and(visible, isNull(alerts.atendidaAt)));
      return { pendientes: n, alerts: rows };
    });
  });

  app.post('/orgs/:orgId/alerts/:alertId/ack', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const alertId = uuid.safeParse((req.params as { alertId: string }).alertId).data;
    if (!alertId) return notFound(reply);
    return withOrg(db, orgId, async (tx) => {
      const [a] = await tx.select({ id: alerts.id }).from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.orgId, orgId)));
      if (!a) return notFound(reply);
      await tx.update(alerts).set({ atendidaAt: sql`now()`, atendidaPor: req.user!.id })
        .where(and(eq(alerts.id, alertId), isNull(alerts.atendidaAt)));
      await emit(tx, { org: orgId, type: 'alert.updated', id: alertId });
      return { id: alertId, atendida: true };
    });
  });

  // --- Preferencias de aviso (por persona) --------------------------------------------------------
  const prefsOf = async (userId: string) =>
    withSuper(db, async (tx) => {
      const rows = await tx.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
      return ALERT_TYPES.map((evento) => {
        const p = rows.find((r) => r.evento === evento);
        return { evento, panel: p?.panel ?? true, email: p?.email ?? true, whatsapp: p?.whatsapp ?? false, telegram: p?.telegram ?? false };
      });
    });

  app.get('/me/notification-prefs', { preHandler: guards.requireUser }, async (req) => ({ prefs: await prefsOf(req.user!.id) }));

  app.put('/me/notification-prefs', { preHandler: guards.requireUser }, async (req, reply) => {
    const b = z
      .object({
        prefs: z
          // `telegram` es opcional: un cliente que no lo conoce conserva el valor guardado.
          .array(z.object({ evento: eventoSchema, panel: z.boolean(), email: z.boolean(), whatsapp: z.boolean(), telegram: z.boolean().optional() }))
          .min(1)
          .max(ALERT_TYPES.length),
      })
      .parse(req.body);
    const userId = req.user!.id;
    const current = await prefsOf(userId);
    const prefs = b.prefs.map((p) => ({ ...p, telegram: p.telegram ?? current.find((c) => c.evento === p.evento)?.telegram ?? false }));
    const bad = await withSuper(db, async (tx) => {
      // WhatsApp solo con número verificado y consentimiento: sin eso no se puede activar.
      if (prefs.some((p) => p.whatsapp)) {
        const [c] = await tx.select({ v: managerContacts.verifiedAt }).from(managerContacts).where(eq(managerContacts.userId, userId));
        if (!c?.v) return 'whatsapp' as const;
      }
      // Telegram solo con un chat vinculado desde la propia cuenta del gerente.
      if (prefs.some((p) => p.telegram)) {
        const [t] = await tx.select({ chat: managerTelegram.chatId }).from(managerTelegram).where(eq(managerTelegram.userId, userId));
        if (!t?.chat) return 'telegram' as const;
      }
      for (const p of prefs) {
        await tx.insert(notificationPrefs).values({ userId, ...p })
          .onConflictDoUpdate({
            target: [notificationPrefs.userId, notificationPrefs.evento],
            set: { panel: p.panel, email: p.email, whatsapp: p.whatsapp, telegram: p.telegram },
          });
      }
      return null;
    });
    if (bad === 'whatsapp') return reply.status(409).send({ error: 'whatsapp_not_verified', message: 'Verifica tu WhatsApp antes de activar los avisos por ese canal' });
    if (bad === 'telegram') return reply.status(409).send({ error: 'telegram_not_linked', message: 'Vincula tu Telegram antes de activar los avisos por ese canal' });
    return { prefs: await prefsOf(userId) };
  });

  // --- WhatsApp del gerente (solo alertas urgentes) -----------------------------------------------
  const strict = { config: { rateLimit: { max: deps.codeRateMax ?? 5, timeWindow: '1 minute' } } };
  const me = { preHandler: guards.requireUser };

  app.get('/me/notification-whatsapp', me, async (req) => {
    const [c] = await withSuper(db, (tx) => tx.select().from(managerContacts).where(eq(managerContacts.userId, req.user!.id)));
    return c ? { configurado: true, verificado: !!c.verifiedAt, celular: maskPhone(c.celular) } : { configurado: false, verificado: false };
  });

  app.put('/me/notification-whatsapp', { ...me, ...strict }, async (req, reply) => {
    const b = z.object({ celular: z.string().max(30), consentimiento: z.literal(true) }).parse(req.body);
    const phone = normalizeCoPhone(b.celular);
    if (!phone) return reply.status(422).send({ error: 'invalid_phone', message: 'Celular colombiano inválido' });
    const userId = req.user!.id;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await withSuper(db, async (tx) => {
      const row = { celular: phone, consentAt: sql`now()`, verifiedAt: null, codeHash: hashCode(userId, code), codeExpiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0 };
      await tx.insert(managerContacts).values({ userId, ...row }).onConflictDoUpdate({ target: managerContacts.userId, set: row });
      await enqueue(tx, { canal: 'whatsapp', to: phone, msg: { text: `Tu código de verificación de TurnoExtra es ${code}. Vence en 10 minutos. Si no lo pediste, ignóralo.` } });
    });
    return reply.status(202).send({ configurado: true, verificado: false, celular: maskPhone(phone) });
  });

  app.post('/me/notification-whatsapp/verify', { ...me, ...strict }, async (req, reply) => {
    const { codigo } = z.object({ codigo: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const userId = req.user!.id;
    return withSuper(db, async (tx) => {
      const [c] = await tx.select().from(managerContacts).where(eq(managerContacts.userId, userId)).for('update');
      if (!c || !c.codeHash || !c.codeExpiresAt || c.codeExpiresAt.getTime() < Date.now()) {
        return reply.status(422).send({ error: 'code_expired', message: 'El código venció; pide uno nuevo' });
      }
      if (c.attempts >= MAX_CODE_ATTEMPTS) {
        return reply.status(429).send({ error: 'too_many_attempts', message: 'Demasiados intentos; pide un código nuevo' });
      }
      const given = Buffer.from(hashCode(userId, codigo));
      const expected = Buffer.from(c.codeHash);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        await tx.update(managerContacts).set({ attempts: c.attempts + 1 }).where(eq(managerContacts.userId, userId));
        return reply.status(422).send({ error: 'wrong_code', message: 'Código incorrecto' });
      }
      await tx.update(managerContacts).set({ verifiedAt: sql`now()`, codeHash: null, codeExpiresAt: null, attempts: 0 }).where(eq(managerContacts.userId, userId));
      return { configurado: true, verificado: true, celular: maskPhone(c.celular) };
    });
  });

  // --- Telegram del gerente ------------------------------------------------------------------------
  // Se vincula abriendo t.me/<bot>?start=G-<código> desde su propia cuenta (el bot recibe el /start y guarda el chat).
  const tgState = async (userId: string) => {
    const [t] = await withSuper(db, (tx) => tx.select().from(managerTelegram).where(eq(managerTelegram.userId, userId)));
    return { disponible: !!deps.telegramBot, vinculado: !!t?.chatId, vinculadoAt: t?.linkedAt ? t.linkedAt.toISOString() : null };
  };

  app.get('/me/notification-telegram', me, async (req) => tgState(req.user!.id));

  app.post('/me/notification-telegram', { ...me, ...strict }, async (req, reply) => {
    if (!deps.telegramBot) return reply.status(409).send({ error: 'telegram_off', message: 'Telegram no está disponible por ahora' });
    const userId = req.user!.id;
    const code = newManagerTelegramCode();
    const expiresAt = new Date(Date.now() + MANAGER_TG_TTL_MIN * 60_000);
    await withSuper(db, async (tx) => {
      const row = { codeHash: managerTelegramCodeHash(code), codeExpiresAt: expiresAt };
      await tx.insert(managerTelegram).values({ userId, ...row }).onConflictDoUpdate({ target: managerTelegram.userId, set: row });
    });
    return { url: `https://t.me/${deps.telegramBot}?start=G-${code}`, expiresAt: expiresAt.toISOString() };
  });

  // Desvincular: se olvida el chat y se apagan los avisos por Telegram.
  app.delete('/me/notification-telegram', me, async (req) => {
    const userId = req.user!.id;
    await withSuper(db, async (tx) => {
      await tx.delete(managerTelegram).where(eq(managerTelegram.userId, userId));
      await tx.update(notificationPrefs).set({ telegram: false }).where(eq(notificationPrefs.userId, userId));
    });
    return tgState(userId);
  });

  // Retirar el consentimiento: se borra el número y se apagan los avisos por WhatsApp.
  app.delete('/me/notification-whatsapp', me, async (req) => {
    const userId = req.user!.id;
    await withSuper(db, async (tx) => {
      await tx.delete(managerContacts).where(eq(managerContacts.userId, userId));
      await tx.update(notificationPrefs).set({ whatsapp: false }).where(eq(notificationPrefs.userId, userId));
    });
    return { configurado: false, verificado: false };
  });
}
