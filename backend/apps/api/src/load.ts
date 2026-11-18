import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { respondOffer } from '@turnoextra/channels';
import { assignments, audit, orgRoles, orgWorkers, orgs, organization, roles, shiftOffers, shifts, withSuper, workers, type Db } from '@turnoextra/db';

export type LoadResult = {
  n: number;
  cupos: number;
  ms: number;
  outcomes: Record<string, number>;
  confirmados: number;
  enEspera: number;
  /** Ningún invariante roto: confirmados == min(cupos, n) y nadie quedó duplicado. */
  ok: boolean;
  orgId: string;
  shiftId: string;
};

/**
 * Prueba de carga honesta: `n` aceptaciones simultáneas del mismo turno, cada una en su propia transacción, contra la
 * base de datos real. No son `n` personas: son `n` candidatos sintéticos (sin nombre real ni celular) en una
 * organización desechable. Verifica que nunca haya más confirmados que cupos.
 */
export async function runLoad(db: Db, opts: { n: number; cupos: number }): Promise<LoadResult> {
  const { n, cupos } = opts;
  const orgId = randomUUID();
  const slug = `carga-${Date.now()}`;
  await db.insert(organization).values({ id: orgId, name: `Carga ${slug}`, slug });

  const { shiftId, offers } = await withSuper(db, async (tx) => {
    await tx.insert(orgs).values({ id: orgId, nombre: `Carga ${slug}` });
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.activo, true)).limit(1);
    if (!role) throw new Error('No hay roles activos: corre las migraciones.');
    await tx.insert(orgRoles).values({ orgId, roleId: role.id });
    const [s] = await tx
      .insert(shifts)
      .values({
        orgId, roleId: role.id, inicio: new Date(Date.now() + 2 * 86400_000), fin: new Date(Date.now() + 2 * 86400_000 + 8 * 3600_000),
        cupos, pagoTotal: '1', pisoCalculado: '0', createdBy: 'load-test',
      })
      .returning({ id: shifts.id });
    const ws = await tx.insert(workers).values(Array.from({ length: n }, () => ({}))).returning({ id: workers.id });
    await tx.insert(orgWorkers).values(ws.map((w, i) => ({ orgId, workerId: w.id, nombre: `Carga ${i + 1}`, estado: 'activo' as const })));
    const os = await tx
      .insert(shiftOffers)
      .values(ws.map((w) => ({ orgId, shiftId: s!.id, workerId: w.id, status: 'sent' })))
      .returning({ id: shiftOffers.id, workerId: shiftOffers.workerId });
    await audit(tx, { orgId, actorId: null, accion: 'load_test.seeded', entidad: 'org', entidadId: orgId, detalle: { n, cupos } });
    return { shiftId: s!.id, offers: os };
  });

  const t0 = performance.now();
  const results = await Promise.all(offers.map((o) => withSuper(db, (tx) => respondOffer(tx, o.id, o.workerId, 'accept', 'whatsapp'))));
  const ms = Math.round(performance.now() - t0);

  const outcomes: Record<string, number> = {};
  for (const r of results) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  const counts = await withSuper(db, (tx) =>
    tx.select({ status: assignments.status, c: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.shiftId, shiftId))).groupBy(assignments.status),
  );
  const confirmados = counts.find((c) => c.status === 'confirmed')?.c ?? 0;
  const enEspera = counts.find((c) => c.status === 'standby')?.c ?? 0;
  return { n, cupos, ms, outcomes, confirmados, enEspera, ok: confirmados === Math.min(cupos, n) && (outcomes.confirmed ?? 0) === confirmados, orgId, shiftId };
}
