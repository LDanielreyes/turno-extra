// Traduce las ofertas del API (GET /orgs/:id/shifts/:id/offers) a lo que dibuja la red B3.
// Estado → forma: aceptó (relleno verde) · esperando (aro brasa) · lo vio (aro brasa con pulso)
// · sin respuesta (aro tenue) · no llegó (aro rojo) · en cola (punteado).
export const KIND = {
  accepted: 'ok', read: 'now', sent: 'live', delivered: 'live',
  undeliverable: 'x', declined: 'off', expired: 'off', cancelled: 'off', queued: 'wait',
}
export const STATUS_TEXT = {
  accepted: 'Aceptó', read: 'Lo vio', sent: 'Enviado', delivered: 'Lo recibió', undeliverable: 'No llegó',
  declined: 'No puede', expired: 'Sin respuesta', cancelled: 'Ya no aplica', queued: 'En cola',
}
export const KIND_BADGE = { ok: 'b-ok', now: 'b-em', live: 'b-em', x: 'b-err', off: '', wait: '' }

// Anillo: 1 = favoritos, 2 = resto de la banca, 3 = aún en cola.
export const ringOf = (o) => (o.status === 'queued' ? 3 : Math.min(2, Math.max(1, o.wave)))

export function summarize(ofertas, settings) {
  const sent = ofertas.filter((o) => o.status !== 'queued')
  const wave = sent.length ? Math.max(...sent.map((o) => o.wave)) : 0
  const waveStart = sent.filter((o) => o.wave === wave).reduce((m, o) => Math.min(m, Date.parse(o.createdAt)), Infinity)
  const waveMs = (settings?.waveMinutes ?? 3) * 60_000
  // Solo hay «siguiente ronda» mientras se ofrece a favoritos y quedan personas en cola o en la banca.
  const nextAt = wave === 1 && Number.isFinite(waveStart) ? waveStart + waveMs : null
  return { wave, nextAt, waveMs }
}

export const tookText = (o) => {
  if (!o.respondedAt) return '—'
  const s = Math.max(0, Math.round((Date.parse(o.respondedAt) - Date.parse(o.createdAt)) / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}
