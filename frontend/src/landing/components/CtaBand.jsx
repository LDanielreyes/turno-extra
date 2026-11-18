import { Link } from 'react-router-dom'
import Backdrop from './Backdrop'
import { Isotype } from './Logo'
import './CtaBand.css'

// Cierre de página, en marco como el hero: titular grande a la izquierda y, a la derecha, el reloj de marca
// (esfera de instrumento + isotipo) del que salen las ondas de la oferta hacia la banca.
// Geometría del dial (viewBox 200): puntos sobre un círculo, y 60 marcas de minuto con las de hora más largas.
const polar = (deg, r) => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)]
const D60 = Array.from({ length: 60 }, (_, i) => {
  const hr = i % 5 === 0
  const [x1, y1] = polar(i * 6, hr ? 84 : 90)
  const [x2, y2] = polar(i * 6, 97)
  return { i, hr, x1, y1, x2, y2 }
})

// Esfera: 48 marcas de minuto finas, 12 de hora gruesas (la de las 12 en brasa), cuatro numerales y la aguja de segundos.
function Clock() {
  return (
    <div className="cta__clock" aria-hidden="true">
      <svg viewBox="0 0 200 200" className="cta__ticks">
        <circle cx="100" cy="100" r="99.5" className="cta__rim" />
        {D60.filter((t) => !t.hr).map((t) => <line key={t.i} className="cta__min" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
        {D60.filter((t) => t.hr).map((t) => <line key={t.i} className={t.i === 0 ? 'cta__hr cta__hr--top' : 'cta__hr'} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
        <g className="cta__num">
          <text x="100" y="31" textAnchor="middle">00</text>
          <text x="172" y="103" textAnchor="middle">15</text>
          <text x="100" y="175" textAnchor="middle">30</text>
          <text x="28" y="103" textAnchor="middle">45</text>
        </g>
        <g className="cta__hand">
          <line x1="100" y1="56" x2="100" y2="8" />
          <circle cx="100" cy="8" r="2.8" />
        </g>
      </svg>
      <Isotype size={120} decorative className="cta__iso" />
    </div>
  )
}

export default function CtaBand({ title, body, cta, note }) {
  return (
    <section className="cta" aria-label={title}>
      <div className="cta__card">
        <Backdrop variant="rings" />
        <Clock />
        <div className="cta__in">
          <h2 className="cta__title">{title}</h2>
          {body && <p className="cta__body">{body}</p>}
          <Link to={cta.to} className="btn btn--primary btn--lg">{cta.label}</Link>
          {note && <p className="cta__note mono">{note}</p>}
        </div>
      </div>
    </section>
  )
}
