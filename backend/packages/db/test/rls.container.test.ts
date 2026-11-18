import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { createDb, runMigrations, orgs, orgWorkers, workers, auditLog, withOrg } from '../src/index.js';

let pg: StartedPostgreSqlContainer;
let app: ReturnType<typeof createDb>;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  if (!process.env.TESTCONTAINERS) return;
  pg = await new PostgreSqlContainer('postgres:16').start();
  const owner = pg.getConnectionUri();
  await runMigrations(owner, 'app_test_pw_123');
  // Datos sembrados como dueño (salta RLS), a propósito.
  const seed = postgres(owner);
  const rows = await seed`INSERT INTO orgs (nombre) VALUES ('A'), ('B') RETURNING id`;
  orgA = rows[0]!.id;
  orgB = rows[1]!.id;
  const w = await seed`INSERT INTO workers (nombre) VALUES ('Ana') RETURNING id`;
  await seed`INSERT INTO org_workers (org_id, worker_id, nombre) VALUES (${orgA}, ${w[0]!.id}, 'Ana')`;
  await seed.end();
  const u = new URL(owner);
  u.username = 'turnoextra_app';
  u.password = 'app_test_pw_123';
  app = createDb(u.toString());
});

afterAll(async () => {
  await app?.close();
  await pg?.stop();
});

describe.skipIf(!process.env.TESTCONTAINERS)('RLS con Postgres real en contenedor (T21, T11)', () => {
  it('sin org activa: cero filas', async () => {
    expect(await app.db.select().from(orgs)).toHaveLength(0);
    expect(await app.db.select().from(orgWorkers)).toHaveLength(0);
  });
  it('cada org ve solo lo suyo', async () => {
    expect(await withOrg(app.db, orgA, (tx) => tx.select().from(orgWorkers))).toHaveLength(1);
    expect(await withOrg(app.db, orgB, (tx) => tx.select().from(orgWorkers))).toHaveLength(0);
    expect(await withOrg(app.db, orgB, (tx) => tx.select().from(workers))).toHaveLength(0);
    expect(await withOrg(app.db, orgA, (tx) => tx.select().from(orgs))).toHaveLength(1);
  });
  it('no puede escribir filas de otra org', async () => {
    await expect(
      withOrg(app.db, orgB, (tx) => tx.insert(orgWorkers).values({ orgId: orgA, workerId: crypto.randomUUID() })),
    ).rejects.toThrow();
  });
  it('audit_log: inserta pero no actualiza ni borra', async () => {
    await withOrg(app.db, orgA, (tx) => tx.insert(auditLog).values({ orgId: orgA, accion: 'test' }));
    await expect(withOrg(app.db, orgA, (tx) => tx.execute(sql`UPDATE audit_log SET accion = 'x'`))).rejects.toThrow();
    await expect(withOrg(app.db, orgA, (tx) => tx.execute(sql`DELETE FROM audit_log`))).rejects.toThrow();
  });
});
