import { useId } from 'react'
import { errorText } from '../shared/api'
import Crops from '../shared/Crops'
import './kit.css'

// Piezas propias del panel de super admin. Mismo sistema (tokens de theme.css), con más presencia que el kit genérico.

// Bloque de trabajo: cabecera con título, dato al lado y acciones; cuerpo libre.
export function Panel({ title, meta, actions, tone, icon, className = '', children }) {
  return (
    <section className={`ak-panel${tone ? ` ak-panel--${tone}` : ''} ${className}`}>
      <Crops />
      {(title || actions) && (
        <header className="ak-panel__head">
          <div className="ak-panel__title">
            {icon && <span className="ak-panel__ico" aria-hidden="true">{icon}</span>}
            {title && <h2>{title}</h2>}
            {meta != null && <span className="ak-panel__meta">{meta}</span>}
          </div>
          {actions && <div className="ak-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="ak-panel__body">{children}</div>
    </section>
  )
}

// Campo: etiqueta + ayuda a la derecha, control con prefijo/sufijo opcional, error o estado debajo.
export function AkField({ label, hint, prefix, suffix, status, error, as: As = 'input', className = '', children, ...p }) {
  const id = useId()
  return (
    <div className={`ak-field ${className}`}>
      <div className="ak-field__top">
        <label htmlFor={id}>{label}</label>
        {hint && <span>{hint}</span>}
      </div>
      <div className={`ak-ctl${As === 'textarea' ? ' ak-ctl--area' : ''}${error ? ' is-bad' : ''}`}>
        {prefix && <span className="ak-ctl__fix">{prefix}</span>}
        <As id={id} aria-invalid={error ? 'true' : undefined} {...p}>{children}</As>
        {suffix && <span className="ak-ctl__fix ak-ctl__fix--end">{suffix}</span>}
      </div>
      {error ? <p className="ak-field__msg is-bad">{error}</p> : status ? <p className={`ak-field__msg is-${status.tone}`}>{status.text}</p> : null}
    </div>
  )
}

// Selector de opciones grandes (radio con apariencia de tarjeta).
export function Choice({ name, value, onChange, options, cols = 2 }) {
  return (
    <div className="ak-choice" role="radiogroup" style={{ '--cols': cols }}>
      {options.map((o) => (
        <label key={o.value} className={`ak-choice__opt${value === o.value ? ' is-on' : ''}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="ak-choice__dot" aria-hidden="true" />
          <span className="ak-choice__txt">
            <strong>{o.label}</strong>
            {o.sub && <small>{o.sub}</small>}
          </span>
          {o.aside && <span className="ak-choice__aside">{o.aside}</span>}
        </label>
      ))}
    </div>
  )
}

// Estado en texto con punto: tone = on (vigente/activo) | ok | next | (neutro).
export const Badge = ({ tone, children }) => <span className={`ak-badge${tone ? ` ak-badge--${tone}` : ''}`}>{children}</span>

// Monograma de organización: iniciales.
export function Monogram({ name }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return <span className="ak-mono" aria-hidden="true">{ini || '·'}</span>
}

export const Alert = ({ tone = 'ok', children }) => (
  <p className={`ak-alert ak-alert--${tone}`} role={tone === 'ok' ? 'status' : 'alert'}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {tone === 'ok' ? <path d="M5 10.5l3.2 3.2L15 7" /> : <path d="M10 5.5v5.5M10 14.2v.3" />}
    </svg>
    <span>{children}</span>
  </p>
)

export const AkError = ({ error }) => (error ? <Alert tone="bad">{errorText(error)}</Alert> : null)

// Estado vacío: qué falta y dónde se resuelve.
export function Vacant({ title, art, children }) {
  return (
    <div className="ak-vacant">
      {art && <span className="ak-vacant__art">{art}</span>}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}

// Iconos de trazo para acciones dentro de filas.
export const Ico = {
  x: <svg className="ak-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>,
  doc: <svg className="ak-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 2.8h6.2l2.8 2.8v11.6H5.5z" /><path d="M11.5 2.8v3h3M8 10h4.5M8 13h4.5" /></svg>,
  chev: <svg className="ak-ico ak-ico--chev" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 8l3 3 3-3" /></svg>,
  search: <svg className="ak-ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5" /><path d="M13 13l3.5 3.5" /></svg>,
  check: <svg className="ak-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" /></svg>,
}
