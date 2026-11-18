import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withSuper } from '@turnoextra/db';
import {
  TelegramChannel, dispatchOnce, handleInbound, parseTelegramUpdate, raiseAlert, rowsOf, type Channel, type OutMessage,
} from '@turnoextra/channels';
import { createWorld, env, type World } from './world.js';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { MemoryEmailProvider } from '../src/email.js';

// H8: Telegram como canal pleno — alta directa del personal desde el QR y avisos al gerente.
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
const engine = { policyUrl: 'https://turnoextra.test/legal', telegramBot: 'turnoextra_bot' };

beforeAll(async () => {
  w = await createWorld({ TELEGRAM_BOT_USERNAME: 'turnoextra_bot', RATE_LIMIT_MAX: 100_000 });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
let n = 0;
const newPhone = () => `+57312${String(7770000 + n++)}`;
const newChat = () => String(880_000_000 + n++);

async function flush() {
  for (let i = 0; i < 6; i++) if (!(await dispatchOnce(w.t.db, channels())).claimed) break;
}
type In = { text?: string; button?: string; contact?: { phone: string; own: boolean } };
/** Mensaje entrante por Telegram desde `chat`; devuelve lo que el bot respondió a ese chat. */
async function tgSay(chat: string, what: In) {
  const before = tg.sent.length;
  const r = await handleInbound(w.t.db, engine, {
    canal: 'telegram', externalId: randomUUID(), from: chat,
    ...(what.text !== undefined ? { text: what.text } : {}),
    ...(what.button ? { buttonId: what.button } : {}),
    ...(what.contact ? { contact: what.contact } : {}),
  });
  await flush();
  return { ...r, replies: tg.sent.slice(before).filter((s) => s.to === chat).map((s) => s.msg) };
}

/** Persona registrada por Org A (pendiente); devuelve su id y celular. */
async function registered(nombre: string) {
  const phone = newPhone();
  const r = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre, celular: phone, roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  const id = (await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${r.json().id}`))[0]!.worker_id;
  return { id, phone };
}
const inviteCode = async () => (await w.api('GET', `/orgs/${w.A.orgId}/invitacion`, { cookie: w.A.cookie })).json().codigo as string;

describe('alta directa por Telegram', () => {
  it('la invitación trae el enlace de Telegram con el código de la org', async () => {
    const r = (await w.api('GET', `/orgs/${w.A.orgId}/invitacion`, { cookie: w.A.cookie })).json();
    expect(r.telegramUrl).toBe(`https://t.me/turnoextra_bot?start=ALTA-${r.codigo}`);
    expect(r.telegramUrl).toMatch(/start=[A-Za-z0-9_-]{1,64}$/);
  });

  it('/start ALTA-código pide el celular; con el propio queda en la lista y Telegram es su canal principal', async () => {
    const p = await registered('Tele Uno');
    const chat = newChat();
    const code = await inviteCode();

    const ask = await tgSay(chat, { text: `/start ALTA-${code}` });
    expect(ask.handled).toBe('telegram_alta_contact_requested');
    expect(ask.replies[0]!.requestContact).toBe('Compartir mi celular');

    // Telegram entrega el celular sin «+»: se normaliza igual que el remitente de WhatsApp.
    const got = await tgSay(chat, { contact: { phone: p.phone.replace(/\D/g, ''), own: true } });
    expect(got.handled).toBe('consent_requested');
    expect(got.replies[0]).toMatchObject({ text: 'Recibimos tu celular.', removeKeyboard: true });
    const consent = got.replies[1]!;
    expect(consent.text).toContain('por Telegram');

    const yes = await tgSay(chat, { button: consent.buttons![0]!.id });
    expect(yes.handled).toBe('consent_accepted');

    const link = await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE worker_id = ${p.id} AND org_id = ${w.A.orgId}`);
    expect(link[0]!.estado).toBe('activo');
    const ch = await owner<{ canal: string; identificador: string; habilitado: boolean; prioridad: number }>(
      sql`SELECT canal, identificador, habilitado, prioridad FROM worker_channels WHERE worker_id = ${p.id} ORDER BY canal`,
    );
    expect(ch).toEqual([{ canal: 'telegram', identificador: chat, habilitado: true, prioridad: 10 }]);
    const cons = await owner<{ canal: string }>(sql`SELECT canal FROM worker_consents WHERE worker_id = ${p.id}`);
    expect(cons.map((c) => c.canal)).toEqual(['telegram']);
    const aud = await owner<{ accion: string }>(sql`SELECT accion FROM audit_log WHERE entidad_id = ${p.id} AND accion = 'worker.channel_enabled'`);
    expect(aud).toHaveLength(1);

    // Un /start ALTA repetido desde el chat ya vinculado responde como un ALTA repetido.
    expect((await tgSay(chat, { text: `/start ALTA-${code}` })).handled).toBe('alta_already');
  });

  it('rechaza un contacto ajeno y no vincula nada', async () => {
    const p = await registered('Tele Dos');
    const chat = newChat();
    await tgSay(chat, { text: `/start ALTA-${await inviteCode()}` });
    const r = await tgSay(chat, { contact: { phone: p.phone, own: false } });
    expect(r.handled).toBe('telegram_contact_not_own');
    expect(r.replies[0]!.requestContact).toBe('Compartir mi celular');
    const ch = await owner(sql`SELECT 1 FROM worker_channels WHERE worker_id = ${p.id}`);
    expect(ch).toHaveLength(0);
    // Sigue pudiendo compartir el propio después.
    expect((await tgSay(chat, { contact: { phone: p.phone, own: true } })).handled).toBe('consent_requested');
  });

  it('celular que la empresa no registró: no lo encuentra y no crea canal', async () => {
    const chat = newChat();
    await tgSay(chat, { text: `/start ALTA-${await inviteCode()}` });
    const r = await tgSay(chat, { contact: { phone: newPhone(), own: true } });
    expect(r.handled).toBe('alta_not_found');
    const ch = await owner(sql`SELECT 1 FROM worker_channels WHERE canal = 'telegram' AND identificador = ${chat}`);
    expect(ch).toHaveLength(0);
  });

  it('contacto sin /start previo (o vencido) pide volver a escanear; código de org inexistente da ayuda', async () => {
    expect((await tgSay(newChat(), { contact: { phone: newPhone(), own: true } })).handled).toBe('telegram_alta_expired');
    expect((await tgSay(newChat(), { text: '/start ALTA-NOEXISTE' })).handled).toBe('help');
  });

  it('parseTelegramUpdate marca si el contacto es el de la propia cuenta', () => {
    const base = { update_id: 1, message: { chat: { id: 55, type: 'private' }, from: { id: 55 } } };
    expect(parseTelegramUpdate({ ...base, message: { ...base.message, contact: { phone_number: '573001112233', user_id: 55 } } })[0])
      .toMatchObject({ canal: 'telegram', from: '55', contact: { phone: '573001112233', own: true } });
    expect(parseTelegramUpdate({ ...base, message: { ...base.message, contact: { phone_number: '573001112233', user_id: 99 } } })[0]!.contact!.own).toBe(false);
    expect(parseTelegramUpdate({ ...base, message: { ...base.message, contact: { phone_number: '573001112233' } } })[0]!.contact!.own).toBe(false);
  });

  it('TelegramChannel arma el teclado para pedir el celular y el que lo quita', async () => {
    const bodies: { reply_markup?: unknown }[] = [];
    const fetchFn = (async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const ch = new TelegramChannel({ token: 't', fetchFn });
    await ch.send('1', { text: 'a', requestContact: 'Compartir mi celular' });
    await ch.send('1', { text: 'b', removeKeyboard: true });
    expect(bodies[0]!.reply_markup).toEqual({ keyboard: [[{ text: 'Compartir mi celular', request_contact: true }]], resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Toca el botón de abajo' });
    expect(bodies[1]!.reply_markup).toEqual({ remove_keyboard: true });
  });
});

describe('avisos al gerente por Telegram', () => {
  it('sin vincular: estado disponible, 409 telegram_not_linked al activarlo; el PUT viejo sin telegram sigue sirviendo', async () => {
    expect((await w.api('GET', '/me/notification-telegram', { cookie: w.A.cookie })).json())
      .toEqual({ disponible: true, vinculado: false, vinculadoAt: null });
    const on = await w.api('PUT', '/me/notification-prefs', {
      cookie: w.A.cookie, body: { prefs: [{ evento: 'turno_vencido', panel: true, email: true, whatsapp: false, telegram: true }] },
    });
    expect(on.statusCode).toBe(409);
    expect(on.json()).toEqual({ error: 'telegram_not_linked', message: 'Vincula tu Telegram antes de activar los avisos por ese canal' });
    const old = await w.api('PUT', '/me/notification-prefs', {
      cookie: w.A.cookie, body: { prefs: [{ evento: 'turno_vencido', panel: true, email: false, whatsapp: false }] },
    });
    expect(old.statusCode).toBe(200);
    expect(old.json().prefs.find((p: { evento: string }) => p.evento === 'turno_vencido')).toMatchObject({ email: false, telegram: false });
  });

  it('vincula con /start G-código (un solo uso), recibe alertas por Telegram y se desvincula', async () => {
    const chat = newChat();
    const link = await w.api('POST', '/me/notification-telegram', { cookie: w.A.cookie });
    expect(link.statusCode).toBe(200);
    const { url, expiresAt } = link.json();
    expect(url).toMatch(/^https:\/\/t\.me\/turnoextra_bot\?start=G-[A-Z0-9]+$/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    const code = /start=(G-[A-Z0-9]+)$/.exec(url)![1]!;

    const ok = await tgSay(chat, { text: `/start ${code}` });
    expect(ok.handled).toBe('manager_telegram_linked');
    expect((await tgSay(newChat(), { text: `/start ${code}` })).handled).toBe('manager_telegram_invalid');

    const st = (await w.api('GET', '/me/notification-telegram', { cookie: w.A.cookie })).json();
    expect(st).toMatchObject({ disponible: true, vinculado: true });
    expect(typeof st.vinculadoAt).toBe('string');

    // Activa Telegram solo para cancelaciones; el PUT sin `telegram` en otro evento no lo toca.
    const put = await w.api('PUT', '/me/notification-prefs', {
      cookie: w.A.cookie, body: { prefs: [{ evento: 'cancelacion_asistencia', panel: true, email: true, whatsapp: false, telegram: true }] },
    });
    expect(put.statusCode).toBe(200);
    const keep = await w.api('PUT', '/me/notification-prefs', {
      cookie: w.A.cookie, body: { prefs: [{ evento: 'cancelacion_asistencia', panel: true, email: false, whatsapp: false }] },
    });
    expect(keep.json().prefs.find((p: { evento: string }) => p.evento === 'cancelacion_asistencia')).toMatchObject({ email: false, telegram: true });

    const outTo = async (to: string) => Number((await owner<{ n: number }>(sql`SELECT count(*)::int AS n FROM outbox WHERE canal = 'telegram' AND destinatario = ${to}`))[0]!.n);
    const before = await outTo(chat);
    await withSuper(w.t.db, (tx) => raiseAlert(tx, { orgId: w.A.orgId, tipo: 'cancelacion_asistencia' }));
    expect(await outTo(chat)).toBe(before + 1);
    // Evento sin Telegram activado: no se encola por Telegram.
    await withSuper(w.t.db, (tx) => raiseAlert(tx, { orgId: w.A.orgId, tipo: 'turno_vencido' }));
    expect(await outTo(chat)).toBe(before + 1);

    // Otro gerente no puede tomar el mismo chat.
    const other = (await w.api('POST', '/me/notification-telegram', { cookie: w.B.cookie })).json();
    expect((await tgSay(chat, { text: `/start ${/start=(G-[A-Z0-9]+)$/.exec(other.url)![1]}` })).handled).toBe('manager_telegram_taken');

    const del = await w.api('DELETE', '/me/notification-telegram', { cookie: w.A.cookie });
    expect(del.json()).toEqual({ disponible: true, vinculado: false, vinculadoAt: null });
    const prefs = (await w.api('GET', '/me/notification-prefs', { cookie: w.A.cookie })).json().prefs as { telegram: boolean }[];
    expect(prefs.every((p) => p.telegram === false)).toBe(true);
  });

  it('sin bot configurado: POST responde 409 telegram_off y la invitación no trae enlace de Telegram', async () => {
    // Misma base y misma sesión, pero una app sin TELEGRAM_BOT_USERNAME.
    const app2 = await buildApp(env, { db: w.t.db, auth: createAuth({ db: w.t.db, env, email: new MemoryEmailProvider() }) });
    const call = (method: 'GET' | 'POST', url: string) =>
      app2.inject({ method, url, headers: { origin: env.APP_URL, cookie: w.A.cookie } });
    try {
      const r = await call('POST', '/me/notification-telegram');
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toBe('telegram_off');
      expect((await call('GET', '/me/notification-telegram')).json().disponible).toBe(false);
      expect((await call('GET', `/orgs/${w.A.orgId}/invitacion`)).json().telegramUrl).toBeNull();
    } finally {
      await app2.close();
    }
  });
});
