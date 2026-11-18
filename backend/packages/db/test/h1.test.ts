import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '../src/testing.js';
import { audit, auditLog, orgRoles, orgs, orgTerms, roleRequirements, roles, termsVersions, withOrg, withSuper } from '../src/index.js';

type T = Awaited<ReturnType<typeof createTestDb>>;
let t: T;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

beforeAll(async () => {
  t = await createTestDb();
  await t.asOwner(async (o) => {
    await o.execute(sql`INSERT INTO "user" (id, name, email) VALUES ('u1','U1','u1@x.co'),('u2','U2','u2@x.co'),('u3','U3','u3@x.co'),('u4','U4','u4@x.co')`);
    await o.execute(sql`INSERT INTO organization (id, name, slug) VALUES (${A}, 'A', 'a'), (${B}, 'B', 'b')`);
    await o.execute(sql`INSERT INTO orgs (id, nombre) VALUES (${A}, 'A'), (${B}, 'B')`);
  });
}, 120_000);

afterAll(() => t?.close());

describe('migraciones y catálogo', () => {
  it('siembra los roles por defecto con sus documentos obligatorios', async () => {
    const rs = await t.db.select().from(roles);
    expect(rs.map((r) => r.slug).sort()).toEqual(['cocina', 'conductor', 'mesero', 'seguridad']);
    const reqs = await t.db.select().from(roleRequirements);
    // 4 propios de cada rol + la cédula, que se pide a los 4 roles.
    expect(reqs).toHaveLength(8);
    expect(reqs.filter((r) => r.tipoDocumento === 'cedula' && r.obligatorio && !r.vigenciaRequerida)).toHaveLength(4);
  });
});

describe('aislamiento y super admin (T21, T22)', () => {
  it('sin org activa no se ve ninguna org', async () => {
    expect(await t.db.select().from(orgs)).toHaveLength(0);
  });
  it('una org ve solo la suya y el super admin ve todas', async () => {
    expect(await withOrg(t.db, A, (tx) => tx.select().from(orgs))).toHaveLength(1);
    expect(await withSuper(t.db, (tx) => tx.select().from(orgs))).toHaveLength(2);
  });
  it('org_roles y org_terms están aislados por org', async () => {
    const [r] = await t.db.select().from(roles).limit(1);
    await withSuper(t.db, (tx) => tx.insert(orgRoles).values({ orgId: A, roleId: r!.id }));
    expect(await withOrg(t.db, A, (tx) => tx.select().from(orgRoles))).toHaveLength(1);
    expect(await withOrg(t.db, B, (tx) => tx.select().from(orgRoles))).toHaveLength(0);
    expect(await t.db.select().from(orgRoles)).toHaveLength(0);
  });
  it('el catálogo es legible por todos pero solo el super admin lo modifica', async () => {
    expect(await withOrg(t.db, A, (tx) => tx.select().from(roles))).toHaveLength(4);
    await expect(withOrg(t.db, A, (tx) => tx.insert(roles).values({ slug: 'x', nombre: 'X' }))).rejects.toThrow();
    await expect(withOrg(t.db, A, (tx) => tx.insert(termsVersions).values({ audience: 'org', version: 1, titulo: 't', cuerpo: 'c' }))).rejects.toThrow();
    const [nr] = await withSuper(t.db, (tx) => tx.insert(roles).values({ slug: 'nuevo', nombre: 'Nuevo' }).returning());
    expect(nr!.slug).toBe('nuevo');
  });
  it('una org no puede aceptar términos a nombre de otra', async () => {
    const [tv] = await withSuper(t.db, (tx) => tx.insert(termsVersions).values({ audience: 'org', version: 1, titulo: 'T', cuerpo: 'cuerpo largo' }).returning());
    await expect(withOrg(t.db, B, (tx) => tx.insert(orgTerms).values({ orgId: A, termsVersionId: tv!.id, acceptedBy: 'u1' }))).rejects.toThrow();
    await withOrg(t.db, A, (tx) => tx.insert(orgTerms).values({ orgId: A, termsVersionId: tv!.id, acceptedBy: 'u1' }));
  });
});

describe('bitácora', () => {
  it('el super admin registra acciones globales (org nula) y la org no las ve', async () => {
    await withSuper(t.db, (tx) => audit(tx, { orgId: null, actorId: 'u1', accion: 'role.created' }));
    expect((await withSuper(t.db, (tx) => tx.select().from(auditLog))).some((e) => e.orgId === null)).toBe(true);
    expect((await withOrg(t.db, A, (tx) => tx.select().from(auditLog))).every((e) => e.orgId === A)).toBe(true);
  });
  it('no se puede actualizar ni borrar (T11)', async () => {
    await expect(withSuper(t.db, (tx) => tx.execute(sql`UPDATE audit_log SET accion = 'x'`))).rejects.toThrow();
    await expect(withSuper(t.db, (tx) => tx.execute(sql`DELETE FROM audit_log`))).rejects.toThrow();
  });
});

describe('máximo 3 administradores por org (T20, nivel BD)', () => {
  it('el cuarto administrador es rechazado; el propietario no cuenta', async () => {
    const add = (id: string, userId: string, role: string) =>
      t.asOwner((o) => o.execute(sql`INSERT INTO member (id, organization_id, user_id, role) VALUES (${id}, ${A}, ${userId}, ${role})`));
    await add('m0', 'u1', 'owner');
    await add('m1', 'u1x', 'admin').catch(() => undefined); // usuario inexistente: no cuenta
    await t.asOwner((o) => o.execute(sql`INSERT INTO "user" (id, name, email) VALUES ('u5','U5','u5@x.co')`));
    await add('m2', 'u2', 'admin');
    await add('m3', 'u3', 'admin');
    await add('m4', 'u5', 'admin');
    const err = await add('m5', 'u4', 'admin').then(() => null, (e: Error & { cause?: Error }) => e);
    expect(err?.cause?.message ?? err?.message).toMatch(/max_org_admins_exceeded/);
  });
  it('promover a admin cuando ya hay 3 también falla', async () => {
    const err = await t.asOwner((o) => o.execute(sql`UPDATE member SET role = 'admin' WHERE id = 'm0'`)).then(() => null, (e: Error & { cause?: Error }) => e);
    expect(err?.cause?.message ?? err?.message).toMatch(/max_org_admins_exceeded/);
  });
});
