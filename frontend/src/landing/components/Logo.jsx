import './Logo.css'

// Isotipo: anillo (el cupo) + manecilla (el turno). Al cargar el anillo se dibuja y la manecilla
// da una vuelta; después marca un cuarto de vuelta cada pocos segundos, como un reloj de turno.
export function Isotype({ size = 32, decorative = false, className = '', ...props }) {
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'TurnoExtra' }
  return (
    <svg className={`iso ${className}`} width={size} height={size} viewBox="0 0 24 24" {...a11y} {...props}>
      <circle className="iso__track" cx="12" cy="12" r="8" />
      <circle className="iso__arc" cx="12" cy="12" r="8" pathLength="100" />
      <g className="iso__hand">
        <path d="M11 7h2v4h3v2h-5z" />
      </g>
    </svg>
  )
}

// La "o" de TurnoExtra es el isotipo. Se arma con texto real para que siga a la tipografía del tema.
export function Wordmark({ height = 24, className = '', ...props }) {
  return (
    <span className={`wm ${className}`} style={{ '--wm': `${height}px` }} role="img" aria-label="TurnoExtra" {...props}>
      <span aria-hidden="true">Turn</span>
      <Isotype className="wm__o" size={height} decorative />
      <span aria-hidden="true">Extra</span>
    </span>
  )
}
