import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { audit, orgs, shifts, workerInvites, withSuper, orgWorkers, orgRoles, roleRequirements, roles, shiftOffers, workerChannels, workerDocuments, workers, withOrg, type Db } from '@turnoextra/db';
import type { Guards } from '../auth/guards.js';
import { normalizeCoPhone, maskPhone } from '../phone.js';
import { shiftFit } from '../services/eligibility.js';
import { getFile, storageEnabled } from '../storage.js';

const uuid = z.string().uuid();
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
const idParam = (req: FastifyRequest, key: string) => z.object({ [key]: uuid }).safeParse(req.params).data?.[key];

type Gate = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** Banca de trabajadores y revisión de documentos (panel de empresa). */
export function bancaRoutes(app: FastifyInstance, deps: { db: Db; guards: Guards; gate: Gate; telegramBot?: string; appUrl?: string }) {
  const { db, guards, gate } = deps;
  const pre = [guards.requireOrgAdmin, gate];
  const org = (req: FastifyRequest) => (req.params as { orgId: string }).orgId;

  type Tx = Parameters<Parameters<typeof withOrg>[2]>[0];
  type Created = { ok: true; id: string } | { ok: false; error: 'invalid_phone' | 'role_not_enabled' | 'conflict' };

  /** Alta de una persona en la banca: queda `pendiente` hasta que dé su consentimiento. Corre dentro de `withOrg`. */
  async function createWorker(tx: Tx, orgId: string, actorId: string, p: { nombre: string; celular: string; roleId: string }, enabled: Set<string>): Promise<Created> {
    const celular = normalizeCoPhone(p.celular);
    if (!celular) return { ok: false, error: 'invalid_phone' };
    if (!enabled.has(p.roleId)) return { ok: false, error: 'role_not_enabled' };
    const r = await tx.execute(sql`SELECT ensure_worker(${celular}) AS id`);
    const workerId = ((r as unknown as { rows?: { id: string }[] }).rows ?? (r as unknown as { id: string }[]))[0]!.id;
    const [row] = await tx
      .insert(orgWorkers)
      .values({ orgId, workerId, nombre: p.nombre, roleId: p.roleId })
      .onConflictDoNothing()
      .returning({ id: orgWorkers.id });
    if (!row) return { ok: false, error: 'conflict' };
    await audit(tx, { orgId, actorId, accion: 'worker.created', entidad: 'org_worker', entidadId: row.id });
    return { ok: true, id: row.id };
  }

  const enabledRoles = async (tx: Tx, orgId: string) =>
    new Set(
      (await tx
        .select({ id: orgRoles.roleId })
        .from(orgRoles)
        .innerJoin(roles, eq(roles.id, orgRoles.roleId))
        .where(and(eq(orgRoles.orgId, orgId), eq(roles.activo, true)))).map((r) => r.id),
    );

  const CREATE_ERR = {
    invalid_phone: [422, 'Celular colombiano inválido'],
    role_not_enabled: [422, 'Ese rol no está habilitado para tu organización'],
    conflict: [409, 'Ese celular ya está en tu banca'],
  } as const;

  // La empresa registra nombre, celular y rol. Queda `pendiente`: no se envía nada hasta que el
  // candidato dé su consentimiento por WhatsApp (flujo ALTA, H3).
  app.post('/orgs/:orgId/workers', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const body = z
      .object({ nombre: z.string().trim().min(2).max(120), celular: z.string().max(30), roleId: uuid })
      .parse(req.body);
    return withOrg(db, orgId, async (tx) => {
      const r = await createWorker(tx, orgId, req.user!.id, body, await enabledRoles(tx, orgId));
      if (!r.ok) {
        const [status, message] = CREATE_ERR[r.error];
        return reply.status(status).send({ error: r.error, message });
      }
      return reply.status(201).send({ id: r.id, estado: 'pendiente' });
    });
  });

  // Carga masiva: una lista de nombre + celular (+ rol propio opcional). Cada fila se resuelve por separado:
  // las que fallan no frenan a las demás y vuelven con su motivo para corregirlas.
  app.post('/orgs/:orgId/workers/import', { preHandler: pre, bodyLimit: 512 * 1024 }, async (req) => {
    const orgId = org(req);
    const body = z
      .object({
        roleId: uuid,
        personas: z.array(z.object({ nombre: z.string().trim().min(2).max(120), celular: z.string().max(30), roleId: uuid.optional() })).min(1).max(500),
      })
      .parse(req.body);
    return withOrg(db, orgId, async (tx) => {
      const enabled = await enabledRoles(tx, orgId);
      const out = { creados: 0, errores: [] as { fila: number; error: string; message: string }[] };
      for (const [i, p] of body.personas.entries()) {
        const r = await createWorker(tx, orgId, req.user!.id, { nombre: p.nombre, celular: p.celular, roleId: p.roleId ?? body.roleId }, enabled);
        if (r.ok) out.creados++;
        else out.errores.push({ fila: i + 1, error: r.error, message: CREATE_ERR[r.error][1] });
      }
      return out;
    });
  });

  // Enlace de alta personal para quien aún no acepta: el token lo identifica en Telegram sin pedirle el celular.
  // Es de un solo uso, caduca y reemplaza al anterior; solo se guarda su hash.
  const INVITE_TTL_DAYS = 7;
  app.post('/orgs/:orgId/workers/:id/enlace', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const id = idParam(req, 'id');
    if (!id) return notFound(reply);
    const found = await withOrg(db, orgId, async (tx) => {
      const [row] = await tx
        .select({ nombre: orgWorkers.nombre, estado: orgWorkers.estado, code: orgs.inviteCode, orgNombre: orgs.nombre, roleId: orgWorkers.roleId })
        .from(orgWorkers)
        .innerJoin(orgs, eq(orgs.id, orgWorkers.orgId))
        .where(and(eq(orgWorkers.id, id), eq(orgWorkers.orgId, orgId)));
      if (!row) return null;
      const docs = row.roleId
        ? (await tx.select({ t: roleRequirements.tipoDocumento }).from(roleRequirements).where(and(eq(roleRequirements.roleId, row.roleId), eq(roleRequirements.obligatorio, true)))).map((d) => d.t)
        : [];
      return { ...row, docs };
    });
    if (!found) return notFound(reply);
    if (found.estado !== 'pendiente') {
      return reply.status(409).send({ error: 'not_pending', message: 'Solo se puede generar el enlace de quien aún no acepta' });
    }
    const token = randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
    await withSuper(db, async (tx) => {
      await tx.delete(workerInvites).where(eq(workerInvites.orgWorkerId, id));
      await tx.insert(workerInvites).values({ tokenHash: createHash('sha256').update(token).digest('hex'), orgWorkerId: id, expiresAt });
    });
    const num = process.env.WHATSAPP_PUBLIC_NUMBER?.replace(/\D/g, '');
    const telegramUrl = deps.telegramBot ? `https://t.me/${deps.telegramBot}?start=I-${token}` : null;
    const whatsappUrl = num ? `https://wa.me/${num}?text=${encodeURIComponent(`ALTA ${found.code}`)}` : null;
    const portal = deps.appUrl ? `${deps.appUrl}/yo` : null;
    const docs = found.docs.map((d) => d.replace(/_/g, ' '));
    const mensaje = [
      `Hola ${found.nombre.split(' ')[0]}, ${found.orgNombre} te agregó a su banca de turnos extra.`,
      telegramUrl ? `Para aceptar por Telegram, abre este enlace (es personal y vence en ${INVITE_TTL_DAYS} días): ${telegramUrl}` : null,
      whatsappUrl ? `Si prefieres WhatsApp, toca: ${whatsappUrl}` : null,
      docs.length && portal ? `Después sube tus documentos (${docs.join(', ')}) en ${portal}: entras con tu celular y te llega un código.` : null,
    ].filter(Boolean).join('\n\n');
    return { telegramUrl, whatsappUrl, mensaje, venceAt: expiresAt.toISOString() };
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

  app.get('/orgs/:orgId/workers', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const q = z
      .object({
        estado: z.enum(['pendiente', 'activo', 'baja', 'baja_org']).optional(),
        roleId: uuid.optional(),
        favorito: z.enum(['true', 'false']).optional(),
        // Con un turno, la elegibilidad se evalúa contra su rol y su horario.
        shiftId: uuid.optional(),
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
      // Elegibilidad general (sin mirar un turno concreto): persona activa y documentos obligatorios de su rol
      // aprobados y vigentes. Descanso y tope semanal dependen del horario y se evalúan al abrir cada turno.
      let shift: { roleId: string; fin: Date } | undefined;
      let fits: Awaited<ReturnType<typeof shiftFit>> = [];
      if (q.shiftId) {
        [shift] = await tx.select({ roleId: shifts.roleId, fin: shifts.fin }).from(shifts).where(and(eq(shifts.id, q.shiftId), eq(shifts.orgId, orgId)));
        if (!shift) return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
        fits = await shiftFit(tx, orgId, q.shiftId);
      }
      const roleIds = [...new Set([...rows.map((r) => r.roleId), shift?.roleId].filter((x): x is string => !!x))];
      const reqs = roleIds.length
        ? await tx
            .select({ roleId: roleRequirements.roleId, tipo: roleRequirements.tipoDocumento, vigencia: roleRequirements.vigenciaRequerida })
            .from(roleRequirements)
            .where(and(inArray(roleRequirements.roleId, roleIds), eq(roleRequirements.obligatorio, true)))
        : [];
      const docs = ids.length
        ? await tx
            .select({ workerId: workerDocuments.workerId, tipo: workerDocuments.tipoDocumento, estado: workerDocuments.estado, venceAt: workerDocuments.venceAt })
            .from(workerDocuments)
            .where(and(eq(workerDocuments.orgId, orgId), inArray(workerDocuments.workerId, ids)))
        : [];
      // Vigencia: hoy, o el día en que termina el turno (hora de Bogotá).
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(shift?.fin ?? new Date());
      const motivosDe = (w: (typeof rows)[number]) => {
        if (w.estado === 'pendiente') return [{ codigo: 'sin_aceptar' }];
        if (w.estado !== 'activo') return [{ codigo: 'baja' }];
        const out: { codigo: string; tipo?: string }[] = [];
        const fit = fits.find((f) => f.workerId === w.workerId);
        if (shift && w.roleId !== shift.roleId) out.push({ codigo: 'otro_rol' });
        if (fit?.asignado) out.push({ codigo: 'ya_asignado' });
        for (const r of reqs.filter((x) => x.roleId === (shift?.roleId ?? w.roleId))) {
          const mine = docs.filter((d) => d.workerId === w.workerId && d.tipo === r.tipo);
          const valid = (d: (typeof mine)[number]) => !r.vigencia || (!!d.venceAt && d.venceAt >= today);
          if (mine.some((d) => d.estado === 'aprobado' && valid(d))) continue;
          const codigo = mine.some((d) => d.estado === 'aprobado') ? 'doc_vencido'
            : mine.some((d) => d.estado === 'pendiente') ? 'doc_pendiente'
            : mine.length ? 'doc_rechazado' : 'doc_falta';
          out.push({ codigo, tipo: r.tipo });
        }
        if (fit?.ocupado) out.push({ codigo: 'ocupado' });
        if (fit?.tope) out.push({ codigo: 'tope_semanal' });
        return out;
      };
      return {
        workers: rows.map((row) => {
          const { celular, workerId, ...r } = row;
          const motivos = motivosDe(row);
          return {
          ...r,
          motivos,
          elegible: motivos.length === 0,
          celular: maskPhone(celular),
          canales: chans.filter((c) => c.workerId === workerId && c.habilitado).map((c) => c.canal),
          respondioPor: last.find((l) => l.workerId === workerId)?.canal ?? null,
          respondioAt: last.find((l) => l.workerId === workerId)?.at ?? null,
          };
        }),
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
