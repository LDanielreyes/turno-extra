import { lazy } from 'react'
import { Route } from 'react-router-dom'

const Login = lazy(() => import('./Login'))
const Terminos = lazy(() => import('./Terminos'))
const AceptarInvitacion = lazy(() => import('./AceptarInvitacion'))

// Acceso común a todos los roles: sin cabecera ni pie de la landing.
export const accesoRoutes = (
  <>
    <Route path="/login" element={<Login />} />
    <Route path="/terminos" element={<Terminos />} />
    <Route path="/aceptar-invitacion/:id" element={<AceptarInvitacion />} />
  </>
)
