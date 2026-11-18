// Escenario de la simulación (VITE_USE_MOCKS=true). Se elige con ?mock=<escenario> y queda guardado.
//   live      datos completos; el turno de demostración avanza solo
//   empty     listas vacías
//   cero      turno abierto sin nadie elegible
//   error     el servidor responde con error (paneles muestran «Reintentar»)
//   slow      respuestas lentas (se ven los esqueletos de carga)
//   sse-down  sin tiempo real: los datos llegan por actualización periódica (20 s)
export const SCENARIOS = ['live', 'empty', 'cero', 'error', 'slow', 'sse-down']
const KEY = 'te.mock'

export function getScenario() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mock')
    if (fromUrl && SCENARIOS.includes(fromUrl)) { localStorage.setItem(KEY, fromUrl); return fromUrl }
    const saved = localStorage.getItem(KEY)
    return SCENARIOS.includes(saved) ? saved : 'live'
  } catch {
    return 'live'
  }
}

export function setScenario(s) {
  try { localStorage.setItem(KEY, s) } catch { /* sin storage: solo esta pestaña */ }
  const url = new URL(window.location.href)
  url.searchParams.set('mock', s)
  window.location.replace(url)
}

// Persona de la simulación: qué sesión tiene el visitante. Se elige con ?as=<persona> y queda guardada.
//   gerente    gerente de empresa (sesión de Better Auth)
//   admin      super admin de la plataforma
//   candidato  persona de la banca (cookie propia; /me responde 401)
export const PERSONAS = ['gerente', 'admin', 'candidato']
const PERSONA_KEY = 'te.persona'

export function getPersona() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('as')
    if (fromUrl && PERSONAS.includes(fromUrl)) { localStorage.setItem(PERSONA_KEY, fromUrl); return fromUrl }
    const saved = localStorage.getItem(PERSONA_KEY)
    return PERSONAS.includes(saved) ? saved : 'gerente'
  } catch {
    return 'gerente'
  }
}

export function setPersona(p) {
  try { localStorage.setItem(PERSONA_KEY, p) } catch { /* sin storage: solo esta pestaña */ }
  const url = new URL(window.location.href)
  url.searchParams.set('as', p)
  window.location.replace(url)
}
