import Shell from '../shared/Shell'
import { ICONS } from './icons'
import { MiniClock, useNow } from './scenes'

const NAV = [
  { to: '/admin/orgs', label: 'Organizaciones', icon: ICONS.orgs },
  { to: '/admin/roles', label: 'Roles y requisitos', icon: ICONS.roles },
  { to: '/admin/legal', label: 'Parámetros legales', icon: ICONS.legal },
  { to: '/admin/terminos', label: 'Términos', icon: ICONS.terms },
  { to: '/admin/auditoria', label: 'Auditoría', icon: ICONS.audit },
  { to: '/admin/datos', label: 'Datos personales', icon: ICONS.datos },
]

// El área se identifica con el reloj de la marca, a la hora de Bogotá (la plataforma vive en turnos).
function Crest() {
  const time = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(useNow(30_000))
  return (
    <div className="crest">
      <svg viewBox="0 0 80 80" aria-hidden="true"><MiniClock cx={40} cy={40} r={30} /></svg>
      <div>
        <strong>Super admin</strong>
        <span>{time} · Bogotá</span>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  return <Shell area="Super admin" nav={NAV} crest={<Crest />} />
}
