import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withOrg } from '@turnoextra/db';
import {
  WhatsAppChannel, SendError, dispatchOnce, handleInbound, rowsOf, MAX_ATTEMPTS,
  type Channel, type OutMessage,
} from '@turnoextra/channels';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { createWorld, env, type World } from './world.js';

const SECRET = 'app-secret-de-prueba';
let w: World;

class Recorder implements Channel {
  readonly name = 'whatsapp' as const;
  sent: { to: string; msg: OutMessage }[] = [];
  async send(to: string, msg: OutMessage) {
    this.sent.push({ to, msg });
    return { externalId: `wamid.${this.sent.length}` };
  }
}
const rec = new Recorder();
const engine = { policyUrl: 'https://turnoextra.test/legal' };

beforeAll(async () => {
  w = await createWorld({ WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: 'verifica' });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

let n = 0;
const newPhone = () => `+57310${String(5550000 + n++)}`;
const digits = (p: string) => p.replace(/\D/g, '');

async function register(org: { orgId: string; cookie: string }, nombre: string, celular: string) {
  const r = await w.api('POST', `/orgs/${org.orgId}/workers`, { cookie: org.cookie, body: { nombre, celular, roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  // La API devuelve el id del vínculo con la org; los servicios trabajan con el id global del trabajador.
  return (await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${r.json().id as string}`))[0]!.worker_id;
}
const codeOf = async (org: { orgId: string; cookie: string }) =>
  (await w.api('GET', `/orgs/${org.orgId}/invitacion`, { cookie: org.cookie })).json().codigo as string;

/** Envía un mensaje entrante por el motor y devuelve lo que el worker entregaría como respuesta. */
async function say(phone: string, what: string | { button: string }, externalId: string = randomUUID()) {
  const before = rec.sent.length;
  const r = await handleInbound(w.t.db, engine, {
    canal: 'whatsapp', externalId, from: digits(phone),
    ...(typeof what === 'string' ? { text: what } : { buttonId: what.button }),
  });
  await dispatchOnce(w.t.db, new Map([['whatsapp', rec]]));
  return { ...r, replies: rec.sent.slice(before).map((s) => s.msg) };
}
const states = (workerId: string) =>
  w.t.asOwner(async (o) =>
    rowsOf<{ org: string; estado: string }>(
      await o.execute(sql`SELECT o.nombre AS org, ow.estado FROM org_workers ow JOIN orgs o ON o.id = ow.org_id WHERE ow.worker_id = ${workerId}`),
    ),
  );
const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));

describe('ALTA y consentimiento', () => {
  it('registrar a alguien no envía nada; ALTA con código pide autorización con botones', async () => {
    const phone = newPhone();
    const id = await register(w.A, 'Luis Pérez', phone);
    expect(await owner(sql`SELECT 1 FROM outbox WHERE worker_id = ${id}`)).toHaveLength(0);

    const r = await say(phone, `alta ${await codeOf(w.A)}`);
    expect(r.handled).toBe('consent_requested');
    expect(r.replies[0]!.text).toContain('Org A');
    expect(r.replies[0]!.text).toContain('https://turnoextra.test/legal');
    expect(r.replies[0]!.buttons?.map((b) => b.title)).toEqual(['Acepto', 'No acepto']);
    expect((await states(id))[0]!.estado).toBe('pendiente'); // todavía sin consentimiento
  });

  it('«Acepto» activa al candidato, habilita WhatsApp como prioritario y registra el consentimiento', async () => {
    const phone = newPhone();
    const id = await register(w.A, 'Marta Ruiz', phone);
    const ask = await say(phone, 'ALTA ' + (await codeOf(w.A)));
    const yes = ask.replies[0]!.buttons![0]!.id;

    const r = await say(phone, { button: yes });
    expect(r.handled).toBe('consent_accepted');
    expect(r.replies[0]!.text).toContain('quedas en la lista de Org A');
    expect((await states(id))[0]!.estado).toBe('activo');
    const ch = await owner<{ canal: string; habilitado: boolean; prioridad: number }>(sql`SELECT canal, habilitado, prioridad FROM worker_channels WHERE worker_id = ${id}`);
    expect(ch).toEqual([{ canal: 'whatsapp', habilitado: true, prioridad: 10 }]);
    expect(await owner(sql`SELECT 1 FROM worker_consents WHERE worker_id = ${id} AND revoked_at IS NULL`)).toHaveLength(1);
    const log = await owner<{ accion: string; detalle: unknown }>(sql`SELECT accion, detalle FROM audit_log WHERE entidad_id = ${id} AND accion = 'worker.consent_accepted'`);
    expect(log).toHaveLength(1);
  });

  it('un reintento del mismo mensaje (mismo id) no se procesa dos veces', async () => {
    const phone = newPhone();
    await register(w.A, 'Pedro Díaz', phone);
    const code = await codeOf(w.A);
    const first = await say(phone, `ALTA ${code}`, 'wamid.REPETIDO');
    const again = await say(phone, `ALTA ${code}`, 'wamid.REPETIDO');
    expect(first.replies).toHaveLength(1);
    expect(again.handled).toBe('duplicate');
    expect(again.replies).toHaveLength(0);
  });

  it('«No acepto» deja a la persona fuera sin habilitar canales', async () => {
    const phone = newPhone();
    const id = await register(w.A, 'Sara Gil', phone);
    const ask = await say(phone, 'ALTA ' + (await codeOf(w.A)));
    const r = await say(phone, { button: ask.replies[0]!.buttons![1]!.id });
    expect(r.handled).toBe('consent_declined');
    expect((await states(id))[0]!.estado).toBe('baja_org');
    expect(await owner(sql`SELECT 1 FROM worker_channels WHERE worker_id = ${id}`)).toHaveLength(0);
    // Un botón «Acepto» viejo no la revive.
    const stale = await say(phone, { button: ask.replies[0]!.buttons![0]!.id });
    expect(stale.handled).toBe('consent_stale');
    expect((await states(id))[0]!.estado).toBe('baja_org');
  });

  it('número no registrado → W3; código inválido o texto libre → ayuda W4', async () => {
    const stranger = await say(newPhone(), 'ALTA ' + (await codeOf(w.A)));
    expect(stranger.handled).toBe('alta_not_found');
    expect(stranger.replies[0]!.text).toContain('No encontramos tu número');
    expect((await say(newPhone(), 'ALTA ZZZZZZZZ')).handled).toBe('help');
    const free = await say(newPhone(), 'buenas tardes');
    expect(free.replies[0]!.text).toContain('escribe ALTA');
  });

  it('«Hola» abre la conversación: con una sola org pendiente sigue el flujo ALTA', async () => {
    const phone = newPhone();
    await register(w.A, 'Eva Mora', phone);
    expect((await say(phone, 'Hola')).handled).toBe('consent_requested');
  });

  it('el código de otra org no sirve para un celular que esa org no registró (aislamiento)', async () => {
    const phone = newPhone();
    await register(w.A, 'Tomás Vera', phone);
    const r = await say(phone, 'ALTA ' + (await codeOf(w.B)));
    expect(r.handled).toBe('alta_not_found');
  });
});

describe('BAJA y SALIR', () => {
  async function activeIn(orgs: { orgId: string; cookie: string }[], nombre: string) {
    const phone = newPhone();
    let id = '';
    for (const o of orgs) {
      id = await register(o, nombre, phone);
      const ask = await say(phone, 'ALTA ' + (await codeOf(o)));
      await say(phone, { button: ask.replies[0]!.buttons![0]!.id });
    }
    return { phone, id };
  }

  it('SALIR {empresa} (T18): solo esa relación pasa a baja_org; las demás siguen', async () => {
    const { phone, id } = await activeIn([w.A, w.B], 'Julia Sanz');
    const r = await say(phone, 'salir org a');
    expect(r.handled).toBe('salir');
    expect(r.replies[0]!.text).toContain('saliste de la lista de Org A');
    const st = Object.fromEntries((await states(id)).map((s) => [s.org, s.estado]));
    expect(st).toEqual({ 'Org A': 'baja_org', 'Org B': 'activo' });
    // El canal sigue habilitado: la otra org lo necesita.
    expect((await owner<{ habilitado: boolean }>(sql`SELECT habilitado FROM worker_channels WHERE worker_id = ${id}`))[0]!.habilitado).toBe(true);
  });

  it('SALIR sin empresa reconocible pide aclarar y no cambia nada', async () => {
    const { phone, id } = await activeIn([w.A, w.B], 'Hugo León');
    expect((await say(phone, 'SALIR')).handled).toBe('salir_help');
    expect((await say(phone, 'SALIR Hotel Inexistente')).handled).toBe('salir_help');
    expect((await states(id)).every((s) => s.estado === 'activo')).toBe(true);
  });

  it('BAJA es global: estado baja en todas las orgs, autorizaciones revocadas, canal apagado, reservas canceladas, orgs avisadas', async () => {
    const { phone, id } = await activeIn([w.A, w.B], 'Rosa Nieto');
    await owner(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, estado) SELECT ${w.A.orgId}, ${id}, 'cedula', 'aprobado'`);
    const shiftId = (await owner<{ id: string }>(sql`INSERT INTO shifts (org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, created_by)
      VALUES (${w.A.orgId}, ${w.roleId('mesero')}, now() + interval '2 days', now() + interval '2 days 5 hours', 1, 100000, 50000, 'u') RETURNING id`))[0]!.id;
    const shift2 = (await owner<{ id: string }>(sql`INSERT INTO shifts (org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, created_by)
      VALUES (${w.A.orgId}, ${w.roleId('mesero')}, now() + interval '4 days', now() + interval '4 days 5 hours', 1, 100000, 50000, 'u') RETURNING id`))[0]!.id;
    await owner(sql`INSERT INTO assignments (org_id, shift_id, worker_id, status) VALUES (${w.A.orgId}, ${shiftId}, ${id}, 'standby'), (${w.A.orgId}, ${shift2}, ${id}, 'confirmed')`);

    const r = await say(phone, '  Baja. ');
    expect(r.handled).toBe('baja');
    expect(r.replies).toHaveLength(1); // un solo mensaje de confirmación
    expect(r.replies[0]!.text).toContain('no recibirás más mensajes');
    expect((await states(id)).every((s) => s.estado === 'baja')).toBe(true);
    expect(await owner(sql`SELECT 1 FROM worker_consents WHERE worker_id = ${id} AND revoked_at IS NULL`)).toHaveLength(0);
    expect((await owner<{ habilitado: boolean }>(sql`SELECT habilitado FROM worker_channels WHERE worker_id = ${id}`))[0]!.habilitado).toBe(false);
    const asg = await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE worker_id = ${id} ORDER BY status`);
    expect(asg.map((a) => a.status).sort()).toEqual(['cancelled', 'confirmed']);
    const aviso = await owner<{ detalle: { confirmados_vigentes: number } }>(sql`SELECT detalle FROM audit_log WHERE entidad_id = ${id} AND accion = 'worker.baja' AND org_id = ${w.A.orgId}`);
    expect(aviso[0]!.detalle.confirmados_vigentes).toBe(1);
  });

  it('tras BAJA, la empresa puede reinvitar y la persona vuelve con ALTA y «Acepto»', async () => {
    const { phone, id } = await activeIn([w.A], 'Nora Cano');
    await say(phone, 'BAJA');
    expect((await say(phone, 'ALTA ' + (await codeOf(w.A)))).handled).toBe('alta_not_found');
    const link = (await owner<{ id: string }>(sql`SELECT id FROM org_workers WHERE worker_id = ${id}`))[0]!.id;
    const re = await w.api('POST', `/orgs/${w.A.orgId}/workers/${link}/reinvitar`, { cookie: w.A.cookie });
    expect(re.statusCode).toBe(200);
    const ask = await say(phone, 'ALTA ' + (await codeOf(w.A)));
    expect(ask.handled).toBe('consent_requested');
    expect((await say(phone, { button: ask.replies[0]!.buttons![0]!.id })).handled).toBe('consent_accepted');
    expect(await w.api('POST', `/orgs/${w.B.orgId}/workers/${link}/reinvitar`, { cookie: w.B.cookie })).toMatchObject({ statusCode: 404 });
  });
});

describe('BORRAR MIS DATOS (T19)', () => {
  const dump = async () => {
    const tables = (await owner<{ table_name: string }>(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).map((t) => t.table_name);
    let all = '';
    for (const t of tables) all += (await owner<{ s: string }>(sql`SELECT coalesce(string_agg(x::text, ' '), '') AS s FROM ${sql.raw(`"${t}"`)} x`))[0]!.s;
    return all;
  };

  it('pide confirmar; con «Sí, borrar» no queda nombre ni celular en ninguna tabla, y turnos y asignaciones siguen', async () => {
    const phone = newPhone();
    const nombre = 'Valentina Quintero Zapata';
    const id = await register(w.A, nombre, phone);
    const ask = await say(phone, 'ALTA ' + (await codeOf(w.A)));
    await say(phone, { button: ask.replies[0]!.buttons![0]!.id });
    await owner(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, vence_at, estado) SELECT ${w.A.orgId}, ${id}, 'carnet_manipulacion_alimentos', '2030-01-01', 'aprobado'`);
    const shiftId = (await owner<{ id: string }>(sql`INSERT INTO shifts (org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, created_by)
      VALUES (${w.A.orgId}, ${w.roleId('mesero')}, now() - interval '3 days', now() - interval '3 days' + interval '5 hours', 1, 100000, 50000, 'u') RETURNING id`))[0]!.id;
    await owner(sql`INSERT INTO assignments (org_id, shift_id, worker_id, status) VALUES (${w.A.orgId}, ${shiftId}, ${id}, 'completed')`);

    const req = await say(phone, 'borrar mis datos');
    expect(req.handled).toBe('delete_requested');
    expect(req.replies[0]!.buttons?.map((b) => b.title)).toEqual(['Sí, borrar', 'Cancelar']);
    expect(await dump()).toContain(nombre); // aún no se borra nada

    const done = await say(phone, { button: 'DELETE_YES' });
    expect(done.handled).toBe('delete_confirmed');
    expect(done.replies[0]!.text).toContain('tus datos fueron borrados');

    const all = await dump();
    expect(all).not.toContain(nombre);
    expect(all).not.toContain(digits(phone).slice(-10)); // ni el celular, en ninguna forma
    // Se conservan, anónimos: asignación, turno y la fila de la org (para los reportes).
    expect(await owner(sql`SELECT 1 FROM assignments WHERE worker_id = ${id} AND status = 'completed'`)).toHaveLength(1);
    expect(await owner(sql`SELECT 1 FROM shifts WHERE id = ${shiftId}`)).toHaveLength(1);
    expect((await owner<{ nombre: string }>(sql`SELECT nombre FROM org_workers WHERE worker_id = ${id}`))[0]!.nombre).toBe('[borrado]');
    expect(await owner(sql`SELECT 1 FROM worker_documents WHERE worker_id = ${id}`)).toHaveLength(0);
    // La bitácora conserva solo ids.
    const log = await owner<{ accion: string }>(sql`SELECT accion FROM audit_log WHERE entidad_id = ${id} AND accion = 'worker.data_deleted'`);
    expect(log).toHaveLength(1);
    // Quien escribe después ya no es reconocido.
    expect((await say(phone, 'ALTA ' + (await codeOf(w.A)))).handled).toBe('alta_not_found');
  });

  it('«Cancelar» no borra; una confirmación sin pedido previo o vencida no hace nada', async () => {
    const phone = newPhone();
    const id = await register(w.A, 'Camilo Ardila', phone);
    expect((await say(phone, { button: 'DELETE_YES' })).handled).toBe('delete_expired');
    await say(phone, 'BORRAR MIS DATOS');
    expect((await say(phone, { button: 'DELETE_NO' })).handled).toBe('delete_cancelled');
    expect((await say(phone, { button: 'DELETE_YES' })).handled).toBe('delete_expired'); // ya consumida
    await say(phone, 'BORRAR MIS DATOS');
    await owner(sql`UPDATE pending_confirmations SET expires_at = now() - interval '1 minute' WHERE worker_id = ${id}`);
    expect((await say(phone, { button: 'DELETE_YES' })).handled).toBe('delete_expired');
    expect((await owner<{ nombre: string }>(sql`SELECT nombre FROM org_workers WHERE worker_id = ${id}`))[0]!.nombre).toBe('Camilo Ardila');
  });

  it('`data delete` del super admin usa el mismo servicio; un admin de org no puede (403)', async () => {
    const phone = newPhone();
    const id = await register(w.A, 'Ignacio Bermúdez', phone);
    expect((await w.api('POST', `/admin/workers/${id}/data-delete`, { cookie: w.A.cookie })).statusCode).toBe(403);
    const r = await w.api('POST', `/admin/workers/${id}/data-delete`, { cookie: w.superCookie });
    expect(r.statusCode).toBe(200);
    expect(await dump()).not.toContain('Ignacio');
    expect((await w.api('POST', `/admin/workers/${randomUUID()}/data-delete`, { cookie: w.superCookie })).statusCode).toBe(404);
  });
});

describe('outbox y worker', () => {
  it('al enviar, la cola borra destinatario y contenido; no queda un archivo de mensajes con datos personales', async () => {
    const phone = newPhone();
    await register(w.A, 'Lina Ortiz', phone);
    await say(phone, 'ALTA ' + (await codeOf(w.A)));
    const rows = await owner<{ estado: string; destinatario: string; payload: unknown }>(sql`SELECT estado, destinatario, payload FROM outbox WHERE estado = 'sent' ORDER BY id DESC LIMIT 1`);
    expect(rows[0]).toMatchObject({ estado: 'sent', destinatario: '***', payload: {} });
  });

  it('un fallo reintentable reprograma con espera; agotados los intentos queda failed', async () => {
    class Flaky implements Channel {
      readonly name = 'whatsapp' as const;
      calls = 0;
      async send(): Promise<never> {
        this.calls++;
        throw new SendError('whatsapp 503');
      }
    }
    const flaky = new Flaky();
    const id = (await owner<{ id: number }>(sql`INSERT INTO outbox (canal, destinatario, payload) VALUES ('whatsapp', '+573001112233', '{"text":"hola"}') RETURNING id`))[0]!.id;
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      await owner(sql`UPDATE outbox SET next_attempt_at = now() WHERE id = ${id}`);
      const r = await dispatchOnce(w.t.db, new Map([['whatsapp', flaky]]));
      expect(r.claimed).toBe(1);
      const [row] = await owner<{ estado: string; attempts: number; last_error: string }>(sql`SELECT estado, attempts, last_error FROM outbox WHERE id = ${id}`);
      expect(row!.attempts).toBe(i);
      expect(row!.estado).toBe(i < MAX_ATTEMPTS ? 'pending' : 'failed');
    }
    // Entre intentos respeta la espera: sin forzar next_attempt_at no se toma de nuevo.
    expect(flaky.calls).toBe(MAX_ATTEMPTS);
    const [fin] = await owner<{ destinatario: string; last_error: string }>(sql`SELECT destinatario, last_error FROM outbox WHERE id = ${id}`);
    expect(fin!.destinatario).toBe('***');
  });

  it('un error no reintentable (p. ej. destinatario no permitido) falla de inmediato y el mensaje de error no filtra el celular', async () => {
    class Reject implements Channel {
      readonly name = 'whatsapp' as const;
      async send(): Promise<never> {
        throw new SendError('whatsapp 400 +573001112233 no permitido', false);
      }
    }
    const id = (await owner<{ id: number }>(sql`INSERT INTO outbox (canal, destinatario, payload) VALUES ('whatsapp', '+573001112233', '{"text":"x"}') RETURNING id`))[0]!.id;
    await dispatchOnce(w.t.db, new Map([['whatsapp', new Reject()]]));
    const [row] = await owner<{ estado: string; last_error: string }>(sql`SELECT estado, last_error FROM outbox WHERE id = ${id}`);
    expect(row!.estado).toBe('failed');
    expect(row!.last_error).not.toContain('3001112233');
  });

  it('los mensajes de un canal no configurado esperan en cola; no se marcan como fallidos', async () => {
    const id = (await owner<{ id: number }>(sql`INSERT INTO outbox (canal, destinatario, payload) VALUES ('telegram', 'chat1', '{"text":"x"}') RETURNING id`))[0]!.id;
    await dispatchOnce(w.t.db, new Map([['whatsapp', rec]]));
    expect((await owner<{ estado: string }>(sql`SELECT estado FROM outbox WHERE id = ${id}`))[0]!.estado).toBe('pending');
  });

  it('dos despachadores a la vez no envían el mismo mensaje dos veces', async () => {
    const r1 = new Recorder();
    const r2 = new Recorder();
    for (let i = 0; i < 6; i++) await owner(sql`INSERT INTO outbox (canal, destinatario, payload) VALUES ('whatsapp', ${`+57300999990${i}`}, '{"text":"x"}')`);
    await Promise.all([dispatchOnce(w.t.db, new Map([['whatsapp', r1]]), 10), dispatchOnce(w.t.db, new Map([['whatsapp', r2]]), 10)]);
    const all = [...r1.sent, ...r2.sent].map((s) => s.to);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(6);
  });

  it('RLS: ningún panel de org puede leer la cola ni las confirmaciones', async () => {
    await owner(sql`INSERT INTO outbox (canal, destinatario, payload) VALUES ('whatsapp', '+573000000001', '{"text":"x"}')`);
    const seen = await withOrg(w.t.db, w.A.orgId, async (tx) => rowsOf(await tx.execute(sql`SELECT 1 FROM outbox`)));
    expect(seen).toHaveLength(0);
  });
});

describe('WhatsApp: webhook y adaptador', () => {
  const sign = (body: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const post = (body: string, sig?: string) =>
    w.app.inject({ method: 'POST', url: '/webhooks/whatsapp', headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, payload: body });
  const payload = (from: string, text: string, id: string) =>
    JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id, from, type: 'text', text: { body: text } }] } }] }] });

  it('verificación de Meta: devuelve el reto solo con el token correcto', async () => {
    const ok = await w.app.inject({ method: 'GET', url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=12345' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('12345');
    const bad = await w.app.inject({ method: 'GET', url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1' });
    expect(bad.statusCode).toBe(403);
  });

  it('rechaza sin firma o con firma falsa (401) y no procesa nada', async () => {
    const phone = newPhone();
    await register(w.A, 'Pablo Rey', phone);
    const body = payload(digits(phone), 'ALTA ' + (await codeOf(w.A)), 'wamid.X1');
    expect((await post(body)).statusCode).toBe(401);
    expect((await post(body, sign(body, 'otro-secreto'))).statusCode).toBe(401);
    expect(await owner(sql`SELECT 1 FROM inbound_messages WHERE external_id = 'wamid.X1'`)).toHaveLength(0);
  });

  it('con firma válida procesa el mensaje y deja la respuesta en la cola', async () => {
    const phone = newPhone();
    const id = await register(w.A, 'Rita Mejía', phone);
    const body = payload(digits(phone), 'ALTA ' + (await codeOf(w.A)), 'wamid.X2');
    const r = await post(body, sign(body));
    expect(r.statusCode).toBe(200);
    const q = await owner<{ payload: { text: string } }>(sql`SELECT payload FROM outbox WHERE worker_id = ${id} AND estado = 'pending'`);
    expect(q[0]!.payload.text).toContain('Org A quiere enviarte');
  });

  it('un estado de entrega (sin mensajes) responde 200 sin hacer nada', async () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }] });
    expect((await post(body, sign(body))).statusCode).toBe(200);
  });

  it('el adaptador arma texto simple, botones interactivos y distingue errores reintentables', async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
    const fake = (status: number, json: unknown): typeof fetch =>
      (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: String((init?.headers as Record<string, string>).authorization) });
        return new Response(JSON.stringify(json), { status });
      }) as typeof fetch;

    const ok = new WhatsAppChannel({ token: 'T', phoneId: '123', apiVersion: 'v21.0', fetchFn: fake(200, { messages: [{ id: 'wamid.OK' }] }) });
    expect(await ok.send('+57 300 123 4567', { text: 'hola' })).toEqual({ externalId: 'wamid.OK' });
    await ok.send('+573001234567', { text: '¿Aceptas?', buttons: [{ id: 'CONSENT_YES:1', title: 'Acepto' }, { id: 'CONSENT_NO:1', title: 'No acepto' }] });
    expect(calls[0]).toMatchObject({ url: 'https://graph.facebook.com/v21.0/123/messages', auth: 'Bearer T' });
    expect(calls[0]!.body).toMatchObject({ to: '573001234567', type: 'text' });
    expect(calls[1]!.body).toMatchObject({ type: 'interactive' });
    expect(JSON.stringify(calls[1]!.body)).toContain('CONSENT_YES:1');

    const denied = new WhatsAppChannel({ token: 'T', phoneId: '1', apiVersion: 'v21.0', fetchFn: fake(400, { error: { code: 131030, message: 'no permitido' } }) });
    await expect(denied.send('+573001234567', { text: 'x' })).rejects.toMatchObject({ retryable: false });
    const down = new WhatsAppChannel({ token: 'T', phoneId: '1', apiVersion: 'v21.0', fetchFn: fake(503, {}) });
    await expect(down.send('+573001234567', { text: 'x' })).rejects.toMatchObject({ retryable: true });
  });
});

describe('simulador /demo (plan B)', () => {
  it('apagado por defecto: sin DEMO_MODE las rutas ni existen', async () => {
    const r = await w.api('POST', '/demo/inbound', { cookie: w.superCookie, body: { celular: '3001234567', text: 'hola' } });
    expect(r.statusCode).toBe(404);
  });

  it('con DEMO_MODE usa el mismo motor, responde por la bandeja rotulada como simulación y exige super admin', async () => {
    // Segunda app sobre la misma base y las mismas sesiones, con el simulador encendido.
    const demoApp = await buildApp({ ...env, DEMO_MODE: true }, { db: w.t.db, auth: createAuth({ db: w.t.db, env, email: w.email }) });
    const call = (method: 'GET' | 'POST', url: string, cookie: string, payload?: object) =>
      demoApp.inject({ method, url, headers: { origin: env.APP_URL, cookie }, ...(payload ? { payload } : {}) });
    try {
      const phone = newPhone();
      await register(w.A, 'Demo Uno', phone);
      const code = await codeOf(w.A);
      expect((await call('POST', '/demo/inbound', w.A.cookie, { celular: phone, text: `ALTA ${code}` })).statusCode).toBe(403);
      const r = await call('POST', '/demo/inbound', w.superCookie, { celular: phone, text: `ALTA ${code}` });
      expect(r.json().handled).toBe('consent_requested');
      const m = (await call('GET', `/demo/messages?celular=${encodeURIComponent(phone)}`, w.superCookie)).json();
      expect(m.simulacion).toBe(true);
      expect(m.messages[0].texto).toContain('Org A quiere enviarte');
      const yes = m.messages[0].botones[0].id as string;
      expect((await call('POST', '/demo/inbound', w.superCookie, { celular: phone, buttonId: yes })).json().handled).toBe('consent_accepted');
    } finally {
      await demoApp.close();
    }
  });
});
