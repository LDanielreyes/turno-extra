import { pgTable, uuid, text, boolean, timestamp, integer, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orgs } from './schema.js';

/** Eventos que avisan al gerente. `disputa_abierta` lo produce H6 (asistencia y disputas). */
export const ALERT_TYPES = ['cancelacion_asistencia', 'baja_con_turnos', 'turno_vencido', 'disputa_abierta'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * Alertas del panel. Solo guardan ids y tipo: el nombre del candidato se resuelve al mostrarlas
 * (así BORRAR MIS DATOS no deja datos personales aquí). `atendida_*` es compartida por la org.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    tipo: text('tipo').notNull(),
    urgente: boolean('urgente').notNull().default(false),
    shiftId: uuid('shift_id'),
    workerId: uuid('worker_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    atendidaAt: timestamp('atendida_at', { withTimezone: true }),
    atendidaPor: text('atendida_por'),
  },
  (t) => [
    check('alerts_tipo_ck', sql`${t.tipo} in ('cancelacion_asistencia','baja_con_turnos','turno_vencido','disputa_abierta')`),
    index('alerts_org_idx').on(t.orgId, t.createdAt),
  ],
);

/** Preferencias de aviso por persona y evento. Panel y correo vienen activos; WhatsApp solo si se pide (y está verificado). */
export const notificationPrefs = pgTable(
  'notification_prefs',
  {
    userId: text('user_id').notNull(),
    evento: text('evento').notNull(),
    panel: boolean('panel').notNull().default(true),
    email: boolean('email').notNull().default(true),
    whatsapp: boolean('whatsapp').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.evento] }),
    check('notification_prefs_evento_ck', sql`${t.evento} in ('cancelacion_asistencia','baja_con_turnos','turno_vencido','disputa_abierta')`),
  ],
);

/**
 * WhatsApp del gerente para alertas urgentes. Exige consentimiento (`consent_at`) y verificación con un código
 * enviado a ese número (`verified_at`). El código se guarda con hash y vence solo.
 */
export const managerContacts = pgTable('manager_contacts', {
  userId: text('user_id').primaryKey(),
  celular: text('celular').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  codeHash: text('code_hash'),
  codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
});
