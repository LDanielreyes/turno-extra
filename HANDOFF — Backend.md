# HANDOFF — Backend de TurnoExtra

Fuente de verdad: `TurnoExtra — Diseño MVP v2.md` (secciones citadas abajo). Si este handoff y el documento difieren, manda el documento. Mensajes al usuario final: `Mensajes WhatsApp — para revisar.md` (W1–W19, aún en revisión del dueño).

## 1. Qué se construye
Plataforma multi-organización (HORECA y más) para cubrir turnos extra con la **banca propia** de personal. El gerente publica un turno en el panel, la oferta sale por WhatsApp/Telegram/correo a candidatos que ya consintieron, el primero que acepta ocupa el cupo y el panel se actualiza en vivo.
TurnoExtra **no recluta, no paga, no cobra comisión y no es empleador**: solo es medio de contacto e información.

**Contexto:** piloto expositivo para un jurado en una feria, no lanzamiento comercial. Debe ser **real de punta a punta** (panel, BD, mensajes a celulares reales). El simulador `/demo` es solo plan B (doc §1.1).

## 2. Stack decidido (todo TypeScript)
- Node 22, Fastify, Zod, Drizzle ORM, PostgreSQL 16.
- Auth: Better Auth (plugins organization, admin, twoFactor), argon2, cookies httpOnly.
- Worker en el mismo repo, cola `outbox` con `FOR UPDATE SKIP LOCKED`.
- Tiempo real: SSE + Postgres `LISTEN/NOTIFY` (eventos solo con ids); respaldo por polling 15–30 s.
- Tests: Vitest + Testcontainers. Observabilidad: pino (JSON) + Sentry.
- Frontend existente: `frontend/` (React 19, Vite 8, react-router 7; es la landing). Se le agregará TanStack Query para los paneles.
- Despliegue: lo decide el usuario después; no asumir plataforma. Usar Docker Compose local (Postgres) para desarrollo.

## 3. Actores y login
- Roles: `super_admin` (Lucas), `org_admin` (máx. 3 por organización, con trazabilidad de auditoría), `candidato`.
- **Un solo login para todos**, con redirección por rol: administradores con correo + contraseña (2FA obligatorio para super_admin); candidatos con código de un solo uso por su canal activo.
- Multi-tenant: `org_id` reemplaza a `hotel_id` en todo el modelo (v1 → v2).

## 4. Canales (interfaz abstracta `Channel`)
- **WhatsApp Cloud API** (prioridad): número de prueba de Meta, hasta ~5 destinatarios (límite **no verificado**). Plantillas NO aprobadas → ofertas como mensajes interactivos con botones dentro de la ventana de 24 h (ritual: cada voluntario escribe «ALTA»/«Hola» justo antes de la demo).
- **Telegram**: bot, red de seguridad.
- **Correo**: interfaz `EmailProvider`; implementación inicial Gmail/Nodemailer (sin dominio aún); luego Resend/Postmark.
- Un canal se habilita solo cuando el candidato lo activa. Consentimiento real vía ALTA → «Acepto».
- **Idempotencia entre canales:** una oferta por (turno, trabajador); gana la primera respuesta con `UPDATE` condicional; las demás se bloquean con «Ya respondiste» (W15). Los botones llevan `offer_id`; tabla `offer_deliveries`.
- Comandos: `ALTA`, `BAJA` (global), `SALIR {empresa}`, `BORRAR MIS DATOS` (borrado duro de datos personales; se conservan turnos/ofertas/asignaciones anonimizados y `audit_log` solo con ids), `NO PUEDO IR`.

## 5. Reglas de negocio clave (doc §7–8 y secciones heredadas de v1)
- Elegibilidad por SQL (v1 §8.1), algoritmo de piso salarial (v1 §8.2), asignación atómica con `UPDATE` condicional (v1 §8.4), pipeline de webhooks (v1 §10, firma HMAC).
- Olas: favoritos primero, `wave_minutes` por defecto 3 (demo: 1, parámetro real de la org, sin reloj falso).
- Lista de espera `standby_max` = 2; al liberarse un cupo sube la reserva más antigua. Si se queda sin gente, relanza la búsqueda (`relaunches`, límite por defecto 2, respetando `wave_minutes`).
- Orden por hora de aceptación; ranking opcional configurable por org (v1.1).
- Roles parametrizables (`roles`, `org_roles`, `role_requirements`); documentos con tipo, vencimiento y aprobar/rechazar por la empresa (subida de archivos = extra).
- No asistió → estado `disputed` + tabla `disputes` con evidencia (W19).
- Alertas al gerente: panel + correo siempre; WhatsApp solo urgentes, preferencias por usuario (`notification_prefs`).
- Parámetros salariales (SMMLV 1.750.905, hora 8.338 con divisor 210, nocturno 35 % desde 19:00, dominical 90 %, acumulables): la fecha de vigencia del 90 % (1 vs 15 de julio) **no está confirmada**; dejarlo como parámetro de configuración. Festivos fuera del MVP (API la elige el usuario).

## 6. Modelo de datos
Esquema base de v1 con `hotel_id → org_id`, más los deltas de v2 §10: `roles`, `org_roles`, `role_requirements`, `worker_documents.estado`, `worker_channels`, `offer_deliveries`, `shift_offers.canal_usado`, `shifts.relaunches`, `shifts.visibilidad` (feature flag del portal público, **apagado**), `disputes`, `hw_state 'baja_org'`, `assign_status 'disputed'`, `notification_prefs`. El SQL exacto está en el documento v2 §10.

## 7. Seguridad (obligatoria, listo para producción)
Better Auth con argon2; cookies httpOnly; 2FA; rate limits; **RLS en Postgres** como segunda barrera; validación Zod en toda entrada; cabeceras de seguridad y CORS estricto; firma HMAC en webhooks; secretos solo por variables de entorno; `audit_log` solo-insert para el rol de la app; teléfonos enmascarados en logs; `npm audit` en CI. Checklist completo: doc §9.

## 8. Orden de construcción (doc §14)
H0 cimientos del repo → H1 modelo/auth/RLS → H2 panel y reglas de turnos → **H3–H4 canales reales (WhatsApp, Telegram, correo; P0)** → H5 tiempo real y alertas → H6 ensayo general con 5 voluntarios reales, ritual de 24 h y script de carga. Simulador `/demo` = P1.

## 9. Tests (doc §11)
Mantener T1–T14 y agregar T15–T24. **Críticos para la demo: T1, T4, T5, T6, T7, T8.** Más un script de carga de 50 aceptaciones simultáneas contra el sistema real, rotulado honestamente como script de carga.

## 10. Primer paso sugerido (H0)
1. Crear `backend/` junto a `frontend/` (monorepo con workspaces npm/pnpm): `apps/api`, `apps/worker`, `packages/db` (Drizzle, migraciones), `packages/shared` (Zod, tipos).
2. `docker-compose.yml` con Postgres 16; `.env.example` con todas las variables (sin secretos reales).
3. Fastify con `/health`, pino, manejo de errores, cabeceras de seguridad y CORS.
4. Drizzle + primera migración con tablas base, `org_id` en todas y políticas RLS desde el inicio.
5. Vitest + Testcontainers funcionando con un test trivial contra Postgres real.
6. CI: lint, typecheck, tests, `npm audit`.

## 11. Pendientes que NO bloquean H0–H2
- Dueño: crear cuenta de desarrollador de Meta y bot de Telegram; confirmar cuántos voluntarios reales y si todos usan WhatsApp.
- Dueño: revisar mensajes W1–W19.
- Dueño: elegir proveedor de correo/dominio y API de festivos.
- Textos legales mínimos (política de tratamiento, autorización del candidato) publicados en `/legal` **antes de la feria**, porque habrá personas reales; revisión con abogado y contador antes de cualquier uso comercial. Esto no es asesoría legal.
- Verificar: límite de 5 destinatarios del número de prueba de Meta, estado de plantillas, fecha del recargo dominical, aplicabilidad del RNBD, y validar 3 min / 42 h con empresas reales.
- Riesgo legal registrado: un portal público de vacantes es intermediación laboral (Ley 1636/2013, Decreto 2852/2013); por eso queda diferido a v2 tras flag.

## 12. Notas para quien codifique
- Estética del frontend: ver `frontend/DESIGN.md` y `frontend/PRODUCT.md` (sin cifras, clientes ni testimonios inventados; valores pendientes en `src/config/site.js` quedan en `null`).
- No inventar datos de impacto: el tablero se alimenta de ensayos y demo reales.
- Los eventos SSE/NOTIFY llevan solo ids, nunca datos personales.
- Las decisiones ya tomadas no se reabren; si algo del documento es ambiguo, preguntar al dueño antes de improvisar.
