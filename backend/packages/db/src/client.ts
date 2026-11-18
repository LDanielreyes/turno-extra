import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';
import type { Listen } from './events.js';

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  // Conexión propia de postgres-js para LISTEN (se reconecta sola y vuelve a escuchar).
  const listen: Listen = async (channel, cb) => {
    const meta = await client.listen(channel, cb);
    return () => meta.unlisten();
  };
  return { db, client, listen, close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ejecuta `fn` en una transacción con la org activa fijada para RLS. */
export async function withOrg<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(orgId)) throw new Error('org_id inválido');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/** Contexto de super admin: ve todas las orgs (política `app_is_super()`). Solo para rutas /admin. */
export async function withSuper<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.is_super', 'on', true)`);
    return fn(tx);
  });
}
