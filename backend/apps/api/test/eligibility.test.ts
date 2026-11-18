import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from '@turnoextra/db/testing';
import { withOrg } from '@turnoextra/db';
import { eligibleWorkers } from '../src/services/eligibility.js';

type T = Awaited<ReturnType<typeof createTestDb>>;
let t: T;
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ids: Record<string, string> = {}; // nombre -> worker id
let shiftId: string;
let roleMesero: string;
let roleCocina: string;

const bog = (d: string, h: string) => `${d}T${h}:00-05:00`;
const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Record<string, string>[];

beforeAll(async () => {
  t = await createTestDb();
  await t.asOwner(async (o) => {
    await o.execute(sql`INSERT INTO organization (id, name, slug) VALUES (${A}, 'A', 'a'), (${B}, 'B', 'b')`);
    await o.execute(sql`INSERT INTO orgs (id, nombre) VALUES (${A}, 'A'), (${B}, 'B')`);
    roleMesero = rows(await o.execute(sql`SELECT id FROM roles WHERE slug = 'mesero'`))[0]!.id!;
    roleCocina = rows(await o.execute(sql`SELECT id FROM roles WHERE slug = 'cocina'`))[0]!.id!;
    await o.execute(sql`INSERT INTO org_roles (org_id, role_id) VALUES (${A}, ${roleMesero}), (${A}, ${roleCocina}), (${B}, ${roleMesero})`);

    const shift = async (org: string, ini: string, fin: string, estado = 'abierto') =>
      rows(await o.execute(sql`INSERT INTO shifts (org_id, role_id, inicio, fin, cupos, pago_total, piso_calculado, estado, created_by)
        VALUES (${org}, ${roleMesero}, ${ini}, ${fin}, 1, 100000, 50000, ${estado}, 'u') RETURNING id`))[0]!.id!;
    // Turno a evaluar: martes 1-dic-2026, 18:00–23:00 hora de Bogotá (5 h).
    shiftId = await shift(A, bog('2026-12-01', '18:00'), bog('2026-12-01', '23:00'));

    let n = 0;
    const worker = async (nombre: string, opts: { estado?: string; role?: string; favorito?: boolean; doc?: [string, string | null] | null } = {}) => {
      const cel = `+57300000${String(1000 + n++)}`;
      const id = rows(await o.execute(sql`INSERT INTO workers (celular) VALUES (${cel}) RETURNING id`))[0]!.id!;
      ids[nombre] = id;
      await o.execute(sql`INSERT INTO org_workers (org_id, worker_id, nombre, role_id, estado, favorito)
        VALUES (${A}, ${id}, ${nombre}, ${opts.role ?? roleMesero}, ${opts.estado ?? 'activo'}, ${opts.favorito ?? false})`);
      const doc = opts.doc === undefined ? (['aprobado', '2027-01-01'] as [string, string]) : opts.doc;
      if (doc) {
        await o.execute(sql`INSERT INTO worker_documents (org_id, worker_id, tipo_documento, vence_at, estado)
          VALUES (${A}, ${id}, 'carnet_manipulacion_alimentos', ${doc[1]}, ${doc[0]})`);
      }
      return id;
    };
    const assign = async (org: string, worker: string, shiftRef: string, status = 'confirmed') =>
      o.execute(sql`INSERT INTO assignments (org_id, shift_id, worker_id, status) VALUES (${org}, ${shiftRef}, ${worker}, ${status})`);

    await worker('w_ok');
    const rested = await worker('w_rested');
    await assign(A, rested, await shift(A, bog('2026-12-01', '01:00'), bog('2026-12-01', '09:00'))); // 9 h de descanso
    await worker('w_fav', { favorito: true });
    await worker('w_pendiente', { estado: 'pendiente' });
    await worker('w_baja', { estado: 'baja' });
    await worker('w_cocina', { role: roleCocina });
    await worker('w_sin_doc', { doc: null });
    await worker('w_doc_pendiente', { doc: ['pendiente', '2027-01-01'] });
    await worker('w_doc_rechazado', { doc: ['rechazado', '2027-01-01'] });
    await worker('w_doc_vencido', { doc: ['aprobado', '2026-11-30'] });
    await worker('w_doc_vence_el_dia', { doc: ['aprobado', '2026-12-01'] }); // vigente hasta el fin del turno

    const busy = await worker('w_choque');
    await assign(A, busy, await shift(A, bog('2026-12-01', '10:00'), bog('2026-12-01', '16:00'))); // 2 h antes: sin descanso

    const other = await worker('w_otra_org');
    await assign(B, other, await shift(B, bog('2026-12-01', '19:00'), bog('2026-12-01', '22:00'))); // choca en otra org

    const heavy = await worker('w_tope');
    for (const [d, a, b] of [['2026-11-30', '06:00', '16:00'], ['2026-12-02', '09:00', '19:00'], ['2026-12-03', '09:00', '19:00'], ['2026-12-04', '09:00', '17:00']] as const) {
      await assign(A, heavy, await shift(A, bog(d, a), bog(d, b), 'cubierto')); // 38 h; con 5 h más = 43 > 42
    }
    const already = await worker('w_ya_asignado');
    await assign(A, already, shiftId, 'standby');
  },
  );
}, 120_000);

afterAll(() => t?.close());

const names = async () => {
  const r = await withOrg(t.db, A, (tx) => eligibleWorkers(tx, A, shiftId));
  return r.map((e) => e.nombre);
};

describe('elegibilidad (reconstruida desde el doc v2)', () => {
  it('incluye solo a quienes cumplen todo; favoritos primero y luego por antigüedad', async () => {
    expect(await names()).toEqual(['w_fav', 'w_ok', 'w_rested', 'w_doc_vence_el_dia']);
  });

  it.each([
    ['w_pendiente', 'sin consentimiento (pendiente)'],
    ['w_baja', 'dado de baja'],
    ['w_cocina', 'rol distinto al del turno'],
    ['w_sin_doc', 'sin el documento obligatorio'],
    ['w_doc_pendiente', 'documento aún sin aprobar'],
    ['w_doc_rechazado', 'documento rechazado (T24)'],
    ['w_doc_vencido', 'documento vence antes del fin del turno'],
    ['w_choque', 'otro turno confirmado sin 8 h de descanso'],
    ['w_otra_org', 'turno confirmado que choca en otra organización'],
    ['w_tope', 'superaría el tope semanal de 42 h'],
    ['w_ya_asignado', 'ya tiene asignación a este turno'],
  ])('excluye a %s: %s', async (nombre) => {
    expect(await names()).not.toContain(nombre);
  });

  it('un documento que vence el mismo día del fin del turno sigue siendo válido', async () => {
    expect(await names()).toContain('w_doc_vence_el_dia');
  });

  it('aislamiento (T6/T21): desde otra org no se obtiene ningún elegible de este turno', async () => {
    const r = await withOrg(t.db, B, (tx) => eligibleWorkers(tx, B, shiftId));
    expect(r).toEqual([]);
  });

  it('si el rechazo de un documento ocurre después, el trabajador deja de ser elegible', async () => {
    await t.asOwner((o) => o.execute(sql`UPDATE worker_documents SET estado = 'rechazado' WHERE worker_id = ${ids.w_ok!}`));
    expect(await names()).not.toContain('w_ok');
  });
});
