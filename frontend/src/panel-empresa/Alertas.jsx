import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtAgo, fmtDateTime } from '../shared/format'
import { POLL_MS } from '../shared/useOrgStream'
import { Async, Empty, FormError, PageTitle } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, useOrg } from './org'
import { Ico } from './live/icons'

// tipo → [ícono, texto]. Un ícono por tipo: se lee la clase de alerta antes que la frase.
const KIND = {
  cancelacion_asistencia: ['x', (a) => `${a.candidato ?? 'Alguien'} canceló su asistencia`],
  baja_con_turnos: ['door', (a) => `${a.candidato ?? 'Alguien'} se dio de baja con turnos confirmados`],
  turno_vencido: ['clock', () => 'Un turno venció sin cubrirse'],
  disputa_abierta: ['scale', (a) => `${a.candidato ?? 'Alguien'} disputó una inasistencia`],
}

export default function Alertas() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: orgKey(orgId, 'alerts'), queryFn: () => api(`/orgs/${orgId}/alerts`), refetchInterval: POLL_MS })
  const ack = useMutation({
    mutationFn: (id) => api(`/orgs/${orgId}/alerts/${id}/ack`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKey(orgId, 'alerts') }),
  })
  const list = q.data?.alerts ?? []
  const open = list.filter((a) => !a.atendidaAt)
  const urgent = open.filter((a) => a.urgente).length
  const facts = q.isSuccess ? [[open.length, 'pendientes'], [urgent, 'urgentes'], [list.length - open.length, 'atendidas']] : null

  return (
    <>
      <PageTitle title="Alertas" lede="Lo que necesita tu atención. Las urgentes también llegan por correo." facts={facts} />
      <FormError error={ack.error} />
      <Async q={q}>
        {({ alerts }) => alerts.length === 0 ? <Empty title="Todo en orden">No hay alertas por ahora.</Empty> : (
          <section className="pl" aria-label="Alertas">
            <Crops />
            <ul className="lg">
              {alerts.map((a) => {
                const [icon, text] = KIND[a.tipo] ?? ['bell', () => a.tipo]
                const done = Boolean(a.atendidaAt)
                return (
                  <li key={a.id} className={`lg__row${done ? ' is-done' : ''}${a.urgente && !done ? ' is-urgent' : ''}`}>
                    <span className="lg__ic" aria-hidden="true"><Ico name={icon} size={18} /></span>
                    <div className="lg__main">
                      <strong>{text(a)}</strong>
                      <span className="lg__meta">
                        {a.urgente && !done && <b className="lg__tag">Urgente</b>}
                        {a.rol && <span>{a.rol}</span>}
                        {a.inicio && <span>{fmtDateTime(a.inicio)}</span>}
                        <span>{fmtAgo(a.createdAt)}</span>
                      </span>
                    </div>
                    <div className="lg__act">
                      {a.shiftId && <Link className="icobtn" to={`/turnos/${a.shiftId}`} aria-label="Ver turno" title="Ver turno"><Ico name="send" size={16} /></Link>}
                      {done
                        ? <span className="lg__ok" title={`Atendida ${fmtAgo(a.atendidaAt)}`}><Ico name="check" size={16} label="Atendida" /></span>
                        : <button type="button" className="icobtn icobtn--ok" onClick={() => ack.mutate(a.id)} disabled={ack.isPending} aria-label="Marcar como atendida" title="Marcar como atendida"><Ico name="check" size={16} /></button>}
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="lg__key" aria-label="Leyenda">
              <span><Ico name="x" size={14} />Canceló</span><span><Ico name="door" size={14} />Baja</span><span><Ico name="clock" size={14} />Vencido</span><span><Ico name="scale" size={14} />Disputa</span>
            </p>
          </section>
        )}
      </Async>
    </>
  )
}
