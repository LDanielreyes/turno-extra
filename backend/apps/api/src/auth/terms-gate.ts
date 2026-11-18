import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { orgTerms, termsVersions, withOrg, type Db } from '@turnoextra/db';
import { isSuper } from './guards.js';

export async function currentTerms(db: Db, audience: 'org' | 'candidato') {
  const [t] = await db
    .select()
    .from(termsVersions)
    .where(eq(termsVersions.audience, audience))
    .orderBy(desc(termsVersions.version))
    .limit(1);
  return t;
}

/** Mientras la empresa no acepte la versión vigente de los términos, no opera el panel. */
export function makeTermsGate(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (isSuper(req.user)) return;
    const { orgId } = req.params as { orgId: string };
    const cur = await currentTerms(db, 'org');
    if (!cur) return;
    const ok = await withOrg(db, orgId, async (tx) => {
      const [a] = await tx
        .select()
        .from(orgTerms)
        .where(and(eq(orgTerms.orgId, orgId), eq(orgTerms.termsVersionId, cur.id)));
      return !!a;
    });
    if (!ok) return reply.status(403).send({ error: 'terms_required', message: 'Debes aceptar los términos vigentes' });
  };
}
