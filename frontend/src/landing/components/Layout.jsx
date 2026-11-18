import { Outlet, useLocation } from 'react-router-dom'
import { Suspense, useEffect } from 'react'
import Header from './Header'
import Footer from './Footer'
import useReveal from './useReveal'
import Atmosphere from './Atmosphere'

// Se monta solo cuando la vista (lazy) ya está en el DOM: ahí se miden y preparan las entradas por scroll.
function PageReady({ pathname }) {
  useReveal(pathname)
  return null
}

export default function Layout() {
  const { pathname } = useLocation()
  // al cambiar de pestaña, volver arriba
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <>
      <Atmosphere />
      <div className="progress" aria-hidden="true" />
      <Header />
      <Suspense fallback={<main aria-busy="true" style={{ minHeight: '100vh' }} />}>
        <Outlet />
        <PageReady pathname={pathname} />
      </Suspense>
      <Footer />
    </>
  )
}
