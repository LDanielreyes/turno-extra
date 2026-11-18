import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtDateTime } from '../shared/format'
import { POLL_MS } from '../shared/useOrgStream'
import { Async, Badge, Empty, FormError, PageTitle } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, useOrg } from './org'
import { Ico } from './live/icons'

const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'

// Un no_show pasa a disputa si el candidato lo contesta. La empresa mantiene (upheld) o revierte (reversed); todo queda en bitácora.
export default function Disputas() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const [estado, setEstado] = useState('abierta')
  const q = useQuery({ queryKey: orgKey(orgId, 'disputes', estado), queryFn: () => api(`/orgs/${orgId}/disputes${estado ? `?estado=${estado}` : ''}`), refetchInterval: POLL_MS })
  const [notes, setNotes] = useState({})
  const resolve = useMutation({
    mutationFn: ({ id, resolucion }) => api(`/orgs/${orgId}/disputes/${id}/resolve`, { method: 'POST', body: { resolucion, nota: notes[id]?.trim() || undefined } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orgKey(orgId) }),
  })
  const list = q.data?.disputas ?? []
  // Los contadores salen de la lista visible: con un filtro activo solo se muestra el de ese estado.
  const kinds = [['abierta', 'abiertas'], ['reversed', 'revertidas'], ['upheld', 'mantenidas']]
  const facts = q.isSuccess ? kinds.filter(([k]) => !estado || k === estado).map(([k, l]) => [list.filter((d) => d.estado === k).length, l]) : null

  return (
    <>
      <PageTitle title="Disputas" lede="Inasistencias que la persona contestó." facts={facts}
        actions={
          <select className="shell__select" aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="abierta">Abiertas</option><option value="">Todas</option><option value="upheld">Mantenidas</option><option value="reversed">Revertidas</option>
          </select>} />
      <FormError error={resolve.error} />
      <Async q={q}>
        {({ disputas }) => disputas.length === 0 ? <Empty title="Sin disputas">Cuando alguien conteste una inasistencia aparecerá aquí.</Empty> : (
          <div className="dsp">
            {disputas.map((d) => {
              const open = d.estado === 'abierta'
              return (
                <article key={d.id} className="pl dsp__card">
                  <Crops />
                  <header className="pl__head">
                    <span className="dsp__who">
                      <span className={`av ${open ? 'av--wait' : d.estado === 'reversed' ? 'av--ok' : ''}`} aria-hidden="true">{initials(d.nombre)}</span>
                      <span><strong>{d.nombre ?? 'Persona'}</strong><small className="mono">{d.rol} · {fmtDateTime(d.inicio)}</small></span>
                    </span>
                    <Badge value={d.estado} />
                  </header>
                  <div className="pl__body dsp__body">
                    {/* recorrido de la disputa: dónde está hoy */}
                    <ol className="iflow iflow--sm" aria-label="Recorrido de la disputa">
                      <li className="is-done"><span className="iflow__ic"><Ico name="clock" size={15} /></span>Turno</li>
                      <li className="is-done"><span className="iflow__ic"><Ico name="x" size={15} /></span>Inasistencia</li>
                      <li className="is-done"><span className="iflow__ic"><Ico name="scale" size={15} /></span>Disputa</li>
                      <li className={open ? 'is-now' : 'is-done'}><span className="iflow__ic"><Ico name={d.estado === 'upheld' ? 'x' : 'check'} size={15} /></span>Decisión</li>
                    </ol>
                    <blockquote className="dsp__quote"><Ico name="whatsapp" size={16} /><p>{d.motivo}</p></blockquote>
                    {d.nota && <p className="dsp__note"><span>Tu nota</span>{d.nota}</p>}
                    {open && (
                      <div className="dsp__decide">
                        <label className="dsp__field">
                          <span>Nota <small>(opcional)</small></span>
                          <input maxLength={500} value={notes[d.id] ?? ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
                        </label>
                        <button type="button" className="dsp__btn dsp__btn--ok" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: d.id, resolucion: 'reversed' })}>
                          <Ico name="check" size={18} /><b>Sí asistió</b><small>Revertir</small>
                        </button>
                        <button type="button" className="dsp__btn dsp__btn--bad" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: d.id, resolucion: 'upheld' })}>
                          <Ico name="x" size={18} /><b>No asistió</b><small>Mantener</small>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Async>
    </>
  )
}
