import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { EmailChannel, dispatchOnce, handleInbound, rowsOf, tick, type Channel, type OutMessage } from '@turnoextra/channels';
import { createWorld, env, type World } from './world.js';

let w: World;
let base = '';

class Rec implements Channel {
  sent: { to: string; msg: OutMessage }[] = [];
  readonly name = 'whatsapp' as const;
  async send(to: string, msg: OutMessage) {
    this.sent.push({ to, msg });
    return { externalId: `wa.${this.sent.length}` };
  }
}
const wa = new Rec();
const mails: { to: string; subject: string; text: string }[] = [];
const emailChannel = new EmailChannel({ send: async (m) => void mails.push(m), baseUrl: 'http://localhost:3000', secret: env.BETTER_AUTH_SECRET });
const channels = () => new Map<string, Channel>([['whatsapp', wa], ['email', emailChannel]]);
const engine = { policyUrl: 'https://turnoextra.test/legal' };

beforeAll(async () => {
  w = await createWorld({ RATE_LIMIT_MAX: 100_000 });
  await w.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(w.app.server.address() as AddressInfo).port}`;
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

beforeEach(async () => {
  await w.t.asOwner(async (o) => {
    await o.execute(sql`UPDATE org_workers SET estado = 'baja_org' WHERE estado = 'activo'`);
    await o.execute(sql`UPDATE shifts SET estado = 'cancelado' WHERE estado IN ('abierto','cubierto')`);
    await o.execute(sql`DELETE FROM alerts`);
    await o.execute(sql`DELETE FROM notification_prefs`);
    await o.execute(sql`DELETE FROM manager_contacts`);
  });
  mails.length = 0;
  wa.sent.length = 0;
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
let n = 0;
const newPhone = () => `+57312${String(1110000 + n++)}`;
const digits = (p: string) => p.replace(/\D/g, '');
const hours = (d: number, h: number) => new Date(Date.now() + d * 86400_000 + h * 3600_000).toISOString();
let day = 10;
const nextDay = () => (day += 2);

type Person = { id: string; phone: string };

async function say(p: Person, text: string) {
  await handleInbound(w.t.db, engine, { canal: 'whatsapp', externalId: randomUUID(), from: digits(p.phone), text });
  await flush();
}
async function press(p: Person, buttonId: string) {
  await handleInbound(w.t.db, engine, { canal: 'whatsapp', externalId: randomUUID(), from: digits(p.phone), buttonId });
  await flush();
}
async function flush() {
  for (let i = 0; i < 6; i++) if (!(await dispatchOnce(w.t.db, channels())).claimed) break;
}
async function cycle() {
  await tick(w.t.db);
  await flush();
}

async function mkWorker(nombre: string, org = w.A): Promise<Person> {
  const phone = newPhone();
  const r = await w.api('POST', `/orgs/${org.orgId}/workers`, { cookie: org.cookie, body: { nombre, celular: phone, roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  const linkId = r.json().id as string;
  const id = (await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${linkId}`))[0]!.worker_id;
  const code = (await w.api('GET', `/orgs/${org.orgId}/invitacion`, { cookie: org.cookie })).json().codigo as string;
  await say({ id, phone }, `ALTA ${code}`);
  const consent = wa.sent.filter((s) => digits(s.to) === digits(phone)).at(-1)!.msg.buttons![0]!.id;
  await press({ id, phone }, consent);
  // El candidato sube el documento desde su panel; aquí se siembra y la empresa lo aprueba.
  const [d] = await owner<{ id: string }>(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, vence_at) SELECT org_id, worker_id, 'carnet_manipulacion_alimentos', '2030-01-01' FROM org_workers WHERE id = ${linkId} RETURNING id`);
  await owner(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, estado) SELECT org_id, worker_id, 'cedula', 'aprobado' FROM org_workers WHERE id = ${linkId}`);
  await w.api('PATCH', `/orgs/${org.orgId}/documents/${d!.id}`, { cookie: org.cookie, body: { estado: 'aprobado' } });
  return { id, phone };
}

async function mkShift(startH: number, org = w.A, cupos = 1) {
  const d = startH < 24 ? 0 : nextDay();
  const r = await w.api('POST', `/orgs/${org.orgId}/shifts`, {
    cookie: org.cookie,
    body: { inicio: hours(d, d ? 0 : startH), fin: hours(d, (d ? 0 : startH) + 5), roleId: w.roleId('mesero'), cupos, pagoTotal: 400_000 },
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}

/** Persona con el turno confirmado (flujo real: oleada → botón Aceptar). */
async function confirmed(nombre: string, startH: number) {
  const p = await mkWorker(nombre);
  const shift = await mkShift(startH);
  await cycle();
  const offer = wa.sent.filter((s) => s.to === p.phone && s.msg.buttons?.[0]?.id.startsWith('OFFER_ACCEPT')).at(-1)!.msg.buttons![0]!.id;
  await press(p, offer);
  expect((await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE shift_id = ${shift}`))[0]!.status).toBe('confirmed');
  return { p, shift };
}

const alertsOf = (org = w.A) => w.api('GET', `/orgs/${org.orgId}/alerts`, { cookie: org.cookie });

// --- SSE ------------------------------------------------------------------------------------------
async function connect(path: string, cookie?: string) {
  const ac = new AbortController();
  const res = await fetch(base + path, { headers: { ...(cookie ? { cookie } : {}), origin: env.APP_URL }, signal: ac.signal });
  let text = '';
  if (res.status === 200 && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value);
        }
      } catch {
        /* cierre */
      }
    })();
  } else {
    await res.body?.cancel();
  }
  return { status: res.status, headers: res.headers, text: () => text, close: () => ac.abort() };
}
const until = async (fn: () => boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('tiempo agotado esperando el evento');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms));

describe('SSE', () => {
  it('exige sesión y administrar esa org; otra org no ve ni que existe', async () => {
    expect((await connect(`/orgs/${w.A.orgId}/stream`)).status).toBe(401);
    expect((await connect(`/orgs/${w.A.orgId}/stream`, w.B.cookie)).status).toBe(404);
    const shift = await mkShift(48);
    expect((await connect(`/orgs/${w.B.orgId}/shifts/${shift}/stream`, w.B.cookie)).status).toBe(404); // turno de A, org B
    expect((await connect(`/orgs/${w.A.orgId}/shifts/no-es-uuid/stream`, w.A.cookie)).status).toBe(404);
  });

  it('reenvía eventos de su org con solo ids y tipo, y nada de otra org', async () => {
    const a = await connect(`/orgs/${w.A.orgId}/stream`, w.A.cookie);
    const b = await connect(`/orgs/${w.B.orgId}/stream`, w.B.cookie);
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toContain('text/event-stream');
    await until(() => a.text().includes('event: ready') && b.text().includes('event: ready'));

    const shift = await mkShift(48);
    await until(() => a.text().includes('event: shift.created'));
    const frame = /event: shift\.created\ndata: (.*)\n/.exec(a.text())![1]!;
    expect(JSON.parse(frame)).toEqual({ shift });
    await pause();
    expect(b.text()).not.toContain('shift.created');
    expect(b.text()).not.toContain(shift);
    a.close();
    b.close();
  });

  it('el stream de un turno solo recibe los eventos de ese turno', async () => {
    const s1 = await mkShift(48);
    const s2 = await mkShift(48);
    const one = await connect(`/orgs/${w.A.orgId}/shifts/${s1}/stream`, w.A.cookie);
    await until(() => one.text().includes('event: ready'));
    await w.api('POST', `/orgs/${w.A.orgId}/shifts/${s2}/cancel`, { cookie: w.A.cookie });
    await pause();
    expect(one.text()).not.toContain(s2);
    await w.api('POST', `/orgs/${w.A.orgId}/shifts/${s1}/cancel`, { cookie: w.A.cookie });
    await until(() => one.text().includes(s1));
    expect(one.text()).toContain('event: shift.changed');
    one.close();
  });

  it('los eventos de oferta y asignación llegan al panel (aceptar un turno)', async () => {
    const p = await mkWorker('Ana');
    const shift = await mkShift(48);
    const s = await connect(`/orgs/${w.A.orgId}/shifts/${shift}/stream`, w.A.cookie);
    await until(() => s.text().includes('event: ready'));
    await cycle();
    await until(() => s.text().includes('event: shift.changed')); // oleada enviada
    const before = s.text().split('event: shift.changed').length;
    const offer = wa.sent.filter((m) => m.to === p.phone && m.msg.buttons?.[0]?.id.startsWith('OFFER_ACCEPT')).at(-1)!.msg.buttons![0]!.id;
    await press(p, offer);
    await until(() => s.text().split('event: shift.changed').length > before);
    s.close();
  });

  it('el límite de conexiones por org responde 429', async () => {
    const open = [];
    for (let i = 0; i < 30; i++) open.push(await connect(`/orgs/${w.A.orgId}/stream`, w.A.cookie));
    expect(open.every((c) => c.status === 200)).toBe(true);
    expect((await connect(`/orgs/${w.A.orgId}/stream`, w.A.cookie)).status).toBe(429);
    open.forEach((c) => c.close());
    await pause();
  });
});

// --- Alertas --------------------------------------------------------------------------------------
describe('alertas al gerente', () => {
  it('NO PUEDO IR con el turno en menos de 3 h: alerta urgente en el panel y correo sin datos personales', async () => {
    const { p, shift } = await confirmed('Ana Gómez', 2);
    await say(p, 'NO PUEDO IR');
    const list = (await alertsOf()).json();
    expect(list.pendientes).toBe(1);
    expect(list.alerts[0]).toMatchObject({ tipo: 'cancelacion_asistencia', urgente: true, shiftId: shift, candidato: 'Ana Gómez', rol: 'Mesero' });
    const mail = mails.find((m) => m.to === 'a@org.test')!;
    expect(mail.subject).toContain('URGENTE');
    expect(mail.text).toContain('canceló su asistencia');
    expect(mail.text).not.toContain('Ana');
    expect(mail.text).not.toContain(p.phone);
    // Ni WhatsApp (nadie lo pidió) ni la otra org se enteran.
    expect(wa.sent.filter((s) => s.msg.text.includes('URGENTE'))).toHaveLength(0);
    expect((await alertsOf(w.B)).json().alerts).toHaveLength(0);
    expect(mails.some((m) => m.to === 'b@org.test')).toBe(false);
  });

  it('con más de 3 h de margen la alerta no es urgente; soltar una reserva no alerta', async () => {
    const { p } = await confirmed('Beto', 48);
    await say(p, 'NO PUEDO IR');
    const list = (await alertsOf()).json();
    expect(list.alerts).toHaveLength(1);
    expect(list.alerts[0].urgente).toBe(false);
    expect(mails.find((m) => m.to === 'a@org.test')!.subject).not.toContain('URGENTE');

    await owner(sql`DELETE FROM alerts`);
    await owner(sql`UPDATE org_workers SET estado = 'baja_org' WHERE estado = 'activo'`);
    await owner(sql`UPDATE shifts SET estado = 'cancelado' WHERE estado IN ('abierto','cubierto')`);
    mails.length = 0;
    const c = await mkWorker('Caro');
    const d = await mkWorker('Dani');
    const shift = await mkShift(48);
    await cycle();
    const offerOf = (x: Person) => wa.sent.filter((m) => m.to === x.phone && m.msg.buttons?.[0]?.id.startsWith('OFFER_ACCEPT')).at(-1)?.msg.buttons?.[0]?.id;
    await press(c, offerOf(c)!); // confirma (1 cupo)
    await press(d, offerOf(d)!); // reserva
    expect((await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE shift_id = ${shift} AND worker_id = ${d.id}`))[0]!.status).toBe('standby');
    await say(d, 'NO PUEDO IR');
    expect((await alertsOf()).json().alerts).toHaveLength(0);
  });

  it('turno vencido sin cubrir: una alerta (no urgente) y correo', async () => {
    const shift = await mkShift(48);
    await owner(sql`UPDATE shifts SET inicio = now() - interval '30 minutes', fin = now() + interval '4 hours' WHERE id = ${shift}`);
    await cycle();
    await cycle();
    const list = (await alertsOf()).json();
    expect(list.alerts).toHaveLength(1);
    expect(list.alerts[0]).toMatchObject({ tipo: 'turno_vencido', urgente: false, shiftId: shift });
    expect(mails.filter((m) => m.to === 'a@org.test')).toHaveLength(1);
  });

  it('BAJA de alguien con turno confirmado alerta a esa org', async () => {
    const { p, shift } = await confirmed('Eli', 48);
    await say(p, 'BAJA');
    const list = (await alertsOf()).json();
    expect(list.alerts.map((a: { tipo: string; shiftId: string }) => [a.tipo, a.shiftId])).toEqual([['baja_con_turnos', shift]]);
    expect(mails.filter((m) => m.to === 'a@org.test')).toHaveLength(1);
    expect((await alertsOf(w.B)).json().alerts).toHaveLength(0);
  });

  it('BORRAR MIS DATOS no deja el nombre en las alertas', async () => {
    const { p } = await confirmed('Fabio', 48);
    await say(p, 'NO PUEDO IR');
    await owner(sql`UPDATE org_workers SET nombre = '[borrado]' WHERE worker_id = ${p.id}`);
    expect((await alertsOf()).json().alerts[0].candidato).toBe('[borrado]');
    const cols = await owner<{ column_name: string }>(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'alerts'`);
    expect(cols.map((c) => c.column_name)).not.toEqual(expect.arrayContaining(['nombre', 'celular', 'texto']));
  });

  it('marcar atendida es solo de la org; ver pendientes baja; el evento SSE solo lleva el id', async () => {
    await confirmed('Gabo', 48).then(({ p }) => say(p, 'NO PUEDO IR'));
    const s = await connect(`/orgs/${w.A.orgId}/stream`, w.A.cookie);
    await until(() => s.text().includes('event: ready'));
    const id = (await alertsOf()).json().alerts[0].id as string;

    expect((await w.api('POST', `/orgs/${w.B.orgId}/alerts/${id}/ack`, { cookie: w.B.cookie })).statusCode).toBe(404);
    expect((await w.api('POST', `/orgs/${w.A.orgId}/alerts/no-uuid/ack`, { cookie: w.A.cookie })).statusCode).toBe(404);
    expect((await w.api('POST', `/orgs/${w.A.orgId}/alerts/${id}/ack`, { cookie: w.A.cookie })).statusCode).toBe(200);
    await until(() => s.text().includes('event: alert.updated'));
    expect(JSON.parse(/event: alert\.updated\ndata: (.*)\n/.exec(s.text())![1]!)).toEqual({ id });
    s.close();

    const after = (await w.api('GET', `/orgs/${w.A.orgId}/alerts?solo=pendientes`, { cookie: w.A.cookie })).json();
    expect(after.pendientes).toBe(0);
    expect(after.alerts).toHaveLength(0);
  });

  it('una alerta nueva se anuncia por SSE solo con su id', async () => {
    const s = await connect(`/orgs/${w.A.orgId}/stream`, w.A.cookie);
    await until(() => s.text().includes('event: ready'));
    const { p, shift } = await confirmed('Hugo', 48);
    await say(p, 'NO PUEDO IR');
    await until(() => s.text().includes('event: alert.created'));
    const id = (await alertsOf()).json().alerts[0].id;
    expect(JSON.parse(/event: alert\.created\ndata: (.*)\n/.exec(s.text())![1]!)).toEqual({ shift, id });
    s.close();
  });
});

// --- Preferencias y WhatsApp del gerente -----------------------------------------------------------
describe('preferencias de aviso', () => {
  it('por defecto panel y correo sí, WhatsApp no; se pueden apagar por evento', async () => {
    const def = (await w.api('GET', '/me/notification-prefs', { cookie: w.A.cookie })).json().prefs;
    expect(def).toHaveLength(4);
    expect(def.every((p: { panel: boolean; email: boolean; whatsapp: boolean }) => p.panel && p.email && !p.whatsapp)).toBe(true);

    const put = await w.api('PUT', '/me/notification-prefs', {
      cookie: w.A.cookie, body: { prefs: [{ evento: 'cancelacion_asistencia', panel: true, email: false, whatsapp: false }] },
    });
    expect(put.statusCode).toBe(200);
    const { p } = await confirmed('Ines', 48);
    await say(p, 'NO PUEDO IR');
    expect((await alertsOf()).json().alerts).toHaveLength(1); // panel sí
    expect(mails.filter((m) => m.to === 'a@org.test')).toHaveLength(0); // correo no
  });

  it('con el panel apagado para un evento, esa persona no lo ve en su lista', async () => {
    await w.api('PUT', '/me/notification-prefs', {
      cookie: w.A.cookie, body: { prefs: [{ evento: 'cancelacion_asistencia', panel: false, email: true, whatsapp: false }] },
    });
    const { p } = await confirmed('Jaime', 48);
    await say(p, 'NO PUEDO IR');
    const list = (await alertsOf()).json();
    expect(list.alerts).toHaveLength(0);
    expect(list.pendientes).toBe(0);
  });

  it('valida el cuerpo y las preferencias son por persona', async () => {
    const bad = await w.api('PUT', '/me/notification-prefs', { cookie: w.A.cookie, body: { prefs: [{ evento: 'otro', panel: true, email: true, whatsapp: false }] } });
    expect(bad.statusCode).toBe(400);
    expect((await w.api('GET', '/me/notification-prefs')).statusCode).toBe(401);
    await w.api('PUT', '/me/notification-prefs', { cookie: w.A.cookie, body: { prefs: [{ evento: 'turno_vencido', panel: false, email: false, whatsapp: false }] } });
    const b = (await w.api('GET', '/me/notification-prefs', { cookie: w.B.cookie })).json().prefs;
    expect(b.find((x: { evento: string }) => x.evento === 'turno_vencido')).toMatchObject({ panel: true, email: true });
  });
});

describe('WhatsApp del gerente (solo urgentes)', () => {
  const phone = '+573001230000';
  const prefs = (whatsapp: boolean) =>
    w.api('PUT', '/me/notification-prefs', { cookie: w.A.cookie, body: { prefs: [{ evento: 'cancelacion_asistencia', panel: true, email: true, whatsapp }, { evento: 'turno_vencido', panel: true, email: true, whatsapp }] } });

  it('no se activa sin número verificado; pide consentimiento y valida el celular', async () => {
    expect((await prefs(true)).statusCode).toBe(409);
    const noConsent = await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: phone, consentimiento: false } });
    expect(noConsent.statusCode).toBe(400);
    const badPhone = await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: '123', consentimiento: true } });
    expect(badPhone.statusCode).toBe(422);
  });

  it('verificación con código: incorrecto, correcto; el número nunca sale completo', async () => {
    const put = await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: phone, consentimiento: true } });
    expect(put.statusCode).toBe(202);
    expect(JSON.stringify(put.json())).not.toContain('3001230000');
    await flush();
    const code = /(\d{6})/.exec(wa.sent.filter((s) => s.to === phone).at(-1)!.msg.text)![1]!;

    const wrong = await w.api('POST', '/me/notification-whatsapp/verify', { cookie: w.A.cookie, body: { codigo: code === '000000' ? '111111' : '000000' } });
    expect(wrong.statusCode).toBe(422);
    expect((await w.api('GET', '/me/notification-whatsapp', { cookie: w.A.cookie })).json()).toMatchObject({ configurado: true, verificado: false, celular: '***0000' });
    expect((await w.api('POST', '/me/notification-whatsapp/verify', { cookie: w.A.cookie, body: { codigo: code } })).json()).toMatchObject({ verificado: true });
    expect((await prefs(true)).statusCode).toBe(200);
    // El código ya no sirve y nadie más lo usa.
    expect((await w.api('POST', '/me/notification-whatsapp/verify', { cookie: w.B.cookie, body: { codigo: code } })).statusCode).toBe(422);
  });

  it('tras 5 intentos fallidos el código queda bloqueado', async () => {
    await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: phone, consentimiento: true } });
    await owner(sql`UPDATE manager_contacts SET attempts = 5`);
    const r = await w.api('POST', '/me/notification-whatsapp/verify', { cookie: w.A.cookie, body: { codigo: '123456' } });
    expect(r.statusCode).toBe(429);
  });

  it('con número verificado y preferencia, solo las urgentes salen por WhatsApp', async () => {
    await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: phone, consentimiento: true } });
    await flush();
    const code = /(\d{6})/.exec(wa.sent.filter((s) => s.to === phone).at(-1)!.msg.text)![1]!;
    await w.api('POST', '/me/notification-whatsapp/verify', { cookie: w.A.cookie, body: { codigo: code } });
    expect((await prefs(true)).statusCode).toBe(200);
    wa.sent.length = 0;

    // Urgente: sale por WhatsApp.
    const urgent = await confirmed('Kiko', 2);
    await say(urgent.p, 'NO PUEDO IR');
    const msgs = wa.sent.filter((s) => s.to === phone);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.msg.text).toContain('URGENTE');
    expect(msgs[0]!.msg.text).not.toContain('Kiko');

    // No urgente (turno vencido): solo panel y correo.
    wa.sent.length = 0;
    const shift = await mkShift(48);
    await owner(sql`UPDATE shifts SET inicio = now() - interval '30 minutes', fin = now() + interval '4 hours' WHERE id = ${shift}`);
    await cycle();
    expect(wa.sent.filter((s) => s.to === phone)).toHaveLength(0);
    expect((await alertsOf()).json().alerts.some((a: { tipo: string }) => a.tipo === 'turno_vencido')).toBe(true);
  });

  it('retirar el consentimiento borra el número y apaga los avisos por WhatsApp', async () => {
    await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: phone, consentimiento: true } });
    await flush();
    const code = /(\d{6})/.exec(wa.sent.filter((s) => s.to === phone).at(-1)!.msg.text)![1]!;
    await w.api('POST', '/me/notification-whatsapp/verify', { cookie: w.A.cookie, body: { codigo: code } });
    await prefs(true);

    expect((await w.api('DELETE', '/me/notification-whatsapp', { cookie: w.A.cookie })).json()).toMatchObject({ configurado: false });
    expect(await owner(sql`SELECT 1 FROM manager_contacts`)).toHaveLength(0);
    const p = (await w.api('GET', '/me/notification-prefs', { cookie: w.A.cookie })).json().prefs as { whatsapp: boolean }[];
    expect(p.some((x) => x.whatsapp)).toBe(false);
  });

  it('el contacto del gerente no es legible con el rol de la app fuera del contexto de sistema (RLS)', async () => {
    await w.api('PUT', '/me/notification-whatsapp', { cookie: w.A.cookie, body: { celular: phone, consentimiento: true } });
    const rows = rowsOf(await w.t.db.execute(sql`SELECT * FROM manager_contacts`));
    expect(rows).toHaveLength(0);
  });
});
