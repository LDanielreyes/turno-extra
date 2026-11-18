import { useState } from 'react'
import useMeta from './useMeta'
import { site } from '../config/site'
import Backdrop from '../components/Backdrop'
import { Notes } from '../components/PageArt'
import { home } from '../content/home'
import Crops from '../../shared/Crops'
import '../components/PageHead.css'
import './pages.css'
import './form.css'

const validate = (f, v) => {
  if (f.required && !v.trim()) return 'Completa este campo.'
  if (f.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) return 'Escribe un correo válido, por ejemplo nombre@negocio.com.'
  if (f.type === 'tel' && v && v.replace(/\D/g, '').length < 7) return 'Escribe un celular válido.'
  return ''
}

const AUTOCOMPLETE = { nombre: 'name', correo: 'email', celular: 'tel' }

// Íconos de trazo para «qué pasa después»: formulario, chat, panel.
const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
)
const NEXT_ICONS = [
  () => <Ico d="M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h4" />,
  () => <Ico d="M4 5h16v11H11l-4 3.5V16H4zM8 10.5h8" />,
  () => <Ico d="M3 5h18v12H3zM8 21h8M12 17v4M7 13l3-3 2 2 4-4" />,
]

// Operar: formulario corto, etiquetas visibles, errores junto al campo, nada decorativo.
export default function Contacto({ content }) {
  useMeta(content.meta)
  const { fields, submit, consent, success, error } = content.form
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | sending | success | error

  const set = (name, v) => {
    setValues((p) => ({ ...p, [name]: v }))
    if (errors[name]) setErrors((p) => ({ ...p, [name]: '' }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    fields.forEach((f) => { next[f.name] = validate(f, values[f.name] ?? '') })
    setErrors(next)
    const first = fields.find((f) => next[f.name])
    if (first) { document.getElementById(`f-${first.name}`)?.focus(); return }

    // Sin destino configurado no se simula un envío exitoso.
    if (!site.links.formEndpoint) { setStatus('error'); return }
    setStatus('sending')
    try {
      const res = await fetch(site.links.formEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <main className="contact">
      <Backdrop variant="soft" />
      <div className="container contact__in">
        <header className="contact__head">
          <h1 className="phead__title">{content.hero.title}</h1>
          <p className="phead__lede">{content.hero.lede}</p>
          <ol className="cnext" aria-label="Qué pasa después">
            {content.next.map((s, i) => {
              const Icon = NEXT_ICONS[i]
              return (
                <li key={s} className={i === 0 ? 'is-now' : undefined}>
                  <span className="cnext__ic"><Icon /></span>
                  <span>{s}</span>
                </li>
              )
            })}
          </ol>
          <Notes items={home.hero.sectors} />
        </header>

        <div className="form__plate plate">
          <Crops />
        {status === 'success' ? (
          <div className="form form--done" role="status">
            <h2>{success}</h2>
          </div>
        ) : (
          <form className="form" onSubmit={onSubmit} noValidate>
            {fields.map((f) => {
              const id = `f-${f.name}`
              const err = errors[f.name]
              const common = {
                id, name: f.name, value: values[f.name] ?? '', onChange: (e) => set(f.name, e.target.value),
                'aria-invalid': err ? 'true' : undefined, 'aria-describedby': err ? `${id}-e` : undefined,
                autoComplete: AUTOCOMPLETE[f.name],
              }
              return (
                <div key={f.name} className={`field${f.type === 'textarea' ? ' field--wide' : ''}`}>
                  <label htmlFor={id}>{f.label}{!f.required && <span> · opcional</span>}</label>
                  {f.type === 'select' ? (
                    <select {...common}>
                      <option value="">Elige una opción</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={4} {...common} />
                  ) : (
                    <input type={f.type} inputMode={f.type === 'tel' ? 'tel' : undefined} {...common} />
                  )}
                  {err && <p id={`${id}-e`} className="field__err">{err}</p>}
                </div>
              )
            })}

            <div className="form__foot">
              <button type="submit" className="btn btn--primary btn--lg" disabled={status === 'sending'}>
                {status === 'sending' ? 'Enviando…' : submit}
              </button>
              <p className="small">{consent}</p>
            </div>
            {status === 'error' && <p className="form__err" role="alert">{error}</p>}
          </form>
        )}
        </div>
      </div>
    </main>
  )
}
