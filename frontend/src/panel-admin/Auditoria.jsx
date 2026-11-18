import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtTime } from '../shared/format'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { NoMatch, Pager, useTable } from '../shared/table'
import { actionIcon } from './icons'
import { AkError, Ico } from './kit'
import './auditoria.css'

// Nombre legible de las acciones conocidas; las demás se muestran con su clave.
const ACTIONS = {
  'org.roles_set': 'Roles de la organización',
  'role.created': 'Rol creado',
  'role.updated': 'Rol actualizado',
  'role.requirements_set': 'Requisitos del rol',
  'terms.published': 'Términos publicados',
  'legal_param.created': 'Parámetro legal registrado',
}
const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(d))
const dayLabel = (d) => {
  const k = dayKey(d)
  if (k === dayKey(new Date())) return 'Hoy'
  if (k === dayKey(Date.now() - 86400_000)) return 'Ayer'
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' }).format(new Date(d))
}
const short = (id) => String(id).slice(0, 8)
// Actores automáticos llevan el prefijo «system:» (p. ej. system:offers); el resto son ids de personas.
const isSystem = (id) => !id || String(id).startsWith('system:')
const actorLabel = (id) => (!id ? 'sistema' : String(id).startsWith('system:') ? `sistema · ${String(id).slice(7)}` : short(id))
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·'

const ORDERS = [
  ['at:desc', 'Más reciente'],
  ['at:asc', 'Más antiguo'],
  ['accion:asc', 'Acción'],
  ['entidad:asc', 'Entidad'],
  ['org:asc', 'Organización'],
  ['actor:asc', 'Actor'],
]

// Bitácora global como cinta impresa: la impresora la saca de su ranura y cada evento es una línea.
// Filtrar por organización = elegir su monograma sobre la ranura; la cinta se reimprime.
// Solo ids, nunca datos personales (doc §9).
export default function Auditoria() {
  const [orgId, setOrgId] = useState('')
  const orgs = useQuery({ queryKey: ['admin', 'orgs'], queryFn: () => api('/admin/orgs') })
  const q = useQuery({
    queryKey: ['admin', 'audit', orgId],
    queryFn: () => api(`/admin/auditoria?limit=200${orgId ? `&orgId=${orgId}` : ''}`),
    refetchInterval: 30_000,
    // Al cambiar de organización la cinta vieja sigue a la vista mientras la impresora trabaja.
    placeholderData: (prev) => prev,
  })
  // La cinta se reimprime cuando llega la respuesta de la organización elegida, no al tocar el monograma.
  const shown = useRef(orgId)
  if (!q.isPlaceholderData) shown.current = orgId
  const orgName = (id) => orgs.data?.orgs.find((o) => o.id === id)?.nombre
  const entries = q.data?.entries ?? []
  const today = entries.filter((e) => dayKey(e.at) === dayKey(new Date())).length
  const actors = new Set(entries.filter((e) => e.actorId).map((e) => e.actorId)).size
  const latest = entries[0]

  const printer = (
      <div className="au-printer">
      <div className="au-printer__bar">
        <span className={`au-led${q.isFetching ? ' is-busy' : ''}${q.isError ? ' is-bad' : ''}`} role="status"
          aria-label={q.isError ? 'Sin conexión' : q.isFetching ? 'Imprimiendo' : 'Al día · se actualiza cada 30 s'} />
        <span className="au-printer__state">{q.isError ? 'Sin conexión' : q.isFetching ? 'Imprimiendo…' : 'Al día'}</span>
        <div className="au-orgs" role="radiogroup" aria-label="Organización">
          <OrgChip on={!orgId} label="Todas" mono={<svg viewBox="0 0 20 20" className="ak-ico"><path d="M3 17V8l5-3v12M8 17V9l9 3v5M2 17h16" /></svg>} onPick={() => setOrgId('')} />
          {orgs.data?.orgs.map((o) => (
            <OrgChip key={o.id} on={orgId === o.id} label={o.nombre} mono={initials(o.nombre)} onPick={() => setOrgId(o.id)} />
          ))}
        </div>
      </div>
      <div className="au-printer__slot" aria-hidden="true" />
    </div>
  )

  return (
    <section className="au">
      <Crops />
      <header className="au__head">
        <div className="au__title">
          <h1>Auditoría</h1>
          <ul className="mh__key">
            <li><i className="au-k au-k--person" aria-hidden="true" />Persona</li>
            <li><i className="au-k au-k--system" aria-hidden="true" />Sistema</li>
            <li><i className="au-k au-k--last" aria-hidden="true" />Último</li>
          </ul>
        </div>
        {q.isSuccess && (
          <dl className="mh__facts au__facts">
            <div><dt>{today === 1 ? 'evento hoy' : 'eventos hoy'}</dt><dd>{today}</dd></div>
            <div><dt>{actors === 1 ? 'persona actuó' : 'personas actuaron'}</dt><dd>{actors}</dd></div>
            <div><dt>último evento</dt><dd>{latest ? fmtTime(latest.at) : '—'}</dd></div>
          </dl>
        )}
      </header>

      {q.data ? (
        <Tape feed={shown.current || 'all'} entries={entries} latest={latest} orgName={orgName} printer={printer} />
      ) : (
        <>
          {printer}
          {q.isError ? (
            <div className="au-tape au-tape--msg">
              <AkError error={q.error} />
              <Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn>
            </div>
          ) : <TapeSkeleton />}
        </>
      )}
    </section>
  )
}

function OrgChip({ on, label, mono, onPick }) {
  return (
    <button type="button" role="radio" aria-checked={on} title={label} className={`au-chip${on ? ' is-on' : ''}`} onClick={onPick}>
      <span className="au-chip__mono" aria-hidden="true">{mono}</span>
      <span className="au-chip__name">{label}</span>
    </button>
  )
}

function TapeSkeleton() {
  return (
    <div className="au-tape is-skel" aria-busy="true" aria-label="Cargando registros">
      {Array.from({ length: 7 }, (_, i) => <span key={i} className="au-skel" style={{ '--i': i }} />)}
    </div>
  )
}

function Tape({ feed, entries, latest, orgName, printer }) {
  const t = useTable(entries, {
    pageSize: 25,
    initialSort: { key: 'at', dir: 'desc' },
    sorters: {
      at: { by: (e) => +new Date(e.at), first: 'desc' },
      accion: (e) => ACTIONS[e.accion] ?? e.accion,
      entidad: (e) => e.entidad,
      org: (e) => (e.orgId ? (orgName(e.orgId) ?? e.orgId) : null),
      actor: (e) => e.actorId ?? null,
    },
    search: (e) => `${e.accion} ${ACTIONS[e.accion] ?? ''} ${e.entidad} ${e.entidadId ?? ''} ${e.actorId ?? ''}`,
    filters: {
      accion: (e, v) => e.accion === v,
      entidad: (e, v) => e.entidad === v,
      actor: (e, v) => (v === 'sistema' ? isSystem(e.actorId) : !isSystem(e.actorId)),
    },
  })
  const [open, setOpen] = useState(null)
  // Líneas que llegan en un refresco posterior: se imprimen con animación; las de la primera carga no.
  const seen = useRef(null)
  if (seen.current === null) seen.current = new Set(entries.map((e) => e.id))
  const fresh = entries.filter((e) => !seen.current.has(e.id)).map((e) => e.id)
  useEffect(() => { for (const e of entries) seen.current.add(e.id) }, [entries])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { t.setPage(1); setOpen(null) }, [feed])

  const acciones = [...new Set(entries.map((e) => e.accion))].sort().map((a) => [a, ACTIONS[a] ?? a])
  const entidades = [...new Set(entries.map((e) => e.entidad).filter(Boolean))].sort()
  const order = t.sort ? `${t.sort.key}:${t.sort.dir}` : 'at:desc'
  const setOrder = (v) => {
    const [key, dir] = v.split(':')
    const cur = t.sort?.key === key ? t.sort.dir : null
    if (cur === dir) return
    // toggleSort con clave nueva arranca en su dirección por defecto; un segundo toque la invierte.
    const first = key === 'at' ? 'desc' : 'asc'
    t.toggleSort(key)
    if (cur === null && first !== dir) t.toggleSort(key)
  }

  // Agrupar por día solo cuando se ordena por hora; con otro orden las líneas van planas.
  const grouped = t.sort?.key === 'at'
  const days = []
  for (const e of t.view) {
    const key = grouped ? dayKey(e.at) : 'all'
    if (days.at(-1)?.key !== key) days.push({ key, label: grouped ? dayLabel(e.at) : null, items: [] })
    days.at(-1).items.push(e)
  }

  return (
    <>
      {entries.length > 0 && <div className="au-tools" role="search">
        <label className="ak-search">
          {Ico.search}
          <input type="search" placeholder="Acción, entidad o id" aria-label="Buscar acción, entidad o id" value={t.query} onChange={(e) => t.setQuery(e.target.value)} />
        </label>
        <select className="ak-select" aria-label="Acción" value={t.values.accion ?? ''} onChange={(e) => t.setFilter('accion', e.target.value)}>
          <option value="">Todas las acciones</option>
          {acciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="ak-select" aria-label="Entidad" value={t.values.entidad ?? ''} onChange={(e) => t.setFilter('entidad', e.target.value)}>
          <option value="">Todas las entidades</option>
          {entidades.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="au-seg" role="radiogroup" aria-label="Actor">
          {[['', 'Todos'], ['persona', 'Persona'], ['sistema', 'Sistema']].map(([v, l]) => (
            <button key={v || 'all'} type="button" role="radio" aria-checked={(t.values.actor ?? '') === v} className={(t.values.actor ?? '') === v ? 'is-on' : ''} onClick={() => t.setFilter('actor', v)}>{l}</button>
          ))}
        </div>
        <select className="ak-select" aria-label="Orden" value={order} onChange={(e) => setOrder(e.target.value)}>
          {ORDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {t.active && <button type="button" className="ak-linkbtn" onClick={t.reset}>Limpiar</button>}
        <span className="au-count" aria-live="polite">{t.active ? `${t.total} de ${t.all}` : t.all} líneas</span>
      </div>}
      {printer}

      <div className="au-tape" key={feed}>
        {entries.length === 0 ? (
          <div className="au-tape--msg">
            <svg className="au-blank" viewBox="0 0 120 40" aria-hidden="true"><path d="M8 12h70M8 22h52M8 32h84" /></svg>
            <strong>Sin registros</strong>
            <span>Las acciones de administración se imprimen aquí.</span>
          </div>
        ) : t.total === 0 ? <div className="au-nomatch"><NoMatch t={t} /></div> : days.map((d, di) => (
          <Fragment key={d.key}>
            {d.label && (
              <div className={`au-cut${di === 0 ? ' is-first' : ''}`}>
                <span>{d.label}</span><b>{d.items.length}</b>
              </div>
            )}
            <ol className="au-lines">
              {d.items.map((e, i) => (
                <Line key={e.id} e={e} i={i} latest={e === latest} fresh={fresh.includes(e.id)} grouped={grouped}
                  orgName={orgName} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
              ))}
            </ol>
          </Fragment>
        ))}
        <span className="au-tape__tear" aria-hidden="true" />
      </div>
      <div className="au-pager"><Pager t={t} /></div>
    </>
  )
}

function Line({ e, i, latest, fresh, grouped, orgName, open, onToggle }) {
  const sys = isSystem(e.actorId)
  const org = e.orgId ? orgName(e.orgId) : null
  const detail = e.detalle && typeof e.detalle === 'object' ? Object.entries(e.detalle) : []
  return (
    <li className={`au-line${latest ? ' is-latest' : ''}${fresh ? ' is-fresh' : ''}${open ? ' is-open' : ''}${sys ? ' is-sys' : ''}`} style={{ '--i': Math.min(i, 14) }}>
      <button type="button" className="au-line__row" aria-expanded={open} onClick={onToggle}>
        <time className="au-time" dateTime={e.at}>{grouped ? fmtTime(e.at) : `${dayLabel(e.at)} · ${fmtTime(e.at)}`}</time>
        <span className="au-glyph" aria-hidden="true">{actionIcon(e.accion)}</span>
        <span className="au-what">
          <strong>{ACTIONS[e.accion] ?? e.accion}</strong>
          <span>{e.entidad}{e.entidadId ? ` · ${short(e.entidadId)}` : ''}</span>
        </span>
        <span className="au-org">{e.orgId ? (org ?? short(e.orgId)) : 'Plataforma'}</span>
        <span className="au-actor"><i aria-hidden="true" />{actorLabel(e.actorId)}</span>
        <span className="au-chev" aria-hidden="true">{Ico.chev}</span>
      </button>
      {open && (
        <dl className="au-detail">
          <div><dt>Acción</dt><dd>{e.accion}</dd></div>
          <div><dt>Entidad</dt><dd>{e.entidad ?? '—'}{e.entidadId ? ` · ${e.entidadId}` : ''}</dd></div>
          <div><dt>Organización</dt><dd>{e.orgId ? `${org ? `${org} · ` : ''}${e.orgId}` : 'Plataforma'}</dd></div>
          <div><dt>Actor</dt><dd>{e.actorId ?? 'sistema'}</dd></div>
          <div><dt>Registro</dt><dd>#{e.id} · {new Date(e.at).toISOString()}</dd></div>
          {detail.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>)}
        </dl>
      )}
    </li>
  )
}
