import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtCOP, fmtRange } from '../shared/format'
import { POLL_MS } from '../shared/useOrgStream'
import { Async, Badge, Empty, PageTitle } from '../shared/ui'
import Crops from '../shared/Crops'
import { NoMatch, Pager, SortTh, TableTools, useTable } from '../shared/table'
import { orgKey, roleName, useOrg, useRoles } from './org'

const ESTADOS = [['abierto', 'Abiertos'], ['cubierto', 'Cubiertos'], ['completado', 'Completados'], ['cancelado', 'Cancelados'], ['vencido', 'Vencidos']]

export default function Turnos() {
  const { orgId } = useOrg()
  const roles = useRoles()
  const q = useQuery({ queryKey: orgKey(orgId, 'shifts'), queryFn: () => api(`/orgs/${orgId}/shifts`), refetchInterval: POLL_MS })

  return (
    <>
      <PageTitle title="Turnos" lede="Publica un turno y la oferta sale a tu banca. Esta lista se actualiza sola."
        actions={<Link className="btn btn--primary" to="/turnos/nuevo">Publicar turno</Link>} />
      <Async skeleton="table" q={q}>
        {({ shifts }) => shifts.length === 0 ? (
          <Empty title="Aún no hay turnos" action={<Link className="btn btn--sm" to="/turnos/nuevo">Publicar el primero</Link>}>
            Cuando publiques uno, aquí verás cuántos cupos van confirmados en vivo.
          </Empty>
        ) : <ShiftsTable shifts={shifts} roles={roles.data} />}
      </Async>
    </>
  )
}

function ShiftsTable({ shifts, roles }) {
  const now = Date.now()
  const t = useTable(shifts, {
    initialSort: { key: 'inicio', dir: 'desc' },
    sorters: {
      rol: (s) => roleName(roles, s.roleId),
      inicio: { by: (s) => +new Date(s.inicio), first: 'desc' },
      cupos: { by: (s) => (s.cupos ? s.confirmados / s.cupos : 0), first: 'desc' },
      pago: { by: (s) => Number(s.pagoTotal), first: 'desc' },
      estado: (s) => s.estado,
    },
    search: (s) => `${roleName(roles, s.roleId)} ${s.estado}`,
    filters: {
      estado: (s, v) => s.estado === v,
      rol: (s, v) => s.roleId === v,
      cuando: (s, v) => (v === 'proximos' ? +new Date(s.fin) >= now : +new Date(s.fin) < now),
    },
  })
  const roleOptions = [...new Map(shifts.map((s) => [s.roleId, roleName(roles, s.roleId)])).entries()]

  return (
    <section className="pl" aria-label="Lista de turnos">
      <Crops />
      <TableTools t={t} placeholder="Buscar por rol o estado" filters={[
        { key: 'cuando', label: 'Cuándo', options: [['proximos', 'Próximos y en curso'], ['pasados', 'Pasados']] },
        { key: 'estado', label: 'Todos los estados', options: ESTADOS },
        { key: 'rol', label: 'Todos los roles', options: roleOptions },
      ]} />
      {t.total === 0 ? <NoMatch t={t} /> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <SortTh t={t} k="rol">Rol</SortTh>
                <SortTh t={t} k="inicio">Horario</SortTh>
                <SortTh t={t} k="cupos">Cupos</SortTh>
                <SortTh t={t} k="pago">Pago</SortTh>
                <SortTh t={t} k="estado">Estado</SortTh>
              </tr>
            </thead>
            <tbody>
              {t.view.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/turnos/${s.id}`}>{roleName(roles, s.roleId)}</Link></td>
                  <td>{fmtRange(s.inicio, s.fin)}</td>
                  <td>
                    <span className="seats-mini" role="img" aria-label={`${s.confirmados} de ${s.cupos} cupos`}>
                      {Array.from({ length: Math.min(s.cupos, 6) }, (_, i) => <i key={i} className={i < s.confirmados ? 'is-on' : undefined} />)}
                      <b className="mono">{s.confirmados}/{s.cupos}</b>
                    </span>
                  </td>
                  <td className="mono">{fmtCOP(s.pagoTotal)}</td>
                  <td><Badge value={s.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager t={t} />
    </section>
  )
}
