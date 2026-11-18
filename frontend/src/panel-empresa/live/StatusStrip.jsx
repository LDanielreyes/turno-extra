import { Ico } from './icons'

// Franja de estado visual (DESIGN.md §1.2): puestos como círculos, rondas como pasos con íconos.
// Sin frases: cada pieza se entiende por forma; el detalle va en aria-label.
export default function StatusStrip({ cupos, asignados, wave, estado }) {
  const seats = Array.from({ length: cupos }, (_, i) => asignados[i] ?? null)
  const faltan = Math.max(0, cupos - asignados.length)
  const shown = seats.slice(0, 8)
  const steps = [
    { icon: 'star', label: 'Favoritos' },
    { icon: 'people', label: 'Tu banca' },
    { icon: 'check', label: 'Cubierto' },
  ]
  const at = estado === 'cubierto' || faltan === 0 ? 2 : Math.max(0, wave - 1)
  return (
    <div className="lv-strip">
      <div className="lv-seats" role="img" aria-label={`${asignados.length} de ${cupos} puestos cubiertos${faltan ? `, faltan ${faltan}` : ''}`}>
        {shown.map((p, i) => (
          <span key={i} className={p ? 'lv-seat is-on' : 'lv-seat'}>
            <span className="lv-seat__av">{p ? p.slice(0, 1).toUpperCase() : <i className="lv-dot" />}</span>
            <span className="lv-seat__n">{p ?? (i === asignados.length ? `falta ${faltan}` : '')}</span>
          </span>
        ))}
        {seats.length > shown.length && <span className="lv-seat__more mono">+{seats.length - shown.length}</span>}
      </div>
      <ol className="lv-steps" aria-label={`Paso ${at + 1} de 3: ${steps[at].label}`}>
        {steps.map((s, i) => (
          <li key={s.label} className={i < at ? 'is-done' : i === at ? 'is-now' : undefined}>
            <span className="lv-steps__ic"><Ico name={s.icon} /></span>
            <small>{s.label}</small>
          </li>
        ))}
      </ol>
    </div>
  )
}
