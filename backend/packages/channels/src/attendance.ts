import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alerts, assignments, audit, disputes, emit, shifts, type Tx } from '@turnoextra/db';
import { raiseAlert } from './alerts.js';
import { msg } from './messages.js';
import { notifyWorker, shiftInfoOf } from './offers.js';
import { rowsOf } from './outbox.js';
import type { OutMessage } from './types.js';

/** Días, contados desde el fin del turno, durante los que el candidato puede disputar un no_show. */
export const DISPUTE_WINDOW_DAYS = 7;
/** Largo mínimo de una explicación para tomarla como disputa (evita abrir una por un «ok» suelto). */
export const MIN_MOTIVO = 10;
const MAX_MOTIVO = 1000;

export type Mark = { assignmentId: string; status: 'completed' | 'no_show' };
export type MarkResult =
  | { ok: true; marcadas: number; rechazadas: string[] }
  | { ok: false; reason: 'not_found' | 'not_finished' | 'bad_state' };

/**
 * La empresa marca asistencia después del fin del turno. Solo se puede marcar `confirmed` (y corregir entre
 * `completed` y `no_show`); una asignación en disputa no se toca hasta resolverla. Un `no_show` avisa al candidato (W19).
 * Contexto de sistema (encola avisos); el llamador ya verificó que la persona administra `orgId`.
 */
export async function markAttendance(tx: Tx, orgId: string, shiftId: string, marks: Mark[], actorId: string): Promise<MarkResult> {
  const [s] = rowsOf<{ estado: string; passed: boolean }>(
    await tx.execute(sql`SELECT estado, fin <= now() AS passed FROM shifts WHERE id = ${shiftId} AND org_id = ${orgId} FOR UPDATE`),
  );
  if (!s) return { ok: false, reason: 'not_found' };
  if (s.estado === 'cancelado') return { ok: false, reason: 'bad_state' };
  if (!s.passed) return { ok: false, reason: 'not_finished' };

  const rows = await tx
    .select({ id: assignments.id, status: assignments.status, workerId: assignments.workerId })
    .from(assignments)
    .where(and(eq(assignments.shiftId, shiftId), eq(assignments.orgId, orgId), inArray(assignments.id, marks.map((m) => m.assignmentId))));
  const byId = new Map(rows.map((r) => [r.id, r]));

  let marcadas = 0;
  const rechazadas: string[] = [];
  const info = marks.some((m) => m.status === 'no_show') ? await shiftInfoOf(tx, shiftId) : undefined;
  for (const m of marks) {
    const a = byId.get(m.assignmentId);
    if (!a || !['confirmed', 'completed', 'no_show'].includes(a.status)) {
      rechazadas.push(m.assignmentId);
      continue;
    }
    if (a.status === m.status) continue; // ya estaba así: no repite avisos
    await tx.update(assignments).set({ status: m.status }).where(eq(assignments.id, a.id));
    await audit(tx, { orgId, actorId, accion: `attendance.${m.status}`, entidad: 'assignment', entidadId: a.id, detalle: { turno: shiftId } });
    if (m.status === 'no_show') await notifyWorker(tx, a.workerId, orgId, msg.w19NoShow(info!));
    marcadas++;
  }

  // Sin confirmados pendientes de marcar, el turno queda completado.
  const [left] = await tx.select({ n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.shiftId, shiftId), eq(assignments.status, 'confirmed')));
  const [any] = await tx.select({ n: sql<number>`count(*)::int` }).from(assignments).where(and(eq(assignments.shiftId, shiftId), inArray(assignments.status, ['completed', 'no_show', 'disputed'])));
  if (left!.n === 0 && any!.n > 0) await tx.update(shifts).set({ estado: 'completado' }).where(eq(shifts.id, shiftId));
  await emit(tx, { org: orgId, type: 'shift.changed', shift: shiftId });
  return { ok: true, marcadas, rechazadas };
}

export type DisputeOutcome = 'opened' | 'none' | 'too_short';

/**
 * El candidato responde a un no_show con su explicación. Se atiende el no_show más reciente que siga dentro de la
 * ventana y no esté disputado. Abre la disputa, pasa la asignación a `disputed`, alerta a la org (`disputa_abierta`).
 */
export async function openDispute(tx: Tx, workerId: string, text: string, assignmentId?: string): Promise<{ outcome: DisputeOutcome; reply?: OutMessage; orgId?: string }> {
  const motivo = text.trim().slice(0, MAX_MOTIVO);
  if (motivo.length < MIN_MOTIVO) return { outcome: 'too_short' };

  const [a] = await tx
    .select({ id: assignments.id, orgId: assignments.orgId, shiftId: assignments.shiftId })
    .from(assignments)
    .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
    .leftJoin(disputes, eq(disputes.assignmentId, assignments.id))
    .where(and(
      eq(assignments.workerId, workerId), eq(assignments.status, 'no_show'), isNull(disputes.id),
      assignmentId ? eq(assignments.id, assignmentId) : undefined,
      sql`${shifts.fin} > now() - make_interval(days => ${DISPUTE_WINDOW_DAYS})`,
    ))
    .orderBy(desc(shifts.fin))
    .limit(1);
  if (!a) return { outcome: 'none' };

  const [d] = await tx.insert(disputes).values({ orgId: a.orgId, assignmentId: a.id, workerId, motivo }).onConflictDoNothing().returning({ id: disputes.id });
  if (!d) return { outcome: 'none' };
  await tx.update(assignments).set({ status: 'disputed' }).where(and(eq(assignments.id, a.id), eq(assignments.status, 'no_show')));
  await audit(tx, { orgId: a.orgId, actorId: `worker:${workerId}`, accion: 'dispute.opened', entidad: 'dispute', entidadId: d.id, detalle: { turno: a.shiftId } });
  await raiseAlert(tx, { orgId: a.orgId, tipo: 'disputa_abierta', shiftId: a.shiftId, workerId, urgente: false });
  await emit(tx, { org: a.orgId, type: 'shift.changed', shift: a.shiftId });
  return { outcome: 'opened', orgId: a.orgId, reply: msg.w19bDisputeReceived(await shiftInfoOf(tx, a.shiftId)) };
}

/**
 * La empresa resuelve: `upheld` mantiene el no_show; `reversed` lo corrige a completed. Solo afecta a esa org.
 * Devuelve false si la disputa no existe en la org o ya estaba resuelta.
 */
export async function resolveDispute(
  tx: Tx, orgId: string, disputeId: string, resolucion: 'upheld' | 'reversed', actorId: string, nota?: string,
): Promise<boolean> {
  const [d] = await tx
    .update(disputes)
    .set({ estado: resolucion, resueltoPor: actorId, resolvedAt: sql`now()`, nota: nota ?? null })
    .where(and(eq(disputes.id, disputeId), eq(disputes.orgId, orgId), eq(disputes.estado, 'abierta')))
    .returning({ assignmentId: disputes.assignmentId, workerId: disputes.workerId });
  if (!d) return false;
  const [a] = await tx
    .update(assignments)
    .set({ status: resolucion === 'reversed' ? 'completed' : 'no_show' })
    .where(and(eq(assignments.id, d.assignmentId), eq(assignments.orgId, orgId)))
    .returning({ shiftId: assignments.shiftId });
  await audit(tx, { orgId, actorId, accion: `dispute.${resolucion}`, entidad: 'dispute', entidadId: disputeId, detalle: { turno: a!.shiftId } });
  // La alerta de esa disputa deja de estar pendiente.
  await tx.update(alerts).set({ atendidaAt: sql`now()`, atendidaPor: actorId })
    .where(and(eq(alerts.orgId, orgId), eq(alerts.tipo, 'disputa_abierta'), eq(alerts.shiftId, a!.shiftId), eq(alerts.workerId, d.workerId), isNull(alerts.atendidaAt)));
  await notifyWorker(tx, d.workerId, orgId, msg.w19cDisputeResolved(await shiftInfoOf(tx, a!.shiftId), resolucion === 'reversed'));
  await emit(tx, { org: orgId, type: 'shift.changed', shift: a!.shiftId });
  await emit(tx, { org: orgId, type: 'alert.updated' });
  return true;
}
