import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import {
  audit, invitation, member, orgs, orgRoles, orgTerms, organization, roleRequirements, roles, user, withOrg,
  type Db,
} from '@turnoextra/db';
import type { Guards } from '../auth/guards.js';
import { currentTerms, makeTermsGate } from '../auth/terms-gate.js';

const uuid = z.string().uuid();

export function orgRoutes(app: FastifyInstance, deps: { db: Db; guards: Guards; /** Usuario del bot (sin @); sin él no hay QR de Telegram. */ telegramBot?: string }) {
  const { db, guards } = deps;

  const validOrg = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!uuid.safeParse((req.params as { orgId: string }).orgId).success) {
      return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
    }
  };
  const base = { preHandler: [validOrg, guards.requireOrgAdmin] };

  const requireTerms = makeTermsGate(db);
  const gated = { preHandler: [validOrg, guards.requireOrgAdmin, requireTerms] };

  app.get('/me', { preHandler: guards.requireUser }, async (req) => {
    const u = req.user!;
    const memberships = await db
      .select({ orgId: member.organizationId, role: member.role, nombre: organization.name })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, u.id));
    return {
      user: { id: u.id, email: u.email, name: u.name, role: u.role ?? 'user' },
      memberships,
    };
  });

  app.get('/terms/current', { preHandler: guards.requireUser }, async (req, reply) => {
    const { audience } = z.object({ audience: z.enum(['org', 'candidato']).default('org') }).parse(req.query);
    const t = await currentTerms(db, audience);
    if (!t) return reply.status(404).send({ error: 'not_found', message: 'Sin términos publicados' });
    return t;
  });

  app.get('/orgs/:orgId/terms/status', base, async (req) => {
    const { orgId } = req.params as { orgId: string };
    const cur = await currentTerms(db, 'org');
    if (!cur) return { current: null, accepted: true };
    const accepted = await withOrg(db, orgId, async (tx) => {
      const [a] = await tx.select().from(orgTerms).where(and(eq(orgTerms.orgId, orgId), eq(orgTerms.termsVersionId, cur.id)));
      return !!a;
    });
    return { current: { id: cur.id, version: cur.version, titulo: cur.titulo }, accepted };
  });

  app.post('/orgs/:orgId/terms/accept', base, async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const { termsVersionId } = z.object({ termsVersionId: uuid }).parse(req.body);
    const cur = await currentTerms(db, 'org');
    if (!cur || cur.id !== termsVersionId) {
      return reply.status(409).send({ error: 'stale_terms', message: 'Hay una versión más reciente de los términos' });
    }
    await withOrg(db, orgId, async (tx) => {
      await tx.insert(orgTerms).values({ orgId, termsVersionId, acceptedBy: req.user!.id }).onConflictDoNothing();
      await audit(tx, { orgId, actorId: req.user!.id, accion: 'terms.accepted', entidad: 'terms', entidadId: termsVersionId });
    });
    return { accepted: true };
  });

  // Equipo: gerentes actuales e invitaciones pendientes (máx. 3 en total, ver auth.ts).
  app.get('/orgs/:orgId/team', gated, async (req) => {
    const { orgId } = req.params as { orgId: string };
    const members = await db
      .select({ id: member.id, userId: member.userId, role: member.role, name: user.name, email: user.email, since: member.createdAt })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, orgId), eq(member.role, 'admin')));
    const invitations = await db
      .select({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt })
      .from(invitation)
      .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, 'pending'), gt(invitation.expiresAt, new Date())));
    return { members, invitations, maxAdmins: 3 };
  });

  app.get('/orgs/:orgId/roles', gated, async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrg(db, orgId, async (tx) => {
      const rs = await tx
        .select({ id: roles.id, slug: roles.slug, nombre: roles.nombre })
        .from(orgRoles)
        .innerJoin(roles, eq(roles.id, orgRoles.roleId))
        .where(and(eq(orgRoles.orgId, orgId), eq(roles.activo, true)));
      const reqs = await tx.select().from(roleRequirements);
      return { roles: rs.map((r) => ({ ...r, requisitos: reqs.filter((q) => q.roleId === r.id) })) };
    });
  });

  // Código y enlace de ALTA para que la empresa lo comparta (el frontend dibuja el QR). El código no es secreto:
  // sin un celular registrado como pendiente no abre nada.
  app.get('/orgs/:orgId/invitacion', gated, async (req) => {
    const { orgId } = req.params as { orgId: string };
    return withOrg(db, orgId, async (tx) => {
      const [o] = await tx.select({ code: orgs.inviteCode }).from(orgs).where(eq(orgs.id, orgId));
      const num = process.env.WHATSAPP_PUBLIC_NUMBER?.replace(/\D/g, '');
      return {
        codigo: o!.code,
        texto: `ALTA ${o!.code}`,
        whatsappUrl: num ? `https://wa.me/${num}?text=${encodeURIComponent(`ALTA ${o!.code}`)}` : null,
        // Alta directa por Telegram: el bot pide el celular de la cuenta y sigue el mismo flujo que por WhatsApp.
        telegramUrl: deps.telegramBot ? `https://t.me/${deps.telegramBot}?start=ALTA-${o!.code}` : null,
      };
    });
  });
}
