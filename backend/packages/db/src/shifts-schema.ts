import { pgTable, pgEnum, uuid, text, timestamp, integer, numeric, date, check, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orgs, workers } from './schema.js';
import { roles } from './domain-schema.js';

export const shiftEstado = pgEnum('shift_estado', ['abierto', 'cubierto', 'cancelado', 'vencido', 'completado']);
export const assignStatus = pgEnum('assign_status', ['confirmed', 'standby', 'cancelled', 'completed', 'no_show', 'disputed']);

/** Documento del trabajador, revisado por cada empresa (aprobar/rechazar). */
export const workerDocuments = pgTable(
  'worker_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    tipoDocumento: text('tipo_documento').notNull(),
    venceAt: date('vence_at', { mode: 'string' }),
    estado: text('estado').notNull().default('pendiente'),
    revisadoPor: text('revisado_por'),
    revisadoAt: timestamp('revisado_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('worker_documents_estado_ck', sql`${t.estado} in ('pendiente','aprobado','rechazado')`),
    index('worker_documents_lookup_idx').on(t.orgId, t.workerId, t.tipoDocumento),
  ],
);

export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    roleId: uuid('role_id').notNull().references(() => roles.id),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    fin: timestamp('fin', { withTimezone: true }).notNull(),
    cupos: integer('cupos').notNull(),
    /** Pago total en COP por cupo; debe ser ≥ piso legal calculado. */
    pagoTotal: numeric('pago_total', { precision: 14, scale: 0 }).notNull(),
    /** Piso calculado al crear (auditable aunque cambien los parámetros después). */
    pisoCalculado: numeric('piso_calculado', { precision: 14, scale: 0 }).notNull(),
    estado: shiftEstado('estado').notNull().default('abierto'),
    relaunches: integer('relaunches').notNull().default(0),
    /** Oleadas enviadas y cuándo salió la última (el worker las espacia por `wave_minutes`). */
    waveCount: integer('wave_count').notNull().default(0),
    lastWaveAt: timestamp('last_wave_at', { withTimezone: true }),
    visibilidad: text('visibilidad').notNull().default('privada'),
    notas: text('notas'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('shifts_cupos_ck', sql`${t.cupos} between 1 and 50`),
    check('shifts_horas_ck', sql`${t.fin} > ${t.inicio}`),
    check('shifts_visibilidad_ck', sql`${t.visibilidad} in ('privada','publica')`),
    index('shifts_org_inicio_idx').on(t.orgId, t.inicio),
  ],
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id),
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    status: assignStatus('status').notNull().default('confirmed'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('assignments_shift_worker_uq').on(t.shiftId, t.workerId),
    index('assignments_worker_idx').on(t.workerId, t.status),
  ],
);

export const DISPUTE_ESTADOS = ['abierta', 'upheld', 'reversed'] as const;

/**
 * Disputa de un `no_show` por el candidato. Efecto solo dentro de la org dueña de la asignación.
 * `motivo` es texto del candidato (dato personal): BORRAR MIS DATOS lo vacía.
 */
export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    assignmentId: uuid('assignment_id').notNull().references(() => assignments.id),
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    motivo: text('motivo').notNull(),
    estado: text('estado').notNull().default('abierta'),
    resueltoPor: text('resuelto_por'),
    nota: text('nota'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    check('disputes_estado_ck', sql`${t.estado} in ('abierta','upheld','reversed')`),
    // Una sola disputa por asignación: el candidato no puede reabrir lo que la empresa ya resolvió.
    uniqueIndex('disputes_assignment_uq').on(t.assignmentId),
    index('disputes_org_idx').on(t.orgId, t.estado),
  ],
);

/** Parámetros legales con vigencia (SMMLV, divisor, recargos). Los carga el super admin. */
export const legalParams = pgTable(
  'legal_params',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clave: text('clave').notNull(),
    valor: numeric('valor', { precision: 18, scale: 4 }).notNull(),
    vigenteDesde: date('vigente_desde', { mode: 'string' }).notNull(),
    nota: text('nota'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('legal_params_clave_desde_uq').on(t.clave, t.vigenteDesde)],
);
