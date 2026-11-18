import './Backdrop.css'

// Chispas: posiciones fijas (sin Math.random, para que el render sea estable).
const SPARKS = [
  [8, 62, 0, 9], [15, 30, 2.4, 11], [23, 74, 4.1, 8], [31, 44, 1.2, 12], [39, 82, 5.5, 10],
  [47, 24, 3.2, 9], [55, 68, 0.8, 13], [62, 38, 4.8, 8], [70, 78, 2.0, 11], [77, 28, 5.9, 10],
  [84, 58, 1.6, 12], [91, 40, 3.7, 9], [12, 86, 6.3, 10], [88, 84, 2.9, 13],
]

// variant:
//  hero  → haces de luz brasa desde arriba + suelo en perspectiva + chispas
//  soft  → un solo haz y puntos (cabeceras de vistas interiores)
//  rings → ondas concéntricas: la "oleada" de la oferta (cierre de página)
const spark = ([x, y, d, s], i) => (
  <span key={i} className="bd__spark" style={{ left: `${x}%`, top: `${y}%`, '--d': `${d}s`, '--s': `${s}s` }} />
)

export default function Backdrop({ variant = 'hero', className = '' }) {
  if (variant === 'side') {
    return (
      <div className={`bd bd--side ${className}`} aria-hidden="true">
        <span className="bd__dots" />
        <span className="bd__fan bd__fan--a" />
        <span className="bd__source" />
        {SPARKS.slice(0, 4).map(spark)}
      </div>
    )
  }
  if (variant === 'ceil') {
    return (
      <div className={`bd bd--ceil ${className}`} aria-hidden="true">
        <span className="bd__floor"><i /></span>
        <span className="bd__source" />
      </div>
    )
  }
  if (variant === 'paper') {
    return (
      <div className={`bd bd--paper ${className}`} aria-hidden="true">
        <span className="bd__rays"><i /></span>
      </div>
    )
  }
  if (variant === 'rings') {
    return (
      <div className={`bd bd--rings ${className}`} aria-hidden="true">
        <span className="bd__dots" />
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className="bd__ring" style={{ '--i': i }} />)}
      </div>
    )
  }
  if (variant === 'soft') {
    return (
      <div className="bd bd--soft" aria-hidden="true">
        <span className="bd__dots" />
        <span className="bd__fan bd__fan--a" />
        <span className="bd__source" />
        <span className="bd__floor"><i /></span>
      </div>
    )
  }
  return (
    <div className="bd bd--hero" aria-hidden="true">
      <span className="bd__dots" />
      <span className="bd__fan bd__fan--a" />
      <span className="bd__fan bd__fan--b" />
      <span className="bd__source" />
      <span className="bd__floor"><i /></span>
      {SPARKS.map(([x, y, d, s], i) => (
        <span key={i} className="bd__spark" style={{ left: `${x}%`, top: `${y}%`, '--d': `${d}s`, '--s': `${s}s` }} />
      ))}
    </div>
  )
}
