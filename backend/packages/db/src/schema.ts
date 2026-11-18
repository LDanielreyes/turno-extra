import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, bigserial, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';

export const hwState = pgEnum('hw_state', ['pendiente', 'activo', 'baja', 'baja_org']);

/** Organización (antes `hotels`). Parámetros de operación por org. */
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  sector: text('sector').notNull().default('horeca'),
  waveMinutes: integer('wave_minutes').notNull().default(3),
  descansoMinH: integer('descanso_min_h').notNull().default(8),
  topeSemanalH: integer('tope_semanal_h').notNull().default(42),
  standbyMax: integer('standby_max').notNull().default(2),
  relaunchLimit: integer('relaunch_limit').notNull().default(2),
  /** Código de ALTA (va en el QR/enlace). No es secreto: el celular debe estar registrado como pendiente. */
  inviteCode: text('invite_code').notNull().unique().default(sql`upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Persona de la banca; global, el vínculo con cada org vive en `org_workers`. */
export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre'),
  celular: text('celular').unique(), // E.164; único entre orgs (ver ensure_worker)
  /** Marca de borrado de datos personales (BORRAR): la fila queda como tombstone anónimo. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orgWorkers = pgTable(
  'org_workers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    /** Nombre que la org le da; el dato personal vive aquí y no en `workers`. */
    nombre: text('nombre').notNull(),
    /** FK a roles se agrega en SQL (evita import circular con domain-schema). */
    roleId: uuid('role_id'),
    favorito: boolean('favorito').notNull().default(false),
    estado: hwState('estado').notNull().default('pendiente'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('org_workers_org_worker_uq').on(t.orgId, t.workerId)],
);

/** Bitácora solo-insert. Solo ids, nunca datos personales. */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  orgId: uuid('org_id').references(() => orgs.id),
  actorId: text('actor_id'),
  accion: text('accion').notNull(),
  entidad: text('entidad'),
  entidadId: text('entidad_id'),
  detalle: jsonb('detalle'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});
