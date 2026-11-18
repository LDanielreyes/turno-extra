import './AccessStage.css'

// Escenario del login: la noche de un turno extra contada en un solo ciclo de 12 s.
// El reloj de marca (el mismo dial del cierre de la landing) emite la oferta en ondas; la banca orbita alrededor,
// cada persona se enciende cuando la onda la alcanza, dos aceptan y su trazo vuelve al reloj: el cupo queda 2/2.
// Encima, dos piezas reales del producto con texto de verdad: el turno en el panel y el chat de WhatsApp
// (o, en modo Personal, el mensaje con el código de acceso). Sin movimiento, todo queda en el estado final.

const C = { x: 430, y: 560 }
const polar = (deg, r) => [C.x + r * Math.sin((deg * Math.PI) / 180), C.y - r * Math.cos((deg * Math.PI) / 180)]

const R = 200
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const hr = i % 5 === 0
  const [x1, y1] = polar(i * 6, hr ? R - 30 : R - 16)
  const [x2, y2] = polar(i * 6, R - 4)
  return { i, hr, x1, y1, x2, y2 }
})
const NUMS = [['00', 0], ['15', 90], ['30', 180], ['45', 270]].map(([t, a]) => {
  const [x, y] = polar(a, R - 50)
  return { t, x, y: y + 6 }
})

// Aguja ahusada como polígono ya girado (sin transform: el estilo de transform-origin del campo no la desplaza).
// deg: ángulo desde las 12; len: largo; tail: cola tras el eje; wb / wt: ancho en la base y en la punta.
function hand(deg, len, tail, wb, wt) {
  const a = (deg * Math.PI) / 180
  const ux = Math.sin(a), uy = -Math.cos(a) // hacia la punta
  const px = -uy, py = ux // perpendicular
  const pt = (along, side) => `${(C.x + ux * along + px * side).toFixed(1)} ${(C.y + uy * along + py * side).toFixed(1)}`
  return `M${pt(-tail, -wb / 2)}L${pt(len, -wt / 2)}L${pt(len, wt / 2)}L${pt(-tail, wb / 2)}z`
}

// Órbitas de la banca. La onda tarda 3.6 s en llegar a r = 480: cada persona se enciende con ese retraso.
const ORBITS = [300, 400]
const PEOPLE = [
  [300, 22], [300, 76], [300, 124, 'a'], [300, 168], [300, 248], [300, 332],
  [400, 46], [400, 98], [400, 148], [400, 194], [400, 236], [400, 300, 'b'], [400, 352],
].map(([r, a, pick]) => {
  const [x, y] = polar(a, r)
  const [ex, ey] = polar(a, R + 6)
  return { r, a, pick, x, y, ex, ey, delay: `${((r / 480) * 3.6).toFixed(2)}s` }
})

function Person({ p }) {
  return (
    <g className={`st-person${p.pick ? ` is-pick st-pick--${p.pick}` : ''}`} style={{ '--wd': p.delay }} transform={`translate(${p.x} ${p.y})`}>
      {p.pick && <circle className="st-pickring" r="34" />}
      <circle className="st-person__disc" r="21" />
      <circle className="st-person__glyph" cy="-5" r="5.6" />
      <path className="st-person__glyph" d="M-10 12a10 10 0 0 1 20 0z" />
      {p.pick && (
        <text className="st-person__tag" y={p.y > C.y ? 56 : -44} textAnchor="middle">Aceptó</text>
      )}
    </g>
  )
}

function Field() {
  const picks = PEOPLE.filter((p) => p.pick)
  return (
    <svg className="st-field" viewBox="0 0 900 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {ORBITS.map((r) => <circle key={r} className="st-orbit" cx={C.x} cy={C.y} r={r} />)}
      {[0, 1, 2].map((i) => (
        <circle key={i} className={`st-wave st-wave--${i}`} cx={C.x} cy={C.y} r="480" vectorEffect="non-scaling-stroke" />
      ))}
      {picks.map((p) => (
        <path key={p.pick} className={`st-return st-return--${p.pick}`} pathLength="100" d={`M${p.x} ${p.y}L${p.ex} ${p.ey}`} />
      ))}
      {PEOPLE.map((p) => <Person key={`${p.r}-${p.a}`} p={p} />)}

      <g className="st-dial">
        <circle className="st-dial__face" cx={C.x} cy={C.y} r={R} />
        <circle className="st-dial__rim" cx={C.x} cy={C.y} r={R + 14} />
        {/* el anillo exterior es el cupo: se llena a la mitad con el primer «acepto» y completo con el segundo */}
        <path className="st-dial__fill" pathLength="100" d={`M${C.x} ${C.y - R - 14}a${R + 14} ${R + 14} 0 1 1 0 ${2 * (R + 14)}a${R + 14} ${R + 14} 0 1 1 0 ${-2 * (R + 14)}`} />
        {TICKS.filter((t) => !t.hr).map((t) => <line key={t.i} className="st-dial__min" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />)}
        {TICKS.filter((t) => t.hr).map((t) => (
          <line key={t.i} className={t.i === 0 ? 'st-dial__hr st-dial__hr--top' : 'st-dial__hr'} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
        ))}
        {NUMS.map((n) => <text key={n.t} className="st-dial__num" x={n.x} y={n.y} textAnchor="middle">{n.t}</text>)}
        {/* esfera de marca: el nombre bajo las 12, como en un reloj, y el horario del turno abajo */}
        <text className="st-dial__brand" x={C.x} y={C.y - 74} textAnchor="middle">TurnoExtra</text>
        <text className="st-dial__shift" x={C.x} y={C.y + 92} textAnchor="middle">22:00 – 04:00</text>
        {/* agujas fijas en las 22:00, la hora del turno */}
        <path className="st-dial__hh" d={hand(300, 96, 16, 10, 7)} />
        <path className="st-dial__mh" d={hand(0, 156, 22, 7, 4)} />
        <g className="st-dial__hand">
          <line x1={C.x} y1={C.y + 36} x2={C.x} y2={C.y - R + 10} />
          <circle cx={C.x} cy={C.y - R + 22} r="4.5" />
        </g>
        <circle className="st-dial__pivot" cx={C.x} cy={C.y} r="9" />
        <circle className="st-dial__pin" cx={C.x} cy={C.y} r="3" />
      </g>
    </svg>
  )
}

const Slot = ({ k }) => <i className="st-slot"><u className={k} /></i>

export default function AccessStage({ mode = 'admin' }) {
  return (
    <div className="stage" data-mode={mode} aria-hidden="true">
      <p className="stage__hour">22:00</p>
      <div className="stage__cycle">
        <Field />

        {/* turno en el panel de la empresa */}
        <article className="st-card st-ticket">
          <header className="st-card__bar">
            <span className="st-live"><i />en vivo</span>
            <span className="st-state">
              <b className="sk-0-53">Abierto</b>
              <b className="sk-53-100 is-done">Cubierto</b>
            </span>
          </header>
          <p className="st-ticket__role">Mesero</p>
          <p className="st-ticket__when">Hoy · 22:00 – 04:00 · Salón principal</p>
          <div className="st-ticket__cupos">
            <span className="st-ticket__count">
              <b className="sk-0-40">0/2</b>
              <b className="sk-40-53">1/2</b>
              <b className="sk-53-100">2/2</b>
            </span>
            <span className="st-slots"><Slot k="sk-40-100" /><Slot k="sk-53-100" /></span>
          </div>
          <p className="st-ticket__reach">Oferta enviada a 13 personas de tu banca</p>
        </article>

        {/* mensaje con el código de acceso (modo Personal) */}
        <article className="st-card st-code">
          <header className="st-card__bar">
            <span className="st-from"><span className="st-avatar" />TurnoExtra</span>
            <small>ahora</small>
          </header>
          <p className="st-code__msg">Tu código para entrar a TurnoExtra:</p>
          <span className="st-code__cells">
            {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ '--i': i }}><u /></i>)}
          </span>
          <p className="st-code__exp">Vence en 10 minutos. No lo compartas.</p>
        </article>

        {/* chat de la persona que acepta */}
        <article className="st-card st-chat">
          <header className="st-card__bar">
            <span className="st-from"><span className="st-avatar" />TurnoExtra</span>
            <small>en línea</small>
          </header>
          <div className="st-chat__body">
            <p className="st-bub st-bub--in sk-8-100">
              Turno extra: mesero, hoy 22:00. ¿Lo tomas?
              <span className="st-bub__btns"><b>Acepto</b><b>No puedo</b></span>
            </p>
            <p className="st-bub st-bub--out sk-30-100">Acepto</p>
            <p className="st-bub st-bub--in sk-41-100">Listo, el cupo es tuyo.</p>
          </div>
        </article>
      </div>
    </div>
  )
}
