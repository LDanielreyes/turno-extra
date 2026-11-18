/**
 * Especificación OpenAPI 3.0 escrita a mano (las rutas validan con Zod dentro de cada handler, así que no hay esquemas
 * que generar solos). Mantenerla al día cuando cambie una ruta: es lo que muestra /docs.
 *
 * Sesión: los endpoints protegidos usan cookies httpOnly. Se inicia sesión con POST /api/auth/sign-in/email (gerente o
 * super admin) o con POST /candidato/codigo + /candidato/verificar (candidato) desde esta misma página; el navegador guarda
 * la cookie y las demás pruebas la envían solas.
 */
type Json = Record<string, unknown>;
type Param = { name: string; in: 'path' | 'query'; required?: boolean; schema?: Json; description?: string; example?: unknown };

const str = (example?: unknown, extra: Json = {}): Json => ({ type: 'string', ...(example !== undefined ? { example } : {}), ...extra });
const int = (example?: unknown, extra: Json = {}): Json => ({ type: 'integer', ...(example !== undefined ? { example } : {}), ...extra });
const bool = (example?: unknown): Json => ({ type: 'boolean', ...(example !== undefined ? { example } : {}) });
const obj = (properties: Record<string, Json>, required: string[] = Object.keys(properties)): Json => ({ type: 'object', properties, required });
const uuidS = (ex = '00000000-0000-4000-8000-000000000000'): Json => str(ex, { format: 'uuid' });

const orgId: Param = { name: 'orgId', in: 'path', required: true, schema: uuidS(), description: 'Id de la organización (de GET /me → memberships)' };
const shiftId: Param = { name: 'shiftId', in: 'path', required: true, schema: uuidS() };
const id = (name: string, d?: string): Param => ({ name, in: 'path', required: true, schema: uuidS(), description: d });

type Op = {
  tag: string;
  summary: string;
  /** Quién puede llamarla. */
  who?: 'público' | 'sesión' | 'gerente' | 'super admin' | 'candidato' | 'firma Meta/Telegram';
  params?: Param[];
  body?: Json;
  status?: number;
  res?: Json;
  csv?: boolean;
  sse?: boolean;
  note?: string;
};

const paths: Record<string, Record<string, Json>> = {};
function add(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, o: Op) {
  const who = o.who ?? 'sesión';
  const status = String(o.status ?? 200);
  const content = o.csv
    ? { 'text/csv': { schema: str() } }
    : o.sse
      ? { 'text/event-stream': { schema: str() } }
      : { 'application/json': { schema: o.res ?? { type: 'object' } } };
  (paths[path] ??= {})[method] = {
    tags: [o.tag],
    summary: o.summary,
    description: `**Quién:** ${who}.${o.note ? `\n\n${o.note}` : ''}`,
    ...(o.params?.length ? { parameters: o.params.map((p) => ({ required: p.in === 'path', schema: str(), ...p })) } : {}),
    ...(o.body ? { requestBody: { required: true, content: { 'application/json': { schema: o.body } } } } : {}),
    responses: {
      [status]: { description: 'OK', content },
      ...(who !== 'público' && who !== 'firma Meta/Telegram' ? { 401: { description: 'Sin sesión' } } : {}),
      ...(['gerente', 'super admin'].includes(who) ? { 403: { description: 'Sin permiso' }, 404: { description: 'No existe o es de otra organización' } } : {}),
      400: { description: 'Datos inválidos (validation_error)' },
    },
  };
}

// --- Sistema ----------------------------------------------------------------------------------
add('get', '/health', { tag: 'Sistema', who: 'público', summary: 'Estado del servicio y de la base de datos', res: obj({ status: str('ok') }) });

// --- Sesión (Better Auth) ---------------------------------------------------------------------
const T = 'Sesión (Better Auth)';
add('post', '/api/auth/sign-in/email', {
  tag: T, who: 'público', summary: 'Iniciar sesión (gerente o super admin)',
  body: obj({ email: str('gerente@miorg.co', { format: 'email' }), password: str('una-clave-larga-123') }),
  note: 'Guarda la cookie de sesión en el navegador. Requiere correo verificado. Límite: 5 intentos por minuto.',
});
add('post', '/api/auth/sign-up/email', {
  tag: T, who: 'público', summary: 'Crear cuenta (solo con invitación vigente)',
  body: obj({ name: str('Ana Gómez'), email: str('gerente@miorg.co', { format: 'email' }), password: str('una-clave-larga-123', { minLength: 12 }) }),
  note: 'Sin invitación pendiente para ese correo no se crea la cuenta (signup_requires_invitation).',
});
add('post', '/api/auth/sign-out', { tag: T, summary: 'Cerrar sesión', body: obj({}, []) });
add('get', '/api/auth/get-session', { tag: T, summary: 'Sesión actual (Better Auth)' });
add('post', '/api/auth/organization/invite-member', {
  tag: T, who: 'gerente', summary: 'Invitar a un gerente a la organización (máx. 3 en total)',
  body: obj({ email: str('otro@miorg.co', { format: 'email' }), role: str('admin', { enum: ['admin'] }), organizationId: uuidS() }),
});
add('post', '/api/auth/organization/accept-invitation', { tag: T, summary: 'Aceptar una invitación', body: obj({ invitationId: uuidS() }) });
add('post', '/api/auth/organization/cancel-invitation', { tag: T, who: 'gerente', summary: 'Cancelar una invitación pendiente', body: obj({ invitationId: uuidS() }) });
add('post', '/api/auth/organization/remove-member', {
  tag: T, who: 'gerente', summary: 'Quitar a un gerente', body: obj({ memberIdOrEmail: str('id del miembro o correo'), organizationId: uuidS() }),
});

// --- Perfil -----------------------------------------------------------------------------------
const P = 'Perfil y avisos';
add('get', '/me', { tag: P, summary: 'Usuario y organizaciones a las que pertenece', res: obj({ user: { type: 'object' }, memberships: { type: 'array', items: obj({ orgId: uuidS(), role: str('admin'), nombre: str('Hotel Demo') }) } }) });
add('get', '/terms/current', { tag: P, summary: 'Términos vigentes', params: [{ name: 'audience', in: 'query', schema: str('org', { enum: ['org', 'candidato'] }) }] });
add('get', '/me/notification-prefs', { tag: P, summary: 'Mis preferencias de aviso por evento' });
add('put', '/me/notification-prefs', {
  tag: P, summary: 'Guardar preferencias de aviso',
  body: obj({ prefs: { type: 'array', items: obj({ evento: str('turno_vencido', { enum: ['cancelacion_asistencia', 'baja_con_turnos', 'turno_vencido', 'disputa_abierta'] }), panel: bool(true), email: bool(true), whatsapp: bool(false) }) } }),
  note: 'whatsapp=true exige tener el WhatsApp verificado (409 whatsapp_not_verified).',
});
add('get', '/me/notification-whatsapp', { tag: P, summary: 'Estado de mi WhatsApp para avisos urgentes' });
add('put', '/me/notification-whatsapp', { tag: P, summary: 'Registrar mi WhatsApp y recibir un código', status: 202, body: obj({ celular: str('300 123 4567'), consentimiento: bool(true) }) });
add('post', '/me/notification-whatsapp/verify', { tag: P, summary: 'Verificar el código recibido', body: obj({ codigo: str('123456', { pattern: '^\\d{6}$' }) }) });
add('delete', '/me/notification-whatsapp', { tag: P, summary: 'Retirar mi consentimiento y borrar el número' });

// --- Empresa ------------------------------------------------------------------------------------
const E = 'Empresa · términos, equipo y roles';
add('get', '/orgs/{orgId}/terms/status', { tag: E, who: 'gerente', summary: '¿Aceptó la org los términos vigentes?', params: [orgId] });
add('post', '/orgs/{orgId}/terms/accept', { tag: E, who: 'gerente', summary: 'Aceptar los términos vigentes', params: [orgId], body: obj({ termsVersionId: uuidS() }) });
add('get', '/orgs/{orgId}/team', { tag: E, who: 'gerente', summary: 'Gerentes e invitaciones pendientes', params: [orgId] });
add('get', '/orgs/{orgId}/roles', { tag: E, who: 'gerente', summary: 'Roles habilitados y sus requisitos', params: [orgId] });
add('get', '/orgs/{orgId}/invitacion', { tag: E, who: 'gerente', summary: 'Código y enlace de WhatsApp para dar de alta a la banca', params: [orgId] });
add('get', '/orgs/{orgId}/settings', { tag: E, who: 'gerente', summary: 'Parámetros de la organización', params: [orgId] });
add('patch', '/orgs/{orgId}/settings', {
  tag: E, who: 'gerente', summary: 'Cambiar parámetros de la organización', params: [orgId],
  body: obj({ waveMinutes: int(3), descansoMinH: int(8), topeSemanalH: int(42), standbyMax: int(2), relaunchLimit: int(2) }, []),
});

const B = 'Empresa · banca';
add('post', '/orgs/{orgId}/workers', {
  tag: B, who: 'gerente', summary: 'Agregar a la banca (queda pendiente hasta que acepte por su canal)', params: [orgId], status: 201,
  body: obj({ nombre: str('Carlos Ruiz'), celular: str('300 123 4567'), roleId: uuidS() }),
});
add('get', '/orgs/{orgId}/workers', {
  tag: B, who: 'gerente', summary: 'Listar la banca (celulares enmascarados)',
  params: [orgId, { name: 'estado', in: 'query', schema: str(undefined, { enum: ['pendiente', 'activo', 'baja', 'baja_org'] }) }, { name: 'roleId', in: 'query', schema: uuidS() }, { name: 'favorito', in: 'query', schema: str(undefined, { enum: ['true', 'false'] }) }],
});
add('patch', '/orgs/{orgId}/workers/{id}', { tag: B, who: 'gerente', summary: 'Editar nombre, rol o favorito', params: [orgId, id('id', 'org_workers.id')], body: obj({ favorito: bool(true), nombre: str('Carlos R.'), roleId: uuidS() }, []) });
add('post', '/orgs/{orgId}/workers/{id}/reinvitar', { tag: B, who: 'gerente', summary: 'Reinvitar a quien salió (baja / baja_org)', params: [orgId, id('id', 'org_workers.id')] });
add('post', '/orgs/{orgId}/workers/{id}/documents', {
  tag: B, who: 'gerente', summary: 'Registrar un documento (tipo y vencimiento)', params: [orgId, id('id', 'org_workers.id')], status: 201,
  body: obj({ tipoDocumento: str('carnet_manipulacion', { pattern: '^[a-z0-9_]+$' }), venceAt: str('2027-06-30', { format: 'date', nullable: true }) }, ['tipoDocumento']),
});
add('get', '/orgs/{orgId}/workers/{id}/documents', { tag: B, who: 'gerente', summary: 'Documentos de una persona', params: [orgId, id('id', 'org_workers.id')] });
add('patch', '/orgs/{orgId}/documents/{docId}', { tag: B, who: 'gerente', summary: 'Aprobar o rechazar un documento', params: [orgId, id('docId')], body: obj({ estado: str('aprobado', { enum: ['aprobado', 'rechazado'] }) }) });

const S = 'Empresa · turnos';
add('post', '/orgs/{orgId}/shifts/floor-preview', {
  tag: S, who: 'gerente', summary: 'Piso legal en vivo para un horario', params: [orgId],
  body: obj({ inicio: str('2026-12-05T22:00:00-05:00', { format: 'date-time' }), fin: str('2026-12-06T04:00:00-05:00', { format: 'date-time' }) }),
});
add('post', '/orgs/{orgId}/shifts', {
  tag: S, who: 'gerente', summary: 'Publicar un turno (dispara las ofertas)', params: [orgId], status: 201,
  body: obj({ roleId: uuidS(), inicio: str('2026-12-05T22:00:00-05:00', { format: 'date-time' }), fin: str('2026-12-06T04:00:00-05:00', { format: 'date-time' }), cupos: int(3), pagoTotal: int(120000), notas: str('Evento privado') }, ['roleId', 'inicio', 'fin', 'cupos', 'pagoTotal']),
  note: 'Responde 422 below_floor si el pago es menor al piso calculado.',
});
add('get', '/orgs/{orgId}/shifts', { tag: S, who: 'gerente', summary: 'Listar turnos (200 más recientes)', params: [orgId] });
add('get', '/orgs/{orgId}/shifts/{shiftId}', { tag: S, who: 'gerente', summary: 'Detalle: confirmados, en espera y elegibles', params: [orgId, shiftId] });
add('post', '/orgs/{orgId}/shifts/{shiftId}/cancel', { tag: S, who: 'gerente', summary: 'Cancelar el turno y avisar a los afectados', params: [orgId, shiftId] });
add('get', '/orgs/{orgId}/shifts/{shiftId}/assignments', { tag: S, who: 'gerente', summary: 'Quiénes tienen el turno (para marcar asistencia)', params: [orgId, shiftId] });
add('get', '/orgs/{orgId}/shifts/{shiftId}/offers', { tag: S, who: 'gerente', summary: 'Ofertas del turno: persona, ronda, canal, estado y entregas por canal (sin celulares)', params: [orgId, shiftId] });
add('post', '/orgs/{orgId}/shifts/{shiftId}/attendance', {
  tag: S, who: 'gerente', summary: 'Marcar asistencia (solo cuando el turno terminó)', params: [orgId, shiftId],
  body: obj({ marks: { type: 'array', items: obj({ assignmentId: uuidS(), status: str('completed', { enum: ['completed', 'no_show'] }) }) } }),
});

const R = 'Empresa · alertas, disputas y reportes';
add('get', '/orgs/{orgId}/alerts', { tag: R, who: 'gerente', summary: 'Alertas del panel', params: [orgId, { name: 'solo', in: 'query', schema: str(undefined, { enum: ['pendientes'] }) }] });
add('post', '/orgs/{orgId}/alerts/{alertId}/ack', { tag: R, who: 'gerente', summary: 'Marcar una alerta como atendida', params: [orgId, id('alertId')] });
add('get', '/orgs/{orgId}/disputes', { tag: R, who: 'gerente', summary: 'Disputas de inasistencia', params: [orgId, { name: 'estado', in: 'query', schema: str(undefined, { enum: ['abierta', 'upheld', 'reversed'] }) }] });
add('post', '/orgs/{orgId}/disputes/{disputeId}/resolve', {
  tag: R, who: 'gerente', summary: 'Resolver una disputa (mantener o revertir)', params: [orgId, id('disputeId')],
  body: obj({ resolucion: str('reversed', { enum: ['upheld', 'reversed'] }), nota: str('Se verificó con el jefe de sala') }, ['resolucion']),
});
add('get', '/orgs/{orgId}/reports/monthly', { tag: R, who: 'gerente', summary: 'Reporte mensual por persona (CSV)', params: [orgId, { name: 'mes', in: 'query', required: true, schema: str('2026-11', { pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }) }], csv: true });
add('get', '/orgs/{orgId}/stream', { tag: R, who: 'gerente', summary: 'Tiempo real de la organización (SSE)', params: [orgId], sse: true, note: 'Swagger UI no muestra bien los streams; pruébalo con `curl -N` o EventSource. Eventos: shift.created, shift.changed, alert.created, alert.updated, org.changed (solo ids).' });
add('get', '/orgs/{orgId}/shifts/{shiftId}/stream', { tag: R, who: 'gerente', summary: 'Tiempo real de un turno (SSE)', params: [orgId, shiftId], sse: true });

// --- Super admin -------------------------------------------------------------------------------
const A = 'Super admin';
add('get', '/admin/orgs', { tag: A, who: 'super admin', summary: 'Organizaciones y cuántos gerentes tienen' });
add('post', '/admin/orgs', { tag: A, who: 'super admin', summary: 'Crear organización e invitar a su primer gerente', status: 201, body: obj({ nombre: str('Hotel Demo'), slug: str('hotel-demo', { pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }), contactEmail: str('gerente@hotel.co', { format: 'email' }) }) });
add('get', '/admin/orgs/{orgId}/roles', { tag: A, who: 'super admin', summary: 'Roles habilitados hoy en una org', params: [orgId] });
add('put', '/admin/orgs/{orgId}/roles', { tag: A, who: 'super admin', summary: 'Definir los roles habilitados de una org (reemplaza el conjunto)', params: [orgId], body: obj({ roleIds: { type: 'array', items: uuidS() } }) });
add('get', '/admin/roles', { tag: A, who: 'super admin', summary: 'Catálogo de roles y requisitos' });
add('post', '/admin/roles', { tag: A, who: 'super admin', summary: 'Crear un rol', status: 201, body: obj({ slug: str('seguridad'), nombre: str('Seguridad') }) });
add('patch', '/admin/roles/{id}', { tag: A, who: 'super admin', summary: 'Renombrar o activar/desactivar un rol', params: [id('id')], body: obj({ nombre: str('Seguridad'), activo: bool(true) }, []) });
add('put', '/admin/roles/{id}/requirements', {
  tag: A, who: 'super admin', summary: 'Definir los documentos que exige un rol (reemplaza)', params: [id('id')],
  body: { type: 'array', items: obj({ tipoDocumento: str('carnet_manipulacion'), obligatorio: bool(true), vigenciaRequerida: bool(true) }, ['tipoDocumento']) },
});
add('post', '/admin/terms', { tag: A, who: 'super admin', summary: 'Publicar una versión de términos', status: 201, body: obj({ audience: str('org', { enum: ['org', 'candidato'] }), titulo: str('Términos para empresas'), cuerpo: str('Texto completo de los términos…') }) });
add('get', '/admin/legal', { tag: A, who: 'super admin', summary: 'Parámetros legales con vigencia' });
add('post', '/admin/legal', {
  tag: A, who: 'super admin', summary: 'Agregar un parámetro legal', status: 201,
  body: obj({ clave: str('smmlv', { enum: ['smmlv', 'divisor_horas', 'recargo_nocturno', 'recargo_dominical', 'nocturno_desde_hora', 'nocturno_hasta_hora'] }), valor: { type: 'number', example: 1750905 }, vigenteDesde: str('2026-01-01', { format: 'date' }), nota: str('Decreto …') }, ['clave', 'valor', 'vigenteDesde']),
});
add('post', '/admin/workers/{id}/data-delete', { tag: A, who: 'super admin', summary: 'Borrar los datos personales de una persona (definitivo)', params: [id('id', 'workers.id')] });
add('get', '/admin/auditoria', { tag: A, who: 'super admin', summary: 'Bitácora (solo ids)', params: [{ name: 'orgId', in: 'query', schema: uuidS() }, { name: 'limit', in: 'query', schema: int(50, { minimum: 1, maximum: 200 }) }] });

// --- Candidato ---------------------------------------------------------------------------------
const C = 'Candidato';
add('post', '/candidato/codigo', { tag: C, who: 'público', summary: 'Pedir un código de acceso por mi canal activo', status: 202, body: obj({ celular: str('300 123 4567') }), note: 'Siempre responde 202 (no revela si el celular existe). 5 por minuto; un código por persona cada 60 s.' });
add('post', '/candidato/verificar', { tag: C, who: 'público', summary: 'Entrar con el código (abre sesión de 12 h)', body: obj({ celular: str('300 123 4567'), code: str('123456', { pattern: '^\\d{6}$' }) }), note: 'El código vence a los 10 minutos, sirve una vez y se bloquea tras 5 intentos fallidos.' });
add('post', '/candidato/salir', { tag: C, who: 'público', summary: 'Cerrar la sesión del candidato', body: obj({}, []) });
add('get', '/yo/sesion', { tag: C, who: 'candidato', summary: 'Sesión del candidato' });
add('get', '/yo', { tag: C, who: 'candidato', summary: 'Mis turnos, canales y datos' });
add('put', '/yo/canales', { tag: C, who: 'candidato', summary: 'Ordenar mis canales ya habilitados (el primero es el prioritario)', body: obj({ prioridad: { type: 'array', items: str('whatsapp', { enum: ['whatsapp', 'telegram', 'email'] }) } }) });
add('post', '/yo/disputas', { tag: C, who: 'candidato', summary: 'Disputar una inasistencia', status: 201, body: obj({ assignmentId: uuidS(), motivo: str('Estuve en el turno completo, me vio el jefe de sala.', { minLength: 10, maxLength: 500 }) }) });
add('post', '/yo/baja', { tag: C, who: 'candidato', summary: 'BAJA global (mismo servicio que el comando del chat)', body: obj({}, []) });
add('post', '/yo/borrar', { tag: C, who: 'candidato', summary: 'BORRAR MIS DATOS (definitivo)', body: obj({}, []) });

// --- Canales (webhooks y enlaces) ------------------------------------------------------------
const W = 'Canales y enlaces';
add('get', '/webhooks/whatsapp', { tag: W, who: 'firma Meta/Telegram', summary: 'Verificación del webhook de Meta', params: [{ name: 'hub.mode', in: 'query', schema: str('subscribe') }, { name: 'hub.verify_token', in: 'query', schema: str() }, { name: 'hub.challenge', in: 'query', schema: str() }] });
add('post', '/webhooks/whatsapp', { tag: W, who: 'firma Meta/Telegram', summary: 'Eventos de WhatsApp (firma HMAC X-Hub-Signature-256)', body: { type: 'object' }, note: 'No se prueba a mano: exige la firma de Meta.' });
add('post', '/webhooks/telegram', { tag: W, who: 'firma Meta/Telegram', summary: 'Eventos de Telegram (cabecera X-Telegram-Bot-Api-Secret-Token)', body: { type: 'object' }, note: 'No se prueba a mano: exige el secreto del webhook.' });
add('get', '/r/{token}', { tag: W, who: 'público', summary: 'Página del enlace de correo (aceptar / rechazar / verificar)', params: [{ name: 'token', in: 'path', required: true, schema: str() }] });
add('post', '/r/{token}', { tag: W, who: 'público', summary: 'Ejecuta la acción del enlace de correo', params: [{ name: 'token', in: 'path', required: true, schema: str() }] });

// --- Simulador (solo con DEMO_MODE=true) ---------------------------------------------------------
const D = 'Simulador (DEMO_MODE=true)';
add('post', '/demo/inbound', { tag: D, who: 'super admin', summary: 'Simular un mensaje entrante de un candidato', body: obj({ celular: str('300 123 4567'), text: str('ALTA ABC123'), buttonId: str('OFFER_ACCEPT:…') }, ['celular']), note: 'Solo existe si DEMO_MODE=true. Plan B de la demo.' });
add('get', '/demo/messages', { tag: D, who: 'super admin', summary: 'Mensajes que el simulador «envió» a un celular', params: [{ name: 'celular', in: 'query', required: true, schema: str('300 123 4567') }] });

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'TurnoExtra API',
    version: '0.1.0',
    description:
      'Documentación para probar la API del MVP.\n\n' +
      '**Cómo probar con sesión:** 1) `POST /api/auth/sign-in/email` con un gerente o super admin (o `POST /candidato/codigo` + `/candidato/verificar` para un candidato). ' +
      '2) El navegador guarda la cookie y las demás pruebas la envían solas (mismo origen). 3) Copia tu `orgId` de `GET /me`.\n\n' +
      'Los errores tienen la forma `{ "error": "codigo", "message": "texto" }`. Las rutas de otra organización responden 404.',
  },
  servers: [{ url: '/' }],
  tags: [...new Set(Object.values(paths).flatMap((p) => Object.values(p).flatMap((o) => (o as { tags: string[] }).tags)))].map((name) => ({ name })),
  paths,
};
