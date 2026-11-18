import { Suspense, lazy } from 'react'
import { USE_MOCKS } from './shared/api'
import { BrowserRouter, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './shared/queryClient'
import { SessionProvider } from './shared/session'
import { landingRoutes } from './landing/routes'
import { accesoRoutes } from './acceso/routes'
import { empresaRoutes } from './panel-empresa/routes'
import { adminRoutes } from './panel-admin/routes'
import { candidatoRoutes } from './panel-candidato/routes'

// Solo con VITE_USE_MOCKS=true: rótulo de simulación y selector de escenario.
const MockBar = lazy(() => import('./services/mocks/MockBar'))

// Una carpeta por vista: landing/, acceso/, panel-empresa/, panel-admin/, panel-candidato/. shared/ es lo común.
// React Router no admite fragmentos propios como hijos de <Routes> salvo <>…</>, por eso cada carpeta exporta sus <Route>.
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Suspense fallback={<div aria-busy="true" style={{ minHeight: '100vh' }} />}>
            <Routes>
              {accesoRoutes}
              {empresaRoutes}
              {adminRoutes}
              {candidatoRoutes}
              {landingRoutes}
            </Routes>
          </Suspense>
          {USE_MOCKS && <Suspense fallback={null}><MockBar /></Suspense>}
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}
