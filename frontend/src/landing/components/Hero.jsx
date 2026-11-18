import { Link } from 'react-router-dom'
import Backdrop from './Backdrop'
import HeroScene from './HeroScene'
import Crops from '../../shared/Crops'
import './Hero.css'

const Arrow = () => (
  <svg className="btn__arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
)

// Hero A1 (Fase 2): placa de instrumento en dos zonas. Titular y acciones a la izquierda sobre fondo limpio;
// a la derecha el panel completo y, debajo, el hilo de la oferta hasta el teléfono. Nada tapa a nada.
export default function Hero({ content }) {
  const last = content.title.length - 1
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__plate">
        <Crops />
        <div className="hero__card">
          <Backdrop variant="hero" />

          <div className="hero__text">
            <h1 id="hero-title" className="hero__title">
              {content.title.map((line, i) => (
                <span key={line} className="hero__line" style={{ '--i': i }}>
                  {i === last ? (
                    <span className="hero__mark">
                      {line}
                      <svg className="hero__scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true">
                        <path d="M3 11C40 3 72 15 110 8s70 6 105 0 58 4 82 -1" pathLength="100" />
                      </svg>
                    </span>
                  ) : (
                    line
                  )}
                </span>
              ))}
            </h1>
            <p className="hero__lede">{content.lede}</p>
            <div className="hero__actions">
              <Link to={content.primaryCta.to} className="btn btn--primary btn--lg">
                {content.primaryCta.label}
                <Arrow />
              </Link>
              <Link to={content.secondaryCta.to} className="btn btn--lg">{content.secondaryCta.label}</Link>
            </div>
            <ul className="hero__facts">
              {content.facts.map((f) => (
                <li key={f.value}><b>{f.value}</b><span>{f.label}</span></li>
              ))}
            </ul>
          </div>

          <div className="hero__stage" aria-hidden="true">
            <div className="hero__stagein">
              <HeroScene labels={content.chips} layout="stack" rows={3} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
