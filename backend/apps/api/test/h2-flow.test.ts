import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { rowsOf } from '@turnoextra/channels';
import { createWorld, type World } from './world.js';

let w: World;
const hours = (d: number, h: number) => new Date(Date.now() + d * 86400_000 + h * 3600_000).toISOString();
// Turno en 5 días, 5 horas de duración (la hora exacta no importa: el piso se lee del preview).
const win = { inicio: hours(5, 0), fin: hours(5, 5) };

beforeAll(async () => {
  w = await createWorld();
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

let workerId: string;
let docId: string;

describe('banca', () => {
  it('rechaza un celular inválido y un rol no habilitado', async () => {
    const bad = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre: 'Ana', celular: '123', roleId: w.roleId('mesero') } });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error).toBe('invalid_phone');
    const role = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre: 'Ana', celular: '300 123 4567', roleId: w.roleId('cocina') } });
    expect(role.json().error).toBe('role_not_enabled');
  });

  it('registra un trabajador como pendiente, sin mostrar el celular completo', async () => {
    const r = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre: 'Ana Gómez', celular: '+57 300 123 4567', roleId: w.roleId('mesero') } });
    expect(r.statusCode).toBe(201);
    expect(r.json().estado).toBe('pendiente');
    workerId = r.json().id;
    const list = await w.api('GET', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie });
    expect(list.json().workers).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toContain('3001234567');
    expect(list.json().workers[0].celular).toBe('+57 *** *** 4567');
  });

  it('el mismo celular no se duplica en la misma org (409) pero otra org puede tenerlo', async () => {
    const dup = await w.api('POST', `/orgs/${w.A.orgId}/workers`, { cookie: w.A.cookie, body: { nombre: 'Otra', celular: '3001234567', roleId: w.roleId('mesero') } });
    expect(dup.statusCode).toBe(409);
    const inB = await w.api('POST', `/orgs/${w.B.orgId}/workers`, { cookie: w.B.cookie, body: { nombre: 'Ana en B', celular: '3001234567', roleId: w.roleId('mesero') } });
    expect(inB.statusCode).toBe(201);
    const rowsB = (await w.api('GET', `/orgs/${w.B.orgId}/workers`, { cookie: w.B.cookie })).json().workers;
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].nombre).toBe('Ana en B'); // el nombre que le dio A no se filtra a B
  });

  it('T6: B no puede ver ni modificar el trabajador de A', async () => {
    const own = await w.api('PATCH', `/orgs/${w.B.orgId}/workers/${workerId}`, { cookie: w.B.cookie, body: { favorito: true } });
    expect(own.statusCode).toBe(404);
    const cross = await w.api('GET', `/orgs/${w.A.orgId}/workers`, { cookie: w.B.cookie });
    expect(cross.statusCode).toBe(404);
  });

  it('marca favorito y filtra', async () => {
    expect((await w.api('PATCH', `/orgs/${w.A.orgId}/workers/${workerId}`, { cookie: w.A.cookie, body: { favorito: true } })).statusCode).toBe(200);
    const fav = await w.api('GET', `/orgs/${w.A.orgId}/workers?favorito=true`, { cookie: w.A.cookie });
    expect(fav.json().workers).toHaveLength(1);
  });
});

describe('documentos', () => {
  it('queda pendiente y la empresa lo aprueba con trazabilidad', async () => {
    // El candidato sube el documento desde su panel (h7-docs); la empresa solo lo revisa.
    docId = (await w.t.asOwner(async (o) => rowsOf<{ id: string }>(await o.execute(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, vence_at) SELECT org_id, worker_id, 'carnet_manipulacion_alimentos', '2030-01-01' FROM org_workers WHERE id = ${workerId} RETURNING id`))))[0]!.id;
    await w.t.asOwner((o) => o.execute(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, estado) SELECT org_id, worker_id, 'cedula', 'aprobado' FROM org_workers WHERE id = ${workerId}`));
    const ap = await w.api('PATCH', `/orgs/${w.A.orgId}/documents/${docId}`, { cookie: w.A.cookie, body: { estado: 'aprobado' } });
    expect(ap.statusCode).toBe(200);
    const list = await w.api('GET', `/orgs/${w.A.orgId}/workers/${workerId}/documents`, { cookie: w.A.cookie });
    expect(list.json().documents[0].estado).toBe('aprobado');
    const audit = (await w.api('GET', `/admin/auditoria?orgId=${w.A.orgId}&limit=100`, { cookie: w.superCookie })).json().entries;
    expect(audit.map((e: { accion: string }) => e.accion)).toContain('document.aprobado');
  });

  it('T6: otra org no puede aprobar el documento', async () => {
    const r = await w.api('PATCH', `/orgs/${w.B.orgId}/documents/${docId}`, { cookie: w.B.cookie, body: { estado: 'rechazado' } });
    expect(r.statusCode).toBe(404);
  });
});

describe('turnos y piso', () => {
  let piso: number;

  it('el piso en vivo devuelve el desglose', async () => {
    const r = await w.api('POST', `/orgs/${w.A.orgId}/shifts/floor-preview`, { cookie: w.A.cookie, body: win });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ valorHoraBase: '8338', horas: '5.00' });
    piso = Number(r.json().pisoTotal);
    expect(piso).toBeGreaterThan(5 * 8338 - 1);
  });

  it('un pago bajo el piso se rechaza con el piso calculado (T4)', async () => {
    const r = await w.api('POST', `/orgs/${w.A.orgId}/shifts`, {
      cookie: w.A.cookie, body: { ...win, roleId: w.roleId('mesero'), cupos: 2, pagoTotal: piso - 1 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ error: 'below_floor', piso: String(piso) });
  });

  it('un pago igual al piso se acepta; cupos, rol y fechas se validan', async () => {
    const base = { ...win, roleId: w.roleId('mesero'), cupos: 2, pagoTotal: piso };
    expect((await w.api('POST', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie, body: { ...base, cupos: 0 } })).statusCode).toBe(400);
    expect((await w.api('POST', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie, body: { ...base, roleId: w.roleId('cocina') } })).json().error).toBe('role_not_enabled');
    expect((await w.api('POST', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie, body: { ...base, inicio: hours(-1, 0), fin: hours(-1, 5) } })).json().error).toBe('starts_in_past');
    expect((await w.api('POST', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie, body: { ...base, fin: hours(5, 20) } })).statusCode).toBe(400); // > 16 h
    const ok = await w.api('POST', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie, body: base });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ estado: 'abierto', piso: String(piso), elegibles: 0 }); // Ana sigue pendiente
  });

  it('con consentimiento (activo) y documento aprobado, Ana pasa a ser elegible', async () => {
    await w.t.asOwner((o) => o.execute(sql`UPDATE org_workers SET estado = 'activo' WHERE id = ${workerId}`));
    const r = await w.api('POST', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie, body: { ...win, roleId: w.roleId('mesero'), cupos: 1, pagoTotal: piso } });
    expect(r.json().elegibles).toBe(1);
    const d = await w.api('GET', `/orgs/${w.A.orgId}/shifts/${r.json().id}`, { cookie: w.A.cookie });
    expect(d.json().elegibles.map((e: { nombre: string }) => e.nombre)).toEqual(['Ana Gómez']);
    expect(d.json()).toMatchObject({ confirmados: 0, enEspera: 0 });
  });

  it('T6: B no ve turnos de A (404) y su listado está vacío', async () => {
    const list = (await w.api('GET', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie })).json().shifts;
    expect(list.length).toBeGreaterThanOrEqual(2);
    const id = list[0].id;
    expect((await w.api('GET', `/orgs/${w.A.orgId}/shifts/${id}`, { cookie: w.B.cookie })).statusCode).toBe(404);
    expect((await w.api('GET', `/orgs/${w.B.orgId}/shifts/${id}`, { cookie: w.B.cookie })).statusCode).toBe(404);
    expect((await w.api('GET', `/orgs/${w.B.orgId}/shifts`, { cookie: w.B.cookie })).json().shifts).toEqual([]);
  });

  it('cancelar un turno lo marca y cancela asignaciones; no se puede cancelar dos veces', async () => {
    const id = (await w.api('GET', `/orgs/${w.A.orgId}/shifts`, { cookie: w.A.cookie })).json().shifts[0].id;
    expect((await w.api('POST', `/orgs/${w.A.orgId}/shifts/${id}/cancel`, { cookie: w.A.cookie })).json().estado).toBe('cancelado');
    expect((await w.api('POST', `/orgs/${w.A.orgId}/shifts/${id}/cancel`, { cookie: w.A.cookie })).statusCode).toBe(404);
  });
});

describe('ajustes de la organización', () => {
  it('guarda parámetros válidos y rechaza los fuera de rango', async () => {
    const ok = await w.api('PATCH', `/orgs/${w.A.orgId}/settings`, { cookie: w.A.cookie, body: { waveMinutes: 1, topeSemanalH: 40 } });
    expect(ok.statusCode).toBe(200);
    const s = await w.api('GET', `/orgs/${w.A.orgId}/settings`, { cookie: w.A.cookie });
    expect(s.json()).toMatchObject({ waveMinutes: 1, topeSemanalH: 40, descansoMinH: 8, standbyMax: 2, relaunchLimit: 2 });
    expect((await w.api('PATCH', `/orgs/${w.A.orgId}/settings`, { cookie: w.A.cookie, body: { waveMinutes: 0 } })).statusCode).toBe(400);
    expect((await w.api('GET', `/orgs/${w.B.orgId}/settings`, { cookie: w.B.cookie })).json().waveMinutes).toBe(3); // B no cambió
  });
});

describe('parámetros legales (super admin)', () => {
  it('quedan sembrados, con la fecha del recargo dominical marcada como sin confirmar', async () => {
    const p = (await w.api('GET', '/admin/legal', { cookie: w.superCookie })).json().params as { clave: string; nota: string }[];
    expect(p.map((x) => x.clave)).toEqual(expect.arrayContaining(['smmlv', 'divisor_horas', 'recargo_nocturno', 'recargo_dominical']));
    expect(p.find((x) => x.clave === 'recargo_dominical')!.nota).toMatch(/sin confirmar/);
  });

  it('una empresa no puede leer ni cambiar parámetros (T22)', async () => {
    expect((await w.api('GET', '/admin/legal', { cookie: w.A.cookie })).statusCode).toBe(403);
    expect((await w.api('POST', '/admin/legal', { cookie: w.A.cookie, body: { clave: 'smmlv', valor: 1, vigenteDesde: '2030-01-01' } })).statusCode).toBe(403);
  });

  it('un parámetro nuevo con vigencia futura cambia el piso solo desde esa fecha', async () => {
    const now = await w.api('POST', `/orgs/${w.A.orgId}/shifts/floor-preview`, { cookie: w.A.cookie, body: win });
    const post = await w.api('POST', '/admin/legal', { cookie: w.superCookie, body: { clave: 'smmlv', valor: 2000000, vigenteDesde: '2030-01-01', nota: 'prueba' } });
    expect(post.statusCode).toBe(201);
    expect((await w.api('POST', '/admin/legal', { cookie: w.superCookie, body: { clave: 'smmlv', valor: 2000000, vigenteDesde: '2030-01-01' } })).statusCode).toBe(409);
    const later = await w.api('POST', `/orgs/${w.A.orgId}/shifts/floor-preview`, {
      cookie: w.A.cookie, body: { inicio: '2030-03-05T15:00:00-05:00', fin: '2030-03-05T20:00:00-05:00' },
    });
    expect(later.json().valorHoraBase).toBe('9524'); // 2.000.000 / 210
    const still = await w.api('POST', `/orgs/${w.A.orgId}/shifts/floor-preview`, { cookie: w.A.cookie, body: win });
    expect(still.json().valorHoraBase).toBe(now.json().valorHoraBase); // hoy no cambia
  });

  it('clave desconocida o valor inválido: 400', async () => {
    expect((await w.api('POST', '/admin/legal', { cookie: w.superCookie, body: { clave: 'otra', valor: 1, vigenteDesde: '2030-01-01' } })).statusCode).toBe(400);
  });
});
