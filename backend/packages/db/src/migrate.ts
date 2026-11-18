import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Aplica migraciones con el rol dueño; opcionalmente habilita login del rol de app. */
export async function runMigrations(url: string, appPassword?: string) {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    if (appPassword) {
      // El rol ya existe tras 0001; la contraseña se escapa como literal.
      const lit = appPassword.replace(/'/g, "''");
      await client.unsafe(`ALTER ROLE turnoextra_app LOGIN PASSWORD '${lit}'`);
    }
  } finally {
    await client.end();
  }
}
