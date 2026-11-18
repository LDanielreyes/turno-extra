import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, upload } from '../shared/api'
import { useSession } from '../shared/session'
import { docLabel, fmtTime } from '../shared/format'
import { Btn, ErrorState, Field, FormError } from '../shared/ui'
import Crops from '../shared/Crops'
import { Ico } from '../panel-empresa/live/icons'
import './yo.css'

// «Mi espacio»: la placa del candidato. Cada turno es un tiquete, cada canal un enchufe en el orden en que
// llegan las ofertas y cada acción sobre tus datos una palanca con seguro. Todo reacciona a lo que
// responde el backend (apps/api/src/routes/candidate.ts): GET /yo, PUT /yo/canales, POST /yo/disputas, /yo/baja, /yo/borrar.

const CANAL = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Correo' }
const HOW = { whatsapp: 'Escribe ALTA al número de TurnoExtra', telegram: 'Envía /start al bot', email: 'Abre el enlace de verificación' }
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const SEAL = { completed: 'Asistió', no_show: 'No asistió', cancelled: 'Canceló', disputed: 'En disputa' }
const FLASH_MS = 1600

const day = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? null : d }

export default function Yo() {
  const q = useQuery({ queryKey: ['yo'], queryFn: () => api('/yo') })
  const d = q.data
  const turnos = d?.turnos ?? []
  const now = Date.now()
  const live = (t) => (t.estado === 'confirmed' || t.estado === 'standby') && +new Date(t.fin) > now
  const upcoming = turnos.filter(live).sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio))
  const past = turnos.filter((t) => !live(t)).sort((a, b) => +new Date(b.inicio) - +new Date(a.inicio))
  const attended = turnos.filter((t) => t.estado === 'completed').length
  const active = (d?.canales ?? []).filter((c) => c.habilitado).length

  return (
    <section className="yo" aria-labelledby="yo-title">
      <Crops />
      <header className="yo__head">
        <div className="yo__title">
          <h1 id="yo-title">{d?.nombre ? `Hola, ${d.nombre}` : 'Mi espacio'}</h1>
          <ul className="yo-key" aria-label="Leyenda">
            <li><i className="yo-k yo-k--next" aria-hidden="true" />Próximo</li>
            <li><i className="yo-k yo-k--done" aria-hidden="true" />Asististe</li>
            <li><i className="yo-k yo-k--bad" aria-hidden="true" />Falta</li>
          </ul>
        </div>
        {q.isSuccess && (
          <dl className="yo__facts">
            <div><dt>{upcoming.length === 1 ? 'turno próximo' : 'turnos próximos'}</dt><dd>{upcoming.length}</dd></div>
            <div><dt>{attended === 1 ? 'asistido' : 'asistidos'}</dt><dd>{attended}</dd></div>
            <div><dt>{active === 1 ? 'canal activo' : 'canales activos'}</dt><dd>{active}</dd></div>
          </dl>
        )}
      </header>

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
        <DocsAviso />
        <div className="yo__stage">
          <Turnos loading={q.isPending} upcoming={upcoming} past={past} ventana={d?.ventanaDisputaDias} />
          <aside className="yo__side">
            <Canales loading={q.isPending} canales={d?.canales ?? []} />
            <Documentos />
            <Datos />
          </aside>
        </div>
        </>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- turnos */

function Turnos({ loading, upcoming, past, ventana }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [flash, setFlash] = useState(null)
  const timer = useRef()
  useEffect(() => () => clearTimeout(timer.current), [])
  const dispute = useMutation({
    mutationFn: (assignmentId) => api('/yo/disputas', { method: 'POST', body: { assignmentId, motivo: motivo.trim() } }),
    onSuccess: async (_, id) => {
      setOpen(null); setMotivo(''); setFlash(id)
      await qc.invalidateQueries({ queryKey: ['yo'] })
      timer.current = setTimeout(() => setFlash(null), FLASH_MS)
    },
  })
  const toggle = (id) => { dispute.reset(); setOpen(open === id ? null : id) }

  if (loading) {
    return (
      <div className="yo-tix-wrap" aria-busy="true" aria-label="Cargando tus turnos">
        <ol className="yo-tix">{[0, 1, 2].map((i) => <li key={i}><span className="yo-tk is-ghost" /></li>)}</ol>
      </div>
    )
  }
  if (!upcoming.length && !past.length) {
    return (
      <div className="yo-tix-wrap">
        <div className="yo-blank" role="status">
          <span className="yo-tk is-ghost yo-tk--lone" aria-hidden="true" />
          <strong>Todavía no tienes turnos</strong>
          <span>Cuando aceptes una oferta, tu tiquete aparece aquí.</span>
        </div>
      </div>
    )
  }
  const render = (t, i) => (
    <li key={t.assignmentId} className="yo-tix__item" style={{ '--i': i }}>
      <Ticket t={t} open={open === t.assignmentId} flash={flash === t.assignmentId} onToggle={() => toggle(t.assignmentId)}>
        <form className="yo-dsp" onSubmit={(e) => { e.preventDefault(); dispute.mutate(t.assignmentId) }}>
          <Field label="¿Qué pasó?" as="textarea" required minLength={10} maxLength={500} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} hint={ventana ? `Tienes ${ventana} días para disputar una marca.` : undefined} />
          <FormError error={dispute.error} />
          <div className="yo-dsp__acts">
            <Btn type="submit" variant="primary" size="sm" loading={dispute.isPending}>Enviar disputa</Btn>
            <Btn type="button" variant="ghost" size="sm" onClick={() => toggle(t.assignmentId)}>Cancelar</Btn>
          </div>
        </form>
      </Ticket>
    </li>
  )
  return (
    <div className="yo-tix-wrap">
      {upcoming.length > 0 && (<><h2 className="yo-h">Próximos</h2><ol className="yo-tix">{upcoming.map(render)}</ol></>)}
      {past.length > 0 && (<><h2 className="yo-h">Anteriores</h2><ol className="yo-tix">{past.map((t, i) => render(t, i + upcoming.length))}</ol></>)}
    </div>
  )
}

function Ticket({ t, open, flash, onToggle, children }) {
  const d = day(t.inicio)
  const tone = t.estado === 'completed' ? 'done' : t.estado === 'no_show' ? 'bad' : t.estado === 'confirmed' || t.estado === 'standby' ? 'next' : 'off'
  const seal = SEAL[t.estado]
  return (
    <article className={`yo-tk is-${tone}${open ? ' is-open' : ''}`} aria-label={`${t.rol}, ${t.org}`}>
      <div className="yo-tk__main">
        <div className="yo-tk__date" aria-hidden="true">
          <span>{d ? WD[d.getDay()] : '—'}</span>
          <b>{d ? d.getDate() : '—'}</b>
          <span>{d ? MES[d.getMonth()] : ''}</span>
        </div>
        <div className="yo-tk__body">
          <strong className="yo-tk__rol">{t.rol}</strong>
          <span className="yo-tk__org">{t.org}</span>
          <span className="yo-tk__hrs"><Ico name="clock" size={14} />{fmtTime(t.inicio)}–{fmtTime(t.fin)}</span>
        </div>
        {seal && <span className={`yo-tk__seal${flash ? ' is-drop' : ''}`}>{seal}</span>}
      </div>
      {t.disputable && (
        <button type="button" className="yo-tk__tear" aria-expanded={open} onClick={onToggle}>
          <Ico name="scale" size={15} />{open ? 'Cerrar' : 'Disputar esta marca'}
        </button>
      )}
      {open && children}
    </article>
  )
}

/* ---------------------------------------------------------------- canales */

function Canales({ loading, canales }) {
  const qc = useQueryClient()
  const sorted = [...canales].sort((a, b) => a.prioridad - b.prioridad)
  const [moved, setMoved] = useState(null)
  const timer = useRef()
  useEffect(() => () => clearTimeout(timer.current), [])
  const save = useMutation({
    mutationFn: (prioridad) => api('/yo/canales', { method: 'PUT', body: { prioridad } }),
    onSuccess: async (_, prioridad) => {
      setMoved(prioridad[0])
      await qc.invalidateQueries({ queryKey: ['yo'] })
      timer.current = setTimeout(() => setMoved(null), FLASH_MS)
    },
  })
  const makeFirst = (canal) => save.mutate([canal, ...sorted.filter((c) => c.habilitado && c.canal !== canal).map((c) => c.canal)])

  return (
    <section className="yo-card" aria-labelledby="yo-ch">
      <h2 id="yo-ch" className="yo-h">Por dónde te llegan las ofertas</h2>
      <p className="yo-note">Una oferta llega por un solo canal a la vez, en este orden. Toca uno activo para ponerlo primero.</p>
      <ol className="yo-plugs">
        {loading ? [0, 1, 2].map((i) => <li key={i}><span className="yo-plug is-ghost" /></li>) : sorted.map((c, i) => {
          const first = i === 0 && c.habilitado
          const name = CANAL[c.canal] ?? c.canal
          const inner = (
            <>
              <span className="yo-plug__n" aria-hidden="true">{c.habilitado ? i + 1 : ''}</span>
              <Ico name={c.canal} size={20} />
              <span className="yo-plug__txt">
                <strong>{name}</strong>
                <small>{c.habilitado ? (first ? 'Primero en llegar' : 'Respaldo') : HOW[c.canal]}</small>
              </span>
              <i className="yo-plug__lamp" aria-hidden="true" />
            </>
          )
          const cls = `yo-plug${c.habilitado ? ' is-on' : ''}${first ? ' is-first' : ''}${moved === c.canal ? ' is-moved' : ''}`
          return (
            <li key={c.canal}>
              {c.habilitado && !first
                ? <button type="button" className={cls} disabled={save.isPending} aria-label={`Poner ${name} como canal prioritario`} onClick={() => makeFirst(c.canal)}>{inner}</button>
                : <div className={cls}>{inner}</div>}
            </li>
          )
        })}
      </ol>
      <FormError error={save.error} />
    </section>
  )
}

/* ---------------------------------------------------------------- documentos */

const ESTADO_DOC = { pendiente: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado' }
const fechaDoc = (iso) => { const d = day(`${String(iso).slice(0, 10)}T12:00:00`); return d ? `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` : '' }
const hoy = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)

// Aviso arriba de todo: sin los documentos obligatorios aprobados no llegan ofertas, y el candidato no tiene por qué adivinarlo.
function DocsAviso() {
  const q = useQuery({ queryKey: ['yo', 'documentos'], queryFn: () => api('/yo/documentos') })
  const reqs = (q.data?.organizaciones ?? []).flatMap((o) => o.requisitos.filter((r) => r.obligatorio).map((r) => ({ org: o.org, ...r })))
  const vigente = (r) => r.documento?.estado === 'aprobado' && (!r.vigenciaRequerida || (r.documento.venceAt && String(r.documento.venceAt).slice(0, 10) >= hoy()))
  const subir = reqs.filter((r) => !r.documento || r.documento.estado === 'rechazado' || (r.documento.estado === 'aprobado' && !vigente(r)))
  const revision = reqs.filter((r) => r.documento?.estado === 'pendiente')
  if (!subir.length && !revision.length) return null
  // Sin almacenamiento no hay dónde subir: no se le pide al candidato algo que no puede hacer.
  if (q.data && !q.data.archivos) {
    return (
      <div className="yo-alert" role="status">
        <Ico name="doc" size={16} />
        <p><strong>Tu empresa te pide documentos, pero la carga está desactivada por ahora.</strong> Avísale a tu empresa; en cuanto se active podrás subirlos aquí, en «Mis documentos».</p>
      </div>
    )
  }
  const names = [...new Set(subir.map((r) => docLabel(r.tipo)))]
  return (
    <div className={`yo-alert${subir.length ? ' is-todo' : ''}`} role={subir.length ? 'alert' : 'status'}>
      <Ico name="doc" size={16} />
      <p>
        {subir.length
          ? <><strong>Te falta subir {names.join(', ')}.</strong> Sin los documentos obligatorios aprobados no te llegan ofertas. Súbelos en «Mis documentos».</>
          : <><strong>Tus documentos están en revisión.</strong> Cuando la empresa los apruebe empezarán a llegarte ofertas.</>}
      </p>
      <a href="#yo-dc" className="yo-alert__go" onClick={(e) => { e.preventDefault(); document.getElementById('yo-dc')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>Ir a mis documentos</a>
    </div>
  )
}

// Lo que cada organización te pide según tu rol. Tú subes el archivo; la empresa lo revisa.
function Documentos() {
  const q = useQuery({ queryKey: ['yo', 'documentos'], queryFn: () => api('/yo/documentos') })
  const orgs = q.data?.organizaciones ?? []
  return (
    <section className="yo-card" aria-labelledby="yo-dc">
      <h2 id="yo-dc" className="yo-h">Mis documentos</h2>
      {q.isPending ? <span className="yo-plug is-ghost" /> : q.isError ? <FormError error={q.error} /> : !orgs.length ? (
        <p className="yo-note">Cuando una empresa te agregue a su banca, aquí verás los documentos que pide tu rol.</p>
      ) : (
        <>
          <p className="yo-note">Sube una foto o PDF (hasta 5 MB). Sin los documentos obligatorios aprobados y vigentes no te llegan ofertas de esa empresa.</p>
          {!q.data.archivos && <p className="yo-note">La carga de archivos no está disponible por ahora.</p>}
          {orgs.map((o) => (
            <div key={o.orgId} className="yo-docs">
              <h3 className="yo-docs__org">{o.org} <small>· {o.rol}</small></h3>
              <ul className="yo-docs__list">
                {o.requisitos.map((r) => <Requisito key={r.tipo} orgId={o.orgId} r={r} enabled={q.data.archivos} />)}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

function Requisito({ orgId, r, enabled }) {
  const qc = useQueryClient()
  const d = r.documento
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState(null)
  const [vence, setVence] = useState('')
  const expired = d?.estado === 'aprobado' && d.venceAt && String(d.venceAt).slice(0, 10) < hoy()
  const estado = expired ? 'Vencido' : d ? ESTADO_DOC[d.estado] : 'Falta'
  const tone = expired || !d || d.estado === 'rechazado' ? 'bad' : d.estado === 'aprobado' ? 'ok' : 'wait'
  const send = useMutation({
    mutationFn: () => upload(`/yo/documentos?${new URLSearchParams({ orgId, tipo: r.tipo, ...(vence ? { vence } : {}) })}`, file),
    onSuccess: async () => { setOpen(false); setFile(null); setVence(''); await qc.invalidateQueries({ queryKey: ['yo', 'documentos'] }) },
  })
  const ready = file && (!r.vigenciaRequerida || vence)
  return (
    <li className={`yo-doc is-${tone}`}>
      <div className="yo-doc__row">
        <div className="yo-doc__txt">
          <strong>{docLabel(r.tipo)}</strong>
          <small>{d?.venceAt ? `vence ${fechaDoc(d.venceAt)}` : r.vigenciaRequerida ? 'requiere vencimiento' : 'sin vencimiento'}{r.obligatorio ? '' : ' · opcional'}</small>
        </div>
        <span className="yo-doc__state">{estado}</span>
        {enabled && (!d || d.estado !== 'pendiente') && (
          <button type="button" className="yo-doc__btn" aria-expanded={open} onClick={() => { send.reset(); setOpen(!open) }}>{d ? 'Subir de nuevo' : 'Subir'}</button>
        )}
      </div>
      {open && (
        <form className="yo-doc__form" onSubmit={(e) => { e.preventDefault(); if (ready) send.mutate() }}>
          <input type="file" accept="image/jpeg,image/png,application/pdf" aria-label={`Archivo de ${docLabel(r.tipo)}`} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {r.vigenciaRequerida && <input type="date" min={hoy()} aria-label="Fecha de vencimiento" title="Fecha de vencimiento" value={vence} onChange={(e) => setVence(e.target.value)} />}
          <FormError error={send.error} />
          <Btn type="submit" size="sm" variant="primary" loading={send.isPending} disabled={!ready}>Enviar</Btn>
        </form>
      )}
    </li>
  )
}

/* ---------------------------------------------------------------- datos */

function Datos() {
  const { logout } = useSession()
  const [step, setStep] = useState(null) // 'baja' | 'borrar'
  const run = useMutation({
    mutationFn: (s) => api(s === 'baja' ? '/yo/baja' : '/yo/borrar', { method: 'POST' }),
    // Tras borrar la sesión ya no es válida; tras BAJA se cierra para que no quede una sesión sin sentido.
    onSuccess: () => { setStep(null); logout() },
  })
  const lever = (id, title, text, warn) => (
    <li className={`yo-lever${step === id ? ' is-armed' : ''}`}>
      <div className="yo-lever__txt"><strong>{title}</strong><span>{text}</span></div>
      {step === id ? (
        <div className="yo-lever__confirm" role="alert">
          <span>{warn}</span>
          <span className="yo-lever__acts">
            <Btn size="sm" variant="primary" loading={run.isPending} onClick={() => run.mutate(id)}>Sí, continuar</Btn>
            <Btn size="sm" variant="ghost" disabled={run.isPending} onClick={() => { run.reset(); setStep(null) }}>No</Btn>
          </span>
        </div>
      ) : (
        <button type="button" className="yo-lever__btn" disabled={run.isPending} onClick={() => { run.reset(); setStep(id) }}>
          <Ico name={id === 'baja' ? 'door' : 'trash'} size={16} />{title}
        </button>
      )}
    </li>
  )
  return (
    <section className="yo-card" aria-labelledby="yo-dt">
      <h2 id="yo-dt" className="yo-h">Tus datos</h2>
      <ul className="yo-levers">
        {lever('baja', 'Darme de baja', 'Detiene todas las ofertas y cancela tus turnos pendientes.', 'Dejarás de recibir ofertas de todas las organizaciones.')}
        {lever('borrar', 'Borrar mis datos', 'Elimina tu nombre, celular y canales. Los turnos pasados quedan anónimos.', 'No se puede deshacer.')}
      </ul>
      <FormError error={run.error} />
    </section>
  )
}
