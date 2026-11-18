import Backdrop from './Backdrop'
import { Isotype } from './Logo'
import Crops from '../../shared/Crops'
import './Trust.css'

// Reglas de juego, dibujadas: quién hace qué (TurnoExtra conecta, tu negocio contrata y paga),
// lo que TurnoExtra NO hace tachado, y las tres garantías para la persona (ALTA, BAJA, registro).
const Shop = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M8 20v20h32V20M5 20l4-12h30l4 12zM20 40V29h8v11" />
    <path className="tr__draw" d="M5 20c0 3 3 5 6.5 5S18 23 18 20c0 3 3 5 6 5s6-2 6-5c0 3 3 5 6.5 5S43 23 43 20" />
  </svg>
)
const Chat = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M8 10h32v22H22l-8 7v-7H8z" />
    <path className="tr__draw" d="M15 21l5 5 10-10" />
  </svg>
)
const Door = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M12 40V8h18v32M8 40h32" />
    <path className="tr__draw" d="M30 24h12m-4-4 4 4-4 4" />
  </svg>
)
const Log = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="10" y="6" width="28" height="36" rx="4" />
    <path className="tr__draw" d="M17 16h14M17 24h14M17 32h8" />
  </svg>
)
const icons = [Chat, Door, Log]

export default function Trust({ content }) {
  const [tx, biz] = content.roles
  return (
    <section className="tr" aria-labelledby="tr-title">
      <Backdrop variant="rings" className="bd--trust" />
      <div className="container">
        <div className="tr__panel plate">
          <Crops />
          <div className="tr__lead">
            <h2 id="tr-title" className="tr__title">{content.title}</h2>
            <p className="sr-only">{content.body}</p>

            <div className="tr__roles" aria-hidden="true">
              <div className="tr__role">
                <span className="tr__badge tr__badge--tx"><Isotype size={30} decorative /></span>
                <b>{tx.who}</b><span>{tx.does}</span>
              </div>
              <svg className="tr__link" viewBox="0 0 120 24" preserveAspectRatio="none">
                <path d="M2 12h112" /><path d="M106 5l8 7-8 7" />
              </svg>
              <div className="tr__role tr__role--biz">
                <span className="tr__badge"><Shop /></span>
                <b>{biz.who}</b><span>{biz.does}</span>
              </div>
            </div>

            <ul className="tr__nots" aria-label="TurnoExtra no">
              {content.nots.map((n) => (
                <li key={n}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <ul className="tr__points">
            {content.points.map((p, i) => {
              const Icon = icons[i]
              return (
                <li key={p.key}>
                  <Icon />
                  <span>
                    {p.key !== 'LOG' && <b className="tr__key mono">{p.key}</b>}
                    {p.text}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
