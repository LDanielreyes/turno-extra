import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  assignments, audit, emit, offerDeliveries, orgRoles, orgWorkers, orgs, roles, shiftOffers, shifts, withOrg, withSuper, type Db,
} from '@turnoextra/db';
import { cancelShift } from '@turnoextra/channels';
import { Decimal } from 'decimal.js';
import type { Guards } from '../auth/guards.js';
import { computeFloor, toMinute } from '../services/floor.js';
import { LegalParamMissing, floorParamsAt } from '../services/legal-params.js';
import { eligibleWorkers } from '../services/eligibility.js';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
const MIN_MINUTES = 30;
const MAX_HOURS = 16;

type Gate = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export function shiftRoutes(app: FastifyInstance, deps: { db: Db; guards: Guards; gate: Gate }) {
  const { db, guards, gate } = deps;
  const pre = [guards.requireOrgAdmin, gate];
  const org = (req: FastifyRequest) => (req.params as { orgId: string }).orgId;

  const window = z.object({ inicio: iso, fin: iso }).superRefine((v, ctx) => {
    const ms = new Date(v.fin).getTime() - new Date(v.inicio).getTime();
    if (ms < MIN_MINUTES * 60_000) ctx.addIssue({ code: 'custom', message: 'El turno es demasiado corto' });
    if (ms > MAX_HOURS * 3600_000) ctx.addIssue({ code: 'custom', message: 'El turno supera las 16 horas' });
  });

  const floorFor = async (tx: Parameters<Parameters<Db['transaction']>[0]>[0], inicio: Date, fin: Date) =>
    computeFloor(inicio, fin, await floorParamsAt(tx, inicio));

  const legalMissing = (reply: FastifyReply, e: LegalParamMissing) =>
    reply.status(503).send({ error: 'legal_params_missing', message: `Falta el parámetro legal ${e.clave}`, clave: e.clave });

  // Piso en vivo para la pantalla de creación.
  app.post('/orgs/:orgId/shifts/floor-preview', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const b = window.parse(req.body);
    try {
      return await withOrg(db, orgId, (tx) => floorFor(tx, new Date(b.inicio), new Date(b.fin)));
    } catch (e) {
      if (e instanceof LegalParamMissing) return legalMissing(reply, e);
      throw e;
    }
  });

  app.post('/orgs/:orgId/shifts', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const b = window
      .and(z.object({ roleId: uuid, cupos: z.number().int().min(1).max(50), pagoTotal: z.number().int().positive().max(100_000_000), notas: z.string().max(500).optional() }))
      .parse(req.body);
    const inicio = toMinute(new Date(b.inicio));
    const fin = toMinute(new Date(b.fin));
    if (inicio.getTime() <= Date.now()) {
      return reply.status(422).send({ error: 'starts_in_past', message: 'El turno debe empezar en el futuro' });
    }
    try {
      return await withOrg(db, orgId, async (tx) => {
        const [enabled] = await tx
          .select({ id: orgRoles.roleId })
          .from(orgRoles)
          .innerJoin(roles, eq(roles.id, orgRoles.roleId))
          .where(and(eq(orgRoles.orgId, orgId), eq(orgRoles.roleId, b.roleId), eq(roles.activo, true)));
        if (!enabled) return reply.status(422).send({ error: 'role_not_enabled', message: 'Ese rol no está habilitado para tu organización' });

        const floor = await floorFor(tx, inicio, fin);
        if (new Decimal(b.pagoTotal).lt(floor.pisoTotal)) {
          return reply.status(422).send({
            error: 'below_floor',
            message: 'El pago está por debajo del piso legal calculado',
            piso: floor.pisoTotal,
            pisoPorHoraPromedio: floor.pisoPorHoraPromedio,
          });
        }
        const [s] = await tx
          .insert(shifts)
          .values({
            orgId, roleId: b.roleId, inicio, fin, cupos: b.cupos, notas: b.notas,
            pagoTotal: String(b.pagoTotal), pisoCalculado: floor.pisoTotal, createdBy: req.user!.id,
          })
          .returning({ id: shifts.id });
        await audit(tx, { orgId, actorId: req.user!.id, accion: 'shift.created', entidad: 'shift', entidadId: s!.id, detalle: { cupos: b.cupos } });
        await emit(tx, { org: orgId, type: 'shift.created', shift: s!.id });
        const elegibles = (await eligibleWorkers(tx, orgId, s!.id)).length;
        return reply.status(201).send({ id: s!.id, estado: 'abierto', piso: floor.pisoTotal, elegibles });
      });
    } catch (e) {
      if (e instanceof LegalParamMissing) return legalMissing(reply, e);
      throw e;
    }
  });

  app.get('/orgs/:orgId/shifts', { preHandler: pre }, async (req) => {
    const orgId = org(req);
    return withOrg(db, orgId, async (tx) => {
      const rows = await tx
        .select({
          id: shifts.id, roleId: shifts.roleId, inicio: shifts.inicio, fin: shifts.fin, cupos: shifts.cupos,
          pagoTotal: shifts.pagoTotal, estado: shifts.estado,
          confirmados: sql<number>`(select count(*)::int from ${assignments} a where a.shift_id = ${shifts.id} and a.status = 'confirmed')`,
        })
        .from(shifts)
        .where(eq(shifts.orgId, orgId))
        .orderBy(desc(shifts.inicio))
        .limit(200);
      return { shifts: rows };
    });
  });

  app.get('/orgs/:orgId/shifts/:shiftId', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const shiftId = uuid.safeParse((req.params as { shiftId: string }).shiftId).data;
    if (!shiftId) return notFound(reply);
    return withOrg(db, orgId, async (tx) => {
      const [s] = await tx.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId)));
      if (!s) return notFound(reply);
      const counts = await tx
        .select({ status: assignments.status, n: sql<number>`count(*)::int` })
        .from(assignments)
        .where(eq(assignments.shiftId, shiftId))
        .groupBy(assignments.status);
      const elegibles = s.estado === 'abierto' ? await eligibleWorkers(tx, orgId, shiftId) : [];
      return {
        shift: s,
        confirmados: counts.find((c) => c.status === 'confirmed')?.n ?? 0,
        enEspera: counts.find((c) => c.status === 'standby')?.n ?? 0,
        elegibles: elegibles.map((e) => ({ id: e.workerId, nombre: e.nombre, favorito: e.favorito })),
      };
    });
  });

  // Ofertas del turno con su ronda, canal y estado, más cada intento de entrega por canal (solo lectura).
  // Alimenta la red de propagación de /turnos/:id. Sin celulares: solo el nombre que la org le da a la persona.
  app.get('/orgs/:orgId/shifts/:shiftId/offers', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const shiftId = uuid.safeParse((req.params as { shiftId: string }).shiftId).data;
    if (!shiftId) return notFound(reply);
    return withOrg(db, orgId, async (tx) => {
      const [s] = await tx.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId)));
      if (!s) return notFound(reply);
      const rows = await tx
        .select({
          id: shiftOffers.id, workerId: shiftOffers.workerId, nombre: orgWorkers.nombre, favorito: orgWorkers.favorito,
          wave: shiftOffers.wave, status: shiftOffers.status, canal: shiftOffers.canalUsado,
          respondedAt: shiftOffers.respondedAt, respondedCanal: shiftOffers.respondedCanal, createdAt: shiftOffers.createdAt,
        })
        .from(shiftOffers)
        .innerJoin(orgWorkers, and(eq(orgWorkers.orgId, shiftOffers.orgId), eq(orgWorkers.workerId, shiftOffers.workerId)))
        .where(and(eq(shiftOffers.shiftId, shiftId), eq(shiftOffers.orgId, orgId)))
        .orderBy(asc(shiftOffers.wave), asc(shiftOffers.createdAt));
      const ids = rows.map((r) => r.id);
      const tries = ids.length
        ? await tx
            .select({ offerId: offerDeliveries.offerId, canal: offerDeliveries.canal, estado: offerDeliveries.estado, at: offerDeliveries.at })
            .from(offerDeliveries)
            .where(and(eq(offerDeliveries.orgId, orgId), inArray(offerDeliveries.offerId, ids)))
            .orderBy(asc(offerDeliveries.at))
        : [];
      return {
        ofertas: rows.map((r) => ({
          ...r,
          entregas: tries.filter((t) => t.offerId === r.id).map(({ canal, estado, at }) => ({ canal, estado, at })),
        })),
      };
    });
  });

  app.post('/orgs/:orgId/shifts/:shiftId/cancel', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const shiftId = uuid.safeParse((req.params as { shiftId: string }).shiftId).data;
    if (!shiftId) return notFound(reply);
    // Corre en contexto de sistema porque encola avisos (la cola es solo del sistema); el guard ya verificó que la persona administra `orgId` y cada consulta filtra por él.
    const ok = await withSuper(db, (tx) => cancelShift(tx, orgId, shiftId, req.user!.id));
    if (!ok) return notFound(reply);
    return { id: shiftId, estado: 'cancelado' };
  });

  // --- Ajustes de la org (/ajustes) ---------------------------------------------------------
  app.get('/orgs/:orgId/settings', { preHandler: pre }, async (req) => {
    const orgId = org(req);
    return withOrg(db, orgId, async (tx) => {
      const [o] = await tx.select().from(orgs).where(eq(orgs.id, orgId));
      return {
        waveMinutes: o!.waveMinutes, descansoMinH: o!.descansoMinH, topeSemanalH: o!.topeSemanalH,
        standbyMax: o!.standbyMax, relaunchLimit: o!.relaunchLimit,
      };
    });
  });

  app.patch('/orgs/:orgId/settings', { preHandler: pre }, async (req) => {
    const orgId = org(req);
    const b = z
      .object({
        waveMinutes: z.number().int().min(1).max(30),
        descansoMinH: z.number().int().min(0).max(24),
        topeSemanalH: z.number().int().min(1).max(60),
        standbyMax: z.number().int().min(0).max(10),
        relaunchLimit: z.number().int().min(0).max(5),
      })
      .partial()
      .parse(req.body);
    return withOrg(db, orgId, async (tx) => {
      if (Object.keys(b).length) await tx.update(orgs).set(b).where(eq(orgs.id, orgId));
      await audit(tx, { orgId, actorId: req.user!.id, accion: 'org.settings_updated', entidad: 'org', entidadId: orgId });
      return b;
    });
  });
}
