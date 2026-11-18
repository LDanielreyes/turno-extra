# Backend de TurnoExtra

Monorepo npm workspaces, todo TypeScript (Node 22). Ver `../HANDOFF — Backend.md` y `../TurnoExtra — Diseño MVP v2.md`.

- `apps/api`: Fastify (`/health`, cabeceras de seguridad, CORS cerrado, rate limit, pino).
- `apps/worker`: proceso aparte (la cola `outbox` llega en H3).
- `packages/db`: Drizzle, migraciones y RLS. Rol de app `turnoextra_app` sin BYPASSRLS; `audit_log` solo-insert.
- `packages/shared`: esquema Zod de variables de entorno.

## Desarrollo

    cp .env.example .env
    docker compose up -d
    npm install
    npm run db:migrate
    npm run dev:api

`npm run lint`, `npm run typecheck`, `npm test` (el test de RLS usa Testcontainers y necesita Docker).

## Estado

- **H1:** Better Auth (org, admin), invitaciones, términos, equipo (máx. 3), roles y requisitos, CLI (`npm run cli -w @turnoextra/api -- superadmin|demo-seed`).
- **H2:** banca, documentos con aprobación, piso salarial (`services/floor.ts`, `decimal.js`), elegibilidad (`services/eligibility.ts`), turnos, ajustes y parámetros legales con vigencia.
- **H3:** `packages/channels` (interfaz `Channel`, WhatsApp Cloud API, simulador, cola `outbox` con `FOR UPDATE SKIP LOCKED`, motor de comandos ALTA / «Acepto» / BAJA / SALIR / BORRAR MIS DATOS). Webhook firmado en `/webhooks/whatsapp`; simulador `/demo/*` solo con `DEMO_MODE=true` y super admin; `GET /orgs/:orgId/invitacion` (código/enlace de ALTA); `POST /admin/workers/:id/data-delete`. El worker es `apps/worker`.
- **H4:** ofertas y asignación. `shift_offers` única por (turno, candidato) y `offer_deliveries`; el worker (`tick`) lanza oleadas de cupos×2 espaciadas por `wave_minutes`, relanza hasta `relaunch_limit`, vence turnos y escala la oferta al siguiente canal si no salió. Aceptación atómica con lista de espera (W6–W9), NO PUEDO IR, cancelación con aviso (W11). Telegram (`TELEGRAM` → código → `/start CÓDIGO`, webhook con secreto en `/webhooks/telegram`) y correo (`CORREO x@y.z` → verificación; respuestas por enlaces firmados `/r/:token`, GET solo muestra, POST actúa).
- **H5:** tiempo real y alertas. Cada cambio hace `pg_notify` dentro de su transacción (solo ids y tipo); un `LISTEN` por proceso reparte a `GET /orgs/:orgId/stream` y `GET /orgs/:orgId/shifts/:shiftId/stream` (SSE, sesión + admin de la org, tope de 30 conexiones por org, latido de 20 s, reconexión forzada cada 30 min). Alertas (`alerts`): cancelación de asistencia (urgente si faltan <3 h), BAJA/SALIR con turnos confirmados, turno vencido; `disputa_abierta` la produce H6. Panel + correo por defecto; WhatsApp solo para urgentes, con número verificado por código, consentimiento y preferencia (`notification_prefs`). Correos y WhatsApp de alertas no llevan nombres ni celulares.
- **H6:** asistencia y disputas. Tras el fin del turno la empresa marca `completed`/`no_show` (`POST /orgs/:orgId/shifts/:shiftId/attendance`); un `no_show` avisa al candidato (W19) y este puede disputarlo respondiendo con su explicación (7 días, `disputes`, estado `disputed`); la empresa resuelve `upheld`/`reversed` (`POST /orgs/:orgId/disputes/:id/resolve`) y se produce la alerta `disputa_abierta`. Reporte mensual CSV (`GET /orgs/:orgId/reports/monthly?mes=YYYY-MM`). CLI `data export|delete <celular>` y `load-test`. Despliegue, ritual de 24 h y ensayo: ver `OPERACION.md`.
- Las reglas de elegibilidad, piso y T4/T5 son una **reconstrucción desde el doc v2** (la v1 no estaba disponible). Los 6 casos del piso están en `apps/api/test/floor.test.ts` y esperan validación de un contador.
- Las pruebas corren sobre PGlite (Postgres real en memoria) sin Docker; con `TESTCONTAINERS=1` además corre el test de RLS contra Postgres 16 en contenedor.

## Notas

- `withOrg(db, orgId, fn)` fija `app.org_id` con `set_config(..., true)` dentro de la transacción. Sin él, las consultas no devuelven filas.
- Las tablas de H0 (`orgs`, `workers`, `org_workers`, `audit_log`) son una base mínima; el resto del esquema (v1 + deltas de v2 §10) llega en H1+.
- El esqueleto anterior en Python (`app/`, `requirements.txt`) quedó obsoleto y se puede borrar.
