// Simulación del backend para VITE_USE_MOCKS=true. Respeta los mismos contratos que la API real
// (rutas, nombres de campos, códigos de error) para que las vistas no sepan si hablan con mocks.
// Todos los datos son de ejemplo y se rotulan como simulación en la interfaz.
import Decimal from 'decimal.js'
import { ApiError } from '../../shared/api'
import { getPersona, getScenario } from './scenario'

const ORG = { orgId: 'org-demo', nombre: 'Hotel Demo · simulación', role: 'owner' }
const ROLES = [
  { id: 'r-mesero', nombre: 'Mesero' },
  { id: 'r-bartender', nombre: 'Bartender' },
  { id: 'r-cocina', nombre: 'Auxiliar de cocina' },
]
const DEMO_SHIFT = 'demo-1'

// ---- reloj del turno de demostración: avanza una etapa cada STEP ms y vuelve a empezar ----
const STEP = 6000
const STAGES = 8
const T0 = Date.now()
const stageNow = () => {
  const n = Math.floor((Date.now() - T0) / STEP)
  return { stage: n % STAGES, cycleStart: T0 + Math.floor(n / STAGES) * STAGES * STEP }
}

const tonight = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d }
const iso = (ms) => new Date(ms).toISOString()

// Personas de la banca: [nombre, favorito, ronda, canal]
const PEOPLE = [
  ['Ana', true, 1, 'whatsapp'], ['Beto', true, 1, 'telegram'], ['Caro', true, 1, 'email'],
  ['Dani', false, 2, 'whatsapp'], ['Eva', false, 2, 'whatsapp'], ['Fer', false, 2, 'email'],
  ['Gabi', false, 2, 'telegram'], ['Hugo', false, 2, 'whatsapp'],
  ['Iván', false, 3, 'whatsapp'], ['Juli', false, 3, 'whatsapp'], ['Kevin', false, 3, 'telegram'], ['Lina', false, 3, 'whatsapp'],
]

// Estado de cada oferta según la etapa. Cada fila: etapa desde la que aplica → estado.
const PLAN = {
  Ana: [[0, 'sent'], [1, 'read'], [2, 'accepted']],
  Beto: [[0, 'sent'], [1, 'read'], [3, 'expired']],
  Caro: [[0, 'sent'], [1, 'undeliverable']],
  Dani: [[3, 'sent'], [4, 'read'], [5, 'accepted']],
  Eva: [[3, 'sent'], [4, 'delivered'], [5, 'cancelled']],
  Fer: [[3, 'sent'], [5, 'cancelled']],
  Gabi: [[3, 'sent'], [4, 'delivered'], [5, 'cancelled']],
  Hugo: [[3, 'sent'], [5, 'cancelled']],
}
const statusAt = (name, stage) => {
  const rows = PLAN[name]
  if (!rows) return 'queued'
  let st = 'queued'
  for (const [from, s] of rows) if (stage >= from) st = s
  return st
}

function demoOffers() {
  const { stage, cycleStart } = stageNow()
  const at = (s) => iso(cycleStart + s * STEP)
  return PEOPLE.map(([nombre, favorito, wave, canal], i) => {
    const status = statusAt(nombre, stage)
    const born = wave === 1 ? 0 : wave === 2 ? 3 : 99
    const entregas = []
    if (status !== 'queued') {
      // Beto: WhatsApp falló y se reintentó por Telegram
      if (nombre === 'Beto') entregas.push({ canal: 'whatsapp', estado: 'failed', at: at(0) })
      entregas.push({ canal, estado: status === 'undeliverable' ? 'failed' : 'sent', at: at(born) })
      if (['delivered', 'read', 'accepted'].includes(status)) entregas.push({ canal, estado: 'delivered', at: at(born + 1) })
      if (['read', 'accepted'].includes(status)) entregas.push({ canal, estado: 'read', at: at(born + 1) })
    }
    const accepted = status === 'accepted'
    return {
      id: `of-${i}`, workerId: `w-${i}`, nombre, favorito, wave, status,
      canal: status === 'queued' ? null : canal,
      respondedAt: accepted ? at(born + 2) : null, respondedCanal: accepted ? canal : null,
      createdAt: born === 99 ? iso(Date.now()) : at(born),
      entregas,
    }
  })
}

function demoShift(scenario) {
  const { stage } = stageNow()
  const offers = demoOffers()
  const confirmados = scenario === 'cero' ? 0 : offers.filter((o) => o.status === 'accepted').length
  const estado = confirmados >= 2 ? 'cubierto' : 'abierto'
  const elegibles = scenario === 'cero' ? [] : PEOPLE.filter(([n]) => statusAt(n, stage) === 'queued' || stage < 3)
    .map(([nombre, favorito], i) => ({ id: `w-${i}`, nombre, favorito }))
  return {
    shift: {
      id: DEMO_SHIFT, roleId: 'r-mesero', inicio: tonight(22).toISOString(), fin: new Date(tonight(22).getTime() + 8 * 3600e3).toISOString(),
      estado, cupos: 2, pagoTotal: '180000', notas: 'Salón principal · uniforme negro',
    },
    confirmados, enEspera: estado === 'cubierto' ? 1 : 0, elegibles: estado === 'abierto' ? elegibles : [],
  }
}

function shiftList(scenario) {
  if (scenario === 'empty') return { shifts: [] }
  const d = demoShift(scenario)
  const day = (n, h) => { const x = tonight(h); x.setDate(x.getDate() + n); return x }
  const row = (id, roleId, a, horas, confirmados, cupos, pagoTotal, estado) =>
    ({ id, roleId, inicio: a.toISOString(), fin: new Date(a.getTime() + horas * 3600e3).toISOString(), confirmados, cupos, pagoTotal, estado })
  return {
    shifts: [
      { ...d.shift, confirmados: d.confirmados },
      row('demo-2', 'r-bartender', day(1, 18), 6, 1, 1, '120000', 'cubierto'),
      row('demo-3', 'r-cocina', day(2, 6), 8, 0, 3, '150000', 'abierto'),
      row('demo-4', 'r-mesero', day(-1, 19), 6, 2, 2, '130000', 'completado'),
      row('demo-5', 'r-mesero', day(-3, 12), 5, 0, 1, '95000', 'cancelado'),
    ],
  }
}

// Piso legal simulado (la regla real vive en el servidor): base hora + recargo nocturno 35 % + dominical 80 %.
function floorPreview({ inicio, fin }) {
  const a = new Date(inicio), b = new Date(fin)
  const base = new Decimal('6189')
  let noct = 0, dom = 0
  for (let t = a.getTime(); t < b.getTime(); t += 60_000) {
    const d = new Date(t)
    const h = d.getHours()
    if (h >= 21 || h < 6) noct += 1
    if (d.getDay() === 0) dom += 1
  }
  const minutos = Math.max(0, (b - a) / 60_000)
  const horas = new Decimal(minutos).div(60)
  const piso = base.mul(horas)
    .plus(base.mul('0.35').mul(noct).div(60))
    .plus(base.mul('0.80').mul(dom).div(60))
    .toDecimalPlaces(0, Decimal.ROUND_UP)
  return {
    pisoTotal: piso.toString(), horas: horas.toDecimalPlaces(2).toString(), valorHoraBase: base.toString(),
    minutosNocturnos: noct, minutosDominicales: dom,
    pisoPorHoraPromedio: horas.isZero() ? '0' : piso.div(horas).toDecimalPlaces(0).toString(),
  }
}

const WORKERS = PEOPLE.map(([nombre, favorito], i) => ({
  id: `w-${i}`, nombre, favorito, roleId: i % 4 === 3 ? 'r-bartender' : 'r-mesero',
  celular: `+57 3** *** ${String(10 + i * 7).padStart(2, '0')} ${String(30 + i * 3).padStart(2, '0')}`,
  estado: i === 11 ? 'pendiente' : i === 10 ? 'baja' : 'activo',
  elegible: i !== 11 && i !== 10 && i !== 5,
  motivos: i === 11 ? [{ codigo: 'sin_aceptar' }] : i === 10 ? [{ codigo: 'baja' }] : i === 5 ? [{ codigo: 'doc_vencido', tipo: 'carnet_manipulacion_alimentos' }] : [],
  createdAt: new Date(Date.now() - (i * 9 + 2) * 86400e3).toISOString(),
  // mismo contrato que /orgs/:id/workers: canales habilitados; el de la ronda en vivo va primero
  canales: i === 11 ? [] : [...new Set([PEOPLE[i][3], 'whatsapp', ...(i % 3 === 0 ? ['telegram'] : []), ...(i % 4 === 2 ? ['email'] : [])])],
}))

const ALERTS = [
  { id: 'al-1', tipo: 'cancelacion_asistencia', candidato: 'Beto', rol: 'Mesero', inicio: tonight(22).toISOString(), urgente: true, atendidaAt: null, shiftId: DEMO_SHIFT, createdAt: iso(Date.now() - 6 * 60e3) },
  { id: 'al-2', tipo: 'turno_vencido', rol: 'Auxiliar de cocina', inicio: iso(Date.now() - 86400e3), urgente: false, atendidaAt: iso(Date.now() - 3600e3), createdAt: iso(Date.now() - 86400e3) },
]

// ---- candidato: «Mi espacio» (GET /yo según apps/api/src/routes/candidate.ts) ----
const at = (dias, h, horas) => {
  const a = tonight(h); a.setDate(a.getDate() + dias)
  return { inicio: a.toISOString(), fin: new Date(a.getTime() + horas * 3600e3).toISOString() }
}
const TURNOS_CANDIDATO = [
  { assignmentId: 'as-c1', estado: 'confirmed', ...at(0, 22, 8), org: 'Hotel Demo · simulación', rol: 'Mesero', disputable: false },
  { assignmentId: 'as-c2', estado: 'confirmed', ...at(1, 18, 6), org: 'Restaurante Ejemplo', rol: 'Bartender', disputable: false },
  { assignmentId: 'as-c3', estado: 'completed', ...at(-2, 19, 6), org: 'Hotel Demo · simulación', rol: 'Mesero', disputable: false },
  { assignmentId: 'as-c4', estado: 'no_show', ...at(-3, 12, 5), org: 'Eventos Muestra', rol: 'Auxiliar de cocina', disputable: true },
]
const CANALES_CANDIDATO = [
  { canal: 'whatsapp', habilitado: true, prioridad: 1 },
  { canal: 'telegram', habilitado: true, prioridad: 2 },
  { canal: 'email', habilitado: false, prioridad: 3 },
]

// ---- super admin: panel de plataforma (apps/api/src/routes/admin.ts) ----
const ORG_ID = { hotel: 'a1000000-0000-4000-8000-000000000001', restaurante: 'a1000000-0000-4000-8000-000000000002', eventos: 'a1000000-0000-4000-8000-000000000003' }
const ROLE_ID = { mesero: 'b2000000-0000-4000-8000-0000000000a1', bartender: 'b2000000-0000-4000-8000-0000000000a2', cocina: 'b2000000-0000-4000-8000-0000000000a3', steward: 'b2000000-0000-4000-8000-0000000000a4', seguridad: 'b2000000-0000-4000-8000-0000000000a5' }
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString()
const ORGS_ADMIN = [
  { id: ORG_ID.restaurante, nombre: 'Restaurante Ejemplo', slug: 'restaurante-ejemplo', admins: 0, createdAt: ago(1440) },
  { id: ORG_ID.eventos, nombre: 'Eventos Muestra', slug: 'eventos-muestra', admins: 2, createdAt: ago(6 * 1440) },
  { id: ORG_ID.hotel, nombre: 'Hotel Demo · simulación', slug: 'hotel-demo-simulacion', admins: 1, createdAt: ago(30 * 1440) },
]
const ORG_ROLE_IDS = {
  [ORG_ID.hotel]: [ROLE_ID.mesero, ROLE_ID.bartender, ROLE_ID.cocina],
  [ORG_ID.restaurante]: [ROLE_ID.mesero],
  [ORG_ID.eventos]: [ROLE_ID.mesero, ROLE_ID.steward],
}
const req = (roleId, tipoDocumento, obligatorio = true, vigenciaRequerida = true) => ({ roleId, tipoDocumento, obligatorio, vigenciaRequerida })
const CATALOGO = [
  { id: ROLE_ID.mesero, slug: 'mesero', nombre: 'Mesero', activo: true, requisitos: [req(ROLE_ID.mesero, 'carnet_manipulacion_alimentos'), req(ROLE_ID.mesero, 'seguridad_social', true, false)] },
  { id: ROLE_ID.bartender, slug: 'bartender', nombre: 'Bartender', activo: true, requisitos: [req(ROLE_ID.bartender, 'carnet_manipulacion_alimentos'), req(ROLE_ID.bartender, 'documento_identidad')] },
  { id: ROLE_ID.cocina, slug: 'auxiliar-cocina', nombre: 'Auxiliar de cocina', activo: true, requisitos: [req(ROLE_ID.cocina, 'carnet_manipulacion_alimentos'), req(ROLE_ID.cocina, 'curso_primeros_auxilios', false)] },
  { id: ROLE_ID.steward, slug: 'steward', nombre: 'Steward', activo: true, requisitos: [] },
  { id: ROLE_ID.seguridad, slug: 'seguridad', nombre: 'Seguridad', activo: false, requisitos: [req(ROLE_ID.seguridad, 'certificado_alturas')] },
]
// Parámetros con vigencia: el historial incluye un valor programado a futuro.
const LEGAL = [
  { id: 'l-1', clave: 'smmlv', valor: '1423500.0000', vigenteDesde: '2025-01-01', nota: 'Valor de ejemplo' },
  { id: 'l-2', clave: 'smmlv', valor: '1750905.0000', vigenteDesde: '2026-01-01', nota: 'Valor de ejemplo' },
  { id: 'l-3', clave: 'smmlv', valor: '1850000.0000', vigenteDesde: '2027-01-01', nota: 'Programado (simulación)' },
  { id: 'l-4', clave: 'divisor_horas', valor: '240.0000', vigenteDesde: '2025-01-01', nota: null },
  { id: 'l-5', clave: 'divisor_horas', valor: '230.0000', vigenteDesde: '2026-01-01', nota: null },
  { id: 'l-6', clave: 'recargo_nocturno', valor: '0.3500', vigenteDesde: '2026-01-01', nota: null },
  { id: 'l-7', clave: 'recargo_dominical', valor: '0.8000', vigenteDesde: '2026-01-01', nota: null },
  { id: 'l-8', clave: 'nocturno_desde_hora', valor: '21.0000', vigenteDesde: '2026-01-01', nota: null },
  { id: 'l-9', clave: 'nocturno_hasta_hora', valor: '6.0000', vigenteDesde: '2026-01-01', nota: null },
]
const TERMS_VERSION = { org: 3, candidato: 2 } // próxima versión a publicar por audiencia
const AUDIT = [
  { id: 1020, orgId: null, actorId: 'u-admin', accion: 'terms.published', entidad: 'terms', entidadId: 'c3000000-0000-4000-8000-000000000001', detalle: { audience: 'org' }, at: ago(25) },
  { id: 1019, orgId: null, actorId: 'worker:d4000000-0000-4000-8000-000000000001', accion: 'candidate.login', entidad: 'worker', entidadId: 'd4000000-0000-4000-8000-000000000001', detalle: null, at: ago(70) },
  { id: 1018, orgId: null, actorId: 'u-admin', accion: 'legal_param.created', entidad: 'legal_param', entidadId: 'e5000000-0000-4000-8000-000000000001', detalle: { clave: 'smmlv' }, at: ago(180) },
  { id: 1017, orgId: null, actorId: 'u-admin', accion: 'role.requirements_set', entidad: 'role', entidadId: ROLE_ID.mesero, detalle: { count: 2 }, at: ago(300) },
  { id: 1016, orgId: ORG_ID.hotel, actorId: 'u-admin', accion: 'org.roles_set', entidad: 'org', entidadId: ORG_ID.hotel, detalle: { count: 3 }, at: ago(420) },
  { id: 1015, orgId: null, actorId: 'u-admin', accion: 'role.updated', entidad: 'role', entidadId: ROLE_ID.seguridad, detalle: null, at: ago(600) },
  { id: 1014, orgId: null, actorId: 'u-admin', accion: 'role.created', entidad: 'role', entidadId: ROLE_ID.steward, detalle: null, at: ago(640) },
  { id: 1013, orgId: ORG_ID.eventos, actorId: 'u-admin', accion: 'org.roles_set', entidad: 'org', entidadId: ORG_ID.eventos, detalle: { count: 2 }, at: ago(1500) },
  { id: 1012, orgId: null, actorId: 'u-admin', accion: 'terms.published', entidad: 'terms', entidadId: 'c3000000-0000-4000-8000-000000000002', detalle: { audience: 'candidato' }, at: ago(1620) },
  { id: 1011, orgId: null, actorId: 'u-admin', accion: 'legal_param.created', entidad: 'legal_param', entidadId: 'e5000000-0000-4000-8000-000000000002', detalle: { clave: 'recargo_nocturno' }, at: ago(1800) },
]

// ---- avisos del gerente (estado de la simulación) ----
let PREFS = ['cancelacion_asistencia', 'baja_con_turnos', 'turno_vencido', 'disputa_abierta']
  .map((evento) => ({ evento, panel: true, email: true, whatsapp: false, telegram: false }))
const TG = { vinculadoAt: null, linkAt: null }
const tgState = () => {
  if (!TG.vinculadoAt && TG.linkAt && Date.now() >= TG.linkAt) { TG.vinculadoAt = new Date().toISOString(); TG.linkAt = null }
  return { disponible: true, vinculado: !!TG.vinculadoAt, vinculadoAt: TG.vinculadoAt }
}

// ---- enrutador ----
const sinSesion = () => { throw new ApiError(401, 'unauthorized', 'Sin sesión') }
const routes = [
  // Persona: gerente y super admin tienen sesión de Better Auth; el candidato no tiene /me (401) y entra por /yo/sesion.
  ['GET', /^\/me$/, () => {
    const p = getPersona()
    if (p === 'candidato') sinSesion()
    if (p === 'admin') return { user: { id: 'u-admin', name: 'Super admin demo', email: 'admin@demo.local', role: 'super_admin' }, memberships: [] }
    return { user: { id: 'u-demo', name: 'Gerente demo', email: 'gerente@demo.local', role: 'user' }, memberships: [ORG] }
  }],
  ['GET', /^\/yo\/sesion$/, () => (getPersona() === 'candidato' ? { id: 'c-demo', nombre: 'Ana' } : sinSesion())],
  ['GET', /^\/yo$/, (s) => ({ nombre: 'Ana', turnos: s === 'empty' ? [] : TURNOS_CANDIDATO, canales: CANALES_CANDIDATO, ventanaDisputaDias: 7 })],
  ['POST', /^\/yo\/disputas$/, (_s, body) => {
    const t = TURNOS_CANDIDATO.find((x) => x.assignmentId === body?.assignmentId)
    if (t) { t.estado = 'disputed'; t.disputable = false }
    return { ok: true }
  }],
  ['PUT', /^\/yo\/canales$/, (_s, body) => {
    const orden = body?.prioridad ?? []
    CANALES_CANDIDATO.forEach((c) => { const i = orden.indexOf(c.canal); c.prioridad = i >= 0 ? i + 1 : 10 + c.prioridad })
    return { prioridad: orden }
  }],

  ['GET', /^\/admin\/orgs$/, (s) => ({ orgs: s === 'empty' ? [] : ORGS_ADMIN.map((o) => ({ ...o, roles: (ORG_ROLE_IDS[o.id] ?? []).length })) })],
  ['GET', /^\/admin\/orgs\/[^/]+\/roles$/, (s, _b, path) => ({ roleIds: s === 'empty' ? [] : ORG_ROLE_IDS[path.split('/')[3]] ?? [] })],
  ['GET', /^\/admin\/roles$/, (s) => ({ roles: s === 'empty' ? [] : CATALOGO })],
  ['GET', /^\/admin\/legal$/, (s) => ({ params: s === 'empty' ? [] : LEGAL })],
  ['POST', /^\/admin\/terms$/, (s, body) => {
    const version = ++TERMS_VERSION[body.audience]
    return { id: `c3000000-0000-4000-8000-${String(version).padStart(12, '0')}`, audience: body.audience, version, titulo: body.titulo, cuerpo: body.cuerpo, publishedAt: new Date().toISOString() }
  }],
  ['GET', /^\/admin\/auditoria(\?.*)?$/, (s, _b, path) => {
    const orgId = new URLSearchParams(path.split('?')[1] ?? '').get('orgId')
    return { entries: s === 'empty' ? [] : AUDIT.filter((e) => !orgId || e.orgId === orgId) }
  }],

  ['GET', /^\/orgs\/[^/]+\/terms\/status$/, () => ({ accepted: true })],
  ['GET', /^\/orgs\/[^/]+\/roles$/, () => ({ roles: ROLES })],
  ['GET', /^\/orgs\/[^/]+\/alerts\?solo=pendientes$/, (s) => (s === 'empty' ? { alerts: [], pendientes: 0 } : { alerts: ALERTS.filter((a) => !a.atendidaAt), pendientes: 1 })],
  ['GET', /^\/orgs\/[^/]+\/alerts$/, (s) => ({ alerts: s === 'empty' ? [] : ALERTS })],
  ['POST', /^\/orgs\/[^/]+\/alerts\/[^/]+\/ack$/, () => ({ ok: true })],
  ['GET', /^\/orgs\/[^/]+\/shifts$/, (s) => shiftList(s)],
  ['POST', /^\/orgs\/[^/]+\/shifts\/floor-preview$/, (s, body) => floorPreview(body)],
  ['POST', /^\/orgs\/[^/]+\/shifts$/, () => ({ id: DEMO_SHIFT })],
  ['GET', /^\/orgs\/[^/]+\/shifts\/[^/]+\/offers$/, (s) => ({ ofertas: s === 'empty' || s === 'cero' ? [] : demoOffers() })],
  ['GET', /^\/orgs\/[^/]+\/shifts\/[^/]+\/assignments$/, (s) => {
    const accepted = s === 'cero' ? [] : demoOffers().filter((o) => o.status === 'accepted')
    return { terminado: false, asignaciones: accepted.map((o) => ({ id: `as-${o.id}`, nombre: o.nombre, status: 'confirmed' })) }
  }],
  ['POST', /^\/orgs\/[^/]+\/shifts\/[^/]+\/cancel$/, () => ({ id: DEMO_SHIFT, estado: 'cancelado' })],
  ['POST', /^\/orgs\/[^/]+\/shifts\/[^/]+\/attendance$/, () => ({ ok: true })],
  ['GET', /^\/orgs\/[^/]+\/shifts\/[^/]+$/, (s) => demoShift(s)],
  ['GET', /^\/orgs\/[^/]+\/workers(\?.*)?$/, (s) => ({ workers: s === 'empty' ? [] : WORKERS })],
  ['GET', /^\/orgs\/[^/]+\/workers\/[^/]+\/documents$/, () => ({
    documents: [
      { id: 'd-1', tipoDocumento: 'carnet_manipulacion_alimentos', venceAt: iso(Date.now() + 120 * 86400e3), estado: 'aprobado' },
      { id: 'd-2', tipoDocumento: 'certificado_eps', venceAt: null, estado: 'pendiente' },
    ],
  })],
  ['GET', /^\/orgs\/[^/]+\/invitacion$/, () => ({
    codigo: 'HOTELDEMO', texto: 'ALTA HOTELDEMO',
    whatsappUrl: 'https://wa.me/?text=ALTA%20HOTELDEMO',
    telegramUrl: 'https://t.me/TurnoExtraBot?start=ALTA-HOTELDEMO',
  })],
  ['GET', /^\/orgs\/[^/]+\/disputes(\?.*)?$/, (s) => ({
    disputas: s === 'empty' ? [] : [{ id: 'dp-1', nombre: 'Hugo', rol: 'Mesero', inicio: iso(Date.now() - 2 * 86400e3), estado: 'abierta', motivo: 'Sí fui, llegué 10 minutos tarde y firmé en recepción.' }],
  })],
  ['GET', /^\/orgs\/[^/]+\/team$/, () => ({
    members: [{ id: 'm-1', userId: 'u-demo', name: 'Gerente demo', email: 'gerente@demo.local', since: iso(Date.now() - 40 * 86400e3) }],
    invitations: [], maxAdmins: 3,
  })],
  ['GET', /^\/orgs\/[^/]+\/settings$/, () => ({ waveMinutes: 1, descansoMinH: 8, topeSemanalH: 42, standbyMax: 2, relaunchLimit: 2, waveFactor: 2 })],
  ['GET', /^\/me\/notification-prefs$/, () => ({ prefs: PREFS })],
  ['PUT', /^\/me\/notification-prefs$/, (_s, body) => {
    if (body.prefs.some((x) => x.telegram) && !TG.vinculadoAt) throw new ApiError(409, 'telegram_not_linked', 'Vincula tu Telegram antes de activar los avisos por ese canal')
    PREFS = PREFS.map((x) => ({ ...x, ...(body.prefs.find((y) => y.evento === x.evento) ?? {}) }))
    return { prefs: PREFS }
  }],
  // Telegram del gerente: POST abre el enlace del bot; la simulación «toca Iniciar» a los ~6 s.
  ['GET', /^\/me\/notification-telegram$/, () => tgState()],
  ['POST', /^\/me\/notification-telegram$/, () => {
    TG.linkAt = Date.now() + 6000
    return { url: 'https://t.me/TurnoExtraBot?start=G-7KQ2MX', expiresAt: new Date(Date.now() + 15 * 60e3).toISOString() }
  }],
  ['DELETE', /^\/me\/notification-telegram$/, () => {
    TG.vinculadoAt = null; TG.linkAt = null
    PREFS = PREFS.map((x) => ({ ...x, telegram: false }))
    return tgState()
  }],
  ['GET', /^\/me\/notification-whatsapp$/, () => ({ verificado: false, configurado: false })],
]

const ALWAYS_OK = /^\/(me|api\/auth|yo\/sesion$)|\/terms\/status$|\/roles$/ // el marco del panel carga aun en escenario «error» (no /yo: ese sí falla)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function mockApi(path, { method = 'GET', body, raw = false } = {}) {
  const scenario = getScenario()
  await wait(scenario === 'slow' ? 2500 : 220)
  if (scenario === 'error' && !ALWAYS_OK.test(path) && method === 'GET') {
    throw new ApiError(503, 'mock_error', 'Error simulado del servidor (escenario «error»)')
  }
  if (path.startsWith('/api/auth')) return {}
  if (raw && /reports\/monthly/.test(path)) {
    const csv = 'trabajador,dias,horas,horas_nocturnas,horas_dominicales\nAna,4,32,12,8\nDani,2,16,8,0\n'
    return new Response(csv, { headers: { 'content-type': 'text/csv' } })
  }
  const hit = routes.find(([m, re]) => m === method && re.test(path))
  if (hit) return structuredClone(hit[2](scenario, body, path))
  if (method !== 'GET') return { ok: true }
  throw new ApiError(404, 'not_found', 'No encontrado (simulación)')
}

// Tiempo real simulado: avisa cada vez que el turno de demostración cambia de etapa.
export function mockStream(onEvent) {
  if (getScenario() === 'sse-down') return { close() {}, down: true }
  const id = setInterval(onEvent, STEP)
  return { close: () => clearInterval(id), down: false }
}
