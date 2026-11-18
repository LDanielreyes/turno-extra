import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  EmailChannel, DISPUTE_WINDOW_DAYS, enqueue, deleteWorkerData, dispatchOnce, exportWorkerData, handleInbound, rowsOf,
  type Channel, type OutMessage,
} from '@turnoextra/channels';
import { withSuper } from '@turnoextra/db';
import { csvCell, monthRange } from '../src/routes/attendance.js';
import { runLoad } from '../src/load.js';
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
const emailChannel = new EmailChannel({ send: async () => undefined, baseUrl: 'http://localhost:3000', secret: env.BETTER_AUTH_SECRET });
const channels = () => new Map<string, Channel>([['whatsapp', wa], ['telegram', tg], ['email', emailChannel]]);
const engine = { policyUrl: 'https://turnoextra.test/legal', telegramBot: 'turnoextra_bot' };

beforeAll(async () => {
  w = await createWorld({ RATE_LIMIT_MAX: 100_000 });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});
// Banca y agenda limpias en cada prueba.
beforeEach(async () => {
  await w.t.asOwner(async (o) => {
    await o.execute(sql`UPDATE org_workers SET estado = 'baja_org' WHERE estado = 'activo'`);
    await o.execute(sql`UPDATE shifts SET estado = 'cancelado' WHERE estado IN ('abierto','cubierto')`);
  });
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
let n = 0;
const newPhone = () => `+57312${String(7770000 + n++)}`;
const digits = (p: string) => p.replace(/\D/g, '');

type Person = { id: string; phone: string };
async function mkWorker(nombre: string, org = w.A): Promise<Person> {
  const phone = newPhone();
  const r = await w.api('POST', `/orgs/${org.orgId}/workers`, { cookie: org.cookie, body: { nombre, celular: phone, roleId: w.roleId('mesero') } });
  expect(r.statusCode).toBe(201);
  const linkId = r.json().id as string;
  const id = (await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${linkId}`))[0]!.worker_id;
  const code = (await w.api('GET', `/orgs/${org.orgId}/invitacion`, { cookie: org.cookie })).json().codigo as string;
  const ask = await say({ phone }, `ALTA ${code}`);
  const consent = ask.replies.find((m) => m.buttons);
  if (!consent) throw new Error(`ALTA ${nombre}: ${ask.handled} ${JSON.stringify(ask.replies)}`);
  await say({ phone }, { button: consent.buttons![0]!.id });
  return { id, phone };
}

async function say(who: { phone: string }, what: string | { button: string }) {
  const before = wa.sent.length;
  const r = await handleInbound(w.t.db, engine, {
    canal: 'whatsapp', externalId: randomUUID(), from: digits(who.phone),
    ...(typeof what === 'string' ? { text: what } : { buttonId: what.button }),
  });
  await flush();
  return { ...r, replies: wa.sent.slice(before).map((s) => s.msg) };
}
async function flush() {
  for (let i = 0; i < 6; i++) if (!(await dispatchOnce(w.t.db, channels())).claimed) break;
}
const sentTo = (p: Person) => wa.sent.filter((s) => digits(s.to) === digits(p.phone));

/** Turno ya terminado (terminó hace `endedHoursAgo` horas) con las personas dadas confirmadas. */
async function pastShift(org: typeof w.A, people: Person[], endedHoursAgo = 2) {
  const id = randomUUID();
  await owner(sql`INSERT INTO shifts (id, org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, estado, created_by)
    VALUES (${id}, ${org.orgId}, ${w.roleId('mesero')}, now() - make_interval(hours => ${endedHoursAgo + 5}), now() - make_interval(hours => ${endedHoursAgo}),
            ${people.length}, 400000, 300000, 'cubierto', 'test')`);
  const ids: string[] = [];
  for (const p of people) {
    const aid = randomUUID();
    ids.push(aid);
    await owner(sql`INSERT INTO assignments (id, org_id, shift_id, worker_id, status) VALUES (${aid}, ${org.orgId}, ${id}, ${p.id}, 'confirmed')`);
  }
  return { id, ids };
}
const statusOf = async (assignmentId: string) => (await owner<{ status: string }>(sql`SELECT status FROM assignments WHERE id = ${assignmentId}`))[0]!.status;
const mark = (org: typeof w.A, shiftId: string, marks: { assignmentId: string; status: string }[]) =>
  w.api('POST', `/orgs/${org.orgId}/shifts/${shiftId}/attendance`, { cookie: org.cookie, body: { marks } });
const auditActions = async (like: string) =>
  (await owner<{ accion: string }>(sql`SELECT accion FROM audit_log WHERE accion LIKE ${like} ORDER BY id`)).map((r) => r.accion);

describe('asistencia', () => {
  it('no se puede marcar antes de que termine el turno', async () => {
    const ana = await mkWorker('Ana');
    const s = await pastShift(w.A, [ana]);
    await owner(sql`UPDATE shifts SET fin = now() + interval '1 hour' WHERE id = ${s.id}`);
    const r = await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'completed' }]);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('shift_not_finished');
    expect(await statusOf(s.ids[0]!)).toBe('confirmed');
  });

  it('marca completed y no_show, avisa solo al no_show (W19) y cierra el turno', async () => {
    const ana = await mkWorker('Ana');
    const beto = await mkWorker('Beto');
    const s = await pastShift(w.A, [ana, beto]);
    const list = await w.api('GET', `/orgs/${w.A.orgId}/shifts/${s.id}/assignments`, { cookie: w.A.cookie });
    expect(list.json().terminado).toBe(true);
    expect(list.json().asignaciones.map((a: { nombre: string }) => a.nombre).sort()).toEqual(['Ana', 'Beto']);

    const before = sentTo(beto).length;
    const r = await mark(w.A, s.id, [
      { assignmentId: s.ids[0]!, status: 'completed' },
      { assignmentId: s.ids[1]!, status: 'no_show' },
      { assignmentId: randomUUID(), status: 'completed' }, // no es de este turno
    ]);
    expect(r.statusCode).toBe(200);
    expect(r.json().marcadas).toBe(2);
    expect(r.json().rechazadas).toHaveLength(1);
    await flush();
    expect(await statusOf(s.ids[0]!)).toBe('completed');
    expect(await statusOf(s.ids[1]!)).toBe('no_show');
    expect((await owner<{ estado: string }>(sql`SELECT estado FROM shifts WHERE id = ${s.id}`))[0]!.estado).toBe('completado');

    const w19 = sentTo(beto).slice(before);
    expect(w19).toHaveLength(1);
    expect(w19[0]!.msg.text).toContain('registró que no asististe');
    expect(sentTo(ana).some((m) => m.msg.text.includes('no asististe'))).toBe(false);

    // Repetir la misma marca no vuelve a avisar.
    await mark(w.A, s.id, [{ assignmentId: s.ids[1]!, status: 'no_show' }]);
    await flush();
    expect(sentTo(beto).slice(before)).toHaveLength(1);
    expect(await auditActions('attendance.%')).toEqual(expect.arrayContaining(['attendance.completed', 'attendance.no_show']));
  });

  it('otra org no ve ni marca el turno (404)', async () => {
    const ana = await mkWorker('Ana');
    const s = await pastShift(w.A, [ana]);
    expect((await w.api('GET', `/orgs/${w.B.orgId}/shifts/${s.id}/assignments`, { cookie: w.B.cookie })).statusCode).toBe(404);
    expect((await mark(w.B, s.id, [{ assignmentId: s.ids[0]!, status: 'no_show' }])).statusCode).toBe(404);
    expect(await statusOf(s.ids[0]!)).toBe('confirmed');
  });

  it('un turno cancelado no admite asistencia', async () => {
    const ana = await mkWorker('Ana');
    const s = await pastShift(w.A, [ana]);
    await owner(sql`UPDATE shifts SET estado = 'cancelado' WHERE id = ${s.id}`);
    expect((await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'completed' }])).statusCode).toBe(409);
  });
});

describe('disputas (T23)', () => {
  it('el candidato disputa un no_show por el canal: estado disputed, alerta, bitácora y efecto solo en esa org', async () => {
    const ana = await mkWorker('Ana');
    // Mismo candidato con un no_show más viejo en la org B: no debe cambiar.
    const other = await pastShift(w.B, [ana], 24 * 8);
    await owner(sql`UPDATE assignments SET status = 'no_show' WHERE id = ${other.ids[0]!}`);
    const s = await pastShift(w.A, [ana]);
    await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'no_show' }]);

    // Un «ok» suelto no abre nada.
    expect((await say(ana, 'ok')).handled).toBe('help');
    expect(await statusOf(s.ids[0]!)).toBe('no_show');

    const r = await say(ana, 'Estaba en el turno, mi jefe de área me vio llegar a las 6');
    expect(r.handled).toBe('dispute_opened');
    expect(r.replies[0]!.text).toContain('Recibimos tu explicación');
    expect(await statusOf(s.ids[0]!)).toBe('disputed');
    expect(await statusOf(other.ids[0]!)).toBe('no_show');

    const mine = await w.api('GET', `/orgs/${w.A.orgId}/disputes?estado=abierta`, { cookie: w.A.cookie });
    const mineHere = (mine.json().disputas as { shiftId: string; motivo: string }[]).filter((d) => d.shiftId === s.id);
    expect(mineHere).toHaveLength(1);
    expect(mineHere[0]).toMatchObject({ estado: 'abierta', nombre: 'Ana' });
    expect(mineHere[0]!.motivo).toContain('mi jefe de área');
    // La org B no ve la disputa de A.
    expect((await w.api('GET', `/orgs/${w.B.orgId}/disputes`, { cookie: w.B.cookie })).json().disputas).toHaveLength(0);

    const alerts = await w.api('GET', `/orgs/${w.A.orgId}/alerts?solo=pendientes`, { cookie: w.A.cookie });
    expect(JSON.stringify(alerts.json())).toContain('disputa_abierta');
    expect(await auditActions('dispute.%')).toContain('dispute.opened');

    // Ya no queda ningún no_show disputable de A, y el de B está fuera de la ventana de 7 días.
    expect((await say(ana, 'Otra explicación más larga que la anterior')).handled).toBe('help');
    expect(DISPUTE_WINDOW_DAYS).toBe(7);
  });

  it('un no_show fuera de la ventana de 7 días ya no se puede disputar', async () => {
    const ana = await mkWorker('Ana');
    const s = await pastShift(w.A, [ana], 24 * 8);
    await owner(sql`UPDATE assignments SET status = 'no_show' WHERE id = ${s.ids[0]!}`);
    expect((await say(ana, 'Quiero explicar lo que pasó ese día')).handled).toBe('help');
    expect(await statusOf(s.ids[0]!)).toBe('no_show');
  });

  it('la empresa resuelve: upheld mantiene el no_show, reversed lo corrige; una sola vez; solo su org', async () => {
    const ana = await mkWorker('Ana');
    const beto = await mkWorker('Beto');
    const s = await pastShift(w.A, [ana, beto]);
    await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'no_show' }, { assignmentId: s.ids[1]!, status: 'no_show' }]);
    await say(ana, 'Sí fui, tengo foto del registro de entrada');
    await say(beto, 'Me avisaron que el turno se había cancelado');
    const open = ((await w.api('GET', `/orgs/${w.A.orgId}/disputes?estado=abierta`, { cookie: w.A.cookie })).json().disputas as { id: string; nombre: string; shiftId: string }[])
      .filter((d) => d.shiftId === s.id);
    expect(open).toHaveLength(2);
    const dAna = open.find((d) => d.nombre === 'Ana')!.id;
    const dBeto = open.find((d) => d.nombre === 'Beto')!.id;

    // Otra org: 404 y no cambia nada.
    expect((await w.api('POST', `/orgs/${w.B.orgId}/disputes/${dAna}/resolve`, { cookie: w.B.cookie, body: { resolucion: 'reversed' } })).statusCode).toBe(404);
    expect(await statusOf(s.ids[0]!)).toBe('disputed');
    expect((await w.api('POST', `/orgs/${w.A.orgId}/disputes/${dAna}/resolve`, { cookie: w.A.cookie, body: { resolucion: 'otra' } })).statusCode).toBe(400);

    const before = sentTo(ana).length;
    const ok = await w.api('POST', `/orgs/${w.A.orgId}/disputes/${dAna}/resolve`, { cookie: w.A.cookie, body: { resolucion: 'reversed', nota: 'Se verificó el registro' } });
    expect(ok.statusCode).toBe(200);
    expect(await statusOf(s.ids[0]!)).toBe('completed');
    await flush();
    expect(sentTo(ana).slice(before)[0]!.msg.text).toContain('queda como asistido');

    await w.api('POST', `/orgs/${w.A.orgId}/disputes/${dBeto}/resolve`, { cookie: w.A.cookie, body: { resolucion: 'upheld' } });
    expect(await statusOf(s.ids[1]!)).toBe('no_show');
    await flush();
    expect(sentTo(beto).at(-1)!.msg.text).toContain('mantiene el registro');

    // Ya resuelta: no se puede resolver otra vez ni reabrir.
    expect((await w.api('POST', `/orgs/${w.A.orgId}/disputes/${dAna}/resolve`, { cookie: w.A.cookie, body: { resolucion: 'upheld' } })).statusCode).toBe(404);
    expect((await say(beto, 'Insisto, tengo evidencia nueva del caso')).handled).toBe('help');
    expect(await auditActions('dispute.%')).toEqual(expect.arrayContaining(['dispute.opened', 'dispute.reversed', 'dispute.upheld']));

    // Las alertas de disputa quedaron atendidas.
    const pend = (await w.api('GET', `/orgs/${w.A.orgId}/alerts?solo=pendientes`, { cookie: w.A.cookie })).json();
    expect((pend.alerts as { tipo: string; shiftId: string }[]).filter((a) => a.tipo === 'disputa_abierta' && a.shiftId === s.id)).toHaveLength(0);
  });

  it('no se puede marcar asistencia sobre una asignación en disputa', async () => {
    const ana = await mkWorker('Ana');
    const s = await pastShift(w.A, [ana]);
    await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'no_show' }]);
    await say(ana, 'Estuve ahí todo el turno, pregunten a mi compañero');
    const r = await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'completed' }]);
    expect(r.json().rechazadas).toEqual([s.ids[0]]);
    expect(await statusOf(s.ids[0]!)).toBe('disputed');
  });
});

describe('reporte mensual CSV', () => {
  it('csvCell escapa comillas y neutraliza fórmulas; monthRange usa hora de Bogotá', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1+1')).toBe("'-1+1");
    expect(csvCell(null)).toBe('');
    expect(monthRange('2026-12')).toEqual({ from: new Date('2026-12-01T05:00:00Z'), to: new Date('2027-01-01T05:00:00Z') });
  });

  /** Turno en fechas fijas (hora de Bogotá, −05:00) con una persona y un estado de asistencia. */
  async function shiftOn(org: typeof w.A, startBog: string, endBog: string, who: Person, status: string) {
    const id = randomUUID();
    await owner(sql`INSERT INTO shifts (id, org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, estado, created_by)
      VALUES (${id}, ${org.orgId}, ${w.roleId('mesero')}, ${startBog + '-05:00'}::timestamptz, ${endBog + '-05:00'}::timestamptz, 1, 400000, 300000, 'completado', 'test')`);
    await owner(sql`INSERT INTO assignments (org_id, shift_id, worker_id, status) VALUES (${org.orgId}, ${id}, ${who.id}, ${status}::assign_status)`);
    return id;
  }
  const rowFor = (body: string, name: string) => body.split('\n').find((l) => l.startsWith(name))?.replace(/\r$/, '');
  const csv = async (org: typeof w.A, mes: string) =>
    ((await w.api('GET', `/orgs/${org.orgId}/reports/monthly?mes=${mes}`, { cookie: org.cookie })) as unknown as { body: string }).body;

  it('T13: por trabajador, con turno que cruza medianoche y otro que cruza fin de mes (horas por mes de Bogotá)', async () => {
    const ana = await mkWorker('Ana Reporte');
    const beto = await mkWorker('Beto Reporte');
    // Viernes 20:00 → sábado 02:00 (6 h nocturnas, cruza medianoche).
    await shiftOn(w.A, '2026-03-06T20:00:00', '2026-03-07T02:00:00', ana, 'completed');
    // 31 de marzo 22:00 → 1 de abril 04:00 (2 h en marzo, 4 h en abril; todas nocturnas).
    await shiftOn(w.A, '2026-03-31T22:00:00', '2026-04-01T04:00:00', ana, 'completed');
    // Domingo 8 de marzo 08:00 → 16:00 (8 h dominicales, diurnas).
    await shiftOn(w.A, '2026-03-08T08:00:00', '2026-03-08T16:00:00', ana, 'completed');
    // Beto: una inasistencia, una disputa y un turno sin marcar; no suman horas.
    await shiftOn(w.A, '2026-03-10T08:00:00', '2026-03-10T12:00:00', beto, 'no_show');
    await shiftOn(w.A, '2026-03-11T08:00:00', '2026-03-11T12:00:00', beto, 'disputed');
    await shiftOn(w.A, '2026-03-12T08:00:00', '2026-03-12T12:00:00', beto, 'confirmed');
    // Turno de Ana en otra org: no aparece en el reporte de A.
    await shiftOn(w.B, '2026-03-20T08:00:00', '2026-03-20T16:00:00', ana, 'completed');

    const last4 = ana.phone.slice(-4);
    const mar = await csv(w.A, '2026-03');
    expect(mar.slice(0, 400)).toContain('nombre,celular,dias,turnos,horas');
    // días: 6 y 7 (cruce), 8 y 31 → 4; turnos 3; horas 6+2+8; nocturnas 6+2; dominicales 8 (+0)
    expect(rowFor(mar, 'Ana Reporte')).toBe(`Ana Reporte,***${last4},4,3,16,8,8,0,0,0`);
    expect(rowFor(mar, 'Beto Reporte')).toMatch(/^Beto Reporte,\*\*\*\d{4},0,0,0,0,0,1,1,1$/);
    const abr = await csv(w.A, '2026-04');
    expect(rowFor(abr, 'Ana Reporte')).toBe(`Ana Reporte,***${last4},1,1,4,4,0,0,0,0`);
    expect(mar).not.toMatch(/\+57\d{6,}/); // sin celulares completos

    // Otra org: solo ve lo suyo.
    expect(rowFor(await csv(w.B, '2026-03'), 'Ana Reporte')).toBeUndefined();

    // T12 + T19: BORRAR MIS DATOS; el reporte sigue, anonimizado y con las mismas horas.
    await withSuper(w.t.db, (tx) => deleteWorkerData(tx, ana.id, { actorId: 'cli:data-delete' }));
    const after = await csv(w.A, '2026-03');
    expect(rowFor(after, 'Ana Reporte')).toBeUndefined();
    expect(rowFor(after, '[borrado]')).toBe('[borrado],,4,3,16,8,8,0,0,0');

    expect((await w.api('GET', `/orgs/${w.A.orgId}/reports/monthly?mes=2026-13`, { cookie: w.A.cookie })).statusCode).toBe(400);
    expect((await w.api('GET', `/orgs/${w.A.orgId}/reports/monthly?mes=2026-03`)).statusCode).toBe(401);
    expect((await w.api('GET', `/orgs/${w.B.orgId}/reports/monthly?mes=2026-03`, { cookie: w.A.cookie })).statusCode).toBeGreaterThanOrEqual(403);
  });
});

describe('data export / delete', () => {
  it('exporta lo que se guarda de la persona y el borrado vacía el motivo de su disputa', async () => {
    const ana = await mkWorker('Ana');
    const s = await pastShift(w.A, [ana]);
    await mark(w.A, s.id, [{ assignmentId: s.ids[0]!, status: 'no_show' }]);
    await say(ana, 'Sí asistí, tengo testigos del turno completo');

    const exp = await withSuper(w.t.db, (tx) => exportWorkerData(tx, ana.id));
        expect(exp!.persona.celular).toBe(ana.phone);
    expect(exp!.empresas.map((e) => e.nombre)).toContain('Ana');
    expect(exp!.canales.map((c) => c.canal)).toContain('whatsapp');
    expect(exp!.turnos).toHaveLength(1);
    expect(exp!.disputas[0]!.motivo).toContain('testigos');

    await withSuper(w.t.db, (tx) => deleteWorkerData(tx, ana.id, { actorId: 'cli:data-delete' }));
    const gone = await withSuper(w.t.db, (tx) => exportWorkerData(tx, ana.id));
    expect(gone!.persona.celular).toBeNull();
    expect(gone!.disputas[0]!.motivo).toBe('[borrado]');
    expect(gone!.canales).toHaveLength(0);
    // El turno y su asistencia siguen (anónimos).
    expect(await statusOf(s.ids[0]!)).toBe('disputed');
  });
});

describe('T14 · rescate de la cola', () => {
  it('un envío que quedó «sending» porque el proceso murió se recupera al vencer la reserva; antes no se toca', async () => {
    const ana = await mkWorker('Ana Cola');
    await flush();
    await withSuper(w.t.db, (tx) => enqueue(tx, { canal: 'whatsapp', to: ana.phone, msg: { text: 'prueba de rescate' }, workerId: ana.id, orgId: w.A.orgId }));
    const id = (await owner<{ id: number }>(sql`SELECT id FROM outbox WHERE estado = 'pending' ORDER BY id DESC LIMIT 1`))[0]!.id;

    // Un worker lo tomó y murió: reserva todavía vigente → nadie más lo toma.
    await owner(sql`UPDATE outbox SET estado = 'sending', attempts = 1, locked_until = now() + interval '30 seconds' WHERE id = ${id}`);
    const before = wa.sent.length;
    await flush();
    expect(wa.sent.length).toBe(before);

    // La reserva vence → otro worker lo recupera y lo envía una sola vez.
    await owner(sql`UPDATE outbox SET locked_until = now() - interval '1 second' WHERE id = ${id}`);
    await flush();
    expect(wa.sent.slice(before).filter((m) => m.msg.text === 'prueba de rescate')).toHaveLength(1);
    expect((await owner<{ estado: string }>(sql`SELECT estado FROM outbox WHERE id = ${id}`))[0]!.estado).toBe('sent');
  });
});

describe('script de carga', () => {
  it('50 aceptaciones simultáneas para 5 cupos: exactamente 5 confirmados, reservas hasta el tope, el resto «lleno»', async () => {
    const r = await runLoad(w.t.db, { n: 50, cupos: 5 });
    expect(r.ok).toBe(true);
    expect(r.confirmados).toBe(5);
    expect(r.enEspera).toBe(2); // standby_max por defecto
    expect(r.outcomes).toEqual({ confirmed: 5, standby: 2, full: 43 });
  });
});
