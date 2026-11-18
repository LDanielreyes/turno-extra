import { sql } from 'drizzle-orm';
import { loadEnv } from '@turnoextra/shared';
import { createDb } from '@turnoextra/db';
import { buildApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { LogEmailProvider, SmtpEmailProvider } from './email.js';

const env = loadEnv();
const { db, listen, close } = createDb(env.DATABASE_URL);

// buildApp crea el logger; el proveedor de correo en modo log escribe en él.
const logRef: { fn: (o: object, m: string) => void } = { fn: () => {} };
const email = env.SMTP_URL
  ? new SmtpEmailProvider(env.SMTP_URL, env.EMAIL_FROM)
  : new LogEmailProvider((o, m) => logRef.fn(o, m));
const auth = createAuth({ db, env, email });

const app = await buildApp(env, {
  db,
  auth,
  listen,
  checkDb: async () => {
    await db.execute(sql`select 1`);
  },
});
logRef.fn = (o, m) => app.log.info(o, m);

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
