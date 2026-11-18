import { lazy } from 'react'
import { Route } from 'react-router-dom'
import { Protected } from '../shared/guards'
import Layout from './Layout'
import './empresa.css'

const lz = (f) => lazy(f)
const Turnos = lz(() => import('./Turnos'))
const TurnoNuevo = lz(() => import('./TurnoNuevo'))
const TurnoDetalle = lz(() => import('./TurnoDetalle'))
const Banca = lz(() => import('./Banca'))
const Alertas = lz(() => import('./Alertas'))
const Disputas = lz(() => import('./Disputas'))
const Reportes = lz(() => import('./Reportes'))
const Equipo = lz(() => import('./Equipo'))
const Ajustes = lz(() => import('./Ajustes'))

// Solo quien administra una organización. El super admin va a su propio panel.
const allow = (s) => s.memberships.length > 0

export const empresaRoutes = (
  <Route element={<Protected allow={allow}><Layout /></Protected>}>
    <Route path="/turnos" element={<Turnos />} />
    <Route path="/turnos/nuevo" element={<TurnoNuevo />} />
    <Route path="/turnos/:id" element={<TurnoDetalle />} />
    <Route path="/banca" element={<Banca />} />
    <Route path="/alertas" element={<Alertas />} />
    <Route path="/disputas" element={<Disputas />} />
    <Route path="/reportes" element={<Reportes />} />
    <Route path="/equipo" element={<Equipo />} />
    <Route path="/ajustes" element={<Ajustes />} />
  </Route>
)
