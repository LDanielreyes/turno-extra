import { raiseAlert, startsSoon } from './alerts.js';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  assignments, audit, candidateLoginCodes, channelLinkCodes, disputes, emit, demoMessages, shiftOffers, inboundMessages, orgWorkers, outbox, pendingConfirmations, shifts,
  workerChannels, workerConsents, workerDocuments, workers, type Tx,
} from '@turnoextra/db';

type Ctx = { actorId: string };

/**
 * BAJA global: estado `baja` en todas las orgs, autorizaciones revocadas, canales apagados, reservas canceladas.
 * Los turnos ya confirmados NO se tocan aquí: cada org queda avisada en su bitácora y con una alerta por turno.
 * Debe correr en contexto de sistema (super).
 */
export async function workerBaja(tx: Tx, workerId: string, ctx: Ctx, accion = 'worker.baja') {
  const links = await tx.select().from(orgWorkers).where(eq(orgWorkers.workerId, workerId));
  await tx.update(orgWorkers).set({ estado: 'baja' }).where(eq(orgWorkers.workerId, workerId));
  await tx.update(workerConsents).set({ revokedAt: sql`now()` }).where(and(eq(workerConsents.workerId, workerId), isNull(workerConsents.revokedAt)));
  await tx.update(workerChannels).set({ habilitado: false }).where(eq(workerChannels.workerId, workerId));
  await tx.delete(pendingConfirmations).where(eq(pendingConfirmations.workerId, workerId));
  await tx.delete(channelLinkCodes).where(eq(channelLinkCodes.workerId, workerId));
  await tx.update(shiftOffers).set({ status: 'cancelled' })
    .where(and(eq(shiftOffers.workerId, workerId), inArray(shiftOffers.status, ['queued', 'sent', 'delivered', 'read'])));

  for (const l of links) {
    const standby = await cancelStandby(tx, workerId, l.orgId);
    const confirmed = await tx
      .select({ id: assignments.id, shiftId: assignments.shiftId })
      .from(assignments)
      .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
      .where(and(eq(assignments.workerId, workerId), eq(assignments.orgId, l.orgId), eq(assignments.status, 'confirmed'), sql`${shifts.fin} > now()`));
    await audit(tx, {
      orgId: l.orgId, actorId: ctx.actorId, accion, entidad: 'worker', entidadId: workerId,
      detalle: { standby_canceladas: standby, confirmados_vigentes: confirmed.length },
    });
    await alertLeft(tx, l.orgId, workerId, confirmed.map((c) => c.shiftId));
  }
  return { orgs: links.length };
}

/** SALIR de una org: solo esa relación pasa a `baja_org`; las demás siguen intactas. */
export async function workerSalir(tx: Tx, workerId: string, orgId: string, ctx: Ctx) {
  await tx.update(orgWorkers).set({ estado: 'baja_org' }).where(and(eq(orgWorkers.workerId, workerId), eq(orgWorkers.orgId, orgId)));
  await tx.update(workerConsents).set({ revokedAt: sql`now()` })
    .where(and(eq(workerConsents.workerId, workerId), eq(workerConsents.orgId, orgId), isNull(workerConsents.revokedAt)));
  await tx.update(shiftOffers).set({ status: 'cancelled' })
    .where(and(eq(shiftOffers.workerId, workerId), eq(shiftOffers.orgId, orgId), inArray(shiftOffers.status, ['queued', 'sent', 'delivered', 'read'])));
  const standby = await cancelStandby(tx, workerId, orgId);
  await audit(tx, { orgId, actorId: ctx.actorId, accion: 'worker.salir', entidad: 'worker', entidadId: workerId, detalle: { standby_canceladas: standby } });
  const confirmed = await tx
    .select({ shiftId: assignments.shiftId })
    .from(assignments)
    .innerJoin(shifts, eq(shifts.id, assignments.shiftId))
    .where(and(eq(assignments.workerId, workerId), eq(assignments.orgId, orgId), eq(assignments.status, 'confirmed'), sql`${shifts.fin} > now()`));
  await alertLeft(tx, orgId, workerId, confirmed.map((c) => c.shiftId));
}

/** La org se entera cuando alguien con turnos confirmados se va (BAJA o SALIR): una alerta por turno. */
async function alertLeft(tx: Tx, orgId: string, workerId: string, shiftIds: string[]) {
  for (const shiftId of shiftIds) {
    await raiseAlert(tx, { orgId, tipo: 'baja_con_turnos', shiftId, workerId, urgente: await startsSoon(tx, shiftId) });
    await emit(tx, { org: orgId, type: 'shift.changed', shift: shiftId });
  }
  await emit(tx, { org: orgId, type: 'org.changed' });
}

async function cancelStandby(tx: Tx, workerId: string, orgId: string) {
  const r = await tx.update(assignments).set({ status: 'cancelled' })
    .where(and(eq(assignments.workerId, workerId), eq(assignments.orgId, orgId), eq(assignments.status, 'standby')))
    .returning({ id: assignments.id });
  return r.length;
}

/**
 * Derecho de acceso (Ley 1581): todo lo que TurnoExtra guarda de una persona, para entregárselo a ella.
 * Solo datos del titular; no incluye datos de otras personas ni de las empresas.
 */
export async function exportWorkerData(tx: Tx, workerId: string) {
  const [w] = await tx.select({ id: workers.id, nombre: workers.nombre, celular: workers.celular, createdAt: workers.createdAt })
    .from(workers).where(eq(workers.id, workerId));
  if (!w) return undefined;
  return {
    persona: w,
    empresas: await tx.select({ orgId: orgWorkers.orgId, nombre: orgWorkers.nombre, estado: orgWorkers.estado }).from(orgWorkers).where(eq(orgWorkers.workerId, workerId)),
    autorizaciones: await tx.select({ orgId: workerConsents.orgId, canal: workerConsents.canal, aceptadaAt: workerConsents.acceptedAt, revocadaAt: workerConsents.revokedAt })
      .from(workerConsents).where(eq(workerConsents.workerId, workerId)),
    canales: await tx.select({ canal: workerChannels.canal, identificador: workerChannels.identificador, habilitado: workerChannels.habilitado })
      .from(workerChannels).where(eq(workerChannels.workerId, workerId)),
    documentos: await tx.select({ orgId: workerDocuments.orgId, tipo: workerDocuments.tipoDocumento, estado: workerDocuments.estado, venceAt: workerDocuments.venceAt })
      .from(workerDocuments).where(eq(workerDocuments.workerId, workerId)),
    turnos: await tx.select({ orgId: assignments.orgId, turnoId: assignments.shiftId, estado: assignments.status, aceptadoAt: assignments.acceptedAt })
      .from(assignments).where(eq(assignments.workerId, workerId)),
    disputas: await tx.select({ orgId: disputes.orgId, turnoId: assignments.shiftId, motivo: disputes.motivo, estado: disputes.estado, creadaAt: disputes.createdAt })
      .from(disputes).innerJoin(assignments, eq(assignments.id, disputes.assignmentId)).where(eq(disputes.workerId, workerId)),
  };
}

/**
 * BORRAR MIS DATOS (hard delete de datos personales). Lo usan el comando del candidato y `data delete` del super admin.
 * Se borran: nombre, celular, canales, autorizaciones, documentos, mensajes en cola/bandeja e idempotencia de webhooks.
 * Se conservan, ya anónimos: turnos, asignaciones y la fila `org_workers` (sin nombre) para los reportes, y la bitácora (solo ids).
 */
export async function deleteWorkerData(tx: Tx, workerId: string, ctx: Ctx) {
  const [w] = await tx.select({ celular: workers.celular }).from(workers).where(eq(workers.id, workerId));
  if (!w) return { deleted: false as const };
  const links = await tx.select({ orgId: orgWorkers.orgId }).from(orgWorkers).where(eq(orgWorkers.workerId, workerId));

  // Primero la BAJA: reservas fuera y cada org avisada de sus turnos confirmados.
  await workerBaja(tx, workerId, ctx, 'worker.baja_por_borrado');

  const digits = w.celular?.replace(/\D/g, '');
  const phones = [w.celular, digits].filter((x): x is string => !!x);
  if (phones.length) await tx.delete(demoMessages).where(inArray(demoMessages.destinatario, phones));
  await tx.delete(outbox).where(eq(outbox.workerId, workerId));
  await tx.delete(inboundMessages).where(eq(inboundMessages.workerId, workerId));
  await tx.delete(candidateLoginCodes).where(eq(candidateLoginCodes.workerId, workerId));
  await tx.update(disputes).set({ motivo: '[borrado]' }).where(eq(disputes.workerId, workerId));
  await tx.delete(workerDocuments).where(eq(workerDocuments.workerId, workerId));
  await tx.delete(workerConsents).where(eq(workerConsents.workerId, workerId));
  await tx.delete(workerChannels).where(eq(workerChannels.workerId, workerId));
  await tx.update(orgWorkers).set({ nombre: '[borrado]', favorito: false, estado: 'baja' }).where(eq(orgWorkers.workerId, workerId));
  await tx.update(workers).set({ nombre: null, celular: null, deletedAt: sql`now()` }).where(eq(workers.id, workerId));

  for (const l of links) {
    await audit(tx, { orgId: l.orgId, actorId: ctx.actorId, accion: 'worker.data_deleted', entidad: 'worker', entidadId: workerId });
  }
  return { deleted: true as const, orgs: links.length };
}
