import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtCOP, fmtRange } from '../shared/format'
import { POLL_MS, useOrgStream } from '../shared/useOrgStream'
import { Async, Badge, Btn, Card, Empty, ErrorState, FormError, Skeleton } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, roleName, useOrg, useRoles } from './org'
import PropagationNet, { HubClock, HubSeats } from './live/PropagationNet'
import StatusStrip from './live/StatusStrip'
import { CHANNEL_LABEL, Ico } from './live/icons'
import { KIND, KIND_BADGE, STATUS_TEXT, summarize, tookText } from './live/model'
import './live/turno-live.css'

// Reloj de un segundo para la cuenta regresiva (solo mientras haya una siguiente ronda).
function useNow(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

const LIVE_TEXT = { live: 'En vivo', connecting: 'Conectando…', down: 'Reconectando · cada 20 s' }

// Detalle en vivo (variante B3): franja de estado + red de propagación + quién recibió la oferta.
// Tiempo real por SSE; si cae, cada consulta se actualiza cada 20 s y la píldora lo dice.
export default function TurnoDetalle() {
  const { id } = useParams()
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const roles = useRoles()
  const stream = useOrgStream(orgId, id)
  const q = useQuery({ queryKey: orgKey(orgId, 'shift', id), queryFn: () => api(`/orgs/${orgId}/shifts/${id}`), refetchInterval: POLL_MS })
  const asg = useQuery({ queryKey: orgKey(orgId, 'shift', id, 'assignments'), queryFn: () => api(`/orgs/${orgId}/shifts/${id}/assignments`), refetchInterval: POLL_MS })
  const offers = useQuery({ queryKey: orgKey(orgId, 'shift', id, 'offers'), queryFn: () => api(`/orgs/${orgId}/shifts/${id}/offers`), refetchInterval: POLL_MS })
  const settings = useQuery({ queryKey: orgKey(orgId, 'settings'), queryFn: () => api(`/orgs/${orgId}/settings`), staleTime: 5 * 60_000 })
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId) })
  const cancel = useMutation({ mutationFn: () => api(`/orgs/${orgId}/shifts/${id}/cancel`, { method: 'POST' }), onSuccess: refresh })
  const [confirming, setConfirming] = useState(false)

  const ofertas = offers.data?.ofertas ?? []
  const { wave, nextAt, waveMs } = summarize(ofertas, settings.data)
  const open = q.data?.shift.estado === 'abierto'
  const now = useNow(open && !!nextAt)
  const remaining = nextAt ? Math.max(0, nextAt - now) : 0

  return (
    <Async skeleton="card" q={q}>
      {({ shift: s, confirmados, elegibles }) => {
        const asignados = (asg.data?.asignaciones ?? []).filter((a) => ['confirmed', 'completed'].includes(a.status)).map((a) => a.nombre ?? 'Persona')
        const center = open && nextAt && remaining > 0
          ? <HubClock remainingMs={remaining} totalMs={waveMs} />
          : <HubSeats confirmados={confirmados} cupos={s.cupos} />
        return (
          <div className="lv">
            <section className="lv-plate">
              <Crops />
              <header className="lv-head">
                <div>
                  <h1>{roleName(roles.data, s.roleId)}</h1>
                  <p>{fmtRange(s.inicio, s.fin)} · <span className="mono">{fmtCOP(s.pagoTotal)}</span> por persona</p>
                </div>
                <div className="lv-head__side">
                  <Badge value={s.estado} />
                  {['abierto', 'cubierto'].includes(s.estado) && (
                    <span className={`lv-live lv-live--${stream}`} role="status">{LIVE_TEXT[stream]}</span>
                  )}
                  <Link className="btn btn--ghost btn--sm" to="/turnos">Volver</Link>
                  {['abierto', 'cubierto'].includes(s.estado) && !confirming && (
                    <Btn size="sm" variant="danger" onClick={() => setConfirming(true)}>Cancelar turno</Btn>
                  )}
                </div>
              </header>

              {confirming && (
                <div className="notice notice--warn row row--between lv-confirm">
                  <span>Se avisará a quienes tenían el turno. ¿Cancelarlo?</span>
                  <span className="row">
                    <Btn size="sm" variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Sí, cancelar</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setConfirming(false)}>No</Btn>
                  </span>
                </div>
              )}
              <FormError error={cancel.error} />

              <StatusStrip cupos={s.cupos} asignados={asignados} wave={wave || 1} estado={s.estado} />

              <div className="lv-body">
                <div className="lv-map">
                  {offers.isPending ? <Skeleton variant="card" label="Cargando la red de avisos" />
                    : offers.isError ? <ErrorState error={offers.error} onRetry={() => offers.refetch()} />
                    : ofertas.length === 0 ? (
                      <div className="lv-empty">
                        <PropagationNet ofertas={[]} center={center} label="Aún no se ha avisado a nadie" />
                        {open && elegibles.length === 0
                          ? <Empty title="Nadie elegible">Nadie de tu banca cumple descanso, tope semanal y documentos para este horario.</Empty>
                          : <p className="muted small">{open ? `${elegibles.length} personas elegibles. Los avisos aparecen aquí en cuanto salen.` : `Este turno está ${s.estado}.`}</p>}
                      </div>
                    ) : (
                      <>
                        <PropagationNet ofertas={ofertas} center={center}
                          label={`Red de avisos: ${ofertas.length} personas, ${confirmados} de ${s.cupos} puestos cubiertos`} />
                        <ul className="lv-key">
                          <li><i className="k k--ok" />Aceptó</li>
                          <li><i className="k k--live" />Esperando</li>
                          <li><i className="k" />Sin respuesta</li>
                          <li><i className="k k--x" />No llegó</li>
                          <li><i className="k k--wait" />En cola</li>
                        </ul>
                      </>
                    )}
                </div>

                <div className="lv-side">
                  <h2>Quién recibió la oferta</h2>
                  {ofertas.length === 0 ? <p className="muted small">Todavía no hay avisos.</p> : (
                    <table className="lv-tbl">
                      <thead><tr><th>Persona</th><th aria-label="Canal" /><th>Estado</th><th className="t">Tardó</th></tr></thead>
                      <tbody>
                        {[...ofertas].filter((o) => o.status !== 'queued')
                          .sort((a, b) => (a.status === 'accepted' ? -1 : 0) - (b.status === 'accepted' ? -1 : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
                          .map((o) => (
                            <tr key={o.id}>
                              <td><b>{o.nombre}</b>{o.favorito && <Ico name="star" size={12} label="favorito" />}</td>
                              <td className="muted"><Ico name={o.canal ?? 'whatsapp'} label={CHANNEL_LABEL[o.canal] ?? 'Canal'} /></td>
                              <td><span className={`badge ${KIND_BADGE[KIND[o.status]] ?? ''}`}>{STATUS_TEXT[o.status] ?? o.status}</span></td>
                              <td className="t mono">{tookText(o)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                  {s.notas && <p className="lv-notes"><span className="muted">Notas</span>{s.notas}</p>}
                </div>
              </div>
            </section>

            <Card title="Asistencia">
              <Attendance orgId={orgId} shiftId={id} q={asg} onDone={refresh} />
            </Card>
          </div>
        )
      }}
    </Async>
  )
}

function Attendance({ orgId, shiftId, q, onDone }) {
  const [marks, setMarks] = useState({})
  const save = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/shifts/${shiftId}/attendance`, {
      method: 'POST', body: { marks: Object.entries(marks).map(([assignmentId, status]) => ({ assignmentId, status })) },
    }),
    onSuccess: () => { setMarks({}); onDone() },
  })
  return (
    <Async skeleton="rows" q={q}>
      {({ terminado, asignaciones }) => asignaciones.length === 0 ? <Empty title="Sin asignaciones todavía">Cuando alguien acepte, aparecerá aquí.</Empty> : (
        <div className="stack">
          <ul className="plain">
            {asignaciones.map((a) => {
              const markable = terminado && a.status === 'confirmed'
              return (
                <li key={a.id} className="row row--between">
                  <span>{a.nombre ?? 'Persona'} <Badge value={marks[a.id] ?? a.status} /></span>
                  {markable && (
                    <span className="row">
                      <Btn size="sm" aria-pressed={marks[a.id] === 'completed'} onClick={() => setMarks({ ...marks, [a.id]: 'completed' })}>Asistió</Btn>
                      <Btn size="sm" aria-pressed={marks[a.id] === 'no_show'} onClick={() => setMarks({ ...marks, [a.id]: 'no_show' })}>No asistió</Btn>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          {!terminado && <p className="small muted">Podrás marcar la asistencia cuando termine el turno.</p>}
          <FormError error={save.error} />
          {Object.keys(marks).length > 0 && <Btn variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Guardar asistencia</Btn>}
        </div>
      )}
    </Async>
  )
}
