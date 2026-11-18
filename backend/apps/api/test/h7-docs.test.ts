import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { createWorld, env, type World } from './world.js';

let w: World;
beforeAll(async () => { w = await createWorld(); }, 180_000);
afterAll(async () => { await w?.app.close(); await w?.t.close(); });

describe('documentación /docs', () => {
  it('sirve Swagger UI y la especificación con los endpoints de los tres paneles', async () => {
    const ui = await w.app.inject({ method: 'GET', url: '/docs' });
    expect([200, 302]).toContain(ui.statusCode);
    const page = ui.statusCode === 302 ? await w.app.inject({ method: 'GET', url: String(ui.headers.location) }) : ui;
    expect(page.statusCode).toBe(200);
    expect(page.body).toMatch(/swagger/i);
    // el CSP de la página debe dejar cargar los scripts del propio UI (el global es default-src 'none')
    expect(String(page.headers['content-security-policy'])).toMatch(/script-src/);

    const spec = (await w.app.inject({ method: 'GET', url: '/docs/json' })).json();
    expect(spec.openapi).toMatch(/^3\./);
    for (const p of ['/api/auth/sign-in/email', '/me', '/orgs/{orgId}/shifts', '/orgs/{orgId}/workers', '/admin/orgs', '/yo', '/candidato/codigo', '/health']) {
      expect(spec.paths[p], p).toBeTruthy();
    }
  });

  it('en producción no se publica salvo DOCS_ENABLED=true', async () => {
    const prod = await buildApp({ ...env, NODE_ENV: 'production' });
    expect((await prod.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404);
    await prod.close();
    const forced = await buildApp({ ...env, NODE_ENV: 'production', DOCS_ENABLED: true });
    expect((await forced.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(200);
    await forced.close();
  });
});

describe('cerrar sesión', () => {
  it('sign-out invalida la sesión del gerente', async () => {
    const before = await w.api('GET', '/me', { cookie: w.B.cookie });
    expect(before.statusCode).toBe(200);
    const out = await w.api('POST', '/api/auth/sign-out', { cookie: w.B.cookie, body: {} });
    expect(out.statusCode).toBe(200);
    expect((await w.api('GET', '/me', { cookie: w.B.cookie })).statusCode).toBe(401);
  });
});
