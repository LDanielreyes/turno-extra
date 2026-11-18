import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  EmailChannel, SendError, TelegramChannel, dispatchOnce, handleInbound, parseTelegramUpdate, rowsOf, signLink, tick, verifyLink,
  type Channel, type OutMessage,
} from '@turnoextra/channels';
import { createWorld, env, type World } from './world.js';

const TG_SECRET = 'secreto-telegram-de-prueba';
let w: World;

class Rec implements Channel {
  sent: { to: string; msg: OutMessage }[] = [];
  fail?: SendError;
  constructor(readonly name: 'whatsapp' | 'telegram') {}
  async send(to: string, msg: OutMessage) {
    if (this.fail) throw this.fail;
    this.sent.push({ to, msg });
    return { externalId: `${this.name}.${this.sent.length}` };
  }
}
const wa = new Rec('whatsapp');
const tg = new Rec('telegram');
const mails: { to: string; subject: string; text: string }[] = [];
const emailChannel = new EmailChannel({
  send: async (m) => void mails.push(m),
  baseUrl: 'http://localhost:3000',
  secret: env.BETTER_AUTH_SECRET,
});
const channels = () => new Map<string, Channel>([['whatsapp', wa], ['telegram', tg], ['email', emailChannel]]);
const engine = { policyUrl: 'https://turnoextra.test/legal', telegramBot: 'turnoextra_bot' };

beforeAll(async () => {
  w = await createWorld({ TELEGRAM_WEBHOOK_SECRET: TG_SECRET, TELEGRAM_BOT_USERNAME: 'turnoextra_bot', RATE_LIMIT_MAX: 100_000 });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

// Cada prueba parte de una banca y una agenda limpias: lo anterior sale de circulación para no recibir ofertas.
beforeEach(async () => {
  await w.t.asOwner(async (o) => {
    await o.execute(sql`UPDATE org_workers SET estado = 'baja_org' WHERE estado = 'activo'`);
    await o.execute(sql`UPDATE shifts SET estado = 'cancelado' WHERE estado IN ('abierto','cubierto')`);
  });
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
let n = 0;
const newPhone = () => `+57311${String(6660000 + n++)}`;
const digits = (p: string) => p.replace(/\D/g, '');
const hours = (d: number, h: number) => new Date(Date.now() + d * 86400_000 + h * 3600_000).toISOString();
let day = 10;
const nextDay = () => (day += 2);

type Person = { id: string; phone: string; chat?: string };

/** Persona activa en Org A con documento aprobado y WhatsApp habilitado (flujo real: ALTA → Acepto). */
async function mkWorker(nombre: string, org = w.A): Promise<Person> {
  const phone = newPhone();
  const r = await w.api('POST', `/orgs/${org.orgId}/workers`, { cookie: org.cookie, body: { nombre, celular: phone, roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  const linkId = r.json().id as string;
  const id = (await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${linkId}`))[0]!.worker_id;
  const code = (await w.api('GET', `/orgs/${org.orgId}/invitacion`, { cookie: org.cookie })).json().codigo as string;
  const ask = await say({ phone }, `ALTA ${code}`);
  await say({ phone }, { button: ask.replies[0]!.buttons![0]!.id });
  // El candidato sube el documento desde su panel; aquí se siembra y la empresa lo aprueba.
  const [d] = await owner<{ id: string }>(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, vence_at) SELECT org_id, worker_id, 'carnet_manipulacion_alimentos', '2030-01-01' FROM org_workers WHERE id = ${linkId} RETURNING id`);
  await w.api('PATCH', `/orgs/${org.orgId}/documents/${d!.id}`, { cookie: org.cookie, body: { estado: 'aprobado' } });
  return { id, phone };
}

type Who = { phone: string; chat?: string };
/** Mensaje entrante; devuelve lo que se entregó como respuesta por el canal por el que se escribió. */
async function say(who: Who, what: string | { button: string }, canal: 'whatsapp' | 'telegram' = 'whatsapp') {
  const rec = canal === 'whatsapp' ? wa : tg;
  const before = rec.sent.length;
  const r = await handleInbound(w.t.db, engine, {
    canal, externalId: randomUUID(), from: canal === 'whatsapp' ? digits(who.phone) : who.chat!,
    ...(typeof what === 'string' ? { text: what } : { buttonId: what.button }),
  });
  await flush();
  return { ...r, replies: rec.sent.slice(before).map((s) => s.msg) };
}
async function flush() {
  for (let i = 0; i < 6; i++) if (!(await dispatchOnce(w.t.db, channels())).claimed) break;
}
/** Un ciclo del worker: motor de turnos + vaciado de la cola. */
async function cycle() {
  const t = await tick(w.t.db);
  await flush();
  return t;
}
const age = (shiftId: string) => owner(sql`UPDATE shifts SET last_wave_at = now() - interval '10 minutes' WHERE id = ${shiftId}`);

async function mkShift(cupos: number, org = w.A) {
  const d = nextDay();
  const r = await w.api('POST', `/orgs/${org.orgId}/shifts`, {
    cookie: org.cookie, body: { inicio: hours(d, 0), fin: hours(d, 5), roleId: w.roleId('mesero'), cupos, pagoTotal: 400_000 },
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}
const offerOf = async (shiftId: string, workerId: string) =>
  (await owner<{ id: string; status: string; canal_usado: string | null; responded_canal: string | null }>(
    sql`SELECT id, status, canal_usado, responded_canal FROM shift_offers WHERE shift_id = ${shiftId} AND worker_id = ${workerId}`,
  ))[0];
const offerCount = async (shiftId: string) =>
  Number((await owner<{ n: number }>(sql`SELECT count(*)::int AS n FROM shift_offers WHERE shift_id = ${shiftId}`))[0]!.n);
const assignStates = async (shiftId: string) =>
  Object.fromEntries((await owner<{ status: string; n: number }>(sql`SELECT status, count(*)::int AS n FROM assignments WHERE shift_id = ${shiftId} GROUP BY status`)).map((r) => [r.status, Number(r.n)]));
const shiftEstado = async (shiftId: string) => (await owner<{ estado: string }>(sql`SELECT estado FROM shifts WHERE id = ${shiftId}`))[0]!.estado;
const respond = (p: Person, offerId: string, kind: 'ACCEPT' | 'DECLINE', canal: 'whatsapp' | 'telegram' = 'whatsapp') =>
  say(p, { button: `OFFER_${kind}:${offerId}` }, canal);
/** Mensajes entregados por WhatsApp a esa persona (las ofertas salen al +57…, las respuestas al número sin +). */
const sentTo = (p: Person) => wa.sent.filter((s) => digits(s.to) === digits(p.phone));
/** Última oferta (con botón de aceptar) entregada a esa persona por WhatsApp. */
const lastOffer = (p: Person) => wa.sent.filter((s) => s.to === p.phone && s.msg.buttons?.[0]?.id.startsWith('OFFER_ACCEPT')).at(-1)?.msg;

describe('oleadas y oferta', () => {
  it('la primera oleada ofrece a cupos×2 elegibles, por WhatsApp, con el texto de la oferta', async () => {
    const people = [await mkWorker('Ana'), await mkWorker('Beto'), await mkWorker('Caro'), await mkWorker('Dani'), await mkWorker('Eli')];
    const shift = await mkShift(1);
    // Solo participan quienes pueden: este test crea el turno después de registrar a todos.
    const t = await cycle();
    expect(t.waves).toBeGreaterThanOrEqual(1);
    expect(await offerCount(shift)).toBe(2);

    const first = await offerOf(shift, people[0]!.id);
    expect(first).toMatchObject({ status: 'sent', canal_usado: 'whatsapp' });
    const m = lastOffer(people[0]!)!;
    expect(m.text).toContain('Org A te ofrece un turno de');
    expect(m.text).toContain('Org A es quien te contrata y te paga');
    expect(m.buttons!.map((b) => b.title)).toEqual(['Aceptar', 'No puedo']);
    expect(m.buttons![0]!.id).toBe(`OFFER_ACCEPT:${first!.id}`);
    // Los demás todavía no tienen oferta.
    expect(await offerOf(shift, people[4]!.id)).toBeUndefined();

    // Sin esperar wave_minutes no sale otra oleada…
    await cycle();
    expect(await offerCount(shift)).toBe(2);
    // …y al vencer el espacio, sale la siguiente a quienes aún no tienen oferta.
    await age(shift);
    await cycle();
    expect(await offerCount(shift)).toBe(4);
    await age(shift);
    await cycle();
    expect(await offerCount(shift)).toBe(5);
    expect(Number((await owner<{ wave_count: number }>(sql`SELECT wave_count FROM shifts WHERE id = ${shift}`))[0]!.wave_count)).toBe(3);
  });

  it('quien no tiene ningún canal habilitado no recibe oferta', async () => {
    const p = await mkWorker('Sin canal');
    await owner(sql`UPDATE worker_channels SET habilitado = false WHERE worker_id = ${p.id}`);
    const shift = await mkShift(1);
    await cycle();
    expect(await offerOf(shift, p.id)).toBeUndefined();
  });

  it('aceptar confirma, llena el turno, manda a lista de espera y cierra cuando no hay cupo ni reserva', async () => {
    const ps: Person[] = [];
    for (const nombre of ['P1', 'P2', 'P3', 'P4']) ps.push(await mkWorker(nombre));
    const shift = await mkShift(1);
    // Cuatro personas pueden quedar con oferta (cupos×2=2 por oleada).
    for (let i = 0; i < 3; i++) {
      await cycle();
      await age(shift);
    }
    const offers = await Promise.all(ps.map(async (p) => (await offerOf(shift, p.id))!));
    const results: string[] = [];
    for (let i = 0; i < ps.length; i++) {
      const r = await respond(ps[i]!, offers[i]!.id, 'ACCEPT');
      results.push(r.handled);
    }
    // standby_max por defecto = 2: 1 confirmado, 2 en espera, 1 sin cupo.
    expect(results).toEqual(['offer_confirmed', 'offer_standby', 'offer_standby', 'offer_full']);
    expect(await assignStates(shift)).toEqual({ confirmed: 1, standby: 2 });
    expect(await shiftEstado(shift)).toBe('cubierto');
    expect(sentTo(ps[0]!).at(-1)!.msg.text).toContain('tienes el turno en Org A');
    expect(sentTo(ps[1]!).at(-1)!.msg.text).toContain('lista de espera');
    expect(sentTo(ps[3]!).at(-1)!.msg.text).toBe('Ese turno ya se cubrió. Gracias por responder.');
  });

  it('12 aceptaciones simultáneas para 3 cupos: nunca más de 3 confirmados', async () => {
    const ps: Person[] = [];
    for (let i = 0; i < 12; i++) ps.push(await mkWorker(`Carga ${i}`));
    const shift = await mkShift(3);
    for (let i = 0; i < 4; i++) {
      await cycle();
      await age(shift);
    }
    const offers = await Promise.all(ps.map(async (p) => (await offerOf(shift, p.id))!));
    const results = await Promise.all(ps.map((p, i) => respond(p, offers[i]!.id, 'ACCEPT')));
    const count = (k: string) => results.filter((r) => r.handled === k).length;
    expect(count('offer_confirmed')).toBe(3);
    expect(count('offer_standby')).toBe(2);
    expect(count('offer_full')).toBe(7);
    expect(await assignStates(shift)).toEqual({ confirmed: 3, standby: 2 });
  }, 120_000);

  it('rechazar cierra la oferta; repetir la misma respuesta da «Ya respondiste»', async () => {
    const p = await mkWorker('Rechaza');
    const shift = await mkShift(1);
    await cycle();
    const o = (await offerOf(shift, p.id))!;
    const r = await respond(p, o.id, 'DECLINE');
    expect(r.handled).toBe('offer_declined');
    expect(r.replies[0]!.text).toContain('no te avisaremos más');
    const again = await respond(p, o.id, 'ACCEPT');
    expect(again.handled).toBe('offer_already');
    expect(again.replies[0]!.text).toContain('Ya respondiste');
    expect(await assignStates(shift)).toEqual({});
  });

  it('una oferta ajena (otro id de oferta) no se puede responder', async () => {
    const a = await mkWorker('Dueña');
    const b = await mkWorker('Intrusa');
    const shift = await mkShift(2);
    await cycle();
    const o = (await offerOf(shift, a.id))!;
    const r = await respond(b, o.id, 'ACCEPT');
    expect(r.handled).toBe('offer_unavailable');
    expect((await offerOf(shift, a.id))!.status).toBe('sent');
  });
});

describe('NO PUEDO IR y lista de espera', () => {
  it('libera el cupo, sube la reserva más antigua (W9) y deja el rastro en bitácora', async () => {
    const [a, b, c] = [await mkWorker('Primero'), await mkWorker('Segundo'), await mkWorker('Tercero')];
    const shift = await mkShift(1);
    for (let i = 0; i < 2; i++) {
      await cycle();
      await age(shift);
    }
    for (const p of [a, b, c]) await respond(p, (await offerOf(shift, p.id))!.id, 'ACCEPT');
    expect(await assignStates(shift)).toEqual({ confirmed: 1, standby: 2 });

    const r = await say(a, 'no puedo ir');
    expect(r.handled).toBe('released');
    expect(r.replies.map((m) => m.text).join(' ')).toContain('liberamos tu cupo');
    // Sube el que aceptó primero entre las reservas (Segundo) y recibe W9.
    const promoted = (await owner<{ nombre: string }>(sql`
      SELECT ow.nombre FROM assignments x JOIN org_workers ow ON ow.worker_id = x.worker_id AND ow.org_id = x.org_id
      WHERE x.shift_id = ${shift} AND x.status = 'confirmed'`))[0]!.nombre;
    expect(promoted).toBe('Segundo');
    expect(sentTo(b).at(-1)!.msg.text).toContain('Se liberó un cupo');
    expect(await assignStates(shift)).toEqual({ confirmed: 1, standby: 1, cancelled: 1 });
    const acc = (await owner<{ accion: string }>(sql`SELECT accion FROM audit_log WHERE entidad_id = ${shift} ORDER BY id`)).map((x) => x.accion);
    expect(acc).toEqual(expect.arrayContaining(['assignment.released', 'assignment.promoted']));
  });

  it('si no hay reserva, el turno vuelve a abierto y el motor busca reemplazo', async () => {
    const [a, b] = [await mkWorker('Titular'), await mkWorker('Reemplazo')];
    const shift = await mkShift(1);
    await cycle();
    await respond(a, (await offerOf(shift, a.id))!.id, 'ACCEPT');
    expect(await shiftEstado(shift)).toBe('cubierto');
    // b también tiene oferta pendiente (misma oleada) pero aún no responde.
    await say(a, 'NO PUEDO IR');
    expect(await shiftEstado(shift)).toBe('abierto');
    const r = await respond(b, (await offerOf(shift, b.id))!.id, 'ACCEPT');
    expect(r.handled).toBe('offer_confirmed');
  });

  it('sin turnos próximos responde que no hay nada que liberar; con dos, pide elegir', async () => {
    const p = await mkWorker('Dos turnos');
    expect((await say(p, 'no puedo ir')).replies[0]!.text).toContain('No encontramos un turno');
    const s1 = await mkShift(1);
    const s2 = await mkShift(1);
    await cycle();
    await respond(p, (await offerOf(s1, p.id))!.id, 'ACCEPT');
    await respond(p, (await offerOf(s2, p.id))!.id, 'ACCEPT');
    const r = await say(p, 'No puedo ir.');
    expect(r.handled).toBe('release_choose');
    expect(r.replies[0]!.buttons).toHaveLength(2);
    expect(r.replies[0]!.buttons!.every((b) => b.id.startsWith('RELEASE:') && b.title.length <= 20)).toBe(true);
    const pick = await say(p, { button: r.replies[0]!.buttons![0]!.id });
    expect(pick.handled).toBe('released');
    expect(await assignStates(s1)).toEqual({ cancelled: 1 });
    expect(await assignStates(s2)).toEqual({ confirmed: 1 });
  });
});

describe('canales: Telegram y correo', () => {
  async function withTelegram(p: Person) {
    p.chat = String(900_000 + n++);
    const ask = await say(p, 'TELEGRAM');
    expect(ask.handled).toBe('telegram_code');
    const code = /start=([A-Z0-9]+)/.exec(ask.replies[0]!.text)![1]!;
    const ok = await say(p, `/start ${code}`, 'telegram');
    expect(ok.handled).toBe('telegram_linked');
    return code;
  }

  it('TELEGRAM da un código de un solo uso; /start CÓDIGO habilita el canal como respaldo', async () => {
    const p = await mkWorker('Con Telegram');
    const code = await withTelegram(p);
    const ch = await owner<{ canal: string; habilitado: boolean; prioridad: number; identificador: string }>(
      sql`SELECT canal, habilitado, prioridad, identificador FROM worker_channels WHERE worker_id = ${p.id} ORDER BY prioridad`,
    );
    expect(ch.map((c) => [c.canal, c.habilitado, c.prioridad])).toEqual([['whatsapp', true, 10], ['telegram', true, 20]]);
    // Reusar el código no sirve; un código inventado tampoco.
    const other = { phone: newPhone(), chat: '1234' };
    expect((await say(other, `/start ${code}`, 'telegram')).handled).toBe('telegram_invalid');
    expect((await say(other, '/start ZZZZZZZZZZ', 'telegram')).handled).toBe('telegram_invalid');
    expect((await say(other, '/start', 'telegram')).handled).toBe('telegram_invalid');
    // Un chat sin vincular no puede aceptar ofertas ni nada más: solo recibe ayuda.
    expect((await say(other, 'hola', 'telegram')).handled).toBe('help');
  });

  it('un chat ya vinculado a otra persona no se puede vincular a una segunda', async () => {
    const a = await mkWorker('Dueño del chat');
    await withTelegram(a);
    const b = await mkWorker('Quiere el mismo chat');
    const ask = await say(b, 'telegram');
    const code = /start=([A-Z0-9]+)/.exec(ask.replies[0]!.text)![1]!;
    const r = await say({ phone: b.phone, chat: a.chat }, `/start ${code}`, 'telegram');
    expect(r.handled).toBe('telegram_taken');
  });

  it('sin consentimiento activo no se puede pedir Telegram ni correo', async () => {
    const stranger = { phone: newPhone() };
    expect((await say(stranger, 'telegram')).handled).toBe('channel_need_active');
    expect((await say(stranger, 'correo a@b.co')).handled).toBe('channel_need_active');
  });

  it('T15: responde por WhatsApp y por Telegram la misma oferta: solo cuenta la primera, la otra recibe «Ya respondiste»', async () => {
    const p = await mkWorker('Doble canal');
    await withTelegram(p);
    const shift = await mkShift(2);
    await cycle();
    const o = (await offerOf(shift, p.id))!;
    // La oferta salió por un solo canal (WhatsApp, el prioritario); Telegram no recibió copia.
    expect(o.canal_usado).toBe('whatsapp');
    expect(tg.sent.filter((s) => s.to === p.chat && s.msg.buttons?.[0]?.id.startsWith('OFFER_'))).toHaveLength(0);

    const first = await respond(p, o.id, 'ACCEPT', 'whatsapp');
    const second = await respond(p, o.id, 'DECLINE', 'telegram');
    expect(first.handled).toBe('offer_confirmed');
    expect(second.handled).toBe('offer_already');
    expect(second.replies[0]!.text).toContain('Ya respondiste');
    expect(await assignStates(shift)).toEqual({ confirmed: 1 });
    const done = await offerOf(shift, p.id);
    expect(done).toMatchObject({ status: 'accepted', responded_canal: 'whatsapp' });
    // Y al revés: la que llega primero por Telegram gana.
    const p2 = await mkWorker('Doble canal 2');
    await withTelegram(p2);
    const shift2 = await mkShift(2);
    await cycle();
    const o2 = (await offerOf(shift2, p2.id))!;
    expect((await respond(p2, o2.id, 'DECLINE', 'telegram')).handled).toBe('offer_declined');
    expect((await respond(p2, o2.id, 'ACCEPT', 'whatsapp')).handled).toBe('offer_already');
    expect(await assignStates(shift2)).toEqual({});
  });

  it('T16: si WhatsApp falla, la oferta escala a Telegram: un solo envío efectivo y el cambio queda registrado', async () => {
    const p = await mkWorker('Escala');
    await withTelegram(p);
    const shift = await mkShift(1);
    wa.fail = new SendError('whatsapp 400: fuera de la ventana de 24 h', false);
    try {
      await cycle(); // oleada → intento por WhatsApp → falla definitiva
      const sentToTg = tg.sent.length;
      await cycle(); // escalada → Telegram
      expect(tg.sent.length).toBe(sentToTg + 1);
    } finally {
      wa.fail = undefined;
    }
    const o = (await offerOf(shift, p.id))!;
    expect(o).toMatchObject({ status: 'sent', canal_usado: 'telegram' });
    const offerMsgs = [...wa.sent, ...tg.sent].filter((s) => s.msg.buttons?.[0]?.id === `OFFER_ACCEPT:${o.id}`);
    expect(offerMsgs).toHaveLength(1);
    expect(offerMsgs[0]!.to).toBe(p.chat);
    const log = await owner<{ detalle: { de: string; a: string } }>(sql`SELECT detalle FROM audit_log WHERE accion = 'offer.escalated' AND entidad_id = ${o.id}`);
    expect(log.map((l) => l.detalle)).toEqual([{ de: 'whatsapp', a: 'telegram' }]);
    const deliveries = await owner<{ canal: string; estado: string }>(sql`SELECT canal, estado FROM offer_deliveries WHERE offer_id = ${o.id} ORDER BY id`);
    expect(deliveries).toEqual([{ canal: 'whatsapp', estado: 'failed' }, { canal: 'telegram', estado: 'sent' }]);
    // Responder por Telegram funciona.
    expect((await respond(p, o.id, 'ACCEPT', 'telegram')).handled).toBe('offer_confirmed');
  });

  it('T16b: si el mensaje queda atascado en cola, se anula y escala; el original nunca sale después', async () => {
    const p = await mkWorker('Atascada');
    await withTelegram(p);
    const shift = await mkShift(1);
    // Solo Telegram está activo en este ciclo: la oferta por WhatsApp queda esperando en la cola.
    await tick(w.t.db);
    const o = (await offerOf(shift, p.id))!;
    expect(o).toMatchObject({ status: 'queued', canal_usado: 'whatsapp' });
    await owner(sql`UPDATE outbox SET created_at = now() - interval '5 minutes' WHERE offer_id = ${o.id}`);
    const moved = await tick(w.t.db);
    expect(moved.escalated).toBe(1);
    expect((await offerOf(shift, p.id))!.canal_usado).toBe('telegram');
    // Aparece WhatsApp: la fila vieja ya no es enviable.
    await flush();
    const offerMsgs = [...wa.sent, ...tg.sent].filter((s) => s.msg.buttons?.[0]?.id === `OFFER_ACCEPT:${o.id}`);
    expect(offerMsgs).toHaveLength(1);
    expect(offerMsgs[0]!.to).toBe(p.chat);
  });

  it('una oferta ya respondida no se envía aunque siga en la cola', async () => {
    const p = await mkWorker('Respondió antes');
    const shift = await mkShift(2);
    await tick(w.t.db); // encola sin despachar
    const o = (await offerOf(shift, p.id))!;
    await owner(sql`UPDATE shift_offers SET status = 'declined' WHERE id = ${o.id}`);
    const before = wa.sent.length;
    await flush();
    expect(wa.sent.slice(before).filter((s) => s.msg.buttons?.[0]?.id === `OFFER_ACCEPT:${o.id}`)).toHaveLength(0);
  });

  it('si no queda ningún canal por probar, la oferta queda «undeliverable» y la oleada sigue con otros', async () => {
    const p = await mkWorker('Sin salida');
    const shift = await mkShift(1);
    wa.fail = new SendError('whatsapp 400: no permitido', false);
    try {
      await cycle();
      await cycle();
    } finally {
      wa.fail = undefined;
    }
    expect((await offerOf(shift, p.id))!.status).toBe('undeliverable');
  });

  it('T17: turno sin gente y con cupos libres relanza la búsqueda hasta el límite, respetando wave_minutes', async () => {
    const a = await mkWorker('Relanza A');
    const shift = await mkShift(1);
    await owner(sql`UPDATE orgs SET relaunch_limit = 2 WHERE id = ${w.A.orgId}`);
    await cycle();
    await respond(a, (await offerOf(shift, a.id))!.id, 'DECLINE');
    const relaunches = async () => Number((await owner<{ relaunches: number }>(sql`SELECT relaunches FROM shifts WHERE id = ${shift}`))[0]!.relaunches);

    await cycle(); // no pasaron wave_minutes: nada
    expect(await relaunches()).toBe(0);

    await age(shift);
    expect((await cycle()).relaunches).toBe(1); // relanza, pero no hay a quién ofrecer
    expect(await offerCount(shift)).toBe(1);

    // Llega una persona nueva entre relanzamientos: la recibe la siguiente oleada.
    const b = await mkWorker('Relanza B');
    await age(shift);
    expect((await cycle()).relaunches).toBe(1);
    expect(await relaunches()).toBe(2);
    expect((await offerOf(shift, b.id))!.status).toBe('sent');
    await respond(b, (await offerOf(shift, b.id))!.id, 'DECLINE');

    // Límite alcanzado: no hay más relanzamientos.
    await age(shift);
    expect((await cycle()).relaunches).toBe(0);
    expect(await relaunches()).toBe(2);
    const acc = await owner<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_log WHERE accion = 'shift.relaunched' AND entidad_id = ${shift}`);
    expect(Number(acc[0]!.n)).toBe(2);
  });
});

describe('vencimiento y cancelación', () => {
  it('un turno que ya empezó sin cubrirse vence; sus ofertas pasan a expiradas y responder da «no disponible»', async () => {
    const p = await mkWorker('Tarde');
    const shift = await mkShift(1);
    await cycle();
    const o = (await offerOf(shift, p.id))!;
    await owner(sql`UPDATE shifts SET inicio = now() - interval '1 hour', fin = now() + interval '4 hours' WHERE id = ${shift}`);
    expect((await cycle()).expired).toBeGreaterThanOrEqual(1);
    expect(await shiftEstado(shift)).toBe('vencido');
    expect((await offerOf(shift, p.id))!.status).toBe('expired');
    const r = await respond(p, o.id, 'ACCEPT');
    expect(r.handled).toBe('offer_unavailable');
    expect(r.replies[0]!.text).toBe('Ese turno ya no está disponible.');
  });

  it('cancelar el turno avisa (W11) a confirmados y reservas y cierra las ofertas abiertas', async () => {
    const [a, b, c] = [await mkWorker('Conf'), await mkWorker('Espera'), await mkWorker('Pendiente')];
    const shift = await mkShift(1);
    for (let i = 0; i < 2; i++) {
      await cycle();
      await age(shift);
    }
    await respond(a, (await offerOf(shift, a.id))!.id, 'ACCEPT');
    await respond(b, (await offerOf(shift, b.id))!.id, 'ACCEPT');
    const r = await w.api('POST', `/orgs/${w.A.orgId}/shifts/${shift}/cancel`, { cookie: w.A.cookie });
    expect(r.statusCode).toBe(200);
    await flush();
    for (const p of [a, b]) expect(sentTo(p).at(-1)!.msg.text).toContain('canceló el turno');
    expect((await offerOf(shift, c.id))!.status).toBe('cancelled');
    expect((await respond(c, (await offerOf(shift, c.id))!.id, 'ACCEPT')).handled).toBe('offer_unavailable');
    // Otra org no puede cancelarlo (T6).
    const other = await w.api('POST', `/orgs/${w.B.orgId}/shifts/${shift}/cancel`, { cookie: w.B.cookie });
    expect(other.statusCode).toBe(404);
  });

  it('BAJA cancela las ofertas abiertas y no confirma nada después', async () => {
    const p = await mkWorker('Se da de baja');
    const shift = await mkShift(2);
    await cycle();
    const o = (await offerOf(shift, p.id))!;
    expect((await say(p, 'BAJA')).handled).toBe('baja');
    expect((await offerOf(shift, p.id))!.status).toBe('cancelled');
    expect((await respond(p, o.id, 'ACCEPT')).handled).toBe('offer_unavailable');
    expect(await assignStates(shift)).toEqual({});
  });
});

describe('correo del candidato', () => {
  const tokenIn = (text: string) => /\/r\/([\w.-]+)/.exec(text)![1]!;

  it('CORREO manda un enlace de verificación; el GET solo muestra la página y el POST habilita el canal', async () => {
    const p = await mkWorker('Con correo');
    const ask = await say(p, 'CORREO Ana@Ejemplo.com');
    expect(ask.handled).toBe('email_verification_sent');
    const mail = mails.at(-1)!;
    expect(mail.to).toBe('ana@ejemplo.com');
    const token = tokenIn(mail.text);

    const page = await w.app.inject({ method: 'GET', url: `/r/${token}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Confirmar mi correo');
    expect(page.headers['content-security-policy']).toContain("form-action 'self'");
    expect(await owner(sql`SELECT 1 FROM worker_channels WHERE worker_id = ${p.id} AND canal = 'email'`)).toHaveLength(0);

    const done = await w.app.inject({ method: 'POST', url: `/r/${token}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(done.statusCode).toBe(200);
    expect(done.body).toContain('tu correo quedó activado');
    const ch = await owner<{ habilitado: boolean; prioridad: number; identificador: string }>(sql`SELECT habilitado, prioridad, identificador FROM worker_channels WHERE worker_id = ${p.id} AND canal = 'email'`);
    expect(ch).toEqual([{ habilitado: true, prioridad: 30, identificador: 'ana@ejemplo.com' }]);
    // Un solo uso.
    const again = await w.app.inject({ method: 'POST', url: `/r/${token}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(again.body).toContain('venció o no es válido');
  });

  it('direcciones inválidas se rechazan; enlaces manipulados o vencidos no funcionan', async () => {
    const p = await mkWorker('Correo malo');
    expect((await say(p, 'correo esto-no-es-correo')).handled).toBe('email_invalid');
    const token = signLink('VERIFY_EMAIL:ABC', env.BETTER_AUTH_SECRET, 1000, Date.now() - 5000);
    expect(verifyLink(token, env.BETTER_AUTH_SECRET)).toBeNull(); // vencido
    const good = signLink('OFFER_ACCEPT:x', env.BETTER_AUTH_SECRET, 60_000);
    expect(verifyLink(good, env.BETTER_AUTH_SECRET)).toBe('OFFER_ACCEPT:x');
    expect(verifyLink(good, 'otro-secreto')).toBeNull();
    const [payload, sig] = good.split('.');
    expect(verifyLink(`${Buffer.from('9999999999999.OFFER_ACCEPT:y').toString('base64url')}.${sig}`, env.BETTER_AUTH_SECRET)).toBeNull();
    expect(payload).toBeTruthy();
    expect((await w.app.inject({ method: 'GET', url: '/r/basura.basura' })).statusCode).toBe(404);
    expect((await w.app.inject({ method: 'POST', url: `/r/${signLink('BORRAR_TODO:1', env.BETTER_AUTH_SECRET, 60_000)}` })).statusCode).toBe(404); // tipo de botón desconocido
  });

  it('la oferta llega por correo si es el único canal y se acepta con el enlace (no con el GET)', async () => {
    const p = await mkWorker('Solo correo');
    await say(p, 'correo solo@ejemplo.com');
    await w.app.inject({ method: 'POST', url: `/r/${tokenIn(mails.at(-1)!.text)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    await owner(sql`UPDATE worker_channels SET habilitado = false WHERE worker_id = ${p.id} AND canal = 'whatsapp'`);
    const shift = await mkShift(1);
    await cycle();
    const o = (await offerOf(shift, p.id))!;
    expect(o).toMatchObject({ status: 'sent', canal_usado: 'email' });
    const offerMail = mails.filter((m) => m.to === 'solo@ejemplo.com').at(-1)!;
    expect(offerMail.subject).toBe('Oferta de turno extra');
    expect(offerMail.text).toContain('Org A te ofrece un turno de');
    const links = [...offerMail.text.matchAll(/\/r\/([\w.-]+)/g)].map((m) => m[1]!);
    expect(links).toHaveLength(2);
    // El GET no cambia nada (los escáneres de enlaces no aceptan turnos).
    await w.app.inject({ method: 'GET', url: `/r/${links[0]}` });
    expect((await offerOf(shift, p.id))!.status).toBe('sent');
    const acc = await w.app.inject({ method: 'POST', url: `/r/${links[0]}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(acc.body).toContain('tienes el turno en Org A');
    expect(await assignStates(shift)).toEqual({ confirmed: 1 });
    expect((await offerOf(shift, p.id))!.responded_canal).toBe('email');
  });

  it('tras BAJA el enlace del correo ya no responde', async () => {
    const p = await mkWorker('Baja y enlace');
    await say(p, 'correo baja@ejemplo.com');
    await w.app.inject({ method: 'POST', url: `/r/${tokenIn(mails.at(-1)!.text)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    await owner(sql`UPDATE worker_channels SET habilitado = false WHERE worker_id = ${p.id} AND canal = 'whatsapp'`);
    const shift = await mkShift(1);
    await cycle();
    const link = [...mails.filter((m) => m.to === 'baja@ejemplo.com').at(-1)!.text.matchAll(/\/r\/([\w.-]+)/g)].map((m) => m[1]!)[0]!;
    await say(p, 'BAJA');
    const r = await w.app.inject({ method: 'POST', url: `/r/${link}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: '' });
    expect(r.body).toContain('ya no está disponible');
    expect(await assignStates(shift)).toEqual({});
  });
});

describe('webhook de Telegram y adaptador', () => {
  const update = (id: number, chat: string, text: string) => ({ update_id: id, message: { chat: { id: Number(chat), type: 'private' }, text } });
  const post = (payload: unknown, secret?: string) =>
    w.app.inject({
      method: 'POST', url: '/webhooks/telegram',
      headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
      payload: JSON.stringify(payload),
    });

  it('sin secreto válido no procesa nada', async () => {
    const before = Number((await owner<{ n: number }>(sql`SELECT count(*)::int AS n FROM inbound_messages WHERE canal = 'telegram'`))[0]!.n);
    expect((await post(update(1, '555', 'hola'))).statusCode).toBe(401);
    expect((await post(update(1, '555', 'hola'), 'secreto-malo')).statusCode).toBe(401);
    expect(Number((await owner<{ n: number }>(sql`SELECT count(*)::int AS n FROM inbound_messages WHERE canal = 'telegram'`))[0]!.n)).toBe(before);
  });

  it('con el secreto correcto vincula el chat y un update repetido no se procesa dos veces', async () => {
    const p = await mkWorker('Por webhook');
    const ask = await say(p, 'TELEGRAM');
    const code = /start=([A-Z0-9]+)/.exec(ask.replies[0]!.text)![1]!;
    const chat = String(700_000 + n++);
    const uid = 5_000_000 + n;
    expect((await post(update(uid, chat, `/start ${code}`), TG_SECRET)).statusCode).toBe(200);
    expect(await owner(sql`SELECT 1 FROM worker_channels WHERE worker_id = ${p.id} AND canal = 'telegram' AND identificador = ${chat}`)).toHaveLength(1);
    const dup = await owner(sql`SELECT 1 FROM inbound_messages WHERE canal = 'telegram' AND external_id = ${`u${uid}`}`);
    expect(dup).toHaveLength(1);
    expect((await post(update(uid, chat, `/start ${code}`), TG_SECRET)).statusCode).toBe(200);
    expect(await owner(sql`SELECT 1 FROM inbound_messages WHERE canal = 'telegram' AND external_id = ${`u${uid}`}`)).toHaveLength(1);
  });

  it('los botones en línea y los chats de grupo se interpretan bien', () => {
    expect(parseTelegramUpdate({ update_id: 7, callback_query: { id: 'x', data: 'OFFER_ACCEPT:abc', message: { chat: { id: 42, type: 'private' } } } }))
      .toEqual([{ canal: 'telegram', externalId: 'u7', from: '42', buttonId: 'OFFER_ACCEPT:abc' }]);
    expect(parseTelegramUpdate({ update_id: 8, message: { chat: { id: -100, type: 'group' }, text: 'hola' } })).toEqual([]);
    expect(parseTelegramUpdate({ nada: true })).toEqual([]);
  });

  it('el adaptador arma botones en línea, distingue errores definitivos y nunca expone el token', async () => {
    const calls: { url: string; body: { chat_id: string; reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] } } }[] = [];
    const ok = new TelegramChannel({
      token: 'TOKEN-SECRETO',
      fetchFn: (async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 321 } }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const r = await ok.send('42', { text: 'hola', buttons: [{ id: 'OFFER_ACCEPT:1', title: 'Aceptar' }, { id: 'OFFER_DECLINE:1', title: 'No puedo' }] });
    expect(r.externalId).toBe('321');
    expect(calls[0]!.body.reply_markup!.inline_keyboard[0]).toEqual([
      { text: 'Aceptar', callback_data: 'OFFER_ACCEPT:1' }, { text: 'No puedo', callback_data: 'OFFER_DECLINE:1' },
    ]);
    const mk = (status: number) =>
      new TelegramChannel({ token: 'TOKEN-SECRETO', fetchFn: (async () => new Response(JSON.stringify({ description: 'Forbidden: bot was blocked' }), { status })) as unknown as typeof fetch });
    await expect(mk(403).send('1', { text: 'x' })).rejects.toMatchObject({ retryable: false });
    await expect(mk(429).send('1', { text: 'x' })).rejects.toMatchObject({ retryable: true });
    const net = new TelegramChannel({ token: 'TOKEN-SECRETO', fetchFn: (async () => { throw new Error('connect ECONNREFUSED https://api.telegram.org/botTOKEN-SECRETO/sendMessage'); }) as unknown as typeof fetch });
    const err = await net.send('1', { text: 'x' }).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('TOKEN-SECRETO');
  });
});

describe('borrado con ofertas', () => {
  it('BORRAR MIS DATOS conserva ofertas y asignaciones anónimas y no deja nombre ni contacto', async () => {
    const p = await mkWorker('Borra todo');
    await say(p, 'correo borra@ejemplo.com');
    const shift = await mkShift(1);
    await cycle();
    await respond(p, (await offerOf(shift, p.id))!.id, 'ACCEPT');
    const ask = await say(p, 'BORRAR MIS DATOS');
    await say(p, { button: ask.replies[0]!.buttons![0]!.id });
    expect(await owner(sql`SELECT 1 FROM shift_offers WHERE worker_id = ${p.id}`)).toHaveLength(1);
    expect(await owner(sql`SELECT 1 FROM assignments WHERE worker_id = ${p.id}`)).toHaveLength(1);
    expect(await owner(sql`SELECT 1 FROM channel_link_codes WHERE worker_id = ${p.id}`)).toHaveLength(0);
    const names = await owner<{ nombre: string }>(sql`SELECT nombre FROM org_workers WHERE worker_id = ${p.id}`);
    expect(names.every((x) => x.nombre === '[borrado]')).toBe(true);
    expect(await owner(sql`SELECT 1 FROM outbox WHERE destinatario LIKE '%borra@ejemplo.com%'`)).toHaveLength(0);
  });
});
