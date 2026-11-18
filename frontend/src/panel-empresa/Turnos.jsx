import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtCOP } from '../shared/format'
import { POLL_MS } from '../shared/useOrgStream'
import { ErrorState } from '../shared/ui'
import { orgKey, roleName, useOrg, useRoles } from './org'
import { Plate, Seats, Stamp, TkIco, dayKey, dayNum, hhmm, hoursText, month, weekday } from './turnos-kit'

const ESTADOS = [['abierto', 'Abiertos'], ['cubierto', 'Cubiertos'], ['completado', 'Completados'], ['cancelado', 'Cancelados'], ['vencido', 'Vencidos']]
const CUANDO = [['proximos', 'Próximos'], ['pasados', 'Pasados'], ['todos', 'Todos']]
const DAYS_PAGE = 10
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Turnos como boletos sobre una línea de días. Cada boleto es el turno: se toca y se abre su detalle.
// La lista consulta cada 20 s; cuando alguien acepta, el puesto se llena en el boleto.
export default function Turnos() {
  const { orgId } = useOrg()
  const roles = useRoles()
  const q = useQuery({ queryKey: orgKey(orgId, 'shifts'), queryFn: () => api(`/orgs/${orgId}/shifts`), refetchInterval: POLL_MS })
  const [cuando, setCuando] = useState('proximos')
  const [estado, setEstado] = useState('')
  const [rol, setRol] = useState('')
  const [term, setTerm] = useState('')
  const [pages, setPages] = useState(1)

  const shifts = q.data?.shifts
  const now = Date.now()
  const upcoming = shifts?.filter((s) => +new Date(s.fin) >= now) ?? []
  const abiertos = upcoming.filter((s) => s.estado === 'abierto')
  const faltan = abiertos.reduce((n, s) => n + Math.max(0, s.cupos - s.confirmados), 0)
  const cubiertos = upcoming.filter((s) => s.estado === 'cubierto').length

  const needle = norm(term.trim())
  const days = useMemo(() => {
    if (!shifts) return []
    const list = shifts.filter((s) => {
      const future = +new Date(s.fin) >= now
      if (cuando === 'proximos' && !future) return false
      if (cuando === 'pasados' && future) return false
      if (estado && s.estado !== estado) return false
      if (rol && s.roleId !== rol) return false
      return !needle || norm(`${roleName(roles.data, s.roleId)} ${s.estado}`).includes(needle)
    })
    list.sort((a, b) => (cuando === 'proximos' ? 1 : -1) * (+new Date(a.inicio) - +new Date(b.inicio)))
    const map = new Map()
    for (const s of list) {
      const k = dayKey(s.inicio)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(s)
    }
    return [...map.entries()]
    // `now` cambia en cada render; el filtro de fecha se recalcula con cada consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, cuando, estado, rol, needle, roles.data, q.dataUpdatedAt])
  const roleOptions = shifts ? [...new Map(shifts.map((s) => [s.roleId, roleName(roles.data, s.roleId)])).entries()] : []
  const filtered = needle || estado || rol || cuando !== 'proximos'
  const today = dayKey(now)
  const tomorrow = dayKey(now + 86_400_000)

  return (
    <Plate title="Turnos"
      legend={[['on', 'Puesto cubierto'], ['open', 'Falta']]}
      facts={shifts ? [[abiertos.length, abiertos.length === 1 ? 'turno abierto' : 'turnos abiertos'], [faltan, faltan === 1 ? 'puesto por cubrir' : 'puestos por cubrir'], [cubiertos, cubiertos === 1 ? 'turno cubierto' : 'turnos cubiertos']] : null}>

      <div className="tk__tools">
        <label className="tk-search">
          <TkIco name="search" />
          <input type="search" placeholder="Buscar rol" aria-label="Buscar por rol o estado" value={term} onChange={(e) => { setTerm(e.target.value); setPages(1) }} />
        </label>
        <div className="tk-seg" role="radiogroup" aria-label="Cuándo">
          {CUANDO.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={cuando === v} className={cuando === v ? 'is-on' : ''} onClick={() => { setCuando(v); setPages(1) }}>{l}</button>
          ))}
        </div>
        <select className="tk-select" aria-label="Estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPages(1) }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {roleOptions.length > 1 && (
          <select className="tk-select" aria-label="Rol" value={rol} onChange={(e) => { setRol(e.target.value); setPages(1) }}>
            <option value="">Todos los roles</option>
            {roleOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
        {q.isRefetchError && <span className="tk-offline" role="status">Sin conexión · reintentando cada 20 s</span>}
      </div>

      {q.isPending ? <TimelineSkeleton />
        : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} />
        : (
          <ol className="tk-line">
            {cuando !== 'pasados' && (
              <li className="tk-day tk-day--new">
                <div className="tk-day__date" aria-hidden="true"><b><TkIco name="plus" size={18} /></b></div>
                <div className="tk-day__row">
                  <Link to="/turnos/nuevo" className="tk-t tk-t--blank">
                    <span className="tk-t__paper">
                      <span className="tk-t__stub"><TkIco name="plus" size={22} /></span>
                      <span className="tk-t__body">
                        <strong className="tk-t__role">Publicar turno</strong>
                        <span className="tk-t__when">La oferta sale a tu banca</span>
                        <span className="tk-seats tk-seats--sm" aria-hidden="true"><i className="tk-seat" /><i className="tk-seat" /><i className="tk-seat" /></span>
                      </span>
                    </span>
                  </Link>
                </div>
              </li>
            )}
            {days.slice(0, pages * DAYS_PAGE).map(([k, list]) => (
              <li key={k} className={`tk-day${k === today ? ' is-today' : ''}`}>
                <div className="tk-day__date">
                  <small>{k === today ? 'Hoy' : k === tomorrow ? 'Mañana' : weekday(list[0].inicio)}</small>
                  <b>{dayNum(list[0].inicio)}</b>
                  <span>{month(list[0].inicio)}</span>
                </div>
                <ul className="tk-day__row">
                  {list.map((s, i) => <Ticket key={s.id} s={s} i={i} role={roleName(roles.data, s.roleId)} />)}
                </ul>
              </li>
            ))}
          </ol>
        )}

      {shifts && days.length === 0 && (
        shifts.length === 0
          ? <p className="tk-none">Aún no hay turnos. Publica el primero y aquí verás cómo se llenan los puestos.</p>
          : <p className="tk-none">{filtered ? 'Ningún turno coincide.' : 'No hay turnos próximos.'} <button type="button" className="tk-link" onClick={() => { setTerm(''); setEstado(''); setRol(''); setCuando(cuando === 'proximos' ? 'todos' : 'proximos') }}>{cuando === 'proximos' && !filtered ? 'Ver todos' : 'Quitar filtros'}</button></p>
      )}
      {days.length > pages * DAYS_PAGE && (
        <button type="button" className="tk-more" onClick={() => setPages(pages + 1)}>Mostrar más días <span className="mono">({days.length - pages * DAYS_PAGE})</span></button>
      )}
    </Plate>
  )
}

const ESTADO_TXT = { abierto: 'abierto', cubierto: 'cubierto', completado: 'completado', cancelado: 'cancelado', vencido: 'vencido' }

function Ticket({ s, i, role }) {
  const live = s.estado === 'abierto' && +new Date(s.inicio) > Date.now()
  return (
    <li className={`tk-tw is-${s.estado}`} style={{ '--d': `${Math.min(i, 8) * 0.04}s` }}>
      <Link to={`/turnos/${s.id}`} className="tk-t"
        aria-label={`${role}, ${hhmm(s.inicio)} a ${hhmm(s.fin)}, ${s.confirmados} de ${s.cupos} puestos, ${fmtCOP(s.pagoTotal)}, ${ESTADO_TXT[s.estado] ?? s.estado}`}>
        <span className="tk-t__paper">
          <span className="tk-t__stub">
            <b className="mono">{hhmm(s.inicio)}</b>
            <small className="mono">{hoursText(s.inicio, s.fin)}</small>
          </span>
          <span className="tk-t__body">
            <strong className="tk-t__role">{role}</strong>
            <span className="tk-t__when mono">{hhmm(s.inicio)}–{hhmm(s.fin)}</span>
            <span className="tk-t__foot">
              <Seats cupos={s.cupos} filled={Math.min(s.confirmados, s.cupos)} live={live} />
              <span className="tk-t__pay mono">{fmtCOP(s.pagoTotal)}</span>
            </span>
          </span>
        </span>
        <Stamp estado={s.estado === 'cubierto' ? null : s.estado} />
      </Link>
    </li>
  )
}

function TimelineSkeleton() {
  return (
    <ol className="tk-line is-skel" aria-busy="true" aria-label="Cargando turnos">
      {[3, 2].map((n, d) => (
        <li key={d} className="tk-day">
          <div className="tk-day__date"><b className="tk-skel" style={{ width: 28, height: 28 }} /></div>
          <ul className="tk-day__row">
            {Array.from({ length: n }, (_, i) => <li key={i} className="tk-tw"><span className="tk-t"><span className="tk-t__paper tk-skel" /></span></li>)}
          </ul>
        </li>
      ))}
    </ol>
  )
}
