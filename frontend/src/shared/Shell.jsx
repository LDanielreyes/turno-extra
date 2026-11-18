import { Suspense, useState } from 'react'
import { PageSkeleton } from './ui'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Wordmark } from '../landing/components/Logo'
import { useSession } from './session'
import './shell.css'

// Marco común de los tres paneles: barra lateral (arriba en móvil), usuario y salir.
// `nav` = [{ to, label, badge?, icon? }]; `context` = nodo opcional bajo la marca (selector de org, etc.);
// `crest` = bloque de marca del área que reemplaza la etiqueta `area`.
export default function Shell({ area, nav, context, crest, children }) {
  const { user, logout } = useSession()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  // el menú móvil se cierra al navegar
  const [last, setLast] = useState(pathname)
  if (last !== pathname) { setLast(pathname); setOpen(false) }

  return (
    <div className="shell">
      <a className="sr-only" href="#contenido">Ir al contenido</a>
      <aside className={`shell__side${open ? ' is-open' : ''}`}>
        <div className="shell__top">
          <NavLink to="/" className="shell__brand" aria-label="TurnoExtra, ir al inicio"><Wordmark height={22} /></NavLink>
          <button type="button" className="shell__toggle" aria-expanded={open} aria-controls="shell-nav" onClick={() => setOpen(!open)}>
            <span className="sr-only">Menú</span>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        {crest ?? <div className="shell__area">{area}</div>}
        {context && <div className="shell__ctx">{context}</div>}
        <nav id="shell-nav" className="shell__nav" aria-label={area}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.icon ? <span className="shell__lab">{n.icon}{n.label}</span> : n.label}
              {n.badge ? <b className="shell__badge" aria-label={`${n.badge} pendientes`}>{n.badge}</b> : null}
            </NavLink>
          ))}
        </nav>
        <div className="shell__user">
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={logout}>Salir</button>
        </div>
      </aside>
      <main id="contenido" className="shell__main">
        <Suspense fallback={<PageSkeleton />}>
          {children ?? <Outlet />}
        </Suspense>
      </main>
    </div>
  )
}
