import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq, inArray } from 'drizzle-orm';
import { member, type Db } from '@turnoextra/db';
import type { Auth } from './auth.js';

export type SessionUser = { id: string; email: string; name: string; role?: string | null };

declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export const isSuper = (u?: SessionUser) => u?.role === 'super_admin';

export function createGuards(auth: Auth, db: Db) {
  const load = async (req: FastifyRequest) => {
    const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    req.user = (s?.user as SessionUser | undefined) ?? undefined;
    return req.user;
  };

  /** Sesión válida. */
  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await load(req))) return reply.status(401).send({ error: 'unauthorized', message: 'Inicia sesión' });
  };

  /** Super admin. */
  const requireSuperAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const u = await load(req);
    if (!u) return reply.status(401).send({ error: 'unauthorized', message: 'Inicia sesión' });
    if (!isSuper(u)) return reply.status(403).send({ error: 'forbidden', message: 'Sin permiso' });
  };

  /**
   * Administrador de la org de `:orgId` (o super admin). Si no pertenece, 404: no se
   * revela que la org existe.
   */
  const requireOrgAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const u = await load(req);
    if (!u) return reply.status(401).send({ error: 'unauthorized', message: 'Inicia sesión' });
    const { orgId } = req.params as { orgId: string };
    if (isSuper(u)) return;
    const [m] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, u.id), inArray(member.role, ['admin', 'owner'])))
      .limit(1);
    if (!m) return reply.status(404).send({ error: 'not_found', message: 'No encontrado' });
  };

  return { requireUser, requireSuperAdmin, requireOrgAdmin };
}

export type Guards = ReturnType<typeof createGuards>;
