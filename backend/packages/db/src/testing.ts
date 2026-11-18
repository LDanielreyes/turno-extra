// Solo para pruebas: Postgres real en memoria (PGlite) con las migraciones aplicadas.
// Alternativa local a Testcontainers cuando no hay Docker. Una sola sesión: el rol activo
// se alterna con SET ROLE, así que las pruebas siembran como dueño y consultan como la app.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrationsFolder } from './migrate.js';
import type { Db } from './client.js';
import type { Listen } from './events.js';

export async function createTestDb() {
  const pg = new PGlite();
  const raw = drizzle(pg);
  await migrate(raw, { migrationsFolder });
  await pg.exec('SET ROLE turnoextra_app');
  const db = raw as unknown as Db;
  return {
    /** Conexión como `turnoextra_app` (sujeta a RLS). */
    db,
    /** Ejecuta `fn` como dueño del esquema (salta RLS) y vuelve al rol de la app. */
    async asOwner<T>(fn: (owner: Db) => Promise<T>): Promise<T> {
      await pg.exec('RESET ROLE');
      try {
        return await fn(db);
      } finally {
        await pg.exec('SET ROLE turnoextra_app');
      }
    },
    /** LISTEN/NOTIFY de PGlite (misma forma que `createDb().listen`). */
    listen: (async (channel, cb) => pg.listen(channel, cb)) as Listen,
    close: () => pg.close(),
  };
}
