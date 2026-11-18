import Crops from '../../shared/Crops'
import './ProblemArt.css'

// Comparación dibujada (mostrar, no contar): a la izquierda la cadena de llamadas, una tras otra, sin respuesta;
// a la derecha la oferta sale a toda la banca a la vez y la primera persona que acepta ocupa el cupo.
const CALLS = [40, 82, 124, 166]
const RING = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2
  return [140 + Math.cos(a) * 74, 100 + Math.sin(a) * 74]
})
const WIN = 2 // la persona que acepta

const Phone = ({ x, y }) => (
  <g transform={`translate(${x - 9} ${y - 14})`}>
    <rect width="18" height="28" rx="4" className="pa2-stroke" />
    <path d="M7 23h4" className="pa2-stroke" />
  </g>
)

export default function ProblemArt({ before, after }) {
  return (
    <div className="pa2 plate">
      <Crops />
      <figure className="pa2__half">
        <svg viewBox="0 0 280 200" className="pa2__svg pa2__svg--before" aria-hidden="true">
          <Phone x={36} y={100} />
          <g className="pa2__clock">
            <circle cx="36" cy="150" r="11" className="pa2-stroke" />
            <path d="M36 143v7l5 3" className="pa2-hand" />
          </g>
          {CALLS.map((y, i) => (
            <g key={y} className={`pa2__call pa2__call--${i}`}>
              <path d={`M50 100 C 110 100, 150 ${y}, 214 ${y}`} className="pa2__line" pathLength="1" />
              <circle cx="226" cy={y} r="11" className="pa2__node" />
              {i < 3 ? (
                <path d={`M221 ${y - 5}l10 10M231 ${y - 5}l-10 10`} className="pa2__x" />
              ) : (
                <g className="pa2__wait">
                  <circle cx="221" cy={y} r="1.6" /><circle cx="226" cy={y} r="1.6" /><circle cx="231" cy={y} r="1.6" />
                </g>
              )}
            </g>
          ))}
        </svg>
        <figcaption><b>{before.label}</b><span>{before.caption}</span></figcaption>
      </figure>

      <figure className="pa2__half pa2__half--after">
        <svg viewBox="0 0 280 200" className="pa2__svg pa2__svg--after" aria-hidden="true">
          <circle cx="140" cy="100" r="22" className="pa2__pulse" />
          <circle cx="140" cy="100" r="22" className="pa2__pulse pa2__pulse--2" />
          {RING.map(([x, y], i) => (
            <line key={`l${i}`} x1="140" y1="100" x2={x} y2={y} className={i === WIN ? 'pa2__ray pa2__ray--win' : 'pa2__ray'} pathLength="1" />
          ))}
          {RING.map(([x, y], i) => (
            <g key={`n${i}`} className={i === WIN ? 'pa2__p pa2__p--win' : 'pa2__p'}>
              <circle cx={x} cy={y} r="11" />
              {i === WIN && <path d={`M${x - 5} ${y}l3.5 3.5 6.5-7`} className="pa2__ck" />}
            </g>
          ))}
          <circle cx="140" cy="100" r="18" className="pa2__core" />
          <path d="M133 100h14M142 95l5 5-5 5" className="pa2__core-ico" />
        </svg>
        <figcaption><b>{after.label}</b><span>{after.caption}</span></figcaption>
      </figure>
    </div>
  )
}
