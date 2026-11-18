import { runMigrations } from './migrate.js';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('Falta MIGRATION_DATABASE_URL');
await runMigrations(url, process.env.APP_DB_PASSWORD);
console.log('Migraciones aplicadas');
