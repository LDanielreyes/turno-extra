import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'
import { useSession } from '../shared/session'
import { useOrgStream, POLL_MS } from '../shared/useOrgStream'
import Shell from '../shared/Shell'
import { OrgCtx, orgKey } from './org'
import { NAV_ICONS } from './navIcons'

const KEY = 'te.org'

export default function EmpresaLayout() {
  const { memberships } = useSession()
  const [pick, setPick] = useState(() => { try { return sessionStorage.getItem(KEY) } catch { return null } })
  const current = memberships.find((m) => m.orgId === pick) ?? memberships[0]
  const orgId = current?.orgId

  // Términos: sin aceptar la versión vigente el backend responde 403 en todo; se lleva a /terminos.
  const terms = useQuery({ queryKey: orgKey(orgId, 'terms-status'), queryFn: () => api(`/orgs/${orgId}/terms/status`), enabled: !!orgId })
  const alerts = useQuery({
    queryKey: orgKey(orgId, 'alerts', 'pendientes'),
    queryFn: () => api(`/orgs/${orgId}/alerts?solo=pendientes`),
    enabled: !!orgId && terms.data?.accepted !== false,
    refetchInterval: POLL_MS,
  })
  useOrgStream(terms.data?.accepted === false ? null : orgId)

  if (!orgId) return <Navigate to="/" replace />
  if (terms.data?.accepted === false) return <Navigate to="/terminos" replace />

  const choose = (e) => {
    setPick(e.target.value)
    try { sessionStorage.setItem(KEY, e.target.value) } catch { /* sin storage: se queda en memoria */ }
  }
  const nav = [
    { to: '/turnos', label: 'Turnos', icon: NAV_ICONS.turnos },
    { to: '/banca', label: 'Banca', icon: NAV_ICONS.banca },
    { to: '/alertas', label: 'Alertas', icon: NAV_ICONS.alertas, badge: alerts.data?.pendientes || null },
    { to: '/disputas', label: 'Disputas', icon: NAV_ICONS.disputas },
    { to: '/reportes', label: 'Reportes', icon: NAV_ICONS.reportes },
    { to: '/equipo', label: 'Equipo', icon: NAV_ICONS.equipo },
    { to: '/ajustes', label: 'Ajustes', icon: NAV_ICONS.ajustes },
  ]
  const context = memberships.length > 1
    ? <select className="shell__select" aria-label="Organización" value={orgId} onChange={choose}>{memberships.map((m) => <option key={m.orgId} value={m.orgId}>{m.nombre}</option>)}</select>
    : <div className="shell__area" style={{ color: 'var(--color-text)', fontSize: 15 }}>{current.nombre}</div>

  return (
    <OrgCtx.Provider value={{ orgId, orgName: current.nombre }}>
      <Shell area="Panel de empresa" nav={nav} context={context} />
    </OrgCtx.Provider>
  )
}
