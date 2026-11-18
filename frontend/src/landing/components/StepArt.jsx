import './StepArt.css'

// Dibujos 2D de los pasos. Solo formas y estados del flujo: sin cifras ni datos de clientes.

// 1 · El gerente publica el turno en el panel.
export function ArtPublish() {
  return (
    <svg className="art art--publish" viewBox="0 0 240 160" aria-hidden="true">
      <rect className="a-stroke" x="20" y="14" width="200" height="132" rx="10" />
      <path className="a-stroke" d="M20 38h200" />
      <circle className="a-fill" cx="34" cy="26" r="3" />
      <circle className="a-fill a-dim" cx="45" cy="26" r="3" />
      <circle className="a-fill a-dim" cx="56" cy="26" r="3" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect className="a-fill a-dim" x="36" y={52 + i * 26} width="34" height="6" rx="3" />
          <rect className="a-stroke" x="80" y={46 + i * 26} width="124" height="18" rx="4" />
          <rect className={`a-type a-type--${i}`} x="84" y={50 + i * 26} width="116" height="10" rx="3" />
        </g>
      ))}
      <g className="a-btn">
        <rect className="a-fill a-solid" x="132" y="124" width="72" height="16" rx="4" />
        <rect className="a-fill a-knock" x="140" y="130" width="38" height="4" rx="2" />
      </g>
    </svg>
  )
}

const NEAR = [[176, 44], [196, 82]]
const FAR = [[170, 120], [206, 118], [208, 50]]

function Person({ x, y, className }) {
  return (
    <g className={`a-person ${className}`}>
      <circle cx={x} cy={y - 5} r="5" />
      <path d={`M${x - 8} ${y + 10}a8 8 0 0 1 16 0z`} />
    </g>
  )
}

// 2 · La oferta sale por WhatsApp: primero favoritos, luego el resto (oleadas).
export function ArtOffer() {
  return (
    <svg className="art art--offer" viewBox="0 0 240 160" aria-hidden="true">
      <circle className="a-ring" cx="56" cy="80" r="34" />
      <circle className="a-ring a-ring--2" cx="56" cy="80" r="34" />
      {[...NEAR, ...FAR].map(([x, y], i) => (
        <path key={i} className="a-link" d={`M56 80L${x} ${y}`} />
      ))}
      <rect className="a-fill a-solid" x="30" y="58" width="52" height="44" rx="8" />
      <path className="a-tail" d="M42 102l-6 12 16-8z" />
      <g className="a-lines">
        <rect x="38" y="68" width="34" height="5" rx="2.5" />
        <rect x="38" y="78" width="26" height="5" rx="2.5" />
        <rect x="38" y="88" width="30" height="5" rx="2.5" />
      </g>
      {NEAR.map(([x, y], i) => (
        <Person key={`n${i}`} x={x} y={y} className="a-person--near" />
      ))}
      {FAR.map(([x, y], i) => (
        <Person key={`f${i}`} x={x} y={y} className="a-person--far" />
      ))}
    </svg>
  )
}

// 3 · El primero que acepta ocupa el cupo.
export function ArtAccept() {
  return (
    <svg className="art art--accept" viewBox="0 0 240 160" aria-hidden="true">
      <rect className="a-stroke" x="140" y="46" width="76" height="68" rx="10" />
      <rect className="a-slot-fill" x="140" y="46" width="76" height="68" rx="10" />
      <path className="a-check" d="M158 82l14 14 28-30" />
      <text className="a-count a-count--a" x="178" y="136" textAnchor="middle">1/2</text>
      <text className="a-count a-count--b" x="178" y="136" textAnchor="middle">2/2 · Cupo cerrado</text>
      <g className="a-queue a-queue--2">
        <circle cx="38" cy="72" r="9" />
        <path d="M20 112a18 18 0 0 1 36 0z" />
      </g>
      <g className="a-queue a-queue--1">
        <circle cx="38" cy="72" r="9" />
        <path d="M20 112a18 18 0 0 1 36 0z" />
      </g>
      <g className="a-runner">
        <circle cx="38" cy="72" r="9" />
        <path d="M20 112a18 18 0 0 1 36 0z" />
      </g>
    </svg>
  )
}
