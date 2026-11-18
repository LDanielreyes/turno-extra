import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorText } from '../shared/api'
import { fmtCOP } from '../shared/format'
import { POLL_MS, useOrgStream } from '../shared/useOrgStream'
import { Empty, ErrorState, Skeleton } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, roleName, useOrg, useRoles } from './org'
import PropagationNet, { HubClock, HubSeats } from './live/PropagationNet'
import StatusStrip from './live/StatusStrip'
import { CHANNEL_LABEL, Ico } from './live/icons'
import { KIND, KIND_BADGE, STATUS_TEXT, summarize, tookText } from './live/model'
import { Plate, Stamp, TkIco, dayNum, hhmm, hoursText, month, weekday } from './turnos-kit'
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

const LIVE_TEXT = { live: 'En vivo', connecting: 'Conectando…', down: 'En vivo interrumpido · cada 20 s' }
const SEATED = ['confirmed', 'completed', 'no_show']

// Detalle: el boleto del turno es la interfaz (puestos con nombre, asistencia sobre cada puesto,
// cancelar = rasgar el talón). Debajo, la red de avisos en vivo por SSE; si cae, consulta cada 20 s.
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

  const ofertas = offers.data?.ofertas ?? []
  const { wave, nextAt, waveMs } = summarize(ofertas, settings.data)
  const open = q.data?.shift.estado === 'abierto'
  const now = useNow(open && !!nextAt)
  const remaining = nextAt ? Math.max(0, nextAt - now) : 0

  if (q.isPending) return <DetailSkeleton />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />

  const { shift: s, confirmados, elegibles } = q.data
  const role = roleName(roles.data, s.roleId)
  const asignados = (asg.data?.asignaciones ?? []).filter((a) => ['confirmed', 'completed'].includes(a.status)).map((a) => a.nombre ?? 'Persona')
  const center = open && nextAt && remaining > 0
    ? <HubClock remainingMs={remaining} totalMs={waveMs} />
    : <HubSeats confirmados={confirmados} cupos={s.cupos} />
  const vivo = ['abierto', 'cubierto'].includes(s.estado)

  return (
    <div className="lv">
      <Plate className="tk--detail"
        side={(
          <div className="tk-detail__nav">
            <Link className="tk-back" to="/turnos"><TkIco name="back" />Turnos</Link>
            {vivo && <span className={`lv-live lv-live--${stream}`} role="status">{LIVE_TEXT[stream]}</span>}
          </div>
        )}>
        <ShiftTicket s={s} role={role} asg={asg} orgId={orgId} onDone={refresh} />
      </Plate>

      <section className="lv-plate" aria-label="Avisos en vivo">
        <Crops />
        <StatusStrip seats={false} cupos={s.cupos} asignados={asignados} wave={wave || 1} estado={s.estado} />

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
                    <li><i className="k k--x" />No le llegó</li>
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
          </div>
        </div>
      </section>
    </div>
  )
}

// Boleto grande: cuerpo con rol, pago y puestos (con nombre); talón con la fecha y las acciones.
function ShiftTicket({ s, role, asg, orgId, onDone }) {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [marks, setMarks] = useState({})
  const prevEstado = useRef(s.estado)
  const [justTorn, setJustTorn] = useState(false)
  useEffect(() => {
    if (prevEstado.current !== 'cancelado' && s.estado === 'cancelado') {
      setJustTorn(true)
      const t = setTimeout(() => setJustTorn(false), 1200)
      prevEstado.current = s.estado
      return () => clearTimeout(t)
    }
    prevEstado.current = s.estado
    return undefined
  }, [s.estado])

  const cancel = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/shifts/${s.id}/cancel`, { method: 'POST' }),
    onSuccess: () => { setConfirming(false); onDone() },
  })
  const save = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/shifts/${s.id}/attendance`, {
      method: 'POST', body: { marks: Object.entries(marks).map(([assignmentId, status]) => ({ assignmentId, status })) },
    }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: orgKey(orgId, 'shift', s.id, 'assignments') }); setMarks({}); onDone() },
  })

  const all = asg.data?.asignaciones ?? []
  const terminado = !!asg.data?.terminado
  const seated = all.filter((a) => SEATED.includes(a.status))
  const standby = all.filter((a) => a.status === 'standby')
  const vivo = ['abierto', 'cubierto'].includes(s.estado)
  const pending = Object.keys(marks).length
  const markable = seated.filter((a) => terminado && a.status === 'confirmed').length
  const live = s.estado === 'abierto' && +new Date(s.inicio) > Date.now()

  return (
    <article className={`tk-big is-${s.estado}${justTorn ? ' is-tearing' : ''}`}>
      <div className="tk-big__paper">
        <div className="tk-big__body">
          <div className="tk-big__title">
            <h1>{role}</h1>
            <p><span className="mono">{hhmm(s.inicio)}–{hhmm(s.fin)}</span> · <span className="mono">{fmtCOP(s.pagoTotal)}</span> por persona</p>
          </div>

          <div className="tk-board" aria-label="Puestos">
            {asg.isPending ? <span className="tk-skel" style={{ height: 64, width: '70%' }} />
              : asg.isError ? <ErrorState error={asg.error} onRetry={() => asg.refetch()} />
              : (
                <ul className="tk-board__seats">
                  {Array.from({ length: s.cupos }, (_, i) => {
                    const a = seated[i]
                    return a
                      ? <SeatPerson key={a.id} a={a} mark={marks[a.id]} canMark={terminado && a.status === 'confirmed' && s.estado !== 'cancelado'}
                          onMark={(st) => setMarks((m) => { const n = { ...m }; if (n[a.id] === st) delete n[a.id]; else n[a.id] = st; return n })} />
                      : (
                        <li key={`f${i}`} className="tk-ps">
                          <span className={`tk-seat tk-seat--lg${live ? ' is-live' : ''}`} aria-hidden="true" />
                          <small>{s.estado === 'cancelado' ? '—' : 'Falta'}</small>
                        </li>
                      )
                  })}
                </ul>
              )}
            {standby.length > 0 && (
              <p className="tk-standby"><span>En espera</span>{standby.map((a) => <b key={a.id}>{a.nombre ?? 'Persona'}</b>)}</p>
            )}
            {!terminado && seated.length > 0 && s.estado !== 'cancelado' && <p className="tk-board__hint">La asistencia se marca cuando termine el turno.</p>}
            {terminado && markable > 0 && pending === 0 && <p className="tk-board__hint">Marca en cada puesto si asistió.</p>}
          </div>

          {s.notas && <p className="tk-big__notes"><span>Notas</span>{s.notas}</p>}
        </div>

        <aside className="tk-big__stub">
          <div className="tk-stubday">
            <small>{weekday(s.inicio)}</small>
            <b>{dayNum(s.inicio)}</b>
            <span>{month(s.inicio)}</span>
          </div>
          <span className="tk-stub__time mono">{hoursText(s.inicio, s.fin)}</span>

          <div className="tk-big__acts">
            {(save.error || cancel.error) && <p className="tk-err" role="alert">{errorText(save.error || cancel.error)}</p>}
            {pending > 0 && (
              <button type="button" className="btn btn--primary btn--sm" aria-busy={save.isPending || undefined} disabled={save.isPending} onClick={() => save.mutate()}>
                Guardar asistencia <span className="mono">({pending})</span>
              </button>
            )}
            {vivo && !confirming && (
              <button type="button" className="tk-tear" onClick={() => setConfirming(true)}><TkIco name="scissors" />Cancelar turno</button>
            )}
            {vivo && confirming && (
              <div className="tk-confirm" role="alertdialog" aria-label="Confirmar cancelación">
                <p>Se avisará a quienes tenían el turno.</p>
                <button type="button" className="btn btn--danger btn--sm" aria-busy={cancel.isPending || undefined} disabled={cancel.isPending} onClick={() => cancel.mutate()}>Sí, cancelar</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>No</button>
              </div>
            )}
          </div>
        </aside>
      </div>
      <Stamp estado={s.estado} />
    </article>
  )
}

// Puesto ocupado: círculo con inicial y nombre. Si el turno terminó, se marca asistencia sobre él.
const ST_LABEL = { confirmed: 'Confirmado', completed: 'Asistió', no_show: 'No asistió' }
function SeatPerson({ a, mark, canMark, onMark }) {
  const name = a.nombre ?? 'Persona'
  const prev = useRef(a.status)
  const [just, setJust] = useState(false)
  useEffect(() => {
    if (prev.current !== a.status) {
      setJust(true)
      const t = setTimeout(() => setJust(false), 900)
      prev.current = a.status
      return () => clearTimeout(t)
    }
    return undefined
  }, [a.status])
  const shown = mark ?? a.status
  return (
    <li className={`tk-ps is-${shown}${mark ? ' is-marked' : ''}${just ? ' is-just' : ''}`}>
      <span className="tk-seat tk-seat--lg is-on" role="img" aria-label={`${name}: ${ST_LABEL[shown] ?? shown}${mark ? ' (sin guardar)' : ''}`}>
        {name.slice(0, 1).toUpperCase()}
        {shown === 'completed' && <i className="tk-ps__badge is-ok"><TkIco name="check" size={11} /></i>}
        {shown === 'no_show' && <i className="tk-ps__badge is-no"><TkIco name="x" size={11} /></i>}
      </span>
      <small title={name}>{name}</small>
      {canMark && (
        <span className="tk-ps__acts">
          <button type="button" className={mark === 'completed' ? 'is-on is-ok' : ''} aria-pressed={mark === 'completed'} aria-label={`${name} asistió`} onClick={() => onMark('completed')}><TkIco name="check" /></button>
          <button type="button" className={mark === 'no_show' ? 'is-on is-no' : ''} aria-pressed={mark === 'no_show'} aria-label={`${name} no asistió`} onClick={() => onMark('no_show')}><TkIco name="x" /></button>
        </span>
      )}
    </li>
  )
}

function DetailSkeleton() {
  return (
    <div className="lv" aria-busy="true" aria-label="Cargando turno">
      <Plate className="tk--detail">
        <div className="tk-big"><div className="tk-big__paper tk-skel" style={{ minHeight: 240 }} /></div>
      </Plate>
      <Skeleton variant="card" label="Cargando la red de avisos" />
    </div>
  )
}
