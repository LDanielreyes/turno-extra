import HeroScene from './HeroScene'
import { Isotype } from './Logo'
import { home } from '../content/home'
import './PageArt.css'

// Los dibujos del hero (panel + WhatsApp), llevados a las vistas interiores. Cada vista usa la pieza
// que cuenta su historia. Todo es dibujo, no captura; los estados son los del flujo real del producto.

// Panel del negocio y WhatsApp del personal, juntos (Cómo funciona).
export function SceneBoth() {
  return <div className="pa pa--scene"><HeroScene labels={home.hero.chips} /></div>
}

// Solo el panel (Para negocios): quien administra.
export function ScenePanel() {
  return <div className="pa pa--scene pa--panel"><HeroScene labels={home.hero.chips} only="panel" /></div>
}

// Solo el WhatsApp de una persona de la banca. flow="alta" cuenta entrar y aceptar; "baja", salir.
const FLOWS = {
  alta: [
    ['out', 'k-4-100', 'ALTA'],
    ['in', 'k-14-100', 'Listo, ya estás en la banca. Escribe BAJA cuando quieras salir.'],
    ['in', 'k-26-100', 'Turno extra disponible: mesero, esta noche. ¿Lo tomas?', true],
    ['out', 'k-40-100', 'Acepto'],
    ['in', 'k-52-100', 'Listo, el cupo es tuyo.'],
  ],
  baja: [
    ['out', 'k-4-100', 'BAJA'],
    ['in', 'k-14-100', 'Listo, ya no recibirás mensajes. Escribe ALTA si quieres volver.'],
  ],
}

export function PhoneChat({ flow = 'alta' }) {
  return (
    <div className={`pa pa--phone pa--${flow}`}>
      <div className="scene__cycle">
        <div className="phone-wrap">
          <div className="phone">
            <div className="phone__top"><Isotype size={20} decorative /><span>TurnoExtra</span><small>en línea</small></div>
            <div className="phone__chat">
              {FLOWS[flow].map(([dir, k, text, btns], i) => (
                <p key={i} className={`bub bub--${dir} ${k}`}>
                  {text}
                  {btns && <span className="bub__btns"><b>Acepto</b><b>No puedo</b></span>}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Notas pegadas flotando (como las del hero). pos: [izquierda %, arriba %, rotación °]
const POS = [[4, 10, -6], [38, 2, 5], [62, 22, -3], [14, 52, 7], [50, 56, -5], [76, 62, 4]]

export function Notes({ items }) {
  return (
    <ul className="pnotes" aria-hidden="true">
      {items.map((t, i) => {
        const [l, tp, r] = POS[i % POS.length]
        return <li key={t} className="note" style={{ left: `${l}%`, top: `${tp}%`, '--r': `${r}deg`, '--d': `${0.6 + i * 0.25}s`, '--f': `${7 + (i % 4)}s` }}>{t}</li>
      })}
    </ul>
  )
}
