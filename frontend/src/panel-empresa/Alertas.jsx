import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtAgo, fmtDateTime } from '../shared/format'
import { POLL_MS } from '../shared/useOrgStream'
import { Async, FormError } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, useOrg } from './org'
import { Ico } from './live/icons'
import './alertas.css'

// tipo → [ícono, texto]. Un ícono por tipo: se lee la clase de alerta antes que la frase.
const KIND = {
  cancelacion_asistencia: ['x', (a) => `${a.candidato ?? 'Alguien'} canceló su asistencia`],
  baja_con_turnos: ['door', (a) => `${a.candidato ?? 'Alguien'} se dio de baja con turnos confirmados`],
  turno_vencido: ['clock', () => 'Un turno venció sin cubrirse'],
  disputa_abierta: ['scale', (a) => `${a.candidato ?? 'Alguien'} disputó una inasistencia`],
}
const FLY_MS = 760

// Tablero de notas adhesivas: cada alerta pendiente es una nota pegada; atenderla es despegarla.
// Cuando el backend confirma, la nota sale volando y queda su marca en la franja de atendidas.
export default function Alertas() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: orgKey(orgId, 'alerts'), queryFn: () => api(`/orgs/${orgId}/alerts`), refetchInterval: POLL_MS })
  const [flying, setFlying] = useState(() => new Set())
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const ack = useMutation({
    mutationFn: (id) => api(`/orgs/${orgId}/alerts/${id}/ack`, { method: 'POST' }),
    onSuccess: (_, id) => {
      setFlying((s) => new Set(s).add(id))
      timers.current.push(setTimeout(async () => {
        await qc.invalidateQueries({ queryKey: orgKey(orgId, 'alerts') })
        setFlying((s) => { const n = new Set(s); n.delete(id); return n })
      }, FLY_MS))
    },
  })

  const list = q.data?.alerts ?? []
  const open = list.filter((a) => !a.atendidaAt)
  const urgent = open.filter((a) => a.urgente).length

  return (
    <section className="al" aria-labelledby="al-title">
      <Crops />
      <header className="al__head">
        <div className="al__title">
          <h1 id="al-title">Alertas</h1>
          <ul className="al-key" aria-label="Leyenda">
            <li><i className="al-key__pin is-urgent" aria-hidden="true" />Urgente</li>
            <li><Ico name="x" size={14} />Canceló</li>
            <li><Ico name="door" size={14} />Baja</li>
            <li><Ico name="clock" size={14} />Vencido</li>
            <li><Ico name="scale" size={14} />Disputa</li>
          </ul>
        </div>
        {q.isSuccess && (
          <dl className="al__facts">
            <div><dt>pendientes</dt><dd>{open.length}</dd></div>
            <div className={urgent ? 'is-hot' : ''}><dt>{urgent === 1 ? 'urgente' : 'urgentes'}</dt><dd>{urgent}</dd></div>
            <div><dt>atendidas</dt><dd>{list.length - open.length}</dd></div>
          </dl>
        )}
      </header>

      <FormError error={ack.error} />
      <Async q={q}>
        {({ alerts }) => {
          const pend = alerts.filter((a) => !a.atendidaAt).sort((a, b) => Number(b.urgente) - Number(a.urgente))
          const done = alerts.filter((a) => a.atendidaAt)
          return (
            <>
              {pend.length === 0 ? (
                <div className="al-clear" role="status">
                  <svg viewBox="0 0 120 80" aria-hidden="true">
                    <rect className="al-clear__mark" x="22" y="12" width="44" height="44" rx="2" transform="rotate(-4 44 34)" />
                    <rect className="al-clear__mark" x="58" y="22" width="40" height="40" rx="2" transform="rotate(5 78 42)" />
                    <circle className="al-clear__pin" cx="44" cy="16" r="3.5" />
                    <path className="al-clear__ok" d="M62 44l7 7 15-17" />
                  </svg>
                  <strong>Todo en orden</strong>
                  <span>Sin notas pendientes</span>
                </div>
              ) : (
                <ul className="al-board" aria-label="Pendientes">
                  {pend.map((a, i) => (
                    <Note key={a.id} a={a} i={i} flying={flying.has(a.id)}
                      busy={ack.isPending && ack.variables === a.id} onAck={() => ack.mutate(a.id)} />
                  ))}
                </ul>
              )}

              {done.length > 0 && (
                <div className="al-done">
                  <h2>Atendidas</h2>
                  <ul>
                    {done.map((a) => {
                      const [icon, text] = KIND[a.tipo] ?? ['bell', () => a.tipo]
                      return (
                        <li key={a.id} title={`Atendida ${fmtAgo(a.atendidaAt)}`}>
                          <span className="al-done__ic" aria-hidden="true"><Ico name={icon} size={14} /></span>
                          <span className="al-done__txt">{text(a)}</span>
                          <span className="al-done__when"><Ico name="check" size={13} label="Atendida" />{fmtAgo(a.atendidaAt)}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </>
          )
        }}
      </Async>
    </section>
  )
}

function Note({ a, i, flying, busy, onAck }) {
  const [icon, text] = KIND[a.tipo] ?? ['bell', () => a.tipo]
  const tilt = [-2.2, 1.6, -0.8, 2.4, -1.6, 0.9][i % 6]
  const cls = `al-note${a.urgente ? ' is-urgent' : ''}${busy ? ' is-lifting' : ''}${flying ? ' is-flying' : ''}`
  return (
    <li className={cls} style={{ '--tilt': `${tilt}deg`, '--d': `${Math.min(i, 10) * 0.05}s`, '--fx': `${i % 2 ? 1 : -1}` }}>
      <div className="al-note__paper">
        <i className="al-note__pin" aria-hidden="true" />
        {a.urgente && <i className="al-note__fold" aria-hidden="true" />}
        <span className="al-note__ic" aria-hidden="true"><Ico name={icon} size={22} /></span>
        <strong className="al-note__txt">{text(a)}</strong>
        <span className="al-note__meta">
          {a.urgente && <b>Urgente</b>}
          {a.rol && <span>{a.rol}</span>}
          {a.inicio && <span className="mono">{fmtDateTime(a.inicio)}</span>}
        </span>
        <span className="al-note__ago">{fmtAgo(a.createdAt)}</span>
        <div className="al-note__acts">
          {a.shiftId && (
            <Link className="al-note__link" to={`/turnos/${a.shiftId}`} aria-label="Ver turno" title="Ver turno">
              <Ico name="send" size={16} />
            </Link>
          )}
          <button type="button" className="al-note__ack" onClick={onAck} disabled={busy || flying}
            aria-label={`Marcar como atendida: ${text(a)}`}>
            <Ico name="check" size={16} />{busy ? 'Despegando…' : 'Atendida'}
          </button>
        </div>
      </div>
    </li>
  )
}
