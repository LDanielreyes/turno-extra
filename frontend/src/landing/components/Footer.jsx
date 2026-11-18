import { Link } from 'react-router-dom'
import { Wordmark } from './Logo'
import { site } from '../config/site'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="foot">
      <div className="foot__glow" aria-hidden="true" />
      <div className="container foot__grid">
        <div className="foot__brand">
          <Link to="/" aria-label={`${site.name}, inicio`}><Wordmark height={46} /></Link>
          <p className="foot__legal">
            © 2026 {site.name}
          </p>
        </div>

        <nav className="foot__col foot__nav" aria-label="Navegación">
          <h2 className="foot__h">Navegación</h2>
          {site.nav.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
        </nav>
        <div className="foot__col foot__about">
          <h2 className="foot__h">Qué es</h2>
          <p>Turnos extra para HORECA y negocios con picos de demanda.</p>
        </div>

        <div className="foot__cta">
          <p>Pide una demo con tu caso</p>
          <Link to={site.cta.to} className="btn btn--primary">{site.cta.label}</Link>
        </div>
      </div>
    </footer>
  )
}
