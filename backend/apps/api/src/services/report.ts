import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { assignments, orgWorkers, shifts, workers, type Db, type Tx } from '@turnoextra/db';
import { nightWindowAt, bogotaDate } from './legal-params.js';
import { toMinute } from './floor.js';

const BOGOTA_OFFSET_MS = -5 * 3600_000; // sin horario de verano

type Night = { nocturnoDesdeHora: number; nocturnoHastaHora: number };

/** Minutos de un turno que caen dentro de [from, to), con su desglose nocturno/dominical en hora de Bogotá. */
export function minuteBreakdown(inicioIn: Date, finIn: Date, from: Date, to: Date, p: Night) {
  const start = Math.max(toMinute(inicioIn).getTime(), from.getTime());
  const end = Math.min(toMinute(finIn).getTime(), to.getTime());
  let minutes = 0;
  let night = 0;
  let sunday = 0;
  const days = new Set<string>();
  for (let t = start; t < end; t += 60_000) {
    const local = new Date(t + BOGOTA_OFFSET_MS);
    const h = local.getUTCHours();
    const isNight = p.nocturnoDesdeHora > p.nocturnoHastaHora ? h >= p.nocturnoDesdeHora || h < p.nocturnoHastaHora : h >= p.nocturnoDesdeHora && h < p.nocturnoHastaHora;
    minutes++;
    if (isNight) night++;
    if (local.getUTCDay() === 0) sunday++;
    days.add(local.toISOString().slice(0, 10));
  }
  return { minutes, night, sunday, days };
}

export type ReportRow = {
  workerId: string;
  nombre: string;
  celular: string | null;
  dias: number;
  turnos: number;
  horas: number;
  horasNocturnas: number;
  horasDominicales: number;
  noShows: number;
  sinMarcar: number;
  enDisputa: number;
};

const hrs = (min: number) => Math.round((min / 60) * 100) / 100;

/**
 * Reporte mensual por trabajador (apoyo a la PILA; TurnoExtra no liquida nómina). Cuenta solo turnos `completed`;
 * los confirmados ya terminados sin marcar salen en `sinMarcar`, los disputados en `enDisputa`. Las horas de un turno
 * que cruza medianoche o fin de mes se reparten por el mes de Bogotá en que ocurrieron.
 */
export async function monthlyReport(db: Db | Tx, orgId: string, from: Date, to: Date): Promise<ReportRow[]> {
  const rows = await db
    .select({
      workerId: assignments.workerId, status: assignments.status, inicio: shifts.inicio, fin: shifts.fin,
      nombre: orgWorkers.nombre, celular: workers.celular,
    })
    .from(assignments)
    .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
    .innerJoin(workers, eq(workers.id, assignments.workerId))
    .leftJoin(orgWorkers, and(eq(orgWorkers.workerId, assignments.workerId), eq(orgWorkers.orgId, assignments.orgId)))
    .where(and(
      eq(assignments.orgId, orgId), inArray(assignments.status, ['completed', 'confirmed', 'no_show', 'disputed']),
      lt(shifts.inicio, to), gt(shifts.fin, from), sql`${shifts.estado} <> 'cancelado'`,
    ));

  const paramsCache = new Map<string, Night>();
  const out = new Map<string, ReportRow & { daySet: Set<string> }>();
  const now = Date.now();
  for (const r of rows) {
    let o = out.get(r.workerId);
    if (!o) {
      o = {
        workerId: r.workerId, nombre: r.nombre ?? '[borrado]', celular: r.celular, dias: 0, turnos: 0, horas: 0, horasNocturnas: 0,
        horasDominicales: 0, noShows: 0, sinMarcar: 0, enDisputa: 0, daySet: new Set(),
      };
      out.set(r.workerId, o);
    }
    const startsInMonth = r.inicio >= from && r.inicio < to;
    if (r.status === 'no_show' && startsInMonth) o.noShows++;
    else if (r.status === 'disputed' && startsInMonth) o.enDisputa++;
    else if (r.status === 'confirmed' && startsInMonth && r.fin.getTime() <= now) o.sinMarcar++;
    else if (r.status === 'completed') {
      const key = bogotaDate(r.inicio);
      let p = paramsCache.get(key);
      if (!p) paramsCache.set(key, (p = await nightWindowAt(db, r.inicio)));
      const b = minuteBreakdown(r.inicio, r.fin, from, to, p);
      if (!b.minutes) continue;
      o.turnos++;
      o.horas += b.minutes;
      o.horasNocturnas += b.night;
      o.horasDominicales += b.sunday;
      for (const d of b.days) o.daySet.add(d);
    }
  }
  return [...out.values()]
    .map(({ daySet, ...o }) => ({ ...o, dias: daySet.size, horas: hrs(o.horas), horasNocturnas: hrs(o.horasNocturnas), horasDominicales: hrs(o.horasDominicales) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
