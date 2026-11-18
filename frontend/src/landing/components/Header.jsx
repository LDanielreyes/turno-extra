import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Wordmark } from './Logo'
import { site } from '../config/site'
import './Header.css'

// Barra fija: logo, navegación al centro, CTA a la derecha. Al bajar toma fondo para que el texto
// de la página no se mezcle con los enlaces (aquí el desenfoque sí cumple una función).
export default function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => {
    let last = window.scrollY
    const on = () => {
      const y = window.scrollY
      setScrolled(y > 12)
      // baja: se esconde; sube (aunque sea poco): vuelve. Cerca del tope siempre visible.
      if (y < 90) setHidden(false)
      else if (y - last > 6) setHidden(true)
      else if (last - y > 4) setHidden(false)
      last = y
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className={`header${scrolled || open ? ' is-solid' : ''}${hidden && !open ? ' is-hidden' : ''}`}
      onFocusCapture={() => setHidden(false)}>
      <div className="container header__in">
        <Link to="/" className="header__logo" aria-label={`${site.name}, inicio`} onClick={close}>
          <Wordmark height={24} />
        </Link>

        <nav id="main-nav" className={`header__nav${open ? ' is-open' : ''}`} aria-label="Principal">
          {site.nav.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={close}>
              {item.label}
            </NavLink>
          ))}
          <Link to={site.cta.to} className="btn btn--primary header__cta-m" onClick={close}>
            {site.cta.label}
          </Link>
        </nav>

        <div className="header__end">
          <Link to={site.links.panel} className="btn btn--ghost btn--sm" onClick={close}>Entrar</Link>
          <Link to={site.cta.to} className="btn btn--primary btn--sm header__cta" onClick={close}>
            {site.cta.label}
          </Link>
          <button
            type="button"
            className="header__toggle"
            aria-expanded={open}
            aria-controls="main-nav"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
