import { describe, it, expect } from 'vitest';
import { buildApp, maskPhones } from '../src/app.js';

const env = { LOG_LEVEL: 'silent' as const, CORS_ORIGINS: [] };

describe('api base', () => {
  it('GET /health responde ok y trae cabeceras de seguridad', async () => {
    const app = await buildApp(env);
    const res = await app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
  it('responde 503 si la BD falla', async () => {
    const app = await buildApp(env, {
      checkDb: async () => {
        throw new Error('x');
      },
    });
    expect((await app.inject({ url: '/health' })).statusCode).toBe(503);
  });
  it('404 uniforme', async () => {
    const app = await buildApp(env);
    expect((await app.inject({ url: '/nope' })).json().error).toBe('not_found');
  });
  it('CORS cerrado sin orígenes configurados', async () => {
    const app = await buildApp(env);
    const res = await app.inject({ url: '/health', headers: { origin: 'https://evil.example' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('enmascara celulares', () => {
    expect(maskPhones('envío a +57 300 123 4567 falló')).not.toContain('300');
  });
});
