// Escenario de cada sección: título, contexto, los datos clave en una línea y la escena dibujada con datos reales.
// facts = [[valor, etiqueta], ...]; el valor se lee en primer plano y la etiqueta lo acompaña.
import Crops from '../shared/Crops'

// legend = [[forma, etiqueta], ...]: la clave del dibujo en vez de explicarlo con un párrafo (DESIGN.md §1.2).
export default function Masthead({ title, lede, facts, art, actions, legend }) {
  return (
    <header className="mh">
      <Crops />
      <div className="mh__text">
        <h1>{title}</h1>
        {lede && <p className="mh__lede">{lede}</p>}
        {legend?.length > 0 && (
          <ul className="mh__key">
            {legend.map(([k, l]) => <li key={l}><i className={`mh-k mh-k--${k}`} aria-hidden="true" />{l}</li>)}
          </ul>
        )}
        {facts?.length > 0 && (
          <dl className="mh__facts">
            {facts.map(([v, l]) => (
              <div key={l}><dt>{l}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
        {actions && <div className="mh__actions">{actions}</div>}
      </div>
      {art && <div className="mh__art" aria-hidden="true">{art}</div>}
    </header>
  )
}
