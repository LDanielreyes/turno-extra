import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { audit, orgWorkers, orgRoles, roleRequirements, roles, shiftOffers, workerChannels, workerDocuments, workers, withOrg, type Db } from '@turnoextra/db';
import type { Guards } from '../auth/guards.js';
import { normalizeCoPhone, maskPhone } from '../phone.js';
import { getFile, storageEnabled } from '../storage.js';

const uuid = z.string().uuid();
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
const idParam = (req: FastifyRequest, key: string) => z.object({ [key]: uuid }).safeParse(req.params).data?.[key];

type Gate = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** Banca de trabajadores y revisión de documentos (panel de empresa). */
export function bancaRoutes(app: FastifyInstance, deps: { db: Db; guards: Guards; gate: Gate }) {
  const { db, guards, gate } = deps;
  const pre = [guards.requireOrgAdmin, gate];
  const org = (req: FastifyRequest) => (req.params as { orgId: string }).orgId;

  // La empresa registra nombre, celular y rol. Queda `pendiente`: no se envía nada hasta que el
  // candidato dé su consentimiento por WhatsApp (flujo ALTA, H3).
  app.post('/orgs/:orgId/workers', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const body = z
      .object({ nombre: z.string().trim().min(2).max(120), celular: z.string().max(30), roleId: uuid })
      .parse(req.body);
    const celular = normalizeCoPhone(body.celular);
    if (!celular) return reply.status(422).send({ error: 'invalid_phone', message: 'Celular colombiano inválido' });
    return withOrg(db, orgId, async (tx) => {
      const [enabled] = await tx
        .select({ id: orgRoles.roleId })
        .from(orgRoles)
        .innerJoin(roles, eq(roles.id, orgRoles.roleId))
        .where(and(eq(orgRoles.orgId, orgId), eq(orgRoles.roleId, body.roleId), eq(roles.activo, true)));
      if (!enabled) {
        return reply.status(422).send({ error: 'role_not_enabled', message: 'Ese rol no está habilitado para tu organización' });
      }
      const r = await tx.execute(sql`SELECT ensure_worker(${celular}) AS id`);
      const workerId = ((r as unknown as { rows?: { id: string }[] }).rows ?? (r as unknown as { id: string }[]))[0]!.id;
      const [row] = await tx
        .insert(orgWorkers)
        .values({ orgId, workerId, nombre: body.nombre, roleId: body.roleId })
        .onConflictDoNothing()
        .returning({ id: orgWorkers.id });
      if (!row) return reply.status(409).send({ error: 'conflict', message: 'Ese celular ya está en tu banca' });
      await audit(tx, { orgId, actorId: req.user!.id, accion: 'worker.created', entidad: 'org_worker', entidadId: row.id });
      return reply.status(201).send({ id: row.id, estado: 'pendiente' });
    });
  });

  // Quien salió (BAJA/SALIR/«No acepto») puede volver: la empresa lo invita de nuevo y él repite ALTA y «Acepto».
  app.post('/orgs/:orgId/workers/:id/reinvitar', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const id = idParam(req, 'id');
    if (!id) return notFound(reply);
    return withOrg(db, orgId, async (tx) => {
      const [row] = await tx
        .update(orgWorkers)
        .set({ estado: 'pendiente' })
        .where(and(eq(orgWorkers.id, id), eq(orgWorkers.orgId, orgId), sql`${orgWorkers.estado} in ('baja', 'baja_org')`))
        .returning({ id: orgWorkers.id });
      if (!row) return notFound(reply);
      await audit(tx, { orgId, actorId: req.user!.id, accion: 'worker.reinvited', entidad: 'org_worker', entidadId: id });
      return { id, estado: 'pendiente' };
    });
  });

  app.get('/orgs/:orgId/workers', { preHandler: pre }, async (req) => {
    const orgId = org(req);
    const q = z
      .object({
        estado: z.enum(['pendiente', 'activo', 'baja', 'baja_org']).optional(),
        roleId: uuid.optional(),
        favorito: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    return withOrg(db, orgId, async (tx) => {
      const rows = await tx
        .select({
          id: orgWorkers.id,
          nombre: orgWorkers.nombre,
          estado: orgWorkers.estado,
          roleId: orgWorkers.roleId,
          favorito: orgWorkers.favorito,
          celular: workers.celular,
          workerId: orgWorkers.workerId,
          createdAt: orgWorkers.createdAt,
        })
        .from(orgWorkers)
        .innerJoin(workers, eq(workers.id, orgWorkers.workerId))
        .where(
          and(
            eq(orgWorkers.orgId, orgId),
            q.estado ? eq(orgWorkers.estado, q.estado) : undefined,
            q.roleId ? eq(orgWorkers.roleId, q.roleId) : undefined,
            q.favorito ? eq(orgWorkers.favorito, q.favorito === 'true') : undefined,
          ),
        )
        .orderBy(desc(orgWorkers.createdAt));
      // Canales que la persona activó (sin el identificador: solo cuál) y por cuál respondió la última vez.
      const ids = [...new Set(rows.map((r) => r.workerId))];
      const chans = ids.length
        ? await tx
            .select({ workerId: workerChannels.workerId, canal: workerChannels.canal, habilitado: workerChannels.habilitado, prioridad: workerChannels.prioridad })
            .from(workerChannels)
            .where(inArray(workerChannels.workerId, ids))
            .orderBy(asc(workerChannels.prioridad))
        : [];
      const last = ids.length
        ? await tx
            .selectDistinctOn([shiftOffers.workerId], { workerId: shiftOffers.workerId, canal: shiftOffers.respondedCanal, at: shiftOffers.respondedAt })
            .from(shiftOffers)
            .where(and(eq(shiftOffers.orgId, orgId), inArray(shiftOffers.workerId, ids), isNotNull(shiftOffers.respondedCanal)))
            .orderBy(shiftOffers.workerId, desc(shiftOffers.respondedAt))
        : [];
      return {
        workers: rows.map(({ celular, workerId, ...r }) => ({
          ...r,
          celular: maskPhone(celular),
          canales: chans.filter((c) => c.workerId === workerId && c.habilitado).map((c) => c.canal),
          respondioPor: last.find((l) => l.workerId === workerId)?.canal ?? null,
          respondioAt: last.find((l) => l.workerId === workerId)?.at ?? null,
        })),
      };
    });
  });

  app.patch('/orgs/:orgId/workers/:id', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const id = idParam(req, 'id');
    if (!id) return notFound(reply);
    const body = z
      .object({ favorito: z.boolean().optional(), nombre: z.string().trim().min(2).max(120).optional(), roleId: uuid.optional() })
      .parse(req.body);
    return withOrg(db, orgId, async (tx) => {
      if (body.roleId) {
        const [ok] = await tx
          .select({ id: orgRoles.roleId })
          .from(orgRoles)
          .where(and(eq(orgRoles.orgId, orgId), eq(orgRoles.roleId, body.roleId)));
        if (!ok) return reply.status(422).send({ error: 'role_not_enabled', message: 'Ese rol no está habilitado para tu organización' });
      }
      const [r] = await tx
        .update(orgWorkers)
        .set(body)
        .where(and(eq(orgWorkers.id, id), eq(orgWorkers.orgId, orgId)))
        .returning({ id: orgWorkers.id });
      if (!r) return notFound(reply);
      await audit(tx, { orgId, actorId: req.user!.id, accion: 'worker.updated', entidad: 'org_worker', entidadId: id });
      return { id };
    });
  });

  // Documentos: los sube el candidato desde su panel (routes/candidate.ts); la empresa solo los revisa.
  app.get('/orgs/:orgId/workers/:id/documents', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const id = idParam(req, 'id');
    if (!id) return notFound(reply);
    return withOrg(db, orgId, async (tx) => {
      const [ow] = await tx
        .select({ workerId: orgWorkers.workerId, roleId: orgWorkers.roleId })
        .from(orgWorkers)
        .where(and(eq(orgWorkers.id, id), eq(orgWorkers.orgId, orgId)));
      if (!ow) return notFound(reply);
      const requisitos = ow.roleId
        ? await tx.select({ tipo: roleRequirements.tipoDocumento, obligatorio: roleRequirements.obligatorio, vigenciaRequerida: roleRequirements.vigenciaRequerida }).from(roleRequirements).where(eq(roleRequirements.roleId, ow.roleId))
        : [];
      const docs = await tx
        .select()
        .from(workerDocuments)
        .where(and(eq(workerDocuments.orgId, orgId), eq(workerDocuments.workerId, ow.workerId)));
      return {
        documents: docs.map((d) => ({ id: d.id, tipoDocumento: d.tipoDocumento, venceAt: d.venceAt, estado: d.estado, revisadoAt: d.revisadoAt, tieneArchivo: !!d.archivoKey })),
        requisitos,
      };
    });
  });

  // El archivo se sirve a través de la API (sesión + pertenencia a la org); el bucket nunca se expone.
  app.get('/orgs/:orgId/documents/:docId/archivo', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const docId = idParam(req, 'docId');
    if (!docId || !storageEnabled()) return notFound(reply);
    const [d] = await withOrg(db, orgId, (tx) =>
      tx.select({ key: workerDocuments.archivoKey, tipo: workerDocuments.archivoTipo }).from(workerDocuments).where(and(eq(workerDocuments.id, docId), eq(workerDocuments.orgId, orgId))));
    const file = d?.key ? await getFile(d.key) : null;
    if (!d || !file) return notFound(reply);
    return reply
      .header('content-type', d.tipo ?? 'application/octet-stream')
      .header('content-disposition', 'inline')
      .header('cache-control', 'private, no-store')
      .header('x-content-type-options', 'nosniff')
      .send(file);
  });

  app.patch('/orgs/:orgId/documents/:docId', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const docId = idParam(req, 'docId');
    if (!docId) return notFound(reply);
    const { estado } = z.object({ estado: z.enum(['aprobado', 'rechazado']) }).parse(req.body);
    return withOrg(db, orgId, async (tx) => {
      const [d] = await tx
        .update(workerDocuments)
        .set({ estado, revisadoPor: req.user!.id, revisadoAt: new Date() })
        .where(and(eq(workerDocuments.id, docId), eq(workerDocuments.orgId, orgId)))
        .returning({ id: workerDocuments.id });
      if (!d) return notFound(reply);
      await audit(tx, { orgId, actorId: req.user!.id, accion: `document.${estado}`, entidad: 'document', entidadId: docId });
      return { id: docId, estado };
    });
  });
}
