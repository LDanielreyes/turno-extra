import { useEffect, useRef } from 'react'
import useSmoothScroll from './useSmoothScroll'
import './Atmosphere.css'

// Atmósfera fija detrás de TODA la web: la misma brasa, los mismos haces y el mismo dibujo de red
// (personas conectadas, la oferta viajando de nodo en nodo) que el hero, pero viva con el scroll.
// Las secciones oscuras son transparentes y la dejan ver; el papel la tapa y trae su propio dibujo.
const NODES = [
  [150, 210], [400, 120], [650, 290], [930, 170], [1200, 250], [1320, 470],
  [1080, 580], [760, 450], [470, 540], [200, 650], [560, 780], [920, 770], [1250, 760],
]
// pares conectados (índices) y cuánto se curva cada arco
const EDGES = [
  [0, 1, 40], [1, 2, -50], [2, 3, 45], [3, 4, -40], [4, 5, 50], [2, 7, 40], [7, 6, -45], [7, 8, 50],
  [8, 9, -40], [8, 10, 45], [10, 11, -50], [11, 12, 40], [6, 5, -35], [6, 11, 45], [3, 7, -55], [9, 0, 60],
]
const arc = ([ax, ay], [bx, by], k) => {
  const mx = (ax + bx) / 2, my = (ay + by) / 2
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
  return `M${ax} ${ay}Q${(mx - (dy / len) * k).toFixed(1)} ${(my + (dx / len) * k).toFixed(1)} ${bx} ${by}`
}
const PATHS = EDGES.map(([a, b, k]) => arc(NODES[a], NODES[b], k))

export default function Atmosphere() {
  const root = useRef(null)
  const net = useRef(null)
  useSmoothScroll(root)
  // los pulsos SMIL no se detienen solos: se pausan con la pestaña oculta
  useEffect(() => {
    const svg = net.current
    const sync = () => (document.hidden ? svg?.pauseAnimations?.() : svg?.unpauseAnimations?.())
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  return (
    <div className="atmo" ref={root} aria-hidden="true">
      <span className="atmo__orb atmo__orb--a" />
      <span className="atmo__orb atmo__orb--b" />
      <span className="atmo__rays"><i /></span>
      <svg className="atmo__net" ref={net} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <g className="atmo__edges">
          {PATHS.map((d, i) => <path key={i} id={`ae${i}`} d={d} />)}
        </g>
        <g className="atmo__nodes">
          {NODES.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === 7 ? 6 : 4} className={i % 4 === 1 ? 'is-lit' : undefined} style={{ '--d': `${(i * 0.7) % 5}s` }} />
          ))}
        </g>
        <g className="atmo__pulses">
          {PATHS.map((_, i) => {
            const dur = 5 + ((i * 1.3) % 5)
            const begin = `-${((i * 1.9) % dur).toFixed(2)}s`
            return (
              <circle key={i} r="3" opacity="0">
                <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.2 1">
                  <mpath href={`#ae${i}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.15;0.8;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
              </circle>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
