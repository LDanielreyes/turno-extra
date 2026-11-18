import { lazy } from 'react'
import { Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'

// Cada vista interior se descarga solo cuando se visita, junto con su contenido.
const page = (view, data, key) =>
  lazy(() =>
    Promise.all([view(), data()]).then(([v, d]) => {
      const View = v.default
      const content = d[key]
      return { default: () => <View content={content} /> }
    }),
  )

const ComoFunciona = page(() => import('./pages/ComoFunciona'), () => import('./content/comoFunciona'), 'comoFunciona')
const ParaNegocios = page(() => import('./pages/ParaNegocios'), () => import('./content/paraNegocios'), 'paraNegocios')
const ParaPersonal = page(() => import('./pages/ParaPersonal'), () => import('./content/paraPersonal'), 'paraPersonal')
const Legal = page(() => import('./pages/Legal'), () => import('./content/legal'), 'legal')
const Contacto = page(() => import('./pages/Contacto'), () => import('./content/contacto'), 'contacto')
export const NotFound = page(() => import('./pages/NotFound'), () => import('./content/notFound'), 'notFound')

// Rutas públicas con el marco de la landing (cabecera, atmósfera, pie). El 404 va dentro de este marco.
export const landingRoutes = (
  <Route element={<Layout />}>
    <Route path="/" element={<Home />} />
    <Route path="/como-funciona" element={<ComoFunciona />} />
    <Route path="/para-negocios" element={<ParaNegocios />} />
    <Route path="/para-personal" element={<ParaPersonal />} />
    <Route path="/legal" element={<Legal />} />
    <Route path="/contacto" element={<Contacto />} />
    <Route path="*" element={<NotFound />} />
  </Route>
)
