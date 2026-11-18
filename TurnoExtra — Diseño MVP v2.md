# TurnoExtra — Documento de diseño del MVP · v2

Nov 16, 2026 · Responsable: Lucas Chacón · Reemplaza las decisiones de la v1 (14 nov) donde se indique. Lo que no se menciona aquí se mantiene como en la v1, con el renombre **hotel → organización (org)**.

## 0. Cómo leer este documento
- **Se mantiene de la v1** (solo renombrar `hotel_id` → `org_id`): catálogo de mensajes W1–W14, SQL de elegibilidad (8.1), algoritmo del piso (8.2), asignación atómica (8.4), pipeline del webhook (10), casos de prueba T1–T14.
- **Cambia en la v2:** secciones 1 a 12 de este documento.
- **Supuestos míos sin confirmar** están marcados con ⚠. Hay uno abierto: ver 14.

## 1. Alcance y decisiones

**Qué es.** Software para negocios del sector HORECA y afines (hoteles, restaurantes, bares, eventos, y más adelante otros sectores) con el que cubren turnos extra con su **propia banca** de personal. TurnoExtra es un **medio de contacto e información dinámica**: no recluta, no paga, no cobra comisión y no es empleador. Cada empresa contrata y paga.

**Para qué sirve esta versión.** Piloto **expositivo**: no se pone en marcha comercialmente. Su único fin es vender la idea a un jurado, con la mayor cantidad de funcionalidades posible y que se vean funcionando. Debe poder escalar a un producto real sin reescribir.

### 1.1 Enfoque expositivo (manda sobre el resto del documento)

1. **Todo es real de punta a punta.** Lo que se expone es la funcionalidad final tal como se vería en producción, no una maqueta: panel real, base de datos real, mensajes reales a celulares reales. Nada de «patio de juegos cerrado».
2. **Canales reales en la demo.** WhatsApp con el número de prueba de Meta (hasta 5 celulares verificados, voluntarios reales) y Telegram como segundo canal real; correo real para alertas e invitaciones. Los voluntarios dan su consentimiento de verdad con el flujo ALTA → «Acepto».
   - **Ventana de 24 h:** mientras Meta no apruebe plantillas, las ofertas salen como mensajes interactivos con botones dentro de la ventana de 24 h. Ritual previo a la presentación: cada voluntario escribe «ALTA» (o «Hola») al número justo antes, y se repite si la ventana se vence.
   - **Telegram** no tiene esa restricción y es la red de seguridad real si WhatsApp falla.
3. **Tiempos reales, parámetros reales.** Sin reloj falso. Para que la demo sea ágil se configura de verdad el parámetro de la organización (`wave_minutes` = 1 min en lugar de 3), tal como lo haría un cliente.
4. **Pruebas de carga honestas.** Los 5 celulares demuestran el flujo real. La prueba de «50 aceptaciones simultáneas» se muestra como lo que es, un script de carga contra el sistema real, con su resultado en pantalla y rotulada así, sin presentarla como 50 personas.
5. **Tablero de impacto con datos reales** salidos de los ensayos y la demo (tiempo hasta la primera aceptación, tiempo de cobertura, mensajes enviados, reservas promovidas). Sin cifras inventadas.
6. **Simulador `/demo` solo como plan B**, rotulado como simulación, para el caso de que falle internet o Meta. No es el eje de la presentación.
7. **Datos de la organización de demostración:** la organización y los turnos son de demostración, pero las personas son voluntarios reales con consentimiento real. Eso hace obligatorios, aunque sean mínimos, la política de datos y el texto de autorización publicados antes de la feria.
8. **Todo lo que el jurado pueda ver tiene prioridad:** panel en vivo, oleadas, lista de espera, multi-org, roles parametrizables, super admin, cumplimiento visible (consentimiento, BAJA, borrado, bitácora), reportes.
9. **Lo que no se ve pasa a segundo plano:** ensayos de restauración de backups, alertas de operación y despliegue multi-entorno. La seguridad de fondo (aislamiento por org, auth, 2FA, firma de webhooks, validación) se mantiene porque se puede demostrar.
10. **Hoja de ruta visible** en la landing o en el panel: el portal público de vacantes, subida de documentos, ranking y pagos aparecen como «próximamente», sin implementarse.
11. **Estética primero** (referencia en `frontend/DESIGN.md`): animaciones suaves, fondos cuidados y dibujos 2D dinámicos, sin aspecto genérico.

**Criterio de salida (demo lista).**
- 3 turnos cubiertos sin doble asignación.
- Oferta en el celular en menos de 30 s desde «Publicar» (meta a medir).
- 50 aceptaciones simultáneas para 3 cupos dan exactamente 3 confirmados.
- Pruebas T1–T14 en verde (vitales para la demo: T1, T4, T5, T6, T7, T8).
- Checklist de seguridad (sección 9) completo.

**Decisiones tomadas**

| Tema | Decisión |
| --- | --- |
| Modelo | Banca propia por organización. Sin portal público de vacantes en esta versión |
| Sector | Multi-org y multi-sector: `org_id` en todo |
| Stack | **Todo TypeScript** (ver 2). Despliegue lo decide Lucas |
| Autenticación | Better Auth (organizaciones, invitaciones por correo, roles, 2FA) |
| Canal principal | WhatsApp Cloud API con **número de prueba de Meta** (hasta 5 destinatarios). Telegram y correo como canales secundarios |
| Tiempo real | SSE + `LISTEN/NOTIFY` de Postgres |
| Alertas al gerente | Panel + correo siempre; WhatsApp solo urgentes, configurable por usuario |
| Documentos del trabajador | v2 de producto: por ahora fecha de vencimiento y estado aprobado o rechazado por la empresa |
| Festivos | Fuera del MVP; API pública a elegir después |
| Observabilidad | Sentry y logs JSON desde el inicio |

**Fuera del alcance (va al checklist de extras, sección 12):** pago, nómina, comisión, portal público de vacantes, calificaciones, app nativa, geofencing, IA, subida de archivos, WhatsApp Flows, festivos.

**Riesgo legal que condiciona el alcance.** Publicar vacantes a candidatos desconocidos es intermediación laboral y, según lo que recuerdo, exige autorización como prestador del Servicio Público de Empleo (Ley 1636/2013, Decreto 2852/2013). Por eso el MVP se limita a la banca propia. Validar con un abogado antes de abrir el portal.

## 2. Stack (TypeScript de punta a punta)

| Capa | Elección |
| --- | --- |
| Backend | Node 22, TypeScript, Fastify, Zod, Drizzle ORM |
| Base de datos | PostgreSQL 16 |
| Auth | Better Auth con plugins `organization`, `admin`, `twoFactor` |
| Worker | Mismo repo, proceso aparte; `FOR UPDATE SKIP LOCKED` sobre `outbox` |
| Tiempo real | SSE (`text/event-stream`) disparado por `LISTEN/NOTIFY` |
| Frontend | React 19 + Vite + react-router (ya existen). Se agrega TanStack Query para datos y SSE. Estilo: ver `frontend/DESIGN.md` |
| Mensajería | WhatsApp Cloud API, Telegram Bot API, correo transaccional (proveedor a elegir) |
| Calidad | Vitest, Testcontainers (Postgres real para T1), Sentry, logs JSON (pino) |

⚠ El SQL de asignación, elegibilidad y piso se porta casi literal; el piso usa `decimal.js`, nunca `number`, para dinero.

Estructura propuesta:
```
turnoextra/
├─ frontend/            # landing existente + paneles (rutas por rol)
├─ backend/src/
│  ├─ api/              # rutas Fastify por dominio
│  ├─ auth/             # configuración Better Auth
│  ├─ services/         # eligibility, floor, assignment, waves, onboarding, reports, audit
│  ├─ channels/         # whatsapp, telegram, email, simulator (interfaz común)
│  ├─ worker/           # bucle y tareas
│  ├─ realtime/         # SSE + LISTEN/NOTIFY
│  └─ cli.ts            # org create, demo seed, legal-params add, data export|delete
├─ db/migrations/
└─ docker-compose.yml
```

## 3. Actores y paneles

| Actor | Superficie | Qué hace |
| --- | --- | --- |
| Visitante | Landing | Conoce el producto, contacto y textos legales |
| Super admin (Lucas) | Panel super admin | Invita organizaciones por correo, habilita roles, parámetros legales, auditoría global, solicitudes de datos |
| Admin de empresa (hasta 3 por org) | Panel de empresa | Banca, turnos, panel en vivo, asistencia, reportes, parámetros de su org. Todo con trazabilidad |
| Candidato | WhatsApp (principal), Telegram, correo; panel de candidato mínimo ⚠ | Se une, acepta ofertas, cancela, BAJA, ve sus turnos y disputas |
| Meta, Telegram, correo | Sistemas externos | Entregan mensajes y eventos |

⚠ **Panel del candidato (abierto):** lo trato como vista web mínima (mis turnos, mis canales, mis datos, disputar una marca). Acceso con código de un solo uso enviado por el canal activo, no con contraseña. Confírmalo en la sección 14.

**Flujo de alta de organización.** El super admin invita por correo → el contacto completa datos de la empresa y crea su cuenta → acepta términos → entra al panel de empresa. Puede invitar hasta 2 gerentes más (3 en total). Toda acción de gerente queda en `audit_log` con su `user_id`.

## 4. Paneles y vistas

**Landing (existente):** inicio, `/contacto`, `/legal`. Pendientes en `src/config/site.js`: correo, WhatsApp, URL del panel, portal legal, endpoint del formulario.

**Panel de empresa**

| Ruta | Vista |
| --- | --- |
| `/login`, `/terminos` | Acceso y términos vigentes |
| `/turnos`, `/turnos/nuevo`, `/turnos/:id` | Lista, creación con piso en vivo, detalle en vivo (SSE) |
| `/banca` | Banca, filtros, invitar con enlace y QR |
| `/reportes` | Reporte mensual CSV |
| `/equipo` | Gerentes (máx. 3), invitaciones, actividad |
| `/ajustes` | Parámetros de la org: minutos entre oleadas, descanso, tope semanal, canales de alerta |

**Panel super admin:** `/admin/orgs` (invitar, estado), `/admin/roles` (catálogo y requisitos), `/admin/legal` (parámetros con vigencia), `/admin/auditoria`, `/admin/datos` (solicitudes de datos).

**Panel de candidato:** `/yo` con mis turnos, mis canales (habilitados y prioritario), disputas con evidencia y solicitud de baja o borrado.

**Simulador `/demo`:** solo `DEMO_MODE=true` y super admin; mismo camino interno que el webhook.

Toda vista tiene estados cargando, vacío y error.

## 5. Roles parametrizables

- `roles` (catálogo del super admin): `mesero` y otros por defecto, activables.
- `org_roles`: qué roles tiene habilitados cada organización.
- `role_requirements`: por rol, qué documentos exige (`tipo`, `obligatorio`, `vigencia_requerida`). Ej.: mesero y cocina → carnet de manipulación de alimentos; seguridad → curso vigente; conductor → licencia.
- Elegibilidad: el trabajador debe tener cada documento obligatorio **aprobado** y vigente hasta el fin del turno.
- **Documentos en el MVP:** el candidato (o la empresa en su nombre) declara tipo y vencimiento; la empresa **aprueba o rechaza** y queda en bitácora. La subida de archivos queda en extras.

## 6. Alta, canales y consentimiento

**Flujo ALTA (se mantiene).**
1. La empresa registra nombre, celular y rol. Queda `pendiente` y no se envía nada.
2. El candidato escanea el QR; WhatsApp abre con «ALTA CÓDIGO» y él lo envía.
3. Se verifica que el celular esté pendiente en esa org y se envía el texto de autorización con «Acepto» y «No acepto».
4. «Acepto» → `activo`.

**Canales por candidato.**
- `worker_channels(worker_id, canal, identificador, habilitado, prioridad, verificado_at)`.
- Un canal queda **habilitado cuando el candidato lo activa él mismo** (WhatsApp con ALTA; Telegram con `/start CÓDIGO`; correo con enlace de verificación). Nunca se escribe por un canal que no inició.
- **WhatsApp es el canal prioritario por defecto** cuando está habilitado. Los demás son respaldo.
- El candidato puede ver y cambiar sus canales en `/yo`.

**Idempotencia entre canales (regla clave).** Una oferta se envía por un solo canal a la vez; los demás quedan bloqueados.
- `shift_offers` es única por (`shift_id`, `worker_id`), sin importar el canal.
- Se guarda `canal_usado` y los identificadores externos en `offer_deliveries(offer_id, canal, external_id, estado)`.
- Respuesta válida = la primera que cambie `shift_offers.status` de `queued|sent|delivered|read` a `accepted|declined`, con `UPDATE … WHERE status IN (...)`. Si el candidato responde por otro canal después, recibe «Ya respondiste a este turno».
- Si el canal prioritario falla o no entrega, el worker puede escalar al siguiente **solo mientras la oferta no tenga respuesta**, y registra el cambio.
- Los botones llevan el ID de oferta (`OFFER_ACCEPT:{offer_id}`), no solo el del turno.

**BAJA y borrado.**
- **BAJA** (global): estado `baja`, revoca todas las autorizaciones, cancela ofertas pendientes y reservas, avisa a las orgs con turnos confirmados, un solo mensaje de confirmación. BAJA se atiende antes que cualquier otra regla.
- **SALIR {empresa}** (por org): `hotel_workers` pasa a `baja_org` solo para esa org; no afecta a las demás.
- **BORRAR MIS DATOS** (hard delete): elimina nombre, celular, canales, autorizaciones, mensajes y documentos. **Se conservan** turnos, ofertas y asignaciones ya anónimos para los reportes de la org, y la bitácora (solo ids). Cada ejecución queda en bitácora. Equivale a `data delete` del super admin; ambos usan el mismo servicio.

## 7. Reglas de negocio (cambios sobre la v1)

**Lista de espera y relanzamiento.** Se mantienen `standby_max` y la promoción de la reserva más antigua. Nuevo: **si no quedan reservas ni candidatos pendientes y el turno sigue abierto con cupos libres, se relanza la búsqueda**: recalcula elegibles que aún no tengan oferta y envía otra oleada. Límite: máximo N relanzamientos por turno (parámetro de la org, 2 por defecto) y nunca a menos de `wave_minutes` del anterior.

**Orden de la lista de espera.** Por defecto, hora de aceptación. Opcional por org (v1.1): ranking configurable con criterios objetivos y explicables (favorito, asistencias en esa org). Nunca hay sanción entre organizaciones.

**Oleadas, piso, descanso y tope semanal.** Sin cambios. Son parámetros por org (`wave_minutes` = 3, descanso 8 h, tope 42 h) y se validan en el piloto.

**Asistencia y disputa.** Tras el fin del turno, la empresa marca `completed` o `no_show`. Un `no_show` pasa a `disputable`: el candidato puede contestarlo desde `/yo` o por el canal con evidencia (texto, y archivo en extras). Hay un estado `disputed` con resolución de la empresa (`upheld` o `reversed`). Todo en bitácora. El efecto es solo dentro de esa org.

**Alertas al gerente.** Eventos: cancelación de asistencia (urgente si faltan menos de 3 h), BAJA de alguien con turnos confirmados, turno vencido sin cubrir, disputa abierta. Canales: panel y correo siempre; WhatsApp solo para urgentes, con consentimiento del gerente y preferencia por usuario.

## 8. Tiempo real

- Endpoint `GET /orgs/:id/stream` y `GET /shifts/:id/stream` (SSE).
- Cada cambio relevante ejecuta `NOTIFY` dentro de la misma transacción; un listener por proceso reenvía a los clientes suscritos de esa org.
- El cliente usa TanStack Query: al llegar un evento invalida y refresca solo lo afectado.
- Fallback: si SSE cae, consulta cada 15–30 s.
- Los eventos llevan solo ids y tipo, nunca datos personales. Cada conexión se autoriza con la sesión y el `org_id`.
- Requiere servidor con conexiones largas (no funciones serverless).

## 9. Seguridad de nivel producción (checklist transversal)

**Acceso**
- [ ] Better Auth con argon2, sesiones en cookies `httpOnly`, `Secure`, `SameSite`.
- [ ] 2FA obligatorio para super admin y opcional para admins de empresa.
- [ ] Límite de intentos de login por correo e IP; bloqueo temporal.
- [ ] Invitaciones por correo de un solo uso con vencimiento.
- [ ] Roles: `super_admin`, `org_admin`, `candidato`; permisos revisados en servidor.

**Aislamiento entre organizaciones**
- [ ] `org_id` obligatorio en cada consulta; dependencia central que lo inyecta.
- [ ] **Row Level Security** de Postgres como segunda barrera (`SET LOCAL app.org_id`).
- [ ] Recursos de otra org responden 404 (T6 en cada endpoint).

**API y datos**
- [ ] Validación Zod en toda entrada; respuestas con esquema explícito.
- [ ] Cabeceras de seguridad (CSP, HSTS, `X-Content-Type-Options`, frame-ancestors) y CORS cerrado.
- [ ] Rate limiting por IP y por usuario; límites distintos para el webhook.
- [ ] Webhooks: firma HMAC verificada sobre cuerpo crudo, comparación en tiempo constante, ventana anti-replay.
- [ ] Secretos solo en variables de entorno; ninguno en el repo; rotación documentada.
- [ ] Rol de BD de la app sin `UPDATE`/`DELETE`/`TRUNCATE` sobre `audit_log` (T11).
- [ ] Cifrado en tránsito (TLS) y en reposo (proveedor de BD); backups automáticos con prueba de restauración.
- [ ] Celulares enmascarados en logs y en la interfaz; bitácora solo con ids.
- [ ] Dependencias auditadas (`npm audit`, Dependabot) y lockfile.
- [ ] Protección CSRF en rutas con cookie; SSRF y subida de archivos: no aplican (sin archivos en MVP).

**Operación**
- [ ] Sentry en API, worker y frontend; logs JSON; `GET /health` y monitor de disponibilidad.
- [ ] Alertas: atraso de cola > 1 min, fallos de envío, 5xx del webhook.
- [ ] Plan de respuesta ante incidentes y de notificación de fugas de datos.

## 10. Modelo de datos: cambios sobre la v1

Renombres: `hotels` → `orgs`; `hotel_workers` → `org_workers`; `hotel_id` → `org_id`; `hotel_terms` → `org_terms`; `descanso_min_h`, `tope_semanal_h`, `wave_minutes` se quedan en `orgs`.

Better Auth gestiona `user`, `session`, `account`, `organization`, `member`, `invitation`; `users` de la v1 se reemplaza por esas tablas y el rol global `super_admin`. Máximo 3 `member` con rol de admin por org (restricción en servicio y en trigger).

Tablas nuevas o cambiadas:

```sql
CREATE TABLE roles (            -- catálogo del super admin
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, nombre text NOT NULL, activo boolean NOT NULL DEFAULT true);

CREATE TABLE org_roles (
  org_id uuid NOT NULL REFERENCES orgs(id), role_id uuid NOT NULL REFERENCES roles(id),
  PRIMARY KEY (org_id, role_id));

CREATE TABLE role_requirements (
  role_id uuid NOT NULL REFERENCES roles(id), tipo_documento text NOT NULL,
  obligatorio boolean NOT NULL DEFAULT true, PRIMARY KEY (role_id, tipo_documento));

-- worker_documents (cambio): estado de revisión por la empresa
ALTER TABLE worker_documents
  ADD COLUMN estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobado','rechazado')),
  ADD COLUMN revisado_por text, ADD COLUMN revisado_at timestamptz;

CREATE TABLE worker_channels (
  worker_id uuid NOT NULL REFERENCES workers(id),
  canal text NOT NULL CHECK (canal IN ('whatsapp','telegram','email')),
  identificador text NOT NULL, habilitado boolean NOT NULL DEFAULT false,
  prioridad int NOT NULL DEFAULT 100, verificado_at timestamptz,
  PRIMARY KEY (worker_id, canal));

CREATE TABLE offer_deliveries (
  id bigserial PRIMARY KEY, offer_id uuid NOT NULL REFERENCES shift_offers(id),
  canal text NOT NULL, external_id text, estado text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canal, external_id));

-- shift_offers: sin cambios en la clave; se agrega
ALTER TABLE shift_offers ADD COLUMN canal_usado text;

-- shifts: relanzamientos y visibilidad (previsto para v2 de producto)
ALTER TABLE shifts
  ADD COLUMN relaunches int NOT NULL DEFAULT 0,
  ADD COLUMN visibilidad text NOT NULL DEFAULT 'privada' CHECK (visibilidad IN ('privada','publica'));

-- asistencia: disputa
ALTER TYPE assign_status ADD VALUE 'disputed';
CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id),
  motivo text NOT NULL, estado text NOT NULL DEFAULT 'abierta'
    CHECK (estado IN ('abierta','upheld','reversed')),
  resuelto_por text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz);

-- org_workers: SALIR por organización
ALTER TYPE hw_state ADD VALUE 'baja_org';

-- Notificaciones al gerente
CREATE TABLE notification_prefs (
  user_id text NOT NULL, evento text NOT NULL,
  panel boolean NOT NULL DEFAULT true, email boolean NOT NULL DEFAULT true,
  whatsapp boolean NOT NULL DEFAULT false, PRIMARY KEY (user_id, evento));
```

⚠ La tabla `postulaciones` del portal público no se crea en el MVP; solo queda la columna `visibilidad`.

## 11. Pruebas

Se mantienen **T1–T14** de la v1 y se agregan:

| ID | Prueba | Resultado esperado |
| --- | --- | --- |
| T15 | Candidato responde la misma oferta por WhatsApp y Telegram a la vez | Solo la primera cuenta; la otra recibe «Ya respondiste» |
| T16 | Canal prioritario falla y el worker escala | Un solo envío efectivo por oferta; cambio registrado |
| T17 | Turno sin gente, con cupos libres | Relanza búsqueda hasta el límite, respetando `wave_minutes` |
| T18 | SALIR de una org | Solo esa relación pasa a `baja_org`; las demás siguen |
| T19 | BORRAR MIS DATOS | Sin nombre ni celular en ninguna tabla; turnos y reportes siguen |
| T20 | Admin intenta invitar un cuarto gerente | Rechazado |
| T21 | Fuga entre orgs con RLS (consulta sin `org_id`) | Cero filas |
| T22 | Rol sin permiso intenta endpoints de super admin | 403 |
| T23 | Disputa de un `no_show` | Estado `disputed`, resolución en bitácora, efecto solo en esa org |
| T24 | Documento rechazado | El trabajador deja de ser elegible para roles que lo exigen |

## 12. Extras (checklist, fuera del MVP)

Cada ítem con su funcionalidad definida para retomarlo.

- [ ] **Portal público de vacantes.** Empresa publica una vacante pública; candidato se postula en el portal; empresa aprueba; el candidato activa WhatsApp. Requiere antes: autorización de prestador del SPE (validar con abogado) y tabla `postulaciones`.
- [ ] **Subida de documentos.** Archivos cifrados en almacenamiento privado, URL firmadas de corta vida, antivirus, retención y borrado.
- [ ] **Ranking configurable por vacante.** Criterios por org (favorito, asistencias, antigüedad), explicables al candidato.
- [ ] **Festivos en el piso.** API pública o librería de festivos de Colombia; cachear por año.
- [ ] **Pago y nómina.** Fuera de modelo; solo si cambia el modelo legal.
- [ ] **Comisión por turno.** Idem.
- [ ] **Calificaciones y check-in con ubicación.** Con consentimiento explícito de ubicación.
- [ ] **WhatsApp Flows.** Formularios dentro del chat.
- [ ] **Recordatorio a 3 h.** Plantilla de utilidad.
- [ ] **Regenerar código de invitación.**
- [ ] **App nativa, geofencing, emparejamiento con IA.**
- [ ] **Websockets bidireccionales** si algún día se necesita chat.

## 13. Documentos legales y mensajes

- **Documentos necesarios:** política de tratamiento de datos (Ley 1581/2012), autorización del candidato, términos para empresas, términos para candidatos, aviso de privacidad.
- **Responsable:** Lucas Chacón, persona natural (nombre, documento y correo de contacto) mientras no haya empresa. ⚠ Confirmar con abogado qué datos deben ir visibles.
- **Contenido mínimo:** finalidades, derechos del titular, canal de consultas (10 días hábiles) y reclamos (15), transmisión a las empresas contratantes, revocatoria, BAJA y borrado.
- **Estado:** la landing existente tiene la sección `/legal`; falta redactar los cinco textos y que un abogado los valide.
- **Catálogo W1–W14:** pendiente de tu revisión de redacción. Se agregan mensajes para Telegram y correo equivalentes y «Ya respondiste a este turno».
- **Valores legales** (`legal_params`): validar con el decreto del salario mínimo 2026, Código Sustantivo del Trabajo, Ley 2466/2025 y un contador o abogado laboralista, usando los 6 casos de prueba del piso.

## 14. Orden de construcción

**Ajuste por enfoque expositivo (1.1):** los canales reales (WhatsApp de prueba, Telegram y correo) son P0 y se construyen en H3–H4, no al final. El simulador pasa a plan B (P1). Se agrega al hito H6 el ensayo general con los 5 voluntarios reales, el ritual de la ventana de 24 h y el script de carga. La política de datos y el texto de autorización deben estar publicados antes de la feria porque habrá personas reales; el resto de la revisión con abogado y contador queda para antes de un uso comercial.

1. **H0 · Cimientos:** repo TS, Docker con Postgres, migraciones, CI, `/health`, Sentry y logs JSON, RLS base.
2. **H1 · Acceso y organizaciones:** Better Auth, invitación por correo, términos, equipo (máx. 3), panel super admin mínimo, roles y requisitos, `demo seed`.
3. **H2 · Banca y turnos:** banca, documentos con aprobación, piso, elegibilidad, turnos. Cierra con T4, T5, T6, T21, T22.
4. **H3 · Canales núcleo:** interfaz de canales, simulador, WhatsApp con número de prueba, outbox y worker, ALTA, «Acepto», BAJA, SALIR, BORRAR. Cierra con T2, T3, T7, T8, T18, T19.
5. **H4 · Oferta y asignación:** oleadas, atómica, lista de espera, relanzamiento, Telegram y correo con idempotencia. Cierra con T1, T9, T10, T15, T16, T17.
6. **H5 · Tiempo real y alertas:** SSE, alertas por panel y correo, WhatsApp urgente.
7. **H6 · Cierre y demo:** asistencia y disputas, reporte CSV, `data export|delete`, T11–T14, T23, T24, ensayo con 5 personas, despliegue.

**Guión de demo de 5 minutos:** se mantiene el de la v1, sustituyendo «hotel» por «organización» y agregando la invitación por correo y el cambio de canal en vivo.

## 15. Preguntas abiertas

- [ ] ⚠ **Panel del candidato:** ¿acceso con código de un solo uso por su canal activo, como propongo, o sin panel web en el MVP?
- [ ] Proveedor de correo transaccional (Resend, Postmark u otro) y dominio para enviar.
- [ ] Validar con abogado: intermediación y SPE, textos legales, uso de persona natural como responsable.
- [ ] Validar con contador: parámetros del piso y los 6 casos de prueba.
- [ ] Qué APIs de festivos evaluar (decide Lucas).
- [ ] Revisar redacción de W1–W14.
- [ ] Validar con empresas reales: 3 min entre oleadas y 42 h semanales.
