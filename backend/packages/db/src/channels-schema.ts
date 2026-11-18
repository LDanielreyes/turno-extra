import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, bigserial, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orgs, workers } from './schema.js';
import { termsVersions } from './domain-schema.js';

/** Canales del candidato. Se habilitan solo cuando él mismo los activa. */
export const workerChannels = pgTable(
  'worker_channels',
  {
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    canal: text('canal').notNull(),
    identificador: text('identificador').notNull(),
    habilitado: boolean('habilitado').notNull().default(false),
    prioridad: integer('prioridad').notNull().default(100),
    verificadoAt: timestamp('verificado_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.workerId, t.canal] }),
    uniqueIndex('worker_channels_ident_uq').on(t.canal, t.identificador),
    check('worker_channels_canal_ck', sql`${t.canal} in ('whatsapp','telegram','email')`),
  ],
);

/** Autorización de tratamiento de datos por (org, candidato). `revokedAt` la revoca (BAJA/SALIR). */
export const workerConsents = pgTable(
  'worker_consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    termsVersionId: uuid('terms_version_id').references(() => termsVersions.id),
    canal: text('canal').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('worker_consents_worker_idx').on(t.workerId)],
);

/** Confirmaciones en curso (p. ej. «BORRAR MIS DATOS» espera el botón). Caducan solas. */
export const pendingConfirmations = pgTable('pending_confirmations', {
  workerId: uuid('worker_id').primaryKey().references(() => workers.id),
  accion: text('accion').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** Idempotencia de webhooks: un mensaje entrante (canal, id externo) se procesa una sola vez. Sin contenido. */
export const inboundMessages = pgTable(
  'inbound_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    canal: text('canal').notNull(),
    externalId: text('external_id').notNull(),
    workerId: uuid('worker_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('inbound_messages_ext_uq').on(t.canal, t.externalId)],
);

/**
 * Cola de salida (worker con FOR UPDATE SKIP LOCKED). `destinatario` y `payload` se borran al enviar
 * (o al fallar definitivamente): la cola no es un archivo de mensajes con datos personales.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    canal: text('canal').notNull(),
    destinatario: text('destinatario').notNull(),
    payload: jsonb('payload').notNull(),
    workerId: uuid('worker_id'),
    orgId: uuid('org_id'),
    /** Si el mensaje es una oferta: permite saber si sigue vigente al enviarla y escalar de canal. */
    offerId: uuid('offer_id'),
    estado: text('estado').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastError: text('last_error'),
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    check('outbox_estado_ck', sql`${t.estado} in ('pending','sending','sent','failed')`),
    index('outbox_due_idx').on(t.estado, t.nextAttemptAt),
  ],
);

/** Bandeja del simulador /demo (plan B). Solo se escribe con el canal `simulator`. */
export const demoMessages = pgTable(
  'demo_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    destinatario: text('destinatario').notNull(),
    texto: text('texto').notNull(),
    botones: jsonb('botones'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('demo_messages_dest_idx').on(t.destinatario, t.id)],
);

/**
 * Código de un solo uso para entrar al panel del candidato (`/yo`). Un código vigente por persona; solo se guarda su hash.
 * Dato de acceso: solo el contexto de sistema lo lee y escribe.
 */
export const candidateLoginCodes = pgTable('candidate_login_codes', {
  workerId: uuid('worker_id').primaryKey().references(() => workers.id),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Alta por Telegram en curso: el chat abrió `/start ALTA-<código>` y falta que comparta el celular de su cuenta.
 * Una fila por chat; caduca sola. Dato de acceso: solo el contexto de sistema la lee y escribe.
 */
export const telegramAltaPending = pgTable('telegram_alta_pending', {
  chatId: text('chat_id').primaryKey(),
  inviteCode: text('invite_code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * Enlace de alta personal: la empresa lo genera para una persona ya registrada en su banca y lo abre en Telegram.
 * Solo se guarda el hash del token; es de un solo uso y caduca. Dato de acceso: solo el contexto de sistema lo toca.
 */
export const workerInvites = pgTable(
  'worker_invites',
  {
    tokenHash: text('token_hash').primaryKey(),
    orgWorkerId: uuid('org_worker_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('worker_invites_ow_idx').on(t.orgWorkerId)],
);
