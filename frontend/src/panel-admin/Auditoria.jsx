import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtTime } from '../shared/format'
import { Async } from '../shared/ui'
import { NoMatch, Pager, SortTh, TableTools, useTable } from '../shared/table'
import Masthead from './Masthead'
import { ICONS, actionIcon } from './icons'
import { AuditScene, VacantArt } from './scenes'
import { Ico, Panel, Vacant } from './kit'

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

// Bitácora global: solo ids, nunca datos personales (doc §9).
export default function Auditoria() {
  const [orgId, setOrgId] = useState('')
  const orgs = useQuery({ queryKey: ['admin', 'orgs'], queryFn: () => api('/admin/orgs') })
  const q = useQuery({
    queryKey: ['admin', 'audit', orgId],
    queryFn: () => api(`/admin/auditoria?limit=200${orgId ? `&orgId=${orgId}` : ''}`),
    refetchInterval: 30_000,
  })
  const orgName = (id) => orgs.data?.orgs.find((o) => o.id === id)?.nombre
  const entries = q.data?.entries ?? []
  const today = entries.filter((e) => dayKey(e.at) === dayKey(new Date())).length
  const actors = new Set(entries.filter((e) => e.actorId).map((e) => e.actorId)).size
  const latest = entries[0]

  return (
    <>
      <Masthead title="Auditoría" art={<AuditScene entries={entries} />}
        facts={q.isSuccess ? [[today, today === 1 ? 'evento hoy' : 'eventos hoy'], [actors, actors === 1 ? 'persona actuó' : 'personas actuaron'], [latest ? fmtTime(latest.at) : '—', 'último evento']] : null}
        lede="Quién hizo qué y cuándo · sin datos personales · cada 30 s" />

      <Panel className="ak-panel--flush" title="Registro" icon={ICONS.audit} meta={q.data ? `últimos ${q.data.entries.length}` : null}
        actions={
          <div className="ak-filters">
            <select className="ak-select" aria-label="Organización" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">Todas las organizaciones</option>
              {orgs.data?.orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
        }>
        <Async skeleton="table" q={q} empty={Object.assign((d) => d.entries.length === 0, { node: <Vacant art={VacantArt.audit} title="Sin registros">Las acciones de administración aparecerán aquí.</Vacant> })}>
          {({ entries }) => <AuditTable entries={entries} latest={latest} orgName={orgName} />}
        </Async>
      </Panel>
    </>
  )
}

function AuditTable({ entries, latest, orgName }) {
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
    search: (e) => `${e.accion} ${ACTIONS[e.accion] ?? ''} ${e.entidad}`,
    filters: {
      accion: (e, v) => e.accion === v,
      entidad: (e, v) => e.entidad === v,
      actor: (e, v) => (v === 'sistema' ? isSystem(e.actorId) : !isSystem(e.actorId)),
    },
  })
  const acciones = [...new Set(entries.map((e) => e.accion))].sort().map((a) => [a, ACTIONS[a] ?? a])
  const entidades = [...new Set(entries.map((e) => e.entidad))].sort().map((x) => [x, x])

  // Agrupar por día solo cuando se ordena por hora; con otro orden las filas van planas.
  const grouped = t.sort?.key === 'at'
  const days = []
  if (grouped) {
    for (const e of t.view) {
      const key = dayKey(e.at)
      if (days.at(-1)?.key !== key) days.push({ key, label: dayLabel(e.at), items: [] })
      days.at(-1).items.push(e)
    }
  }
  const row = (e) => (
    <tr key={e.id} className={`ak-row${e === latest ? ' is-latest' : ''}`}>
      <td className="t dim"><time dateTime={e.at}>{grouped ? fmtTime(e.at) : `${dayLabel(e.at)} · ${fmtTime(e.at)}`}</time></td>
      <td>
        <div className="ak-name">
          <span className="ak-act" aria-hidden="true">{actionIcon(e.accion)}</span>
          <div className="ak-log__what">
            <strong>{ACTIONS[e.accion] ?? e.accion}</strong>
            {ACTIONS[e.accion] && <span>{e.accion}</span>}
          </div>
        </div>
      </td>
      <td className="mono">{e.entidad}{e.entidadId ? ` · ${short(e.entidadId)}` : ''}</td>
      <td>{e.orgId ? (orgName(e.orgId) ?? <span className="mono">{short(e.orgId)}</span>) : <span className="dim">Plataforma</span>}</td>
      <td className="mono">{actorLabel(e.actorId)}</td>
    </tr>
  )

  return (
    <>
      <TableTools t={t} placeholder="Acción o entidad" filters={[
        { key: 'accion', label: 'Todas las acciones', options: acciones },
        { key: 'entidad', label: 'Todas las entidades', options: entidades },
        { key: 'actor', label: 'Cualquier actor', options: [['persona', 'Una persona'], ['sistema', 'El sistema']] },
      ]} />
      {t.total === 0 ? <NoMatch t={t} /> : (
        <table className="ak-table">
          <thead>
            <tr>
              <SortTh t={t} k="at">Hora</SortTh>
              <SortTh t={t} k="accion">Acción</SortTh>
              <SortTh t={t} k="entidad">Entidad</SortTh>
              <SortTh t={t} k="org">Organización</SortTh>
              <SortTh t={t} k="actor">Actor</SortTh>
            </tr>
          </thead>
          <tbody>
            {grouped
              ? days.map((d) => (
                <Fragment key={d.key}>
                  <tr className="ak-log__day"><td colSpan={5}>{d.label}<span>· {d.items.length}</span></td></tr>
                  {d.items.map(row)}
                </Fragment>
              ))
              : t.view.map(row)}
          </tbody>
        </table>
      )}
      <Pager t={t} />
    </>
  )
}
