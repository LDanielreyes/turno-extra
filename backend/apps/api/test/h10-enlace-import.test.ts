import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { dispatchOnce, handleInbound, rowsOf, type Channel, type OutMessage } from '@turnoextra/channels';
import { createWorld, type World } from './world.js';

// Alta más ágil: enlace personal por persona (Telegram sin pedir celular) y carga masiva de la banca.
let w: World;

class Rec implements Channel {
  sent: { to: string; msg: OutMessage }[] = [];
  constructor(readonly name: 'whatsapp' | 'telegram') {}
  async send(to: string, msg: OutMessage) {
    this.sent.push({ to, msg });
    return { externalId: `${this.name}.${this.sent.length}` };
  }
}
const wa = new Rec('whatsapp');
const tg = new Rec('telegram');
const channels = () => new Map<string, Channel>([['whatsapp', wa], ['telegram', tg]]);
const engine = { policyUrl: 'https://turnoextra.test/legal', telegramBot: 'turnoextra_bot', appUrl: 'https://turnoextra.test' };

beforeAll(async () => {
  w = await createWorld({ TELEGRAM_BOT_USERNAME: 'turnoextra_bot', RATE_LIMIT_MAX: 100_000 });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
let n = 0;
const newPhone = () => `+57313${String(8880000 + n++)}`;
const newChat = () => String(770_000_000 + n++);

async function flush() {
  for (let i = 0; i < 6; i++) if (!(await dispatchOnce(w.t.db, channels())).claimed) break;
}
async function tgSay(chat: string, what: { text?: string; button?: string }) {
  const before = tg.sent.length;
  const r = await handleInbound(w.t.db, engine, {
    canal: 'telegram', externalId: randomUUID(), from: chat,
    ...(what.text !== undefined ? { text: what.text } : {}),
    ...(what.button ? { buttonId: what.button } : {}),
  });
  await flush();
  return { ...r, replies: tg.sent.slice(before).filter((s) => s.to === chat).map((s) => s.msg) };
}

async function register(nombre: string) {
  const r = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre, celular: newPhone(), roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}
const link = (id: string) => w.api('POST', `/orgs/${w.A.orgId}/workers/${id}/enlace`, { cookie: w.A.cookie });
const tokenOf = (url: string) => /start=I-([A-Za-z0-9_-]+)$/.exec(url)![1]!;

describe('enlace personal', () => {
  it('el enlace identifica a la persona: no pide celular, vincula el chat y sigue al «Acepto»', async () => {
    const id = await register('Enlace Uno');
    const r = await link(id);
    expect(r.statusCode).toBe(200);
    const { telegramUrl, mensaje } = r.json();
    expect(telegramUrl).toMatch(/^https:\/\/t\.me\/turnoextra_bot\?start=I-[A-Za-z0-9_-]{20,}$/);
    expect(mensaje).toContain(telegramUrl);
    expect(mensaje).toContain('Enlace');

    const chat = newChat();
    const open = await tgSay(chat, { text: `/start I-${tokenOf(telegramUrl)}` });
    expect(open.handled).toBe('consent_requested');
    expect(open.replies[0]!.requestContact).toBeUndefined();
    expect(open.replies[0]!.buttons).toHaveLength(2);

    const yes = await tgSay(chat, { button: open.replies[0]!.buttons![0]!.id });
    expect(yes.handled).toBe('consent_accepted');
    const reqs = await owner<{ n: number }>(sql`SELECT count(*)::int AS n FROM role_requirements WHERE role_id = ${w.roleId('mesero')} AND obligatorio`);
    if (reqs[0]!.n > 0) expect(yes.replies[0]!.text).toContain('https://turnoextra.test/yo');

    const row = await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE id = ${id}`);
    expect(row[0]!.estado).toBe('activo');
    const ch = await owner<{ identificador: string; habilitado: boolean }>(
      sql`SELECT ch.identificador, ch.habilitado FROM worker_channels ch JOIN org_workers ow ON ow.worker_id = ch.worker_id WHERE ow.id = ${id} AND ch.canal = 'telegram'`,
    );
    expect(ch).toEqual([{ identificador: chat, habilitado: true }]);
  });

  it('es de un solo uso y el token no queda guardado en claro', async () => {
    const id = await register('Enlace Dos');
    const token = tokenOf((await link(id)).json().telegramUrl);
    const stored = await owner<{ token_hash: string }>(sql`SELECT token_hash FROM worker_invites WHERE org_worker_id = ${id}`);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.token_hash).not.toContain(token);

    expect((await tgSay(newChat(), { text: `/start I-${token}` })).handled).toBe('consent_requested');
    const again = await tgSay(newChat(), { text: `/start I-${token}` });
    expect(again.handled).toBe('telegram_invite_invalid');
    expect(again.replies[0]!.text).toContain('venció');
  });

  it('generar uno nuevo invalida el anterior; un token inventado o vencido no abre nada', async () => {
    const id = await register('Enlace Tres');
    const first = tokenOf((await link(id)).json().telegramUrl);
    const second = tokenOf((await link(id)).json().telegramUrl);
    expect((await tgSay(newChat(), { text: `/start I-${first}` })).handled).toBe('telegram_invite_invalid');
    expect((await tgSay(newChat(), { text: '/start I-abcdefghijklmnopqrstuvwxyz' })).handled).toBe('telegram_invite_invalid');

    await owner(sql`UPDATE worker_invites SET expires_at = now() - interval '1 minute' WHERE org_worker_id = ${id}`);
    expect((await tgSay(newChat(), { text: `/start I-${second}` })).handled).toBe('telegram_invite_invalid');
    const row = await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE id = ${id}`);
    expect(row[0]!.estado).toBe('pendiente');
  });

  it('un chat ya vinculado a otra persona no puede usar el enlace de alguien más', async () => {
    const a = await register('Enlace Cuatro');
    const b = await register('Enlace Cinco');
    const chat = newChat();
    const open = await tgSay(chat, { text: `/start I-${tokenOf((await link(a)).json().telegramUrl)}` });
    await tgSay(chat, { button: open.replies[0]!.buttons![0]!.id });

    const r = await tgSay(chat, { text: `/start I-${tokenOf((await link(b)).json().telegramUrl)}` });
    expect(r.handled).toBe('telegram_taken');
    const row = await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE id = ${b}`);
    expect(row[0]!.estado).toBe('pendiente');
  });

  it('solo para quien aún no acepta y solo de tu propia banca', async () => {
    const id = await register('Enlace Seis');
    const open = await tgSay(newChat(), { text: `/start I-${tokenOf((await link(id)).json().telegramUrl)}` });
    await tgSay(tg.sent.at(-1)!.to, { button: open.replies[0]!.buttons![0]!.id });
    expect((await link(id)).statusCode).toBe(409);

    const other = await register('Enlace Siete');
    const foreign = await w.api('POST', `/orgs/${w.B.orgId}/workers/${other}/enlace`, { cookie: w.B.cookie });
    expect(foreign.statusCode).toBe(404);
  });
});

describe('carga masiva', () => {
  const imp = (body: unknown) => w.api('POST', `/orgs/${w.A.orgId}/workers/import`, { cookie: w.A.cookie, body });

  it('crea las válidas y devuelve las que fallan con su fila y motivo', async () => {
    const dup = newPhone();
    const first = await imp({ roleId: w.roleId('mesero'), personas: [{ nombre: 'Masivo Uno', celular: dup }] });
    expect(first.json()).toEqual({ creados: 1, errores: [] });

    const r = await imp({
      roleId: w.roleId('mesero'),
      personas: [
        { nombre: 'Masivo Dos', celular: newPhone() },
        { nombre: 'Masivo Tres', celular: '12345' },
        { nombre: 'Masivo Cuatro', celular: dup },
        { nombre: 'Masivo Cinco', celular: newPhone(), roleId: randomUUID() },
        { nombre: 'Masivo Seis', celular: newPhone() },
      ],
    });
    expect(r.statusCode).toBe(200);
    const out = r.json();
    expect(out.creados).toBe(2);
    expect(out.errores.map((e: { fila: number; error: string }) => [e.fila, e.error])).toEqual([
      [2, 'invalid_phone'], [3, 'conflict'], [4, 'role_not_enabled'],
    ]);
    const rows = await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE org_id = ${w.A.orgId} AND nombre LIKE 'Masivo%'`);
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.estado === 'pendiente')).toBe(true);
  });

  it('valida el cuerpo y exige ser admin de esa org', async () => {
    expect((await imp({ roleId: w.roleId('mesero'), personas: [] })).statusCode).toBe(400);
    expect((await imp({ roleId: 'x', personas: [{ nombre: 'Ab', celular: '3001234567' }] })).statusCode).toBe(400);
    const foreign = await w.api('POST', `/orgs/${w.A.orgId}/workers/import`, { cookie: w.B.cookie, body: { roleId: w.roleId('mesero'), personas: [{ nombre: 'Ajeno Uno', celular: newPhone() }] } });
    expect([401, 403, 404]).toContain(foreign.statusCode);
    expect(await owner(sql`SELECT 1 FROM org_workers WHERE nombre = 'Ajeno Uno'`)).toHaveLength(0);
  });
});

describe('cédula como requisito fijo', () => {
  const reqsOf = (roleId: string) =>
    owner<{ tipo_documento: string; obligatorio: boolean; vigencia_requerida: boolean }>(
      sql`SELECT tipo_documento, obligatorio, vigencia_requerida FROM role_requirements WHERE role_id = ${roleId} ORDER BY tipo_documento`);

  it('el super admin no puede quitarla ni volverla opcional al editar los requisitos de un rol', async () => {
    const id = w.roleId('mesero');
    const r = await w.api('PUT', `/admin/roles/${id}/requirements`, {
      cookie: w.superCookie,
      body: [{ tipoDocumento: 'carnet_manipulacion_alimentos' }, { tipoDocumento: 'cedula', obligatorio: false, vigenciaRequerida: true }],
    });
    expect(r.statusCode).toBe(200);
    expect(await reqsOf(id)).toEqual([
      { tipo_documento: 'carnet_manipulacion_alimentos', obligatorio: true, vigencia_requerida: true },
      { tipo_documento: 'cedula', obligatorio: true, vigencia_requerida: false },
    ]);
    // Aun con una lista vacía queda la cédula.
    expect((await w.api('PUT', `/admin/roles/${id}/requirements`, { cookie: w.superCookie, body: [] })).statusCode).toBe(200);
    expect((await reqsOf(id)).map((x) => x.tipo_documento)).toEqual(['cedula']);
    // Se restablece el carnet para no afectar a otras pruebas.
    await w.api('PUT', `/admin/roles/${id}/requirements`, { cookie: w.superCookie, body: [{ tipoDocumento: 'carnet_manipulacion_alimentos' }] });
  });

  it('un rol nuevo nace con la cédula', async () => {
    const r = await w.api('POST', '/admin/roles', { cookie: w.superCookie, body: { slug: 'steward-prueba', nombre: 'Steward de prueba' } });
    expect(r.statusCode).toBe(201);
    expect((await reqsOf(r.json().id)).map((x) => x.tipo_documento)).toEqual(['cedula']);
  });
});
