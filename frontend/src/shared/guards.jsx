import { Navigate, useLocation } from 'react-router-dom'
import { useSession, homeFor } from './session'
import { ErrorState, Loading } from './ui'

// Protege un panel. `allow(session)` decide el rol; si no pasa, va al panel que le corresponde.
export function Protected({ allow, children }) {
  const s = useSession()
  const loc = useLocation()
  if (s.loading) return <div className="container" style={{ paddingTop: 120 }}><Loading label="Verificando sesión" /></div>
  if (s.error) return <div className="container" style={{ paddingTop: 120 }}><ErrorState error={s.error} onRetry={s.refresh} /></div>
  if (!s.user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!allow(s)) return <Navigate to={homeFor(s)} replace />
  return children
}
