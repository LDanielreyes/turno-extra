import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtAgo, fmtDateTime } from '../shared/format'
import { POLL_MS } from '../shared/useOrgStream'
import { Async, FormError } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, useOrg } from './org'
import { Ico } from './live/icons'
import './disputas.css'

const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'
const FILTERS = [['abierta', 'Abiertas'], ['', 'Todas'], ['upheld', 'Mantenidas'], ['reversed', 'Revertidas']]
// resolución → [ícono, texto del sello, acción]
const STAMP = { reversed: ['check', 'Sí asistió', 'Revertir'], upheld: ['x', 'No asistió', 'Mantener'] }
const LAND_MS = 1100
const FILE_MS = 1700

// Un no_show pasa a disputa si la persona lo contesta. Cada disputa es un expediente: tu registro y su
// respuesta, unidos con un clip. Se decide sobre el expediente: nota al margen y uno de dos sellos.
// Cuando el backend confirma, el sello cae sobre los papeles y el expediente se archiva.
export default function Disputas() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const [estado, setEstado] = useState('abierta')
  const q = useQuery({ queryKey: orgKey(orgId, 'disputes', estado), queryFn: () => api(`/orgs/${orgId}/disputes${estado ? `?estado=${estado}` : ''}`), refetchInterval: POLL_MS })
  const [notes, setNotes] = useState({})
  // id → { res, filing }: el sello ya confirmado por el backend mientras termina su animación.
  const [landed, setLanded] = useState({})
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const resolve = useMutation({
    mutationFn: ({ id, resolucion }) => api(`/orgs/${orgId}/disputes/${id}/resolve`, { method: 'POST', body: { resolucion, nota: notes[id]?.trim() || undefined } }),
    onSuccess: (_, { id, resolucion }) => {
      const file = estado === 'abierta'
      setLanded((s) => ({ ...s, [id]: { res: resolucion, filing: false } }))
      if (file) timers.current.push(setTimeout(() => setLanded((s) => ({ ...s, [id]: { res: resolucion, filing: true } })), LAND_MS))
      timers.current.push(setTimeout(async () => {
        await qc.invalidateQueries({ queryKey: orgKey(orgId) })
        setLanded((s) => { const n = { ...s }; delete n[id]; return n })
      }, file ? FILE_MS : LAND_MS))
    },
  })

  const list = q.data?.disputas ?? []
  // Los contadores salen de la lista visible: con un filtro activo solo se muestra el de ese estado.
  const kinds = [['abierta', 'abiertas', 'abierta'], ['reversed', 'revertidas', 'revertida'], ['upheld', 'mantenidas', 'mantenida']]
  const facts = q.isSuccess ? kinds.filter(([k]) => !estado || k === estado).map(([k, pl, sg]) => {
    const n = list.filter((d) => d.estado === k).length
    return [k, n, n === 1 ? sg : pl]
  }) : null

  return (
    <section className="ds" aria-labelledby="ds-title">
      <Crops />
      <header className="ds__head">
        <div className="ds__title">
          <h1 id="ds-title">Disputas</h1>
          <ul className="ds-key" aria-label="Leyenda">
            <li><i className="ds-key__seal is-ok" aria-hidden="true"><Ico name="check" size={11} /></i>Sí asistió</li>
            <li><i className="ds-key__seal is-bad" aria-hidden="true"><Ico name="x" size={11} /></i>No asistió</li>
            <li><Ico name="whatsapp" size={14} />Su respuesta</li>
          </ul>
        </div>
        {facts && (
          <dl className="ds__facts">
            {facts.map(([k, v, l]) => <div key={k} className={k === 'abierta' && v ? 'is-hot' : ''}><dt>{l}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
      </header>

      <div className="ds__tools">
        <div className="ds-seg" role="radiogroup" aria-label="Estado">
          {FILTERS.map(([v, l]) => (
            <button key={l} type="button" role="radio" aria-checked={estado === v} className={estado === v ? 'is-on' : ''} onClick={() => setEstado(v)}>{l}</button>
          ))}
        </div>
      </div>

      <Async q={q}>
        {({ disputas }) => disputas.length === 0 ? (
          <div className="ds-empty" role="status">
            <svg viewBox="0 0 140 84" aria-hidden="true">
              <path className="ds-empty__tray" d="M14 50h112l-10 26H24z" />
              <path className="ds-empty__sheet" d="M36 50V18h44l12 12v20" />
              <path className="ds-empty__sheet" d="M80 18v12h12" />
              <path className="ds-empty__ok" d="M52 36l7 7 14-15" />
            </svg>
            <strong>Sin disputas</strong>
            <span>{estado === 'abierta' ? 'Nada por decidir' : 'Nada en este estado'}</span>
          </div>
        ) : (
          <ul className="ds-list">
            {disputas.map((d, i) => (
              <Case key={d.id} d={d} i={i} note={notes[d.id] ?? ''} onNote={(v) => setNotes({ ...notes, [d.id]: v })}
                landed={landed[d.id]}
                pending={resolve.isPending && resolve.variables?.id === d.id ? resolve.variables.resolucion : null}
                lock={resolve.isPending}
                error={!resolve.isPending && resolve.variables?.id === d.id ? resolve.error : null}
                onResolve={(resolucion) => resolve.mutate({ id: d.id, resolucion })} />
            ))}
          </ul>
        )}
      </Async>
    </section>
  )
}

function Case({ d, i, note, onNote, landed, pending, lock, error, onResolve }) {
  const res = landed?.res ?? (d.estado !== 'abierta' ? d.estado : null)
  const open = !res
  const who = d.nombre ?? 'Persona'
  const cls = `ds-case${open ? ' is-open' : ''}${landed ? ' is-landing' : ''}${landed?.filing ? ' is-filing' : ''}${pending ? ' is-pressing' : ''}`
  return (
    <li className={cls} style={{ '--d': `${Math.min(i, 8) * 0.06}s` }}>
      <article className="ds-case__in" aria-label={`Disputa de ${who}, ${d.rol}, ${fmtDateTime(d.inicio)}`}>
        <div className="ds-file">
          <svg className="ds-clip" viewBox="0 0 26 60" aria-hidden="true">
            <path d="M8 56V12a5 5 0 0 1 10 0v38a3 3 0 0 1-6 0V16" />
          </svg>

          {/* tu registro */}
          <div className="ds-sheet ds-sheet--ours">
            <span className="ds-sheet__tag">Tu registro</span>
            <span className="ds-mark" aria-hidden="true"><Ico name="x" size={22} /></span>
            <strong className="ds-sheet__big">No asistió</strong>
            <span className="ds-sheet__meta">{d.rol}</span>
            <span className="ds-sheet__meta mono">{fmtDateTime(d.inicio)}</span>
          </div>

          {/* su respuesta */}
          <div className="ds-sheet ds-sheet--theirs">
            <span className="ds-sheet__tag"><Ico name="whatsapp" size={13} />Su respuesta</span>
            <span className="ds-who">
              <span className="ds-av" aria-hidden="true">{initials(d.nombre)}</span>
              <strong>{who}</strong>
            </span>
            <blockquote className="ds-quote"><p>{d.motivo}</p></blockquote>
            <span className="ds-sheet__meta">{fmtAgo(d.createdAt)}</span>
            {!open && d.nota && <p className="ds-margin-read"><span>Tu nota</span>{d.nota}</p>}
          </div>

          {res && (
            <span className={`ds-imprint is-${res === 'reversed' ? 'ok' : 'bad'}${landed ? ' is-new' : ''}`} role={landed ? 'status' : undefined}>
              <Ico name={STAMP[res][0]} size={22} />
              <b>{STAMP[res][1]}</b>
              <small>{landed?.filing ? 'Archivada' : res === 'reversed' ? 'Revertida' : 'Mantenida'}</small>
            </span>
          )}
        </div>

        {open && (
          <div className="ds-decide">
            <label className="ds-margin">
              <span>Nota al margen</span>
              <textarea rows={3} maxLength={500} placeholder="Opcional" value={note} onChange={(e) => onNote(e.target.value)} />
            </label>
            <div className="ds-stamps" role="group" aria-label="Decisión">
              {['reversed', 'upheld'].map((r) => (
                <button key={r} type="button" className={`ds-stamp is-${r === 'reversed' ? 'ok' : 'bad'}${pending === r ? ' is-down' : ''}`}
                  disabled={lock} aria-busy={pending === r || undefined}
                  aria-label={`${STAMP[r][1]}: ${STAMP[r][2].toLowerCase()} la inasistencia de ${who}`}
                  onClick={() => onResolve(r)}>
                  <span className="ds-stamp__face">
                    <Ico name={STAMP[r][0]} size={20} />
                    <b>{STAMP[r][1]}</b>
                  </span>
                  <small>{pending === r ? 'Sellando…' : STAMP[r][2]}</small>
                </button>
              ))}
            </div>
            <FormError error={error} />
          </div>
        )}
      </article>
    </li>
  )
}
