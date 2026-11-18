import { useId } from 'react'
import { errorText } from './api'
import Crops from './Crops'
import './ui.css'

export function Btn({ variant, size, loading, disabled, children, className = '', ...p }) {
  const cls = ['btn', variant && `btn--${variant}`, size && `btn--${size}`, className].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} aria-busy={loading || undefined} {...p} disabled={loading || disabled}>
      {children}
    </button>
  )
}

export function Field({ label, hint, error, wide, custom, children, as: As = 'input', ...p }) {
  const id = useId()
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label htmlFor={id}>{label} {hint && <span>{hint}</span>}</label>
      {custom ? <div id={id}>{custom}</div> : <As id={id} aria-invalid={error ? 'true' : undefined} {...p}>{children}</As>}
      {error && <p className="field__err">{error}</p>}
    </div>
  )
}

// Cabecera de vista como placa (DESIGN.md §1.1): título, una línea de contexto, datos clave y un dibujo opcional.
// facts = [[valor, etiqueta], ...]; art = SVG decorativo hecho con los datos de la vista.
export function PageTitle({ title, lede, actions, facts, art }) {
  return (
    <header className={`ptitle plate${art ? ' ptitle--art' : ''}`}>
      <Crops />
      <div className="ptitle__text">
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
        {facts?.length > 0 && (
          <dl className="ptitle__facts">
            {facts.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
      </div>
      {art && <div className="ptitle__art" aria-hidden="true">{art}</div>}
      {actions && <div className="ptitle__actions">{actions}</div>}
    </header>
  )
}

// Estados obligatorios de toda vista: cargando, vacío y error (doc §4).
export function Loading({ label = 'Cargando' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="state__dot" aria-hidden="true" /> {label}…
    </div>
  )
}
// Esqueleto de carga: reserva el espacio del contenido real para que la vista no salte al llegar los datos.
// Variantes: 'rows' (listas), 'table' (tablas), 'card' (tarjeta con campos), 'text' (párrafo corto).
export function Skeleton({ variant = 'rows', rows = 4, label = 'Cargando' }) {
  const bars = Array.from({ length: rows }, (_, i) => i)
  return (
    <div className={`skel skel--${variant}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <div aria-hidden="true" className="skel__body">
        {variant === 'table' && <div className="skel__row skel__row--head"><i /><i /><i /><i /></div>}
        {variant === 'card' && <i className="skel__title" />}
        {variant === 'text' && bars.slice(0, 3).map((n) => <i key={n} className="skel__line" />)}
        {variant === 'card' && bars.slice(0, 3).map((n) => <div key={n} className="skel__field"><i /><i /></div>)}
        {(variant === 'rows' || variant === 'table') && bars.map((n) => (
          <div key={n} className="skel__row">{variant === 'rows' && <i className="skel__av" />}<i /><i /><i />{variant === 'table' && <i />}</div>
        ))}
      </div>
    </div>
  )
}
// Puente mientras carga el código de una vista (lazy): reserva el escenario y el contenido del panel para que no haya salto.
export function PageSkeleton() {
  return (
    <div className="skel-page" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="skel-page__hero"><i className="skel-page__title" /><i /><i /></div>
      <div aria-hidden="true" className="skel-page__grid"><div><Skeleton variant="card" /></div><div><Skeleton variant="table" /></div></div>
    </div>
  )
}
export function Empty({ title, children, action }) {
  return (
    <div className="state state--empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <strong>{errorText(error)}</strong>
      {onRetry && <Btn size="sm" onClick={onRetry}>Reintentar</Btn>}
    </div>
  )
}

// Envuelve una consulta de TanStack Query con los tres estados.
export function Async({ q, empty, skeleton = 'rows', children }) {
  if (q.isPending) return <Skeleton variant={skeleton} />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (empty && empty(q.data)) return empty.node
  return children(q.data)
}

export function FormError({ error }) {
  return error ? <p className="form__err" role="alert">{errorText(error)}</p> : null
}

const TONES = {
  abierto: 'live', cubierto: 'ok', cancelado: 'off', vencido: 'warn', completado: 'ok',
  pendiente: 'warn', activo: 'ok', baja: 'off', baja_org: 'off',
  aprobado: 'ok', rechazado: 'bad',
  confirmed: 'ok', standby: 'warn', cancelled: 'off', completed: 'ok', no_show: 'bad', disputed: 'warn',
  abierta: 'warn', upheld: 'bad', reversed: 'ok',
}
const LABELS = {
  abierto: 'Abierto', cubierto: 'Cubierto', cancelado: 'Cancelado', vencido: 'Vencido', completado: 'Completado',
  pendiente: 'Pendiente', activo: 'Activo', baja: 'Baja', baja_org: 'Salió de la org',
  aprobado: 'Aprobado', rechazado: 'Rechazado',
  confirmed: 'Confirmado', standby: 'En espera', cancelled: 'Canceló', completed: 'Asistió', no_show: 'No asistió', disputed: 'En disputa',
  abierta: 'Abierta', upheld: 'Mantenida', reversed: 'Revertida',
}
export const Badge = ({ value }) => <span className={`badge badge--${TONES[value] ?? 'off'}`}>{LABELS[value] ?? value}</span>

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className={`toggle${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

export const Card = ({ title, actions, children, className = '' }) => (
  <section className={`card ${className}`}>
    <Crops />
    {(title || actions) && (
      <div className="card__head">
        {title && <h2>{title}</h2>}
        {actions}
      </div>
    )}
    {children}
  </section>
)
