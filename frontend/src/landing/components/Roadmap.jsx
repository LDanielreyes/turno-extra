import Crops from '../../shared/Crops'
import './Roadmap.css'

// Hoja de ruta honesta (DESIGN.md §8): lo que ya funciona (marcado) y lo que viene (punteado).
// El tablero de impacto solo muestra mediciones reales del piloto; mientras no las haya, sus medidores quedan vacíos.
const Gauge = () => (
  <svg viewBox="0 0 120 70" className="rm__gauge" aria-hidden="true">
    <path d="M10 64a50 50 0 0 1 100 0" className="rm__arc" />
    <path d="M10 64a50 50 0 0 1 100 0" className="rm__arc rm__arc--scan" pathLength="100" />
    <circle cx="60" cy="64" r="4" className="rm__pin" />
  </svg>
)

export default function Roadmap({ content }) {
  const { now, next, impact } = content
  return (
    <section className="rm" aria-labelledby="rm-title">
      <div className="container">
        <h2 id="rm-title" className="rm__title">{content.title}</h2>
        <div className="rm__plate plate">
          <Crops />
          <div className="rm__col">
            <h3 className="rm__label rm__label--now"><i className="rm__dot" />{now.label}</h3>
            <ul className="rm__list">
              {now.items.map((it) => (
                <li key={it} className="is-on">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>{it}
                </li>
              ))}
            </ul>
          </div>
          <div className="rm__col rm__col--next">
            <h3 className="rm__label"><i className="rm__dot rm__dot--next" />{next.label}</h3>
            <ul className="rm__list">
              {next.items.map((it) => <li key={it}><i className="rm__ghost" aria-hidden="true" />{it}</li>)}
            </ul>
          </div>
          <div className="rm__impact">
            <h3 className="rm__label">{impact.label}</h3>
            <ul className="rm__meters">
              {impact.metrics.map((m) => (
                <li key={m}>
                  <Gauge />
                  <b>{m}</b>
                  <span className="mono">{impact.empty}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
