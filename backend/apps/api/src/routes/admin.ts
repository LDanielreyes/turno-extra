import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { desc, eq, max, sql, and } from 'drizzle-orm';
import {
  audit, auditLog, invitation, user, orgRoles, orgs, roleRequirements, roles, termsVersions, withSuper, organization, member,
  type Db,
} from '@turnoextra/db';
import { legalParams } from '@turnoextra/db';
import { deleteWorkerData } from '@turnoextra/channels';
import { LEGAL_KEYS } from '../services/legal-params.js';
import type { Auth } from '../auth/auth.js';
import type { Guards } from '../auth/guards.js';

const uuid = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);

export function adminRoutes(app: FastifyInstance, deps: { db: Db; auth: Auth; guards: Guards }) {
  const { db, auth, guards } = deps;
  const opts = { preHandler: guards.requireSuperAdmin };
  const actor = (req: { user?: { id: string } }) => req.user!.id;

  // --- Organizaciones -------------------------------------------------------
  app.get('/admin/orgs', opts, async () =>
    withSuper(db, async (tx) => {
      const rows = await tx
        .select({
          id: orgs.id,
          nombre: orgs.nombre,
          slug: organization.slug,
          admins: sql<number>`(select count(*)::int from ${member} m where m.organization_id = ${orgs.id}::text and m.role = 'admin')`,
          // Roles habilitados: el panel los dibuja como ventanas encendidas del edificio.
          roles: sql<number>`(select count(*)::int from ${orgRoles} r where r.org_id = ${orgs.id})`,
          // Correo de la invitación pendiente más reciente, para poder reenviarla desde el panel.
          pendingEmail: sql<string | null>`(select i.email from ${invitation} i where i.organization_id = ${orgs.id}::text and i.status = 'pending' order by i.created_at desc limit 1)`,
          createdAt: orgs.createdAt,
        })
        .from(orgs)
        .leftJoin(organization, sql`${organization.id} = ${orgs.id}::text`)
        .orderBy(desc(orgs.createdAt));
      return { orgs: rows };
    }),
  );

  // Crea la org y deja la invitación enviada al contacto (primer administrador).
  app.post('/admin/orgs', opts, async (req, reply) => {
    const body = z.object({ nombre: z.string().min(2).max(120), slug, contactEmail: z.string().email() }).parse(req.body);
    const headers = fromNodeHeaders(req.headers);
    const org = await auth.api.createOrganization({ body: { name: body.nombre, slug: body.slug, userId: actor(req) } });
    // Sin roles el gerente no podría registrar personal ni publicar turnos: parte con el catálogo activo
    // y el super admin lo recorta en la fila de la organización.
    await withSuper(db, async (tx) => {
      const active = await tx.select({ id: roles.id }).from(roles).where(eq(roles.activo, true));
      if (active.length) await tx.insert(orgRoles).values(active.map((r) => ({ orgId: org.id, roleId: r.id }))).onConflictDoNothing();
    });
    await auth.api.createInvitation({
      body: { email: body.contactEmail.toLowerCase(), role: 'admin', organizationId: org.id },
      headers,
    });
    return reply.status(201).send({ id: org.id, nombre: body.nombre, slug: body.slug });
  });

  // Reenvía lo que el contacto necesita para entrar: la invitación pendiente y, si ya creó su cuenta
  // pero no verificó el correo, también el correo de verificación.
  app.post('/admin/orgs/:orgId/reenviar-invitacion', opts, async (req, reply) => {
    const { orgId } = z.object({ orgId: uuid }).parse(req.params);
    const pending = await withSuper(db, async (tx) => {
      const [inv] = await tx
        .select({ email: invitation.email })
        .from(invitation)
        .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, 'pending')))
        .orderBy(desc(invitation.createdAt))
        .limit(1);
      return inv;
    });
    if (!pending) return reply.status(404).send({ error: 'not_found', message: 'Esta organización no tiene una invitación pendiente' });
    const headers = fromNodeHeaders(req.headers);
    // resend: reutiliza la invitación vigente, renueva su vencimiento y vuelve a enviar el correo.
    await auth.api.createInvitation({
      body: { email: pending.email, role: 'admin', organizationId: orgId, resend: true },
      headers,
    });
    const unverified = await withSuper(db, async (tx) => {
      const [u] = await tx.select({ v: user.emailVerified }).from(user).where(eq(user.email, pending.email));
      return u ? !u.v : false;
    });
    if (unverified) await auth.api.sendVerificationEmail({ body: { email: pending.email } });
    await withSuper(db, (tx) =>
      audit(tx, { orgId, actorId: actor(req), accion: 'org.invitation_resent', entidad: 'org', entidadId: orgId }),
    );
    return { email: pending.email, verificacion: unverified };
  });

  // Roles habilitados hoy: el editor parte de aquí (el PUT reemplaza el conjunto completo).
  app.get('/admin/orgs/:orgId/roles', opts, async (req) => {
    const { orgId } = z.object({ orgId: uuid }).parse(req.params);
    return withSuper(db, async (tx) => {
      const rows = await tx.select({ roleId: orgRoles.roleId }).from(orgRoles).where(eq(orgRoles.orgId, orgId));
      return { roleIds: rows.map((r) => r.roleId) };
    });
  });

  app.put('/admin/orgs/:orgId/roles', opts, async (req, reply) => {
    const { orgId } = z.object({ orgId: uuid }).parse(req.params);
    const { roleIds } = z.object({ roleIds: z.array(uuid).max(100) }).parse(req.body);
    return withSuper(db, async (tx) => {
      const [o] = await tx.select({ id: orgs.id }).from(orgs).where(eq(orgs.id, orgId));
      if (!o) return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
      await tx.delete(orgRoles).where(eq(orgRoles.orgId, orgId));
      if (roleIds.length) await tx.insert(orgRoles).values(roleIds.map((roleId) => ({ orgId, roleId })));
      await audit(tx, { orgId, actorId: actor(req), accion: 'org.roles_set', entidad: 'org', entidadId: orgId, detalle: { count: roleIds.length } });
      return { roleIds };
    });
  });

  // --- Catálogo de roles y requisitos --------------------------------------
  app.get('/admin/roles', opts, async () =>
    withSuper(db, async (tx) => {
      const rs = await tx.select().from(roles).orderBy(roles.nombre);
      const reqs = await tx.select().from(roleRequirements);
      return { roles: rs.map((r) => ({ ...r, requisitos: reqs.filter((q) => q.roleId === r.id) })) };
    }),
  );

  app.post('/admin/roles', opts, async (req, reply) => {
    const body = z.object({ slug: slug.max(40), nombre: z.string().min(2).max(80) }).parse(req.body);
    return withSuper(db, async (tx) => {
      const [r] = await tx.insert(roles).values(body).onConflictDoNothing().returning();
      if (!r) return reply.status(409).send({ error: 'conflict', message: 'El rol ya existe' });
      await audit(tx, { orgId: null, actorId: actor(req), accion: 'role.created', entidad: 'role', entidadId: r.id });
      return reply.status(201).send(r);
    });
  });

  app.patch('/admin/roles/:id', opts, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const body = z.object({ nombre: z.string().min(2).max(80).optional(), activo: z.boolean().optional() }).parse(req.body);
    return withSuper(db, async (tx) => {
      const [r] = await tx.update(roles).set(body).where(eq(roles.id, id)).returning();
      if (!r) return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
      await audit(tx, { orgId: null, actorId: actor(req), accion: 'role.updated', entidad: 'role', entidadId: id });
      return r;
    });
  });

  app.put('/admin/roles/:id/requirements', opts, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    const items = z
      .array(
        z.object({
          tipoDocumento: z.string().regex(/^[a-z0-9_]+$/).max(60),
          obligatorio: z.boolean().default(true),
          vigenciaRequerida: z.boolean().default(true),
        }),
      )
      .max(30)
      .parse(req.body);
    return withSuper(db, async (tx) => {
      const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, id));
      if (!r) return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
      await tx.delete(roleRequirements).where(eq(roleRequirements.roleId, id));
      if (items.length) await tx.insert(roleRequirements).values(items.map((i) => ({ ...i, roleId: id })));
      await audit(tx, { orgId: null, actorId: actor(req), accion: 'role.requirements_set', entidad: 'role', entidadId: id, detalle: { count: items.length } });
      return { requisitos: items };
    });
  });

  // --- Términos y auditoría ---------------------------------------------------
  app.post('/admin/terms', opts, async (req, reply) => {
    const body = z
      .object({ audience: z.enum(['org', 'candidato']), titulo: z.string().min(2).max(160), cuerpo: z.string().min(10) })
      .parse(req.body);
    return withSuper(db, async (tx) => {
      const [m] = await tx.select({ v: max(termsVersions.version) }).from(termsVersions).where(eq(termsVersions.audience, body.audience));
      const [t] = await tx.insert(termsVersions).values({ ...body, version: (m?.v ?? 0) + 1 }).returning();
      await audit(tx, { orgId: null, actorId: actor(req), accion: 'terms.published', entidad: 'terms', entidadId: t!.id, detalle: { audience: body.audience } });
      return reply.status(201).send(t);
    });
  });

  // --- Parámetros legales con vigencia (piso salarial) ---------------------------------------
  app.get('/admin/legal', opts, async () =>
    withSuper(db, async (tx) => ({ params: await tx.select().from(legalParams).orderBy(legalParams.clave, desc(legalParams.vigenteDesde)) })),
  );

  app.post('/admin/legal', opts, async (req, reply) => {
    const body = z
      .object({
        clave: z.enum(LEGAL_KEYS),
        valor: z.number().positive().max(1e9),
        vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        nota: z.string().max(300).optional(),
      })
      .parse(req.body);
    return withSuper(db, async (tx) => {
      const [p] = await tx
        .insert(legalParams)
        .values({ clave: body.clave, valor: String(body.valor), vigenteDesde: body.vigenteDesde, nota: body.nota, createdBy: actor(req) })
        .onConflictDoNothing()
        .returning();
      if (!p) return reply.status(409).send({ error: 'conflict', message: 'Ya existe ese parámetro para esa fecha' });
      await audit(tx, { orgId: null, actorId: actor(req), accion: 'legal_param.created', entidad: 'legal_param', entidadId: p.id, detalle: { clave: body.clave } });
      return reply.status(201).send(p);
    });
  });

  // `data delete`: mismo servicio que el comando BORRAR MIS DATOS del candidato.
  app.post('/admin/workers/:id/data-delete', opts, async (req, reply) => {
    const { id } = z.object({ id: uuid }).parse(req.params);
    return withSuper(db, async (tx) => {
      const r = await deleteWorkerData(tx, id, { actorId: actor(req) });
      if (!r.deleted) return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
      return { deleted: true };
    });
  });

  app.get('/admin/auditoria', opts, async (req) => {
    const q = z.object({ orgId: uuid.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
    return withSuper(db, async (tx) => {
      const rows = await tx
        .select()
        .from(auditLog)
        .where(q.orgId ? and(eq(auditLog.orgId, q.orgId)) : undefined)
        .orderBy(desc(auditLog.id))
        .limit(q.limit);
      return { entries: rows };
    });
  });
}
