import { sql } from 'drizzle-orm';
import type { Tx } from '@turnoextra/db';

export type Eligible = { workerId: string; nombre: string; favorito: boolean };

/**
 * Trabajadores elegibles para un turno (reconstruido desde el doc v2 §5–§7). Debe cumplir todo:
 *  - activo en la org (consentimiento dado) y con el rol del turno;
 *  - cada documento obligatorio del rol aprobado y vigente hasta el fin del turno (hora de Bogotá);
 *  - sin otro turno confirmado que choque, incluyendo el descanso mínimo de la org (otras orgs cuentan);
 *  - sin superar el tope semanal de horas con este turno (semana lunes–domingo);
 *  - sin asignación previa a este mismo turno.
 * Orden: favoritos primero, luego por antigüedad en la banca. Corre dentro de `withOrg`.
 */
export async function eligibleWorkers(tx: Tx, orgId: string, shiftId: string): Promise<Eligible[]> {
  const res = await tx.execute(sql`
    SELECT ow.worker_id AS "workerId", ow.nombre, ow.favorito
    FROM shifts s
    JOIN orgs o ON o.id = s.org_id
    JOIN org_workers ow ON ow.org_id = s.org_id
    WHERE s.id = ${shiftId} AND s.org_id = ${orgId}
      AND ow.estado = 'activo'
      AND ow.role_id = s.role_id
      AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.shift_id = s.id AND a.worker_id = ow.worker_id)
      AND NOT EXISTS (
        SELECT 1 FROM role_requirements rr
        WHERE rr.role_id = s.role_id AND rr.obligatorio
          AND NOT EXISTS (
            SELECT 1 FROM worker_documents d
            WHERE d.org_id = ow.org_id AND d.worker_id = ow.worker_id
              AND d.tipo_documento = rr.tipo_documento AND d.estado = 'aprobado'
              AND (NOT rr.vigencia_requerida OR d.vence_at >= (s.fin AT TIME ZONE 'America/Bogota')::date)))
      AND NOT worker_is_busy(ow.worker_id, s.inicio, s.fin, o.descanso_min_h)
      AND worker_week_hours(ow.worker_id, s.inicio) + extract(epoch FROM (s.fin - s.inicio)) / 3600 <= o.tope_semanal_h
    ORDER BY ow.favorito DESC, ow.created_at ASC, ow.id ASC`);
  const rows = (res as unknown as { rows?: Eligible[] }).rows ?? (res as unknown as Eligible[]);
  return rows.map((r) => ({ workerId: r.workerId, nombre: r.nombre, favorito: r.favorito }));
}

export type ShiftFit = { workerId: string; ocupado: boolean; asignado: boolean; tope: boolean };

/**
 * Condiciones que dependen del horario de un turno, para cada persona activa de la org:
 * choque con otro turno confirmado (con descanso), asignación previa y tope semanal. Corre dentro de `withOrg`.
 */
export async function shiftFit(tx: Tx, orgId: string, shiftId: string): Promise<ShiftFit[]> {
  const res = await tx.execute(sql`
    SELECT ow.worker_id AS "workerId",
      worker_is_busy(ow.worker_id, s.inicio, s.fin, o.descanso_min_h) AS ocupado,
      EXISTS (SELECT 1 FROM assignments a WHERE a.shift_id = s.id AND a.worker_id = ow.worker_id) AS asignado,
      (worker_week_hours(ow.worker_id, s.inicio) + extract(epoch FROM (s.fin - s.inicio)) / 3600 > o.tope_semanal_h) AS tope
    FROM shifts s
    JOIN orgs o ON o.id = s.org_id
    JOIN org_workers ow ON ow.org_id = s.org_id
    WHERE s.id = ${shiftId} AND s.org_id = ${orgId} AND ow.estado = 'activo'`);
  return ((res as unknown as { rows?: ShiftFit[] }).rows ?? (res as unknown as ShiftFit[]));
}
