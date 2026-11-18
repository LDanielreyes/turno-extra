import { randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  assignments, audit, candidateLoginCodes, disputes, orgWorkers, orgs, roles, shifts, workerChannels, workers, withSuper, type Db,
} from '@turnoextra/db';
import { DISPUTE_WINDOW_DAYS, MIN_MOTIVO, deleteWorkerData, enqueue, msg, openDispute, pickChannel, workerBaja, type OutMessage } from '@turnoextra/channels';
import { normalizeCoPhone } from '../phone.js';
import {
  CODE_COOLDOWN_MS, CODE_TTL_MS, MAX_CODE_ATTEMPTS, clearCookie, createCandidateGuard, hashCode, makeSessionToken, sessionCookie,
} from '../auth/candidate.js';

const CANALES = ['whatsapp', 'telegram', 'email'] as const;
const actor = (id: string) => `worker:${id}`;

/**
 * Panel del candidato (`/yo`) y su acceso con código de un solo uso por el canal activo.
 * Reutiliza los mismos servicios que los comandos del chat (BAJA, BORRAR MIS DATOS, disputa), así que el efecto es idéntico.
 */
export function candidateRoutes(
  app: FastifyInstance,
  deps: { db: Db; secret: string; secure: boolean; allowedOrigins: string[]; /** Intentos por minuto en las rutas de código (5 por defecto). */ codeRateMax?: number },
) {
  const { db, secret, secure } = deps;
  const { requireCandidate, sameOrigin } = createCandidateGuard(db, secret, deps.allowedOrigins);
  const strict = { config: { rateLimit: { max: deps.codeRateMax ?? 5, timeWindow: '1 minute' } } };
  const me = { preHandler: [requireCandidate] };
  const mutating = { preHandler: [sameOrigin, requireCandidate] };

  // --- Acceso -------------------------------------------------------------------------------------
  // Siempre 202: no se revela si el celular está registrado ni si tiene canal. Solo se escribe por un canal que la persona activó.
  app.post('/candidato/codigo', { ...strict, preHandler: [sameOrigin] }, async (req, reply) => {
    const { celular } = z.object({ celular: z.string().max(30) }).parse(req.body);
    const phone = normalizeCoPhone(celular);
    if (!phone) return reply.status(422).send({ error: 'invalid_phone', message: 'Celular colombiano inválido' });
    await withSuper(db, async (tx) => {
      const [w] = await tx.select({ id: workers.id, deletedAt: workers.deletedAt }).from(workers).where(eq(workers.celular, phone));
      if (!w || w.deletedAt) return;
      const [prev] = await tx.select({ createdAt: candidateLoginCodes.createdAt }).from(candidateLoginCodes).where(eq(candidateLoginCodes.workerId, w.id));
      if (prev && Date.now() - prev.createdAt.getTime() < CODE_COOLDOWN_MS) return;
      const ch = await pickChannel(tx, w.id);
      if (!ch) return;
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const row = { codeHash: hashCode(w.id, code), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0, createdAt: new Date() };
      await tx.insert(candidateLoginCodes).values({ workerId: w.id, ...row }).onConflictDoUpdate({ target: candidateLoginCodes.workerId, set: row });
      const m: OutMessage = {
        subject: 'Tu código de TurnoExtra',
        text: `Tu código para entrar a TurnoExtra es ${code}. Vence en 10 minutos. Si no lo pediste, ignóralo.`,
      };
      await enqueue(tx, { canal: ch.canal, to: ch.identificador, msg: m, workerId: w.id });
    });
    return reply.status(202).send({ ok: true });
  });

  app.post('/candidato/verificar', { ...strict, preHandler: [sameOrigin] }, async (req, reply) => {
    const { celular, code } = z.object({ celular: z.string().max(30), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const phone = normalizeCoPhone(celular);
    const wrong = () => reply.status(422).send({ error: 'wrong_code', message: 'Código incorrecto' });
    if (!phone) return wrong();
    const out = await withSuper(db, async (tx) => {
      const [w] = await tx.select({ id: workers.id }).from(workers).where(eq(workers.celular, phone));
      if (!w) return 'wrong' as const;
      const [c] = await tx.select().from(candidateLoginCodes).where(eq(candidateLoginCodes.workerId, w.id)).for('update');
      if (!c || c.expiresAt.getTime() < Date.now()) return 'expired' as const;
      if (c.attempts >= MAX_CODE_ATTEMPTS) return 'locked' as const;
      const given = Buffer.from(hashCode(w.id, code));
      const expected = Buffer.from(c.codeHash);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        await tx.update(candidateLoginCodes).set({ attempts: c.attempts + 1 }).where(eq(candidateLoginCodes.workerId, w.id));
        return 'wrong' as const;
      }
      await tx.delete(candidateLoginCodes).where(eq(candidateLoginCodes.workerId, w.id)); // un solo uso
      await audit(tx, { orgId: null, actorId: actor(w.id), accion: 'candidate.login', entidad: 'worker', entidadId: w.id });
      return w.id;
    });
    if (out === 'expired') return reply.status(422).send({ error: 'code_expired', message: 'El código venció; pide uno nuevo' });
    if (out === 'locked') return reply.status(429).send({ error: 'too_many_attempts', message: 'Demasiados intentos; pide un código nuevo' });
    if (out === 'wrong') return wrong();
    return reply.header('set-cookie', sessionCookie(makeSessionToken(out, secret), secure)).send({ ok: true });
  });

  app.post('/candidato/salir', { preHandler: [sameOrigin] }, async (_req, reply) =>
    reply.header('set-cookie', clearCookie(secure)).send({ ok: true }),
  );

  // --- Panel --------------------------------------------------------------------------------------
  app.get('/yo/sesion', me, async (req) => ({ id: req.candidate!.id, nombre: req.candidate!.nombre, candidato: true }));

  app.get('/yo', me, async (req) => {
    const id = req.candidate!.id;
    return withSuper(db, async (tx) => {
      const [w] = await tx.select({ nombre: workers.nombre }).from(workers).where(eq(workers.id, id));
      const [link] = await tx.select({ nombre: orgWorkers.nombre }).from(orgWorkers).where(eq(orgWorkers.workerId, id)).limit(1);
      const rows = await tx
        .select({
          assignmentId: assignments.id, estado: assignments.status, inicio: shifts.inicio, fin: shifts.fin, org: orgs.nombre, rol: roles.nombre,
          disputaId: disputes.id,
          dentroDeVentana: sql<boolean>`${shifts.fin} > now() - make_interval(days => ${DISPUTE_WINDOW_DAYS})`,
        })
        .from(assignments)
        .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
        .innerJoin(orgs, eq(orgs.id, assignments.orgId))
        .innerJoin(roles, eq(roles.id, shifts.roleId))
        .leftJoin(disputes, eq(disputes.assignmentId, assignments.id))
        .where(eq(assignments.workerId, id))
        .orderBy(desc(shifts.inicio))
        .limit(60);
      const chans = await tx.select().from(workerChannels).where(eq(workerChannels.workerId, id));
      return {
        nombre: w?.nombre ?? link?.nombre ?? null,
        turnos: rows.map(({ disputaId, dentroDeVentana, ...t }) => ({
          ...t,
          disputable: t.estado === 'no_show' && !disputaId && dentroDeVentana,
        })),
        canales: CANALES.map((canal) => {
          const c = chans.find((x) => x.canal === canal);
          return { canal, habilitado: c?.habilitado ?? false, prioridad: c?.prioridad ?? 100 };
        }),
        ventanaDisputaDias: DISPUTE_WINDOW_DAYS,
      };
    });
  });

  // El candidato elige el orden entre canales YA habilitados; nunca habilita uno (eso solo lo hace él por el propio canal).
  app.put('/yo/canales', mutating, async (req, reply) => {
    const id = req.candidate!.id;
    const { prioridad } = z.object({ prioridad: z.array(z.enum(CANALES)).min(1).max(3) }).parse(req.body);
    if (new Set(prioridad).size !== prioridad.length) return reply.status(422).send({ error: 'validation_error', message: 'Canales repetidos' });
    return withSuper(db, async (tx) => {
      const enabled = new Set(
        (await tx.select({ canal: workerChannels.canal }).from(workerChannels).where(and(eq(workerChannels.workerId, id), eq(workerChannels.habilitado, true)))).map((c) => c.canal),
      );
      if (prioridad.some((c) => !enabled.has(c))) return reply.status(422).send({ error: 'channel_not_enabled', message: 'Solo puedes ordenar canales que ya activaste' });
      for (const [i, canal] of prioridad.entries()) {
        await tx.update(workerChannels).set({ prioridad: (i + 1) * 10 }).where(and(eq(workerChannels.workerId, id), eq(workerChannels.canal, canal)));
      }
      await audit(tx, { orgId: null, actorId: actor(id), accion: 'worker.channels_reordered', entidad: 'worker', entidadId: id });
      return { prioridad };
    });
  });

  app.post('/yo/disputas', mutating, async (req, reply) => {
    const id = req.candidate!.id;
    const b = z.object({ assignmentId: z.string().uuid(), motivo: z.string().trim().max(500) }).parse(req.body);
    if (b.motivo.length < MIN_MOTIVO) {
      return reply.status(422).send({ error: 'motivo_too_short', message: `Cuéntanos con al menos ${MIN_MOTIVO} caracteres qué pasó` });
    }
    const r = await withSuper(db, (tx) => openDispute(tx, id, b.motivo, b.assignmentId));
    if (r.outcome !== 'opened') return reply.status(404).send({ error: 'not_found', message: 'No hay una inasistencia disputable para ese turno' });
    return reply.status(201).send({ estado: 'abierta' });
  });

  // Mismo servicio que el comando BAJA del chat. La confirmación se encola antes de apagar los canales.
  app.post('/yo/baja', mutating, async (req) => {
    const id = req.candidate!.id;
    await withSuper(db, async (tx) => {
      const ch = await pickChannel(tx, id);
      await workerBaja(tx, id, { actorId: actor(id) });
      if (ch) await enqueue(tx, { canal: ch.canal, to: ch.identificador, msg: msg.w12Baja(), workerId: id });
    });
    return { baja: true };
  });

  // Mismo servicio que BORRAR MIS DATOS. El último aviso no queda atado a la persona (sus filas de la cola se eliminan).
  app.post('/yo/borrar', mutating, async (req, reply) => {
    const id = req.candidate!.id;
    await withSuper(db, async (tx) => {
      const ch = await pickChannel(tx, id);
      await deleteWorkerData(tx, id, { actorId: actor(id) });
      if (ch) await enqueue(tx, { canal: ch.canal, to: ch.identificador, msg: msg.w18Deleted(), workerId: null });
    });
    return reply.header('set-cookie', clearCookie(secure)).send({ borrado: true });
  });
}
