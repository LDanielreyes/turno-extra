import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import { Protected } from '../shared/guards'
import Layout from './Layout'
import '../panel-empresa/empresa.css'
import './admin.css'

const Orgs = lazy(() => import('./Orgs'))
const Roles = lazy(() => import('./Roles'))
const Legal = lazy(() => import('./Legal'))
const Terminos = lazy(() => import('./Terminos'))
const Auditoria = lazy(() => import('./Auditoria'))
const Datos = lazy(() => import('./Datos'))

export const adminRoutes = (
  <Route element={<Protected allow={(s) => s.isSuper}><Layout /></Protected>}>
    <Route path="/admin" element={<Navigate to="/admin/orgs" replace />} />
    <Route path="/admin/orgs" element={<Orgs />} />
    <Route path="/admin/roles" element={<Roles />} />
    <Route path="/admin/legal" element={<Legal />} />
    <Route path="/admin/terminos" element={<Terminos />} />
    <Route path="/admin/auditoria" element={<Auditoria />} />
    <Route path="/admin/datos" element={<Datos />} />
  </Route>
)
