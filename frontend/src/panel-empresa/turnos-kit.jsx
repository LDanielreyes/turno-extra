import { useEffect, useRef, useState } from 'react'
import Crops from '../shared/Crops'
import './turnos.css'

// Piezas del flujo de turnos: placa de la vista, boleto de papel y puestos como círculos.
// El boleto es la interfaz: se toca, se escribe y se marca sobre él (DESIGN.md §1.1–1.2).

export const TZ = 'America/Bogota'
const parts = (d, o) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, ...o }).format(new Date(d))
export const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d))
export const dayNum = (d) => parts(d, { day: 'numeric' })
export const weekday = (d) => parts(d, { weekday: 'short' }).replace('.', '')
export const month = (d) => parts(d, { month: 'short' }).replace('.', '')
export const hhmm = (d) => parts(d, { hour: '2-digit', minute: '2-digit', hour12: false })
export const hoursText = (a, b) => {
  const h = (new Date(b) - new Date(a)) / 3_600_000
  if (!(h > 0)) return '—'
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`
}
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Íconos de trazo (16 px, 1.5). Nada de glifos de texto como íconos.
const I = {
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  back: <path d="M9.5 3.5 5 8l4.5 4.5" />,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  x: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  search: <><circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3.3 3.3" /></>,
  scissors: <><circle cx="4" cy="4.5" r="2" /><circle cx="4" cy="11.5" r="2" /><path d="M5.6 5.7 14 12M5.6 10.3 14 4" /></>,
  arrow: <path d="M3 8h10M9 4l4 4-4 4" />,
}
export const TkIco = ({ name, size = 16, label }) => (
  <svg className="tk-ico" viewBox="0 0 16 16" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{I[name]}</svg>
)

// Placa de la vista: tinta, retícula de puntos, haz de brasa, marcas de corte, título + leyenda + datos.
export function Plate({ title, legend, facts, side, children, className = '' }) {
  return (
    <section className={`tk ${className}`}>
      <Crops />
      {(title || side) && (
        <header className="tk__head">
          <div className="tk__title">
            {title && <h1>{title}</h1>}
            {legend?.length > 0 && (
              <ul className="tk-key">
                {legend.map(([k, l]) => <li key={l}><i className={`tk-k tk-k--${k}`} aria-hidden="true" />{l}</li>)}
              </ul>
            )}
          </div>
          {facts?.length > 0 && (
            <dl className="tk__facts">
              {facts.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
            </dl>
          )}
          {side}
        </header>
      )}
      {children}
    </section>
  )
}

// Puestos como círculos: lleno = cubierto (con inicial si hay nombre), punteado con pulso = falta.
// Cuando el número de cubiertos sube entre consultas, los círculos nuevos hacen «pop».
export function Seats({ cupos, filled, names = [], max = 8, live = false, size = 'sm', label }) {
  const prev = useRef(filled)
  const [popFrom, setPopFrom] = useState(null)
  useEffect(() => {
    if (filled > prev.current) {
      setPopFrom(prev.current)
      const t = setTimeout(() => setPopFrom(null), 900)
      prev.current = filled
      return () => clearTimeout(t)
    }
    prev.current = filled
    return undefined
  }, [filled])
  const shown = Math.min(cupos, max)
  return (
    <span className={`tk-seats tk-seats--${size}`} role="img" aria-label={label ?? `${filled} de ${cupos} puestos cubiertos`}>
      {Array.from({ length: shown }, (_, i) => {
        const on = i < filled
        const pop = on && popFrom != null && i >= popFrom
        return (
          <i key={i} className={`tk-seat${on ? ' is-on' : live ? ' is-live' : ''}${pop ? ' is-pop' : ''}`}>
            {on && names[i] ? names[i].slice(0, 1).toUpperCase() : null}
          </i>
        )
      })}
      {cupos > shown && <b className="tk-seats__more">+{cupos - shown}</b>}
    </span>
  )
}

// Sello de estado sobre el papel.
const STAMP = { cancelado: 'Cancelado', completado: 'Completado', vencido: 'Vencido', cubierto: 'Cubierto' }
export const Stamp = ({ estado }) => (STAMP[estado] ? <span className={`tk-stamp tk-stamp--${estado}`} aria-hidden="true">{STAMP[estado]}</span> : null)
