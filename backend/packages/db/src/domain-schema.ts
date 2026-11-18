import { pgTable, uuid, text, boolean, timestamp, integer, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './schema.js';

/** Versiones de términos publicadas por el super admin (empresas y candidatos). */
export const termsVersions = pgTable(
  'terms_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audience: text('audience').notNull(), // 'org' | 'candidato'
    version: integer('version').notNull(),
    titulo: text('titulo').notNull(),
    cuerpo: text('cuerpo').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('terms_versions_aud_ver_uq').on(t.audience, t.version)],
);

/** Aceptación de términos de empresa (antes `hotel_terms`). Una fila por org y versión. */
export const orgTerms = pgTable(
  'org_terms',
  {
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    termsVersionId: uuid('terms_version_id').notNull().references(() => termsVersions.id),
    acceptedBy: text('accepted_by').notNull(), // user.id
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.termsVersionId] })],
);

/** Catálogo de roles del super admin. */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').notNull().default(true),
});

export const orgRoles = pgTable(
  'org_roles',
  {
    orgId: uuid('org_id').notNull().references(() => orgs.id),
    roleId: uuid('role_id').notNull().references(() => roles.id),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.roleId] })],
);

export const roleRequirements = pgTable(
  'role_requirements',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id),
    tipoDocumento: text('tipo_documento').notNull(),
    obligatorio: boolean('obligatorio').notNull().default(true),
    vigenciaRequerida: boolean('vigencia_requerida').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.tipoDocumento] })],
);
