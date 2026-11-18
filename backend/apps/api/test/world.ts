import { expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@turnoextra/db/testing';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { MemoryEmailProvider } from '../src/email.js';

export const env = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  BETTER_AUTH_URL: 'http://localhost:3000',
  APP_URL: 'http://localhost:5173',
  CORS_ORIGINS: ['http://localhost:5173'],
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'silent' as const,
};
export const PASSWORD = 'una-clave-larga-123';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Res = { statusCode: number; json: () => any; headers: Record<string, unknown> };
type ApiFn = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, opts?: { cookie?: string; body?: unknown }) => Promise<Res>;
export type World = {
  t: Awaited<ReturnType<typeof createTestDb>>;
  app: Awaited<ReturnType<typeof buildApp>>;
  api: ApiFn;
  superCookie: string;
  A: { orgId: string; cookie: string };
  B: { orgId: string; cookie: string };
  roleId: (slug: string) => string;
  email: MemoryEmailProvider;
};

const cookieOf = (res: Res) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []).map((c) => c.split(';')[0]).join('; ');

/** Super admin + dos organizaciones (A y B) con un administrador cada una y el rol mesero habilitado. */
export async function createWorld(
  extra: { WHATSAPP_APP_SECRET?: string; WHATSAPP_VERIFY_TOKEN?: string; DEMO_MODE?: boolean; TELEGRAM_WEBHOOK_SECRET?: string; TELEGRAM_BOT_USERNAME?: string; RATE_LIMIT_MAX?: number } = {},
): Promise<World> {
  const t = await createTestDb();
  const email = new MemoryEmailProvider();
  const boot = createAuth({ db: t.db, env, email, allowOpenSignup: true });
  await boot.api.signUpEmail({ body: { email: 'root@turnoextra.test', name: 'Root', password: PASSWORD } });
  await t.asOwner((o) => o.execute(sql`UPDATE "user" SET role = 'super_admin', email_verified = true WHERE email = 'root@turnoextra.test'`));
  const app = await buildApp({ ...env, ...extra }, { db: t.db, auth: createAuth({ db: t.db, env, email }), listen: t.listen });

  const api: ApiFn = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, opts: { cookie?: string; body?: unknown } = {}): Promise<Res> =>
    app.inject({
      method,
      url,
      headers: { origin: env.APP_URL, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
    }) as unknown as Res;

  const signIn = async (mail: string) => {
    const r = await api('POST', '/api/auth/sign-in/email', { body: { email: mail, password: PASSWORD } });
    expect(r.statusCode).toBe(200);
    return cookieOf(r);
  };
  const superCookie = await signIn('root@turnoextra.test');

  const roles = (await api('GET', '/admin/roles', { cookie: superCookie })).json().roles as { id: string; slug: string }[];
  const roleId = (slug: string) => roles.find((r) => r.slug === slug)!.id;

  async function createOrg(nombre: string, slug: string, contact: string) {
    const r = await api('POST', '/admin/orgs', { cookie: superCookie, body: { nombre, slug, contactEmail: contact } });
    expect(r.statusCode).toBe(201);
    const orgId = r.json().id as string;
    const invitationId = /aceptar-invitacion\/([\w-]+)/.exec(email.sent.at(-1)!.text)![1]!;
    await api('POST', '/api/auth/sign-up/email', { body: { email: contact, name: nombre, password: PASSWORD } });
    await t.asOwner((o) => o.execute(sql`UPDATE "user" SET email_verified = true WHERE email = ${contact}`));
    const cookie = await signIn(contact);
    const acc = await api('POST', '/api/auth/organization/accept-invitation', { cookie, body: { invitationId } });
    expect(acc.statusCode).toBe(200);
    await api('PUT', `/admin/orgs/${orgId}/roles`, { cookie: superCookie, body: { roleIds: [roleId('mesero')] } });
    return { orgId, cookie };
  }

  const A = await createOrg('Org A', 'org-a', 'a@org.test');
  const B = await createOrg('Org B', 'org-b', 'b@org.test');
  return { t, app, api, superCookie, A, B, roleId, email };
}
