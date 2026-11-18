import { lazy } from 'react'
import { Route } from 'react-router-dom'
import { Protected } from '../shared/guards'
import Shell from '../shared/Shell'
import '../panel-empresa/empresa.css'
import { NAV_ICONS } from '../panel-empresa/navIcons'

const Yo = lazy(() => import('./Yo'))

// Candidato = sesión propia por código de un solo uso (cookie distinta a la de los gerentes).
const allow = (s) => !!s.user?.candidate

export const candidatoRoutes = (
  <Route element={<Protected allow={allow}><Shell area="Mi espacio" nav={[{ to: '/yo', label: 'Mi espacio', end: true, icon: NAV_ICONS.yo }]} /></Protected>}>
    <Route path="/yo" element={<Yo />} />
  </Route>
)
