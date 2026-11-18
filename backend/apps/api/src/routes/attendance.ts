import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { assignments, audit, disputes, orgWorkers, roles, shifts, withOrg, withSuper, type Db } from '@turnoextra/db';
import { markAttendance, resolveDispute } from '@turnoextra/channels';
import { LegalParamMissing } from '../services/legal-params.js';
import { monthlyReport } from '../services/report.js';
import type { Guards } from '../auth/guards.js';

type Gate = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

const uuid = z.string().uuid();
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: 'not_found', message: 'No encontrado' });

/** Celda de CSV: comillas dobles escapadas y, contra inyección de fórmulas en Excel, un apóstrofo si empieza con = + - @ o tab. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Límites del mes en hora de Bogotá (UTC−5, sin horario de verano). */
export function monthRange(mes: string): { from: Date; to: Date } {
  const [y, m] = mes.split('-').map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: new Date(`${y}-${p(m)}-01T00:00:00-05:00`), to: new Date(`${ny}-${p(nm)}-01T00:00:00-05:00`) };
}


/** Marca de orden de bytes UTF-8: sin ella Excel rompe las tildes. */
const BOM = String.fromCharCode(0xfeff);

/** Asistencia, disputas y reporte mensual CSV. Todo bajo el guard de admin de la org y el RLS. */
export function attendanceRoutes(app: FastifyInstance, deps: { db: Db; guards: Guards; gate: Gate }) {
  const { db, guards, gate } = deps;
  const pre = [guards.requireOrgAdmin, gate];
  const org = (req: FastifyRequest) => (req.params as { orgId: string }).orgId;
  const param = (req: FastifyRequest, k: string) => uuid.safeParse((req.params as Record<string, string>)[k]).data;

  // Quiénes tenían el turno (para marcar asistencia).
  app.get('/orgs/:orgId/shifts/:shiftId/assignments', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const shiftId = param(req, 'shiftId');
    if (!shiftId) return notFound(reply);
    return withOrg(db, orgId, async (tx) => {
      const [s] = await tx.select({ id: shifts.id, fin: shifts.fin }).from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.orgId, orgId)));
      if (!s) return notFound(reply);
      const rows = await tx
        .select({ id: assignments.id, status: assignments.status, nombre: orgWorkers.nombre })
        .from(assignments)
        .leftJoin(orgWorkers, and(eq(orgWorkers.workerId, assignments.workerId), eq(orgWorkers.orgId, assignments.orgId)))
        .where(and(eq(assignments.shiftId, shiftId), eq(assignments.orgId, orgId)))
        .orderBy(assignments.acceptedAt);
      return { terminado: s.fin.getTime() <= Date.now(), asignaciones: rows };
    });
  });

  app.post('/orgs/:orgId/shifts/:shiftId/attendance', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const shiftId = param(req, 'shiftId');
    if (!shiftId) return notFound(reply);
    const b = z
      .object({ marks: z.array(z.object({ assignmentId: uuid, status: z.enum(['completed', 'no_show']) })).min(1).max(50) })
      .parse(req.body);
    // Sistema porque encola el aviso W19 al candidato; el guard ya verificó la org y cada consulta filtra por ella.
    const r = await withSuper(db, (tx) => markAttendance(tx, orgId, shiftId, b.marks, req.user!.id));
    if (!r.ok) {
      if (r.reason === 'not_found') return notFound(reply);
      if (r.reason === 'not_finished') return reply.status(409).send({ error: 'shift_not_finished', message: 'El turno todavía no terminó' });
      return reply.status(409).send({ error: 'shift_cancelled', message: 'El turno está cancelado' });
    }
    return { marcadas: r.marcadas, rechazadas: r.rechazadas };
  });

  // --- Disputas -----------------------------------------------------------------------------------
  app.get('/orgs/:orgId/disputes', { preHandler: pre }, async (req) => {
    const orgId = org(req);
    const { estado } = z.object({ estado: z.enum(['abierta', 'upheld', 'reversed']).optional() }).parse(req.query);
    return withOrg(db, orgId, async (tx) => {
      const rows = await tx
        .select({
          id: disputes.id, estado: disputes.estado, motivo: disputes.motivo, nota: disputes.nota, createdAt: disputes.createdAt,
          resolvedAt: disputes.resolvedAt, assignmentId: disputes.assignmentId, shiftId: assignments.shiftId,
          inicio: shifts.inicio, rol: roles.nombre, nombre: orgWorkers.nombre,
        })
        .from(disputes)
        .innerJoin(assignments, eq(assignments.id, disputes.assignmentId))
        .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
        .innerJoin(roles, eq(roles.id, shifts.roleId))
        .leftJoin(orgWorkers, and(eq(orgWorkers.workerId, disputes.workerId), eq(orgWorkers.orgId, disputes.orgId)))
        .where(and(eq(disputes.orgId, orgId), estado ? eq(disputes.estado, estado) : undefined))
        .orderBy(desc(disputes.createdAt))
        .limit(200);
      return { disputas: rows };
    });
  });

  app.post('/orgs/:orgId/disputes/:disputeId/resolve', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const id = param(req, 'disputeId');
    if (!id) return notFound(reply);
    const b = z.object({ resolucion: z.enum(['upheld', 'reversed']), nota: z.string().trim().max(500).optional() }).parse(req.body);
    const ok = await withSuper(db, (tx) => resolveDispute(tx, orgId, id, b.resolucion, req.user!.id, b.nota));
    if (!ok) return notFound(reply); // otra org, inexistente o ya resuelta
    return { id, estado: b.resolucion };
  });

  // --- Reporte mensual CSV --------------------------------------------------------------------------
  app.get('/orgs/:orgId/reports/monthly', { preHandler: pre }, async (req, reply) => {
    const orgId = org(req);
    const { mes } = z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).parse(req.query);
    const { from, to } = monthRange(mes);
    let rows;
    try {
      rows = await withOrg(db, orgId, async (tx) => {
      const out = await monthlyReport(tx, orgId, from, to);
      await audit(tx, { orgId, actorId: req.user!.id, accion: 'report.exported', entidad: 'org', entidadId: orgId, detalle: { mes } });
      return out;
      });
    } catch (e) {
      if (e instanceof LegalParamMissing) return reply.status(503).send({ error: 'legal_params_missing', message: `Falta el parámetro legal ${e.clave}`, clave: e.clave });
      throw e;
    }
    const head = ['nombre', 'celular', 'dias', 'turnos', 'horas', 'horas_nocturnas', 'horas_dominicales', 'no_shows', 'sin_marcar', 'en_disputa'];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push(
        [r.nombre, r.celular ? `***${r.celular.slice(-4)}` : '', r.dias, r.turnos, r.horas, r.horasNocturnas, r.horasDominicales, r.noShows, r.sinMarcar, r.enDisputa]
          .map(csvCell).join(','),
      );
    }
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="turnoextra-${mes}.csv"`)
      .header('cache-control', 'no-store')
      .send(`${BOM}${lines.join('\r\n')}\r\n`);
  });
}
