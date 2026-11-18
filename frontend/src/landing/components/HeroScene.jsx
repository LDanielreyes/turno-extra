import { Isotype } from './Logo'
import './HeroScene.css'

// Escena del producto, dibujada (no es captura): el panel del gerente y el WhatsApp de una persona
// de la banca, sincronizados en un ciclo de 12 s. Los estados son los del flujo real:
// oferta enviada → leído → aceptado → cupo cubierto. Sin cifras de clientes ni métricas.
const Person = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0z" />
  </svg>
)

// [quién, ventana en la que se ve "Leído"]; los dos primeros aceptan (2 cupos).
const ROWS = [
  { who: 'Favorito', read: 'k-14-26', ok: 'k-26-100' },
  { who: 'Favorito', read: 'k-14-40', ok: 'k-40-100' },
  { who: 'Banca', read: 'k-14-100' },
  { who: 'Banca', read: 'k-14-100' },
  { who: 'Banca', read: 'k-14-100' },
]

// Hilo entre el panel y el teléfono: la oferta viaja punteada hasta el chat (solo en layout="stack").
const Wire = () => (
  <svg className="scene__wire" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
    <path d="M10 0 C 10 70, 120 40, 196 96" pathLength="100" />
    <circle r="4"><animateMotion dur="2.8s" repeatCount="indefinite" path="M10 0 C 10 70, 120 40, 196 96" /></circle>
  </svg>
)

// layout="stack": panel arriba y teléfono abajo a la derecha, sin taparse (hero de la landing).
export default function HeroScene({ labels, only, layout, rows = ROWS.length }) {
  const [sent, accepted, covered] = labels
  const stack = layout === 'stack'
  const phone = only !== 'panel' && (
    <div className="phone-wrap">
      <div className="phone">
        <div className="phone__top">
          <Isotype size={20} decorative />
          <span>TurnoExtra</span>
          <small>en línea</small>
        </div>
        <div className="phone__chat">
          <p className="bub bub--in k-4-100">
            Turno extra disponible: mesero, esta noche. ¿Lo tomas?
            <span className="bub__btns"><b>Acepto</b><b>No puedo</b></span>
          </p>
          <p className="bub bub--out k-26-100">Acepto</p>
          <p className="bub bub--in k-30-100">Listo, el cupo es tuyo.</p>
        </div>
      </div>
    </div>
  )
  return (
    <div className={stack ? 'scene scene--stack' : 'scene'} aria-hidden="true">
      <div className="scene__cycle">
        <div className="win">
          <div className="win__bar">
            <span className="win__dots"><i /><i /><i /></span>
            <span className="win__title mono">panel · turno abierto</span>
            <span className="win__live"><i />en vivo</span>
          </div>

          <div className="win__body">
            <div className="win__head">
              <div>
                <p className="win__role">Mesero</p>
                <p className="win__sub">Esta noche · salón principal</p>
              </div>
              <div className="win__cupos">
                <span className="mono win__count">
                  <b className="k-0-26">0/2</b>
                  <b className="k-26-40">1/2</b>
                  <b className="k-40-100">2/2</b>
                </span>
                <span className="win__slots">
                  <i><u className="k-26-100" /></i>
                  <i><u className="k-40-100" /></i>
                </span>
              </div>
            </div>

            <ul className="win__chips">
              <li><span className="dot"><b className="k-4-100" /></span>{sent}</li>
              <li><span className="dot"><b className="k-26-100" /></span>{accepted}</li>
              <li><span className="dot"><b className="k-40-100" /></span>{covered}</li>
            </ul>

            <ul className="win__rows">
              {ROWS.slice(0, rows).map((r, i) => (
                <li key={i} className="prow">
                  <span className="prow__av"><Person /></span>
                  <span className="prow__who">{r.who}</span>
                  <span className="prow__st">
                    <span className="k-0-14">Enviado</span>
                    <span className={r.read}>Leído</span>
                    {r.ok && <span className={`prow__ok ${r.ok}`}>Aceptado</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {stack ? <div className="scene__low"><Wire />{phone}</div> : phone}
      </div>
    </div>
  )
}
