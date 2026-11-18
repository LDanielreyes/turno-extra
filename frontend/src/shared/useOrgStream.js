import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_URL, USE_MOCKS } from './api'

// Respaldo si SSE cae: cada consulta viva refresca cada 20 s (doc §8: 15–30 s).
export const POLL_MS = 20_000

// Tiempo real (SSE). El evento solo trae ids: se invalidan las consultas de la org y se vuelve a pedir lo afectado.
// EventSource reconecta solo; mientras tanto el polling de cada consulta hace de respaldo.
// Devuelve el estado de la conexión: 'connecting' | 'live' | 'down' (para la píldora «En vivo» / «Reconectando»).
export function useOrgStream(orgId, shiftId) {
  const qc = useQueryClient()
  const [status, setStatus] = useState('connecting')
  useEffect(() => {
    if (!orgId) return undefined
    const bump = () => qc.invalidateQueries({ queryKey: ['org', orgId] })

    if (USE_MOCKS) {
      let stream = null
      let alive = true
      import('../services/mocks/handlers.js').then(({ mockStream }) => {
        if (!alive) return
        stream = mockStream(bump)
        setStatus(stream.down ? 'down' : 'live')
      })
      return () => { alive = false; stream?.close() }
    }

    if (typeof EventSource === 'undefined') { setStatus('down'); return undefined }
    const url = `${API_URL}/orgs/${orgId}${shiftId ? `/shifts/${shiftId}` : ''}/stream`
    const es = new EventSource(url, { withCredentials: true })
    es.onopen = () => setStatus('live')
    es.onerror = () => setStatus('down') // EventSource reintenta solo; al reconectar vuelve onopen
    const types = ['shift.created', 'shift.changed', 'alert.created', 'alert.updated', 'org.changed']
    types.forEach((t) => es.addEventListener(t, bump))
    return () => es.close()
  }, [orgId, shiftId, qc])
  return status
}
