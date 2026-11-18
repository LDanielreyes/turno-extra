import { z } from 'zod';

const optionalStr = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Conexión del rol de aplicación (sin BYPASSRLS). */
  DATABASE_URL: z.string().url(),
  /** Conexión del rol dueño del esquema; solo para migraciones. */
  MIGRATION_DATABASE_URL: z.string().url().optional(),
  /** Contraseña que se asigna al rol de aplicación al migrar. */
  APP_DB_PASSWORD: z.string().min(8).optional(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
  /** Secreto de Better Auth (≥32 caracteres). Solo por variable de entorno. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL pública de la API (base de /api/auth). */
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  /** URL del frontend; se usa en los enlaces de los correos. */
  APP_URL: z.string().url().default('http://localhost:5173'),
  /** Correo: si falta SMTP_URL, los correos se escriben al log (solo desarrollo). */
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default('TurnoExtra <no-reply@localhost>'),
  /** WhatsApp Cloud API (número de prueba de Meta). Sin estas variables el canal real queda apagado. */
  WHATSAPP_TOKEN: optionalStr,
  WHATSAPP_PHONE_ID: optionalStr,
  /** Secreto de la app de Meta: firma HMAC de los webhooks. Sin él, el webhook rechaza todo. */
  WHATSAPP_APP_SECRET: optionalStr,
  WHATSAPP_VERIFY_TOKEN: optionalStr,
  /** false = apaga el envío por WhatsApp (el worker no lo registra y no se elige para ofertas). El webhook de entrada no cambia. */
  WHATSAPP_ENABLED: z.preprocess((v) => v !== 'false' && v !== false, z.boolean()).default(true),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  /** Telegram: token del bot, secreto del webhook (cabecera X-Telegram-Bot-Api-Secret-Token) y usuario del bot sin @. */
  TELEGRAM_BOT_TOKEN: optionalStr,
  TELEGRAM_WEBHOOK_SECRET: optionalStr,
  TELEGRAM_BOT_USERNAME: optionalStr,
  /** Desarrollo/feria sin URL pública: el worker lee los mensajes con getUpdates (borra el webhook). */
  TELEGRAM_POLLING: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  /** Simulador /demo (plan B): solo super admin y solo con DEMO_MODE=true. */
  DEMO_MODE: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  /** Documentación interactiva de la API en /docs. Por defecto solo fuera de producción. */
  DOCS_ENABLED: z.preprocess((v) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined), z.boolean().optional()),
  /** Enlace a la política de datos que cita el mensaje de autorización (W1). */
  POLICY_URL: optionalStr,
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables de entorno inválidas: ${fields}`);
  }
  return parsed.data;
}
