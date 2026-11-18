import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { rowsOf } from '@turnoextra/channels';
import { createWorld, type World } from './world.js';

let w: World;

beforeAll(async () => {
  w = await createWorld({ RATE_LIMIT_MAX: 100_000 });
}, 180_000);
afterAll(async () => {
  await w?.app.close();
  await w?.t.close();
});

const owner = <T>(q: ReturnType<typeof sql>) => w.t.asOwner(async (o) => rowsOf<T>(await o.execute(q)));
const hours = (d: number, h: number) => new Date(Date.now() + d * 86400_000 + h * 3600_000).toISOString();

/** Crea un turno publicado en la org (201) y devuelve su id. */
async function mkShift(day: number, cupos = 2): Promise<string> {
  const r = await w.api('POST', `/orgs/${w.A.orgId}/shifts`, {
    cookie: w.A.cookie,
    body: { inicio: hours(day, 0), fin: hours(day, 5), roleId: w.roleId('mesero'), cupos, pagoTotal: 400_000 },
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}

/** Registra a una persona en la org (con celular) y devuelve su worker id y su celular. */
async function mkWorker(nombre: string, celular: string): Promise<{ workerId: string }> {
  const r = await w.api('POST', `/orgs/${w.A.orgId}/workers`, {
    cookie: w.A.cookie, body: { nombre, celular, roleId: w.roleId('mesero') },
  });
  expect(r.statusCode).toBe(201);
  const linkId = r.json().id as string;
  const [row] = await owner<{ worker_id: string }>(sql`SELECT worker_id FROM org_workers WHERE id = ${linkId}`);
  return { workerId: row!.worker_id };
}

describe('GET /orgs/:orgId/shifts/:shiftId/offers', () => {
  it('el manager de la org recibe las ofertas del turno con los campos esperados y sin celulares', async () => {
    const shiftId = await mkShift(40);
    const celA = '+573116660101';
    const celB = '+573116660102';
    const a = await mkWorker('Ana Oferta', celA);
    const b = await mkWorker('Beto Oferta', celB);

    // Inserción directa (como dueño) de dos ofertas en distintas oleadas, en orden inverso a la ola.
    const [offerB] = await owner<{ id: string }>(sql`
      INSERT INTO shift_offers (org_id, shift_id, worker_id, status, wave, canal_usado)
      VALUES (${w.A.orgId}, ${shiftId}, ${b.workerId}, 'sent', 2, 'whatsapp') RETURNING id`);
    const [offerA] = await owner<{ id: string }>(sql`
      INSERT INTO shift_offers (org_id, shift_id, worker_id, status, wave, canal_usado, responded_at, responded_canal)
      VALUES (${w.A.orgId}, ${shiftId}, ${a.workerId}, 'accepted', 1, 'whatsapp', now(), 'whatsapp') RETURNING id`);
    await owner(sql`
      INSERT INTO offer_deliveries (org_id, offer_id, canal, external_id, estado)
      VALUES (${w.A.orgId}, ${offerA!.id}, 'whatsapp', ${'wa-' + randomUUID()}, 'delivered'),
             (${w.A.orgId}, ${offerB!.id}, 'whatsapp', ${'wa-' + randomUUID()}, 'failed')`);

    const r = await w.api('GET', `/orgs/${w.A.orgId}/shifts/${shiftId}/offers`, { cookie: w.A.cookie });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(Array.isArray(body.ofertas)).toBe(true);
    expect(body.ofertas).toHaveLength(2);

    // Orden por oleada: primero la 1 (Ana), luego la 2 (Beto).
    const [first, second] = body.ofertas;
    expect(first.id).toBe(offerA!.id);
    expect(first.wave).toBe(1);
    expect(second.id).toBe(offerB!.id);
    expect(second.wave).toBe(2);

    for (const o of body.ofertas) {
      expect(Object.keys(o).sort()).toEqual(
        ['canal', 'createdAt', 'entregas', 'favorito', 'id', 'nombre', 'respondedAt', 'respondedCanal', 'status', 'wave', 'workerId'].sort(),
      );
      expect(Array.isArray(o.entregas)).toBe(true);
    }
    expect(first).toMatchObject({ workerId: a.workerId, nombre: 'Ana Oferta', status: 'accepted', canal: 'whatsapp', respondedCanal: 'whatsapp' });
    expect(first.entregas).toEqual([expect.objectContaining({ canal: 'whatsapp', estado: 'delivered' })]);
    expect(second).toMatchObject({ workerId: b.workerId, nombre: 'Beto Oferta', status: 'sent', canal: 'whatsapp', respondedAt: null });
    expect(second.entregas).toEqual([expect.objectContaining({ canal: 'whatsapp', estado: 'failed' })]);

    // Nunca celulares: ni claves de teléfono ni los dígitos de los números de las personas.
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/celular|telefono|teléfono|phone/i);
    expect(raw).not.toContain(celA.replace(/\D/g, ''));
    expect(raw).not.toContain(celB.replace(/\D/g, ''));
  });

  it('404 para un turno inexistente (uuid al azar) y para un id que no es uuid', async () => {
    const r = await w.api('GET', `/orgs/${w.A.orgId}/shifts/${randomUUID()}/offers`, { cookie: w.A.cookie });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: 'not_found', message: expect.any(String) });

    const bad = await w.api('GET', `/orgs/${w.A.orgId}/shifts/no-es-uuid/offers`, { cookie: w.A.cookie });
    expect(bad.statusCode).toBe(404);
    expect(bad.json().error).toBe('not_found');
  });

  it('un manager de otra org no puede leer las ofertas (404), y sin sesión responde 401', async () => {
    const shiftId = await mkShift(42);
    const cross = await w.api('GET', `/orgs/${w.A.orgId}/shifts/${shiftId}/offers`, { cookie: w.B.cookie });
    expect(cross.statusCode).toBe(404);
    expect(cross.json().error).toBe('not_found');

    const ownOrgButOtherPath = await w.api('GET', `/orgs/${w.B.orgId}/shifts/${shiftId}/offers`, { cookie: w.B.cookie });
    expect(ownOrgButOtherPath.statusCode).toBe(404);

    const anon = await w.api('GET', `/orgs/${w.A.orgId}/shifts/${shiftId}/offers`);
    expect(anon.statusCode).toBe(401);
  });
});
