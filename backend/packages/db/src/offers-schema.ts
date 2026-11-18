import { pgTable, uuid, text, timestamp, integer, bigserial, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orgs, workers } from './schema.js';
import { shifts } from './shifts-schema.js';

/**
 * Oferta de un turno a un candidato. Única por (turno, candidato) sin importar el canal:
 * la primera respuesta válida es la que cuenta (UPDATE … WHERE status IN (abiertos)).
 */
export const shiftOffers = pgTable(
  'shift_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id),
    workerId: uuid('worker_id').notNull().references(() => workers.id),
    status: text('status').notNull().default('queued'),
    wave: integer('wave').notNull().default(1),
    canalUsado: text('canal_usado'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    respondedCanal: text('responded_canal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shift_offers_shift_worker_uq').on(t.shiftId, t.workerId),
    check(
      'shift_offers_status_ck',
      sql`${t.status} in ('queued','sent','delivered','read','accepted','declined','cancelled','expired','undeliverable')`,
    ),
    index('shift_offers_worker_idx').on(t.workerId, t.status),
  ],
);

/** Un intento de entrega por canal. Sirve para escalar al siguiente canal y para auditar. */
export const offerDeliveries = pgTable(
  'offer_deliveries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    offerId: uuid('offer_id').notNull().references(() => shiftOffers.id),
    canal: text('canal').notNull(),
    externalId: text('external_id'),
    estado: text('estado').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('offer_deliveries_ext_uq').on(t.canal, t.externalId),
    index('offer_deliveries_offer_idx').on(t.offerId),
  ],
);

/** Códigos de un solo uso para vincular un canal (Telegram `/start CÓDIGO`, verificación de correo). */
export const channelLinkCodes = pgTable('channel_link_codes', {
  code: text('code').primaryKey(),
  workerId: uuid('worker_id').notNull().references(() => workers.id),
  canal: text('canal').notNull(),
  /** Correo a verificar (solo canal email). */
  identificador: text('identificador'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
