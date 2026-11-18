import { Link } from 'react-router-dom'
import { Wordmark } from '../landing/components/Logo'
import './acceso.css'

// Marco de acceso. Sin `stage`: tarjeta centrada (términos, invitación).
// Con `stage`: pantalla dividida, el escenario dibujado a la izquierda y el formulario en su columna.
export default function AccessFrame({ title, lede, wide, stage, foot, children }) {
  if (stage) {
    return (
      <div className="access access--split">
        <div className="access__stage">{stage}</div>
        <div className="access__side">
          <Link to="/" className="access__brand" aria-label="TurnoExtra, ir al inicio"><Wordmark height={28} /></Link>
          <main className="access__form">
            <h1>{title}</h1>
            {lede && <p className="access__lede">{lede}</p>}
            {children}
          </main>
          {foot && <footer className="access__sidefoot">{foot}</footer>}
        </div>
      </div>
    )
  }
  return (
    <div className="access">
      <Link to="/" className="access__brand" aria-label="TurnoExtra, ir al inicio"><Wordmark height={26} /></Link>
      <main className={`access__card${wide ? ' access__card--wide' : ''}`}>
        <h1>{title}</h1>
        {lede && <p className="access__lede">{lede}</p>}
        {children}
      </main>
    </div>
  )
}
