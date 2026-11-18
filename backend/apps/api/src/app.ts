import Fastify, { type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { openapi } from './docs/openapi.js';
import type { Env } from '@turnoextra/shared';
import type { Db, Listen } from '@turnoextra/db';
import type { Auth } from './auth/auth.js';
import { createGuards } from './auth/guards.js';
import { mountAuth } from './auth/mount.js';
import { adminRoutes } from './routes/admin.js';
import { orgRoutes } from './routes/org.js';
import { bancaRoutes } from './routes/banca.js';
import { shiftRoutes } from './routes/shifts.js';
import { channelRoutes } from './routes/channels.js';
import { alertRoutes } from './routes/alerts.js';
import { attendanceRoutes } from './routes/attendance.js';
import { candidateRoutes } from './routes/candidate.js';
import { createRealtime } from './realtime.js';
import { makeTermsGate } from './auth/terms-gate.js';

/** Oculta celulares (7+ dígitos) en cualquier texto de log. */
export const maskPhones = (s: string) =>
  s.replace(/\+?\d[\d\s-]{6,}\d/g, (m) => `***${m.replace(/\D/g, '').slice(-2)}`);

export type AppDeps = { checkDb?: () => Promise<void>; db?: Db; auth?: Auth; /** LISTEN/NOTIFY para el tiempo real (SSE). */ listen?: Listen };

export async function buildApp(
  env: Pick<Env, 'LOG_LEVEL' | 'CORS_ORIGINS'> & Partial<Pick<Env, 'WHATSAPP_APP_SECRET' | 'WHATSAPP_VERIFY_TOKEN' | 'DEMO_MODE' | 'POLICY_URL' | 'APP_URL' | 'TELEGRAM_WEBHOOK_SECRET' | 'TELEGRAM_BOT_USERNAME' | 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'NODE_ENV' | 'DOCS_ENABLED'>> & { RATE_LIMIT_MAX?: number },
  deps: AppDeps = {},
) {
  const app = Fastify({
    trustProxy: true,
    // Los enlaces firmados del correo (/r/:token) miden ~130 caracteres.
    routerOptions: { maxParamLength: 300 },
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-hub-signature-256"]', 'req.headers["x-telegram-bot-api-secret-token"]'],
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  // CORS cerrado: sin orígenes configurados no se permite ninguno.
  await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX ?? 120, timeWindow: '1 minute' });

  // Documentación para probar endpoints (Swagger UI). Fuera de producción por defecto; en producción solo con DOCS_ENABLED=true.
  const docs = env.DOCS_ENABLED ?? env.NODE_ENV !== 'production';
  if (docs) {
    await app.register(swagger, { mode: 'static', specification: { document: openapi as never } });
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      staticCSP: true,
      uiConfig: { docExpansion: 'none', persistAuthorization: false, tryItOutEnabled: true, displayRequestDuration: true },
      theme: { title: 'TurnoExtra API' },
    });
  }

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err.name === 'ZodError') return reply.status(400).send({ error: 'validation_error', message: 'Datos inválidos' });
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err: { message: maskPhones(err.message), code: err.code } }, 'error no controlado');
    }
    reply.status(status).send({
      error: status >= 500 ? 'internal_error' : (err.code ?? 'bad_request'),
      message: status >= 500 ? 'Error interno' : err.message,
    });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'not_found', message: 'No encontrado' }));

  app.get('/health', async (_req, reply) => {
    try {
      await deps.checkDb?.();
      return { status: 'ok' };
    } catch {
      return reply.status(503).send({ status: 'degraded' });
    }
  });

  if (deps.auth && deps.db) {
    const guards = createGuards(deps.auth, deps.db);
    mountAuth(app, deps.auth);
    orgRoutes(app, { db: deps.db, guards });
    const gate = makeTermsGate(deps.db);
    bancaRoutes(app, { db: deps.db, guards, gate });
    shiftRoutes(app, { db: deps.db, guards, gate });
    attendanceRoutes(app, { db: deps.db, guards, gate });
    const realtime = deps.listen ? await createRealtime(deps.listen) : undefined;
    if (realtime) app.addHook('onClose', async () => void (await realtime.close()));
    alertRoutes(app, { db: deps.db, guards, gate, realtime, codeRateMax: env.RATE_LIMIT_MAX ? env.RATE_LIMIT_MAX : undefined });
    adminRoutes(app, { db: deps.db, auth: deps.auth, guards });
    // Panel del candidato (/yo): sesión propia firmada con el secreto de la app; sin secreto no se monta.
    if (env.BETTER_AUTH_SECRET) {
      candidateRoutes(app, {
        db: deps.db,
        secret: env.BETTER_AUTH_SECRET,
        secure: env.NODE_ENV === 'production',
        // Con /docs activo, la propia API es un origen válido (Swagger UI hace las peticiones desde ahí).
        allowedOrigins: [env.APP_URL ?? 'http://localhost:5173', ...env.CORS_ORIGINS, ...(docs && env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : [])],
        codeRateMax: env.RATE_LIMIT_MAX ? env.RATE_LIMIT_MAX : undefined,
      });
    }
    channelRoutes(app, {
      db: deps.db,
      guards,
      env: { ...env, APP_URL: env.APP_URL ?? 'http://localhost:5173', DEMO_MODE: env.DEMO_MODE ?? false },
    });
  }

  return app;
}
