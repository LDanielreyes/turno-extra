import { useEffect, useState } from 'react'
import './scenes.css'

// Reloj de la barra lateral del super admin (hora de Bogotá). Las escenas de cada vista viven ahora en su propia vista,
// donde el dibujo es la interfaz.

export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), every); return () => clearInterval(t) }, [every])
  return now
}
// Hora de Bogotá en horas decimales (0–24).
const bogota = (d) => {
  const [h, m, s] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).split(':').map(Number)
  return { h: h % 24, m, s }
}
const polar = (cx, cy, r, deg) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)]

// Reloj pequeño con la hora de Bogotá: el mismo dial de la marca.
export function MiniClock({ cx, cy, r }) {
  const { h, m, s } = bogota(useNow(30_000))
  const [hx, hy] = polar(cx, cy, r * 0.5, ((h % 12) + m / 60) * 30)
  const [mx, my] = polar(cx, cy, r * 0.74, m * 6)
  return (
    <g className="sc-clock">
      <circle className="sc-clock__halo" cx={cx} cy={cy} r={r + 16} />
      <circle className="sc-clock__face" cx={cx} cy={cy} r={r} />
      {Array.from({ length: 12 }, (_, i) => {
        const [x1, y1] = polar(cx, cy, r - (i % 3 ? 5 : 8), i * 30)
        const [x2, y2] = polar(cx, cy, r - 2, i * 30)
        return <line key={i} className={i === 0 ? 'sc-clock__tick is-top' : 'sc-clock__tick'} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      <line className="sc-clock__h" x1={cx} y1={cy} x2={hx} y2={hy} />
      <line className="sc-clock__m" x1={cx} y1={cy} x2={mx} y2={my} />
      <line className="sc-clock__s" x1={cx} y1={cy + 5} x2={cx} y2={cy - r + 4}
        style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `-${s}s` }} />
      <circle className="sc-clock__pv" cx={cx} cy={cy} r="2.6" />
    </g>
  )
}
