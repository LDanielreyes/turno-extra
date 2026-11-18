import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema.ts', './src/auth-schema.ts', './src/domain-schema.ts', './src/shifts-schema.ts', './src/channels-schema.ts', './src/offers-schema.ts', './src/alerts-schema.ts'],
  out: './migrations',
});
