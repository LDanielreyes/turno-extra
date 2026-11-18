import { IcoG } from './icons'
import { KIND, STATUS_TEXT, ringOf } from './model'

// Red de propagación (variante B3): el turno en el centro y cada persona en el anillo de su ronda.
// Solo nombres en el dibujo; el estado lo dan forma y color (leyenda aparte) y el <title> de cada nodo.
const CX = 280, CY = 270
const R = { 1: 90, 2: 150, 3: 205 }
const RING_ICON = { 1: 'star', 2: 'people', 3: 'clock' }
const EDGE = { ok: 'e-ok', x: 'e-x', now: 'e-live', live: 'e-live', wait: 'e-wait', off: 'e' }

function place(ofertas) {
  const byRing = { 1: [], 2: [], 3: [] }
  ofertas.forEach((o) => byRing[ringOf(o)].push(o))
  const out = []
  for (const r of [1, 2, 3]) {
    const list = byRing[r]
    const off = r === 1 ? -110 : r === 2 ? -72 : -58 // desfase por anillo para que no se alineen las aristas
    list.forEach((o, i) => {
      const a = ((off + (360 / Math.max(list.length, 1)) * i) * Math.PI) / 180
      out.push({ o, r, c: Math.cos(a), s: Math.sin(a), x: CX + R[r] * Math.cos(a), y: CY + R[r] * Math.sin(a) })
    })
  }
  return out
}

export default function PropagationNet({ ofertas, center, label }) {
  const nodes = place(ofertas)
  const used = new Set(nodes.map((n) => n.r))
  return (
    <svg className="lv-net" viewBox="0 20 560 500" role="img" aria-label={label}>
      {[1, 2, 3].map((r) => (
        <circle key={r} cx={CX} cy={CY} r={R[r]} className={r === 3 ? 'ring ring--wait' : 'ring'} />
      ))}
      {nodes.map(({ o, x, y }) => <line key={`e${o.id}`} x1={CX} y1={CY} x2={x} y2={y} className={EDGE[KIND[o.status]] ?? 'e'} />)}
      {[1, 2, 3].filter((r) => used.has(r)).map((r) => {
        const a = (160 * Math.PI) / 180
        const x = CX + R[r] * Math.cos(a), y = CY + R[r] * Math.sin(a)
        return (
          <g key={`rb${r}`} className="rb">
            <circle cx={x} cy={y} r="15" />
            <IcoG name={RING_ICON[r]} x={x} y={y} />
          </g>
        )
      })}
      {nodes.map(({ o, x, y, c, s }) => {
        const k = KIND[o.status] ?? 'off'
        const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'
        const lx = x + c * 26
        const ly = anchor === 'middle' ? (s < 0 ? y - 26 : y + 36) : y + s * 26 + 5
        return (
          <g key={o.id} className={`nd nd--${k}`}>
            <title>{`${o.nombre}: ${STATUS_TEXT[o.status] ?? o.status}`}</title>
            {k === 'now' && <circle cx={x} cy={y} r="14" className="ping" />}
            <circle cx={x} cy={y} r="14" />
            <IcoG name={o.canal ?? 'whatsapp'} x={x} y={y} />
            <text x={lx} y={ly} textAnchor={anchor}>{o.nombre}</text>
          </g>
        )
      })}
      <g className="hub">{center}</g>
    </svg>
  )
}

// Centro: reloj de arco hasta la siguiente ronda, o puestos cubiertos cuando ya no hay más rondas.
export function HubClock({ remainingMs, totalMs }) {
  const C = 2 * Math.PI * 66
  const frac = totalMs ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0
  const m = Math.floor(remainingMs / 60_000), s = Math.floor((remainingMs % 60_000) / 1000)
  return (
    <>
      <circle cx={CX} cy={CY} r="66" className="hub__bg" />
      <circle cx={CX} cy={CY} r="66" className="hub__arc" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform={`rotate(-90 ${CX} ${CY})`} />
      <circle cx={CX} cy={CY} r="56" className="hub__c" />
      <IcoG name="clock" x={CX} y={CY - 27} size={14} />
      <text x={CX} y={CY + 10} textAnchor="middle" className="hub__v">{`${m}:${String(s).padStart(2, '0')}`}</text>
      <text x={CX} y={CY + 30} textAnchor="middle" className="hub__s">próxima ronda</text>
    </>
  )
}

export function HubSeats({ confirmados, cupos }) {
  const C = 2 * Math.PI * 66
  const frac = cupos ? Math.min(1, confirmados / cupos) : 0
  return (
    <>
      <circle cx={CX} cy={CY} r="66" className="hub__bg" />
      <circle cx={CX} cy={CY} r="66" className={frac >= 1 ? 'hub__arc hub__arc--ok' : 'hub__arc'} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform={`rotate(-90 ${CX} ${CY})`} />
      <circle cx={CX} cy={CY} r="56" className="hub__c" />
      <text x={CX} y={CY + 10} textAnchor="middle" className="hub__v">{`${confirmados}/${cupos}`}</text>
      <text x={CX} y={CY + 30} textAnchor="middle" className="hub__s">cubiertos</text>
    </>
  )
}
