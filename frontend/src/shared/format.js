const tz = 'America/Bogota'
export const fmtDate = (d) => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(d))
export const fmtTime = (d) => new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(d))
export const fmtDateTime = (d) => `${fmtDate(d)} · ${fmtTime(d)}`
export const fmtRange = (a, b) => `${fmtDate(a)} · ${fmtTime(a)}–${fmtTime(b)}`
export const fmtCOP = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n))
export const fmtAgo = (d) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return fmtDate(d)
}

// <input type="datetime-local"> trabaja en hora local del navegador; el backend espera ISO con zona.
export const localToIso = (v) => new Date(v).toISOString()
const toLocalInput = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 16)
}
export const defaultStart = (hoursAhead = 3) => {
  const d = new Date(Date.now() + hoursAhead * 3600_000)
  d.setMinutes(0, 0, 0)
  return toLocalInput(d)
}
export const addHours = (local, h) => toLocalInput(new Date(new Date(local).getTime() + h * 3600_000))
