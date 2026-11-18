import './AccessArt.css'

// Dibujos 2D de la pantalla de acceso. Cuentan el producto (la oferta sale a la banca, el primero que acepta ocupa el cupo)
// con el mismo lenguaje de la landing: formas planas, filete de 1 px, un solo acento de brasa por dibujo.
// Con movimiento reducido cada dibujo queda en su estado final (cupo cubierto), sin perder información.

const NODES = [[92, 96], [388, 84], [430, 232], [372, 352], [232, 386], [84, 326], [52, 214]]
const PICKS = [2, 5]

// Red: el panel (centro) reparte la oferta a la banca; dos personas aceptan y los dos cupos del panel se llenan.
export function NetworkScene() {
  return (
    <svg className="aa aa-net" viewBox="0 0 480 420" aria-hidden="true">
      {NODES.map(([x, y], i) => <path key={`l${i}`} className="aa-link" d={`M240 210L${x} ${y}`} />)}
      {NODES.map(([x, y], i) => (
        <path key={`p${i}`} className="aa-pulse" pathLength="100" d={`M240 210L${x} ${y}`} style={{ '--d': `${i * 0.22}s` }} />
      ))}
      {NODES.map(([x, y], i) => {
        const pick = PICKS.includes(i)
        return (
          <g key={i} className={`aa-person${pick ? ' is-pick' : ''}`} style={{ '--d': `${i * 0.22}s` }}>
            {pick && <circle className={`aa-pickring aa-pickring--${PICKS.indexOf(i)}`} cx={x} cy={y} r="27" />}
            <circle className="aa-head" cx={x} cy={y - 6} r="7" />
            <path className="aa-body" d={`M${x - 12} ${y + 14}a12 12 0 0 1 24 0z`} />
          </g>
        )
      })}
      <g className="aa-hub">
        <rect className="aa-hub-body" x="186" y="172" width="108" height="76" rx="14" />
        <path className="aa-stroke" d="M186 196h108" />
        <circle className="aa-dot" cx="202" cy="184" r="2.6" />
        <circle className="aa-dot aa-dim" cx="212" cy="184" r="2.6" />
        <circle className="aa-dot aa-dim" cx="222" cy="184" r="2.6" />
        <rect className="aa-slot-box" x="204" y="210" width="30" height="24" rx="6" />
        <rect className="aa-slot-box" x="246" y="210" width="30" height="24" rx="6" />
        <rect className="aa-slot aa-slot--0" x="204" y="210" width="30" height="24" rx="6" />
        <rect className="aa-slot aa-slot--1" x="246" y="210" width="30" height="24" rx="6" />
      </g>
    </svg>
  )
}

// Panel: la lista de turnos de la empresa. Un turno pasa de «Abierto» a «Cubierto» cuando se llena el segundo cupo.
export function PanelScene() {
  const rows = [
    { y: 92, state: 'done' },
    { y: 158, state: 'live' },
    { y: 224, state: 'open' },
  ]
  return (
    <svg className="aa aa-panel" viewBox="0 0 460 320" aria-hidden="true">
      <rect className="aa-win" x="6" y="6" width="448" height="308" rx="18" />
      <path className="aa-stroke" d="M6 46h448" />
      <circle className="aa-dot" cx="30" cy="26" r="3.2" />
      <circle className="aa-dot aa-dim" cx="44" cy="26" r="3.2" />
      <circle className="aa-dot aa-dim" cx="58" cy="26" r="3.2" />
      <g className="aa-livepill">
        <rect x="364" y="16" width="72" height="20" rx="10" />
        <circle cx="378" cy="26" r="3" />
        <text x="388" y="29.5">En vivo</text>
      </g>
      <path className="aa-stroke" d="M96 46v268" />
      {[84, 112, 140, 168].map((y, i) => (
        <rect key={y} className={`aa-fillbar${i === 0 ? ' is-on' : ''}`} x="22" y={y} width={i === 0 ? 52 : 40 + (i % 2) * 8} height="8" rx="4" />
      ))}
      <rect className="aa-fillbar" x="118" y="66" width="96" height="10" rx="5" />
      {rows.map((r) => (
        <g key={r.y} className={`aa-row aa-row--${r.state}`}>
          <rect className="aa-row-box" x="118" y={r.y} width="316" height="52" rx="12" />
          <rect className="aa-fillbar" x="134" y={r.y + 14} width="74" height="8" rx="4" />
          <rect className="aa-fillbar aa-dim" x="134" y={r.y + 30} width="48" height="6" rx="3" />
          <rect className="aa-slot-box" x="262" y={r.y + 14} width="24" height="24" rx="7" />
          <rect className="aa-slot-box" x="294" y={r.y + 14} width="24" height="24" rx="7" />
          <rect className="aa-slot aa-slot--a" x="262" y={r.y + 14} width="24" height="24" rx="7" />
          <rect className="aa-slot aa-slot--b" x="294" y={r.y + 14} width="24" height="24" rx="7" />
          <rect className="aa-chip-box" x="340" y={r.y + 14} width="80" height="24" rx="12" />
          <text className="aa-chip aa-chip--open" x="380" y={r.y + 30} textAnchor="middle">Abierto</text>
          <text className="aa-chip aa-chip--done" x="380" y={r.y + 30} textAnchor="middle">Cubierto</text>
        </g>
      ))}
    </svg>
  )
}

const Tick = ({ x, y }) => <path className="aa-tick" d={`M${x} ${y}l5 5 10-11`} />

// Teléfono: el chat de WhatsApp. Llega la oferta con botones, la persona acepta y el cupo queda confirmado.
export function PhoneOfferScene() {
  return (
    <svg className="aa aa-phone" viewBox="0 0 260 460" aria-hidden="true">
      <rect className="aa-win" x="6" y="6" width="248" height="448" rx="36" />
      <rect className="aa-fillbar aa-dim" x="104" y="20" width="52" height="8" rx="4" />
      <path className="aa-stroke" d="M6 60h248" />
      <circle className="aa-avatar" cx="38" cy="86" r="14" />
      <rect className="aa-fillbar" x="62" y="76" width="84" height="8" rx="4" />
      <rect className="aa-fillbar aa-dim" x="62" y="92" width="50" height="6" rx="3" />
      <g className="aa-msg aa-msg--1">
        <rect className="aa-bubble" x="22" y="128" width="190" height="104" rx="16" />
        <rect className="aa-fillbar" x="38" y="144" width="150" height="8" rx="4" />
        <rect className="aa-fillbar" x="38" y="162" width="118" height="8" rx="4" />
        <rect className="aa-fillbar aa-dim" x="38" y="180" width="84" height="6" rx="3" />
        <rect className="aa-btn aa-btn--yes" x="38" y="198" width="74" height="22" rx="11" />
        <rect className="aa-btn" x="120" y="198" width="74" height="22" rx="11" />
      </g>
      <g className="aa-msg aa-msg--2">
        <rect className="aa-bubble aa-bubble--out" x="118" y="254" width="118" height="38" rx="16" />
        <rect className="aa-fillbar aa-fillbar--ink" x="136" y="269" width="64" height="8" rx="4" />
      </g>
      <g className="aa-msg aa-msg--3">
        <rect className="aa-bubble" x="22" y="314" width="176" height="64" rx="16" />
        <circle className="aa-okdot" cx="46" cy="346" r="14" />
        <Tick x={39} y={346} />
        <rect className="aa-fillbar" x="70" y="334" width="104" height="8" rx="4" />
        <rect className="aa-fillbar aa-dim" x="70" y="352" width="72" height="6" rx="3" />
      </g>
    </svg>
  )
}

// Teléfono con código: así entra el personal (el código llega por su canal activo). Los dígitos van ocultos.
export function PhoneCodeScene() {
  return (
    <svg className="aa aa-phone aa-phone--code" viewBox="0 0 260 460" aria-hidden="true">
      <rect className="aa-win" x="6" y="6" width="248" height="448" rx="36" />
      <rect className="aa-fillbar aa-dim" x="104" y="20" width="52" height="8" rx="4" />
      <path className="aa-stroke" d="M6 60h248" />
      <circle className="aa-avatar" cx="38" cy="86" r="14" />
      <rect className="aa-fillbar" x="62" y="76" width="84" height="8" rx="4" />
      <rect className="aa-fillbar aa-dim" x="62" y="92" width="50" height="6" rx="3" />
      <g className="aa-msg aa-msg--1">
        <rect className="aa-bubble" x="22" y="128" width="216" height="112" rx="16" />
        <rect className="aa-fillbar" x="38" y="144" width="150" height="8" rx="4" />
        <rect className="aa-fillbar aa-dim" x="38" y="160" width="96" height="6" rx="3" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <rect className="aa-slot-box" x={38 + i * 32} y="184" width="26" height="36" rx="8" />
            <circle className="aa-digit" style={{ '--i': i }} cx={51 + i * 32} cy="202" r="3.6" />
          </g>
        ))}
      </g>
      <g className="aa-msg aa-msg--3">
        <rect className="aa-bubble" x="22" y="262" width="176" height="64" rx="16" />
        <circle className="aa-okdot" cx="46" cy="294" r="14" />
        <Tick x={39} y={294} />
        <rect className="aa-fillbar" x="70" y="282" width="104" height="8" rx="4" />
        <rect className="aa-fillbar aa-dim" x="70" y="300" width="72" height="6" rx="3" />
      </g>
    </svg>
  )
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
// 0 = libre, 1 = turno cubierto; el hueco es la celda [1][4]
const GRID = [
  [1, 1, 0, 1, 1, 0, 0],
  [1, 0, 1, 1, 'gap', 1, 0],
  [0, 1, 1, 0, 1, 1, 1],
  [1, 1, 0, 1, 1, 0, 1],
]

// Planilla de turnos sobre papel: un hueco en la semana, la oferta lo marca con brasa y queda cubierto.
export function ShiftSheetScene() {
  return (
    <svg className="aa aa-sheet" viewBox="0 0 480 360" aria-hidden="true">
      <rect className="aa-sheet-page" x="6" y="6" width="468" height="348" rx="10" />
      <g className="aa-sheet-days">
        {DAYS.map((d, i) => <text key={i} x={150 + i * 44} y="44" textAnchor="middle">{d}</text>)}
      </g>
      <path className="aa-sheet-rule" d="M24 58h432" />
      {GRID.map((row, r) => (
        <g key={r}>
          <rect className="aa-sheet-name" x="28" y={86 + r * 62} width={56 + (r % 2) * 14} height="8" rx="4" />
          <rect className="aa-sheet-name aa-dim" x="28" y={102 + r * 62} width="36" height="6" rx="3" />
          {row.map((c, i) => {
            const x = 128 + i * 44
            const y = 74 + r * 62
            if (c === 'gap') {
              return (
                <g key={i} className="aa-gap">
                  <rect className="aa-gap-cell" x={x} y={y} width="40" height="40" rx="8" />
                  <rect className="aa-gap-fill" x={x} y={y} width="40" height="40" rx="8" />
                  <path className="aa-gap-check" d={`M${x + 10} ${y + 21}l8 8 14-16`} />
                </g>
              )
            }
            return <rect key={i} className={c ? 'aa-sheet-cell is-on' : 'aa-sheet-cell'} x={x} y={y} width="40" height="40" rx="8" />
          })}
        </g>
      ))}
      <path className="aa-gap-ring" pathLength="100" d="M286 134c-2-17 17-27 36-22 22 6 28 27 16 42-12 14-37 16-50 2-8-9-6-18-2-24" />
    </svg>
  )
}
