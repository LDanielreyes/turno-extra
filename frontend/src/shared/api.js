// Cliente HTTP del backend. Cookies de sesión (Better Auth) siempre incluidas.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message || code || 'Error')
    this.status = status
    this.code = code
    this.extra = extra
  }
}

async function parse(res) {
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return res.json()
  return res.text()
}

// VITE_USE_MOCKS=true: toda la app habla con la simulación (src/services/mocks), mismos contratos que la API.
// Se carga bajo demanda: en producción sin mocks el código de la simulación ni se descarga.
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export async function api(path, { method = 'GET', body, raw = false, signal } = {}) {
  if (USE_MOCKS) {
    const { mockApi } = await import('../services/mocks/handlers.js')
    return mockApi(path, { method, body, raw })
  }
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'No hay conexión con el servidor')
  }
  if (!res.ok) {
    const data = await parse(res).catch(() => ({}))
    // Better Auth responde { code, message }; el API propio { error, message }
    const code = data?.error ?? data?.code
    throw new ApiError(res.status, code, data?.message, data)
  }
  if (raw) return res
  if (res.status === 204) return null
  return parse(res)
}

// Better Auth vive en /api/auth/*. Con cuerpo es POST; sin cuerpo, GET.
export const auth = (path, body) =>
  api(`/api/auth${path}`, { method: body === undefined ? 'GET' : 'POST', body })

const MESSAGES = {
  unauthorized: 'Inicia sesión para continuar',
  forbidden: 'No tienes permiso para hacer esto',
  not_found: 'No encontramos lo que buscas. Revisa el enlace o vuelve atrás',
  validation_error: 'Revisa los datos del formulario',
  below_floor: 'El pago está por debajo del piso legal',
  starts_in_past: 'El turno debe empezar en el futuro',
  role_not_enabled: 'Ese rol no está habilitado para tu organización',
  invalid_phone: 'Celular colombiano inválido',
  conflict: 'Ese registro ya existe',
  legal_params_missing: 'Faltan parámetros legales. Avísale al administrador',
  stale_terms: 'Hay una versión más reciente de los términos',
  shift_not_finished: 'El turno todavía no terminó',
  shift_cancelled: 'El turno está cancelado',
  too_many_streams: 'Demasiadas conexiones abiertas',
  whatsapp_not_verified: 'Verifica tu WhatsApp antes de activar los avisos por ese canal',
  max_org_admins_exceeded: 'La organización ya tiene 3 gerentes',
  signup_requires_invitation: 'Necesitas una invitación para crear cuenta',
  network: 'No hay conexión con el servidor',
  INVALID_EMAIL_OR_PASSWORD: 'Correo o contraseña incorrectos',
  EMAIL_NOT_VERIFIED: 'Verifica tu correo antes de entrar',
  too_many_attempts: 'Demasiados intentos; pide un código nuevo',
  code_expired: 'El código venció; pide uno nuevo',
  wrong_code: 'Código incorrecto',
}

export const errorText = (e) => MESSAGES[e?.code] ?? e?.message ?? 'No pudimos completar la acción. Inténtalo de nuevo'
