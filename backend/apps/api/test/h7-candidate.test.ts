import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { dispatchOnce, handleInbound, rowsOf, type Channel, type OutMessage } from '@turnoextra/channels';
import { makeSessionToken, readSessionToken } from '../src/auth/candidate.js';
import { createWorld, env, type World } from './world.js';

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
  w = await createWorld({ RATE_LIMIT_MAX: 100_000 });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});
beforeEach(async () => {
  await w.t.asOwner(async (o) => {
    await o.execute(sql`UPDATE org_workers SET estado = 'baja_org' WHERE estado = 'activo'`);
  });
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
let n = 0;
const newPhone = () => `+57313${String(5550000 + n++)}`;
const digits = (p: string) => p.replace(/\D/g, '');
const flush = async () => {
  for (let i = 0; i < 6; i++) if (!(await dispatchOnce(w.t.db, channels())).claimed) break;
};

type Person = { id: string; phone: string };
async function mkWorker(nombre: string): Promise<Person> {
  const phone = newPhone();
  const r = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre, celular: phone, roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  const id = (await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${r.json().id}`))[0]!.worker_id;
  const code = (await w.api('GET', `/orgs/${w.A.orgId}/invitacion`, { cookie: w.A.cookie })).json().codigo as string;
  const say = (what: string | { button: string }) =>
    handleInbound(w.t.db, engine, {
      canal: 'whatsapp', externalId: randomUUID(), from: digits(phone),
      ...(typeof what === 'string' ? { text: what } : { buttonId: what.button }),
    });
  await say(`ALTA ${code}`);
  await flush();
  const consent = wa.sent.filter((s) => digits(s.to) === digits(phone)).map((s) => s.msg).find((m) => m.buttons);
  await say({ button: consent!.buttons![0]!.id });
  await flush();
  return { id, phone };
}

const sentTo = (p: Person) => wa.sent.filter((s) => digits(s.to) === digits(p.phone));
const cookieOf = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []).map((c) => c.split(';')[0]).join('; ');

/** Pide el código, lo lee del mensaje que llegó por WhatsApp y entra. Devuelve la cookie de sesión. */
async function login(p: Person) {
  const before = sentTo(p).length;
  const ask = await w.api('POST', '/candidato/codigo', { body: { celular: p.phone } });
  expect(ask.statusCode).toBe(202);
  await flush();
  const msg = sentTo(p).slice(before).map((s) => s.msg.text).find((t) => /código para entrar/.test(t));
  const code = /es (\d{6})\./.exec(msg ?? '')![1]!;
  const ok = await w.api('POST', '/candidato/verificar', { body: { celular: p.phone, code } });
  expect(ok.statusCode).toBe(200);
  return { cookie: cookieOf(ok), code };
}

async function noShow(p: Person, endedHoursAgo = 2) {
  const sid = randomUUID();
  const aid = randomUUID();
  await owner(sql`INSERT INTO shifts (id, org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, estado, created_by)
    VALUES (${sid}, ${w.A.orgId}, ${w.roleId('mesero')}, now() - make_interval(hours => ${endedHoursAgo + 5}), now() - make_interval(hours => ${endedHoursAgo}),
            1, 400000, 300000, 'completado', 'test')`);
  await owner(sql`INSERT INTO assignments (id, org_id, shift_id, worker_id, status) VALUES (${aid}, ${w.A.orgId}, ${sid}, ${p.id}, 'no_show')`);
  return aid;
}

describe('acceso del candidato', () => {
  it('entra con el código enviado por su canal y el código es de un solo uso', async () => {
    const ana = await mkWorker('Ana');
    const { cookie, code } = await login(ana);
    const yo = await w.api('GET', '/yo', { cookie });
    expect(yo.statusCode).toBe(200);
    expect(yo.json().canales.find((c: { canal: string }) => c.canal === 'whatsapp').habilitado).toBe(true);
    expect((await w.api('GET', '/yo/sesion', { cookie })).json().candidato).toBe(true);
    // el mismo código no sirve dos veces
    const again = await w.api('POST', '/candidato/verificar', { body: { celular: ana.phone, code } });
    expect(again.statusCode).toBe(422);
  });

  it('no revela si el celular existe y no escribe por canales no iniciados', async () => {
    const before = wa.sent.length;
    const r = await w.api('POST', '/candidato/codigo', { body: { celular: '+573139990000' } });
    await flush();
    expect(r.statusCode).toBe(202);
    expect(wa.sent.length).toBe(before);
    // un celular inválido sí se rechaza (no depende de la base)
    expect((await w.api('POST', '/candidato/codigo', { body: { celular: '123' } })).statusCode).toBe(422);
  });

  it('bloquea tras 5 intentos fallidos', async () => {
    const beto = await mkWorker('Beto');
    await w.api('POST', '/candidato/codigo', { body: { celular: beto.phone } });
    for (let i = 0; i < 5; i++) {
      const r = await w.api('POST', '/candidato/verificar', { body: { celular: beto.phone, code: '000000' } });
      expect([422]).toContain(r.statusCode);
    }
    const locked = await w.api('POST', '/candidato/verificar', { body: { celular: beto.phone, code: '000000' } });
    expect(locked.statusCode).toBe(429);
  });

  it('no reenvía un código antes del enfriamiento', async () => {
    const eva = await mkWorker('Eva');
    await w.api('POST', '/candidato/codigo', { body: { celular: eva.phone } });
    await flush();
    const n1 = sentTo(eva).filter((s) => /código para entrar/.test(s.msg.text)).length;
    await w.api('POST', '/candidato/codigo', { body: { celular: eva.phone } });
    await flush();
    expect(sentTo(eva).filter((s) => /código para entrar/.test(s.msg.text)).length).toBe(n1);
  });

  it('rechaza sin sesión, con cookie manipulada o vencida', async () => {
    expect((await w.api('GET', '/yo')).statusCode).toBe(401);
    const ana = await mkWorker('Ana2');
    const good = makeSessionToken(ana.id, env.BETTER_AUTH_SECRET);
    expect((await w.api('GET', '/yo', { cookie: `te_cand=${good}x` })).statusCode).toBe(401);
    const old = makeSessionToken(ana.id, env.BETTER_AUTH_SECRET, Date.now() - 13 * 3600_000);
    expect(readSessionToken(old, env.BETTER_AUTH_SECRET)).toBeNull();
    expect((await w.api('GET', '/yo', { cookie: `te_cand=${old}` })).statusCode).toBe(401);
    // firmada con otro secreto
    expect(readSessionToken(makeSessionToken(ana.id, 'otro-secreto'), env.BETTER_AUTH_SECRET)).toBeNull();
    expect((await w.api('GET', '/yo', { cookie: `te_cand=${good}` })).statusCode).toBe(200);
  });

  it('la sesión de un gerente no sirve en /yo', async () => {
    expect((await w.api('GET', '/yo', { cookie: w.A.cookie })).statusCode).toBe(401);
  });
});

describe('panel /yo', () => {
  it('lista sus turnos y marca como disputable un no_show reciente', async () => {
    const ana = await mkWorker('Ana3');
    const aid = await noShow(ana);
    const { cookie } = await login(ana);
    const yo = (await w.api('GET', '/yo', { cookie })).json();
    const t = yo.turnos.find((x: { assignmentId: string }) => x.assignmentId === aid);
    expect(t).toMatchObject({ estado: 'no_show', disputable: true, org: 'Org A' });
  });

  it('abre una disputa por un turno concreto y no permite repetirla', async () => {
    const ana = await mkWorker('Ana4');
    const a1 = await noShow(ana, 30);
    const a2 = await noShow(ana, 2);
    const { cookie } = await login(ana);

    const short = await w.api('POST', '/yo/disputas', { cookie, body: { assignmentId: a1, motivo: 'corto' } });
    expect(short.statusCode).toBe(422);

    const ok = await w.api('POST', '/yo/disputas', { cookie, body: { assignmentId: a1, motivo: 'Estuve ahí, el jefe de sala me vio entrar.' } });
    expect(ok.statusCode).toBe(201);
    // se disputó el turno elegido, no el más reciente
    expect((await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE id = ${a1}`))[0]!.status).toBe('disputed');
    expect((await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE id = ${a2}`))[0]!.status).toBe('no_show');

    const again = await w.api('POST', '/yo/disputas', { cookie, body: { assignmentId: a1, motivo: 'Estuve ahí, el jefe de sala me vio entrar.' } });
    expect(again.statusCode).toBe(404);
    // la empresa la ve en su panel
    const list = (await w.api('GET', `/orgs/${w.A.orgId}/disputes?estado=abierta`, { cookie: w.A.cookie })).json().disputas;
    expect(list.some((d: { assignmentId: string }) => d.assignmentId === a1)).toBe(true);
  });

  it('no deja disputar el turno de otra persona', async () => {
    const ana = await mkWorker('Ana5');
    const beto = await mkWorker('Beto5');
    const aBeto = await noShow(beto);
    const { cookie } = await login(ana);
    const r = await w.api('POST', '/yo/disputas', { cookie, body: { assignmentId: aBeto, motivo: 'Este turno no es mío pero lo disputo.' } });
    expect(r.statusCode).toBe(404);
    expect((await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE id = ${aBeto}`))[0]!.status).toBe('no_show');
  });

  it('ordena canales ya habilitados y rechaza habilitar uno nuevo', async () => {
    const ana = await mkWorker('Ana6');
    const { cookie } = await login(ana);
    const nope = await w.api('PUT', '/yo/canales', { cookie, body: { prioridad: ['telegram', 'whatsapp'] } });
    expect(nope.statusCode).toBe(422);
    expect(nope.json().error).toBe('channel_not_enabled');

    await owner(sql`INSERT INTO worker_channels (worker_id, canal, identificador, habilitado, prioridad, verificado_at) VALUES (${ana.id}, 'telegram', ${`tg${n++}`}, true, 100, now())`);
    const ok = await w.api('PUT', '/yo/canales', { cookie, body: { prioridad: ['telegram', 'whatsapp'] } });
    expect(ok.statusCode).toBe(200);
    const yo = (await w.api('GET', '/yo', { cookie })).json();
    const prio = (c: string) => yo.canales.find((x: { canal: string }) => x.canal === c).prioridad;
    expect(prio('telegram')).toBeLessThan(prio('whatsapp'));
    const dup = await w.api('PUT', '/yo/canales', { cookie, body: { prioridad: ['telegram', 'telegram'] } });
    expect(dup.statusCode).toBe(422);
  });

  it('BAJA: pasa a baja en las orgs, avisa una vez y apaga los canales', async () => {
    const ana = await mkWorker('Ana7');
    const { cookie } = await login(ana);
    const before = sentTo(ana).length;
    const r = await w.api('POST', '/yo/baja', { cookie, body: {} });
    expect(r.statusCode).toBe(200);
    await flush();
    expect((await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE worker_id = ${ana.id}`)).every((x) => x.estado === 'baja')).toBe(true);
    expect((await owner<{ habilitado: boolean }>(sql`SELECT habilitado FROM worker_channels WHERE worker_id = ${ana.id}`)).every((c) => !c.habilitado)).toBe(true);
    expect(sentTo(ana).length - before).toBe(1);
  });

  it('BORRAR MIS DATOS: borra nombre y celular, invalida la sesión y conserva los turnos', async () => {
    const ana = await mkWorker('Ana8');
    const aid = await noShow(ana);
    const { cookie } = await login(ana);
    const r = await w.api('POST', '/yo/borrar', { cookie, body: {} });
    expect(r.statusCode).toBe(200);
    expect(String(r.headers['set-cookie'])).toMatch(/Max-Age=0/);
    const row = (await owner<{ nombre: string | null; celular: string | null }>(sql`SELECT nombre, celular FROM workers WHERE id = ${ana.id}`))[0]!;
    expect(row).toEqual({ nombre: null, celular: null });
    expect((await owner(sql`SELECT 1 FROM candidate_login_codes WHERE worker_id = ${ana.id}`)).length).toBe(0);
    expect((await owner(sql`SELECT 1 FROM assignments WHERE id = ${aid}`)).length).toBe(1);
    // la cookie vieja ya no entra
    expect((await w.api('GET', '/yo', { cookie })).statusCode).toBe(401);
  });

  it('cerrar sesión limpia la cookie y bloquea orígenes ajenos en rutas que cambian datos', async () => {
    const out = await w.api('POST', '/candidato/salir', { body: {} });
    expect(String(out.headers['set-cookie'])).toMatch(/Max-Age=0/);
    const ana = await mkWorker('Ana9');
    const { cookie } = await login(ana);
    const evil = await w.app.inject({
      method: 'POST', url: '/yo/baja', headers: { origin: 'https://evil.example', cookie }, payload: {},
    });
    expect(evil.statusCode).toBe(403);
    expect((await owner<{ estado: string }>(sql`SELECT estado FROM org_workers WHERE worker_id = ${ana.id}`)).every((x) => x.estado !== 'baja')).toBe(true);
  });
});

describe('documentos del candidato', () => {
  it('ve lo que pide su rol y qué le falta; sin almacenamiento configurado no se puede subir', async () => {
    const ana = await mkWorker('Ana documentos');
    const { cookie } = await login(ana);
    const r = await w.api('GET', '/yo/documentos', { cookie });
    expect(r.statusCode).toBe(200);
    const org = r.json().organizaciones.find((o: { orgId: string }) => o.orgId === w.A.orgId);
    expect(org.requisitos).toHaveLength(2);
    expect(org.requisitos).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: 'cedula', obligatorio: true, vigenciaRequerida: false, documento: null }),
      expect.objectContaining({ tipo: 'carnet_manipulacion_alimentos', obligatorio: true, documento: null }),
    ]));
    const up = await w.app.inject({
      method: 'POST', url: `/yo/documentos?orgId=${w.A.orgId}&tipo=carnet_manipulacion_alimentos&vence=2030-01-01`,
      headers: { cookie, origin: env.CORS_ORIGINS[0], 'content-type': 'application/pdf' }, payload: Buffer.from('%PDF-1.4 prueba'),
    });
    expect(up.statusCode).toBe(503);
    expect((await w.api('GET', '/yo/documentos', {})).statusCode).toBe(401);
  });

  it('con almacenamiento simulado sube la cédula (sin vencimiento) y la empresa la ve', async () => {
    process.env.MOCK_STORAGE = 'true';
    process.env.MOCK_STORAGE_DIR = join(tmpdir(), `mock-docs-${Date.now()}`);
    try {
      const ana = await mkWorker('Ana cédula');
      const { cookie } = await login(ana);
      expect((await w.api('GET', '/yo/documentos', { cookie })).json().archivos).toBe(true);

      const send = (tipo: string, body: Buffer) => w.app.inject({
        method: 'POST', url: `/yo/documentos?orgId=${w.A.orgId}&tipo=${tipo}`,
        headers: { cookie, origin: env.CORS_ORIGINS[0], 'content-type': 'application/pdf' }, payload: body,
      });
      expect((await send('cedula', Buffer.from('no es un pdf'))).statusCode).toBe(415);
      const up = await send('cedula', Buffer.from('%PDF-1.4 cedula de prueba'));
      expect(up.statusCode).toBe(201);

      const org = (await w.api('GET', '/yo/documentos', { cookie })).json().organizaciones.find((o: { orgId: string }) => o.orgId === w.A.orgId);
      const ced = org.requisitos.find((r: { tipo: string }) => r.tipo === 'cedula');
      expect(ced.documento).toMatchObject({ estado: 'pendiente', tieneArchivo: true });

      // La empresa abre el archivo por la API (nunca por un enlace público).
      const docId = ced.documento.id as string;
      const file = await w.app.inject({ method: 'GET', url: `/orgs/${w.A.orgId}/documents/${docId}/archivo`, headers: { cookie: w.A.cookie, origin: env.APP_URL } });
      expect(file.statusCode).toBe(200);
      expect(file.rawPayload.toString()).toContain('cedula de prueba');
    } finally {
      delete process.env.MOCK_STORAGE;
      delete process.env.MOCK_STORAGE_DIR;
    }
  });
});
