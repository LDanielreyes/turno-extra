import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { user } from '@turnoextra/db';
import { tick } from '@turnoextra/channels';
import { createAuth } from '../src/auth/auth.js';
import { MemoryEmailProvider } from '../src/email.js';
import { feriaLinkTelegram, feriaLive, feriaSeed } from '../src/feria.js';
import { createWorld, env, PASSWORD } from './world.js';

// La siembra de la feria debe dejar datos que la API sirve tal cual, sin que el motor de turnos escriba a nadie.
describe('feria-seed', () => {
  it('siembra orgs, banca, turnos y un turno en vivo coherentes', async () => {
    const w = await createWorld();
    const auth = createAuth({ db: w.t.db, env, email: new MemoryEmailProvider(), allowOpenSignup: true });
    const signUp = async (mail: string, name: string) => {
      await auth.api.signUpEmail({ body: { email: mail, name, password: PASSWORD } });
      const [row] = await w.t.db.update(user).set({ emailVerified: true }).where(eq(user.email, mail)).returning({ id: user.id });
      return row!.id;
    };
    const r = await feriaSeed(w.t.db, signUp);
    expect(r.already).toBe(false);
    expect((await feriaSeed(w.t.db, signUp)).already).toBe(true);

    const login = await w.api('POST', '/api/auth/sign-in/email', { body: { email: 'gerencia.hotel@example.com', password: PASSWORD } });
    expect(login.statusCode).toBe(200);
    const cookie = ([] as string[]).concat(login.headers['set-cookie'] as string[]).map((c) => c.split(';')[0]).join('; ');
    const me = (await w.api('GET', '/me', { cookie })).json();
    const orgId = me.memberships[0].orgId as string;

    const shifts = (await w.api('GET', `/orgs/${orgId}/shifts`, { cookie })).json().shifts;
    expect(shifts.length).toBeGreaterThanOrEqual(14);
    if (r.already) return;
    const live = (await w.api('GET', `/orgs/${orgId}/shifts/${r.live.shiftId}`, { cookie })).json();
    expect(live.confirmados).toBe(1);
    const offers = (await w.api('GET', `/orgs/${orgId}/shifts/${r.live.shiftId}/offers`, { cookie })).json().ofertas;
    expect(offers.length).toBeGreaterThanOrEqual(7);
    const banca = (await w.api('GET', `/orgs/${orgId}/workers`, { cookie })).json().workers as { canales: string[]; respondioPor: string | null }[];
    expect(banca.length).toBe(16);
    // La banca dice por qué canales se puede llegar a cada persona y por cuál respondió.
    expect(banca.some((x) => x.canales.includes('telegram'))).toBe(true);
    expect(banca.some((x) => x.canales.includes('email'))).toBe(true);
    expect(banca.some((x) => x.respondioPor !== null)).toBe(true);
    expect(JSON.stringify(banca)).not.toMatch(/@example\.com|\+57300/);
    expect((await w.api('GET', `/orgs/${orgId}/disputes?estado=abierta`, { cookie })).json().disputas.length).toBe(1);
    const team = (await w.api('GET', `/orgs/${orgId}/team`, { cookie })).json();
    expect(team.members.length + team.invitations.length).toBe(3);
    expect((await w.api('GET', `/orgs/${orgId}/alerts?solo=pendientes`, { cookie })).json().pendientes).toBe(2);
    expect((await w.api('GET', `/orgs/${orgId}/reports/monthly?mes=${new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 7)}`, { cookie })).statusCode).toBe(200);
    expect((await w.api('GET', '/admin/orgs', { cookie: w.superCookie })).json().orgs.length).toBeGreaterThanOrEqual(5);

    // El motor no encuentra a nadie nuevo a quien ofrecer: la cola de salida queda vacía.
    await w.t.asOwner((o) => o.execute(sql`UPDATE shifts SET last_wave_at = now() - interval '1 hour'`));
    await tick(w.t.db);
    const out = await w.t.asOwner((o) => o.execute(sql`SELECT count(*)::int AS n FROM outbox`));
    expect(((out as unknown as { rows: { n: number }[] }).rows ?? (out as unknown as { n: number }[]))[0]!.n).toBe(0);

    // Registrar a una persona real con su Telegram ya vinculado (y repetible).
    const mine = { orgSlug: 'hotel-demo', celular: '+573105550199', nombre: 'Yo (demo)', chatId: '777000111', roleSlug: 'mesero' };
    await feriaLinkTelegram(w.t.db, mine);
    await feriaLinkTelegram(w.t.db, mine);
    const after = (await w.api('GET', `/orgs/${orgId}/workers`, { cookie })).json().workers as { nombre: string; estado: string; canales: string[] }[];
    const me17 = after.filter((x) => x.nombre === 'Yo (demo)');
    expect(me17).toHaveLength(1);
    expect(me17[0]).toMatchObject({ estado: 'activo', canales: ['telegram'] });

    // feria-live se puede repetir: el anterior queda cancelado.
    const again = await feriaLive(w.t.db);
    const old = (await w.api('GET', `/orgs/${orgId}/shifts/${r.live.shiftId}`, { cookie })).json();
    expect(old.shift.estado).toBe('cancelado');
    expect(again.shiftId).not.toBe(r.live.shiftId);
  }, 120_000);
});
