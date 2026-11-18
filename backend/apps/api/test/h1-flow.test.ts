import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@turnoextra/db/testing';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { MemoryEmailProvider } from '../src/email.js';

const env = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  BETTER_AUTH_URL: 'http://localhost:3000',
  APP_URL: 'http://localhost:5173',
  CORS_ORIGINS: ['http://localhost:5173'],
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'silent' as const,
};
const PASSWORD = 'una-clave-larga-123';
const origin = env.APP_URL;

let t: Awaited<ReturnType<typeof createTestDb>>;
let app: Awaited<ReturnType<typeof buildApp>>;
const email = new MemoryEmailProvider();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Res = { statusCode: number; json: () => any; headers: Record<string, unknown> };
const cookieOf = (res: Res) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []).map((c) => c.split(';')[0]).join('; ');

async function api(method: 'GET' | 'POST' | 'PUT', url: string, opts: { cookie?: string; body?: unknown } = {}): Promise<Res> {
  return app.inject({
    method,
    url,
    headers: { origin, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  }) as unknown as Res;
}

async function signIn(mail: string) {
  const r = await api('POST', '/api/auth/sign-in/email', { body: { email: mail, password: PASSWORD } });
  expect(r.statusCode).toBe(200);
  return cookieOf(r);
}

let superCookie: string;
let orgId: string;

beforeAll(async () => {
  t = await createTestDb();
  // Primer super admin: solo la instancia de arranque permite registro abierto.
  const boot = createAuth({ db: t.db, env, email, allowOpenSignup: true });
  await boot.api.signUpEmail({ body: { email: 'root@turnoextra.test', name: 'Root', password: PASSWORD } });
  await t.asOwner((o) => o.execute(sql`UPDATE "user" SET role = 'super_admin', email_verified = true WHERE email = 'root@turnoextra.test'`));

  app = await buildApp(env, { db: t.db, auth: createAuth({ db: t.db, env, email }) });
  superCookie = await signIn('root@turnoextra.test');
}, 120_000);

afterAll(async () => {
  await app?.close();
  await t?.close();
});

describe('H1: acceso, organizaciones y equipo', () => {
  it('no hay registro abierto: sin invitación no se crea la cuenta', async () => {
    const r = await api('POST', '/api/auth/sign-up/email', { body: { email: 'intruso@x.co', name: 'X', password: PASSWORD } });
    const created = await t.asOwner((o) => o.execute(sql`SELECT 1 FROM "user" WHERE email = 'intruso@x.co'`));
    // Better Auth responde 200 genérico (no revela qué correos existen); lo que importa es que no se crea la cuenta.
    expect(((created as unknown as { rows?: unknown[] }).rows ?? (created as unknown as unknown[])).length).toBe(0);
    expect(email.sent.some((m) => m.to === 'intruso@x.co')).toBe(false);
    expect(r.statusCode).not.toBe(500);
  });

  it('el super admin crea una org y se envía la invitación al contacto', async () => {
    const r = await api('POST', '/admin/orgs', { cookie: superCookie, body: { nombre: 'Hotel Demo', slug: 'hotel-demo', contactEmail: 'gerente@hotel.test' } });
    expect(r.statusCode).toBe(201);
    orgId = r.json().id;
    expect(email.sent.at(-1)?.to).toBe('gerente@hotel.test');
    expect(email.sent.at(-1)?.text).toMatch(/aceptar-invitacion\//);
    const list = await api('GET', '/admin/orgs', { cookie: superCookie });
    expect(list.json().orgs.map((o: { nombre: string }) => o.nombre)).toContain('Hotel Demo');
    // Nace con los roles activos del catálogo: el gerente puede operar desde el primer día.
    const active = (await api('GET', '/admin/roles', { cookie: superCookie })).json().roles.filter((x: { activo: boolean }) => x.activo);
    expect((await api('GET', `/admin/orgs/${orgId}/roles`, { cookie: superCookie })).json().roleIds).toHaveLength(active.length);
  });

  let contactCookie: string;
  let invitationId: string;

  it('el contacto invitado crea su cuenta y acepta la invitación', async () => {
    invitationId = /aceptar-invitacion\/([\w-]+)/.exec(email.sent.at(-1)!.text)![1]!;
    const su = await api('POST', '/api/auth/sign-up/email', { body: { email: 'gerente@hotel.test', name: 'Gerente', password: PASSWORD } });
    expect(su.statusCode).toBe(200);
    // Sin verificar el correo no hay sesión: se comprueba y luego se marca verificado.
    expect(cookieOf(su)).toBe('');
    expect(email.sent.at(-1)?.subject).toMatch(/Verifica/);
    await t.asOwner((o) => o.execute(sql`UPDATE "user" SET email_verified = true WHERE email = 'gerente@hotel.test'`));
    contactCookie = await signIn('gerente@hotel.test');
    const acc = await api('POST', '/api/auth/organization/accept-invitation', { cookie: contactCookie, body: { invitationId } });
    expect([acc.statusCode, acc.json()]).toEqual([200, expect.anything()]);
    const me = await api('GET', '/me', { cookie: contactCookie });
    expect(me.json().memberships[0]).toMatchObject({ orgId, role: 'admin' });
  });

  it('T22: un administrador de empresa no entra a /admin (403)', async () => {
    expect((await api('GET', '/admin/orgs', { cookie: contactCookie })).statusCode).toBe(403);
    expect((await api('GET', '/admin/orgs')).statusCode).toBe(401);
  });

  it('T6: otra org o un uuid inexistente responde 404', async () => {
    expect((await api('GET', `/orgs/${orgId}/team`, { cookie: contactCookie })).statusCode).toBe(200);
    expect((await api('GET', '/orgs/33333333-3333-4333-8333-333333333333/team', { cookie: contactCookie })).statusCode).toBe(404);
    expect((await api('GET', '/orgs/no-es-uuid/team', { cookie: contactCookie })).statusCode).toBe(404);
  });

  it('términos: una vez publicados, el panel exige aceptarlos', async () => {
    await api('POST', '/admin/terms', { cookie: superCookie, body: { audience: 'org', titulo: 'Términos para empresas', cuerpo: 'Texto de prueba de los términos.' } });
    const blocked = await api('GET', `/orgs/${orgId}/team`, { cookie: contactCookie });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toBe('terms_required');
    const st = await api('GET', `/orgs/${orgId}/terms/status`, { cookie: contactCookie });
    expect(st.json().accepted).toBe(false);
    const ok = await api('POST', `/orgs/${orgId}/terms/accept`, { cookie: contactCookie, body: { termsVersionId: st.json().current.id } });
    expect(ok.statusCode).toBe(200);
    expect((await api('GET', `/orgs/${orgId}/team`, { cookie: contactCookie })).statusCode).toBe(200);
  });

  it('T20: máximo 3 gerentes (miembros + invitaciones pendientes)', async () => {
    const invite = (mail: string) =>
      api('POST', '/api/auth/organization/invite-member', { cookie: contactCookie, body: { email: mail, role: 'admin', organizationId: orgId } });
    expect((await invite('g2@hotel.test')).statusCode).toBe(200);
    expect((await invite('g3@hotel.test')).statusCode).toBe(200);
    const fourth = await invite('g4@hotel.test');
    expect(fourth.statusCode).toBe(400);
    expect(JSON.stringify(fourth.json())).toMatch(/max_org_admins_exceeded/);
    const team = await api('GET', `/orgs/${orgId}/team`, { cookie: contactCookie });
    expect(team.json().members).toHaveLength(1);
    expect(team.json().invitations).toHaveLength(2);
  });

  it('solo se pueden invitar administradores', async () => {
    const r = await api('POST', '/api/auth/organization/invite-member', { cookie: contactCookie, body: { email: 'm@hotel.test', role: 'member', organizationId: orgId } });
    expect(r.statusCode).toBe(400);
  });

  it('roles: el super admin habilita roles y la empresa los ve con sus requisitos', async () => {
    const all = (await api('GET', '/admin/roles', { cookie: superCookie })).json().roles as { id: string; slug: string }[];
    const mesero = all.find((r) => r.slug === 'mesero')!;
    const put = await api('PUT', `/admin/orgs/${orgId}/roles`, { cookie: superCookie, body: { roleIds: [mesero.id] } });
    expect(put.statusCode).toBe(200);
    const cur = await api('GET', `/admin/orgs/${orgId}/roles`, { cookie: superCookie });
    expect(cur.json().roleIds).toEqual([mesero.id]);
    const mine =(await api('GET', `/orgs/${orgId}/roles`, { cookie: contactCookie })).json().roles;
    expect(mine).toHaveLength(1);
    expect(mine[0].requisitos[0].tipoDocumento).toBe('carnet_manipulacion_alimentos');
  });

  it('la bitácora registra las acciones con el usuario que las hizo', async () => {
    const r = await api('GET', `/admin/auditoria?orgId=${orgId}`, { cookie: superCookie });
    const acciones = r.json().entries.map((e: { accion: string }) => e.accion);
    expect(acciones).toEqual(expect.arrayContaining(['org.created', 'team.invited', 'team.member_added', 'terms.accepted', 'org.roles_set']));
    expect(r.json().entries.every((e: { actorId: string | null }) => e.actorId)).toBe(true);
  });

  it('validación Zod: slug inválido responde 400', async () => {
    const r = await api('POST', '/admin/orgs', { cookie: superCookie, body: { nombre: 'X', slug: 'Slug Malo', contactEmail: 'no-correo' } });
    expect(r.statusCode).toBe(400);
  });
});
