import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { api, errorText } from '../shared/api'
import { fmtDate } from '../shared/format'
import { useSession } from '../shared/session'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, useOrg } from './org'
import './ajustes.css'

// Ajustes como tablero: cada parámetro es un instrumento que se mueve con la mano y dibuja su efecto;
// los avisos son una centralita de palancas (evento × canal) y los canales del gerente son dos teléfonos
// con el mismo peso: WhatsApp (número + código) y Telegram (enlace del bot). Todo responde a lo que confirma el backend.

const PARAMS = [
  { k: 'waveMinutes', name: 'Entre rondas', unit: 'min', min: 1, max: 30, hint: 'Cada cuánto sale la siguiente ronda de aviso' },
  { k: 'descansoMinH', name: 'Descanso mínimo', unit: 'h', min: 0, max: 24, hint: 'Horas entre un turno y el siguiente de la misma persona' },
  { k: 'topeSemanalH', name: 'Tope semanal', unit: 'h', min: 1, max: 60, hint: 'Horas máximas por persona y semana' },
  { k: 'standbyMax', name: 'En espera', unit: 'pers.', min: 0, max: 10, hint: 'Personas en espera por turno cuando se llenan los puestos' },
  { k: 'relaunchLimit', name: 'Relanzamientos', unit: 'veces', min: 0, max: 5, hint: 'Veces que se vuelve a buscar si nadie acepta' },
]
const EVENTS = {
  cancelacion_asistencia: ['Cancela asistencia', 'Alguien cancela su asistencia a un turno'],
  baja_con_turnos: ['Baja con turnos', 'Se da de baja alguien con turnos confirmados'],
  turno_vencido: ['Turno sin cubrir', 'Un turno venció sin cubrirse'],
  disputa_abierta: ['Disputa abierta', 'Alguien contestó una inasistencia'],
}
const CHANNELS = [
  ['panel', 'Panel', 'en el panel'],
  ['email', 'Correo', 'por correo'],
  ['whatsapp', 'WhatsApp', 'por WhatsApp'],
  ['telegram', 'Telegram', 'por Telegram'],
]
const LOCK_HINT = { whatsapp: 'Verifica tu WhatsApp para usar este canal', telegram: 'Vincula tu Telegram para usar este canal' }

const I = {
  panel: <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="3.8" width="14.4" height="10" rx="1.2" /><path d="M7 16.5h6M10 13.8v2.7" /></svg>,
  email: <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="4.8" width="14.4" height="10.4" rx="1.2" /><path d="M3.2 5.6l6.8 5.2 6.8-5.2" /></svg>,
  whatsapp: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.2a6.8 6.8 0 0 0-5.9 10.2l-.9 3.4 3.5-.9A6.8 6.8 0 1 0 10 3.2z" /><path d="M7.6 8.2c.3 1.7 2 3.6 4.2 4.2" /></svg>,
  telegram: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M17.3 3.4 2.6 9.2l5.1 1.9 7.2-5.1-5.4 6.1.1 4.8 2.5-3.2 3.6 2.6z" /></svg>,
  open: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4.5H4.5v11h11V12M11 3.8h5.2V9M16 4l-7 7" /></svg>,
  lock: <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.4" /><path d="M7 9V6.8a3 3 0 0 1 6 0V9" /></svg>,
  check: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" /></svg>,
  minus: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10" /></svg>,
  plus: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10M10 5v10" /></svg>,
  warn: <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5l7 12.5H3z" /><path d="M10 8.5v3.5M10 14.2v.3" /></svg>,
}

export default function Ajustes() {
  const { orgId } = useOrg()
  const settings = useQuery({ queryKey: orgKey(orgId, 'settings'), queryFn: () => api(`/orgs/${orgId}/settings`) })
  const prefs = useQuery({ queryKey: ['me', 'prefs'], queryFn: () => api('/me/notification-prefs') })
  const wa = useQuery({ queryKey: ['me', 'wa'], queryFn: () => api('/me/notification-whatsapp') })
  const tg = useQuery({ queryKey: ['me', 'tg'], queryFn: () => api('/me/notification-telegram') })
  const linked = wa.data && tg.data ? Number(!!wa.data.verificado) + Number(!!tg.data.vinculado) : null
  const on = prefs.data?.prefs.reduce((s, p) => s + CHANNELS.filter(([c]) => p[c]).length, 0)

  return (
    <section className="aj" aria-labelledby="aj-title">
      <Crops />
      <header className="aj__head">
        <div className="aj__title">
          <h1 id="aj-title">Ajustes</h1>
          <ul className="aj-key">
            <li><i className="aj-k aj-k--dirty" aria-hidden="true" />Sin guardar</li>
            <li><i className="aj-k aj-k--on" aria-hidden="true" />Encendido</li>
            <li><i className="aj-k aj-k--off" aria-hidden="true" />Apagado</li>
          </ul>
        </div>
        <dl className="aj__facts">
          {settings.data && <div><dt>entre rondas</dt><dd>{settings.data.waveMinutes} min</dd></div>}
          {on != null && <div><dt>{on === 1 ? 'aviso encendido' : 'avisos encendidos'}</dt><dd>{on}</dd></div>}
          {linked != null && <div><dt>{linked === 1 ? 'canal vinculado' : 'canales vinculados'}</dt><dd>{linked}/2</dd></div>}
        </dl>
      </header>

      <Board q={settings} orgId={orgId} />
      <Switchboard q={prefs} locked={{ whatsapp: !wa.data?.verificado, telegram: !tg.data?.vinculado }} />
      <div className="aj__devices">
        <Phone q={wa} />
        <TgPhone q={tg} />
      </div>
    </section>
  )
}

const Retry = ({ q }) => (
  <div className="aj-err" role="alert">
    <span>{errorText(q.error)}</span>
    <Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn>
  </div>
)

/* ---------------- Tablero de instrumentos ---------------- */

function Board({ q, orgId }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState({})
  const [settled, setSettled] = useState([])
  const save = useMutation({
    mutationFn: (body) => api(`/orgs/${orgId}/settings`, { method: 'PATCH', body }),
    onSuccess: async (b) => {
      await qc.invalidateQueries({ queryKey: orgKey(orgId, 'settings') })
      setDraft({}); setSettled(Object.keys(b ?? {}))
    },
  })
  useEffect(() => {
    if (!settled.length) return
    const t = setTimeout(() => setSettled([]), 1600)
    return () => clearTimeout(t)
  }, [settled])

  const d = q.data
  const changed = d ? Object.keys(draft).filter((k) => draft[k] !== d[k]) : []
  const set = (k, v, p) => {
    const n = Math.min(p.max, Math.max(p.min, Math.round(Number(v) || 0)))
    setDraft((x) => ({ ...x, [k]: n }))
  }

  return (
    <section className="aj-sec" aria-labelledby="aj-ops">
      <h2 id="aj-ops" className="aj-sec__h">Operación</h2>
      {q.isError ? <Retry q={q} /> : (
        <form className="aj-board" onSubmit={(e) => { e.preventDefault(); if (changed.length) save.mutate(Object.fromEntries(changed.map((k) => [k, draft[k]]))) }}>
          <div className="aj-insts">
            {PARAMS.map((p) => {
              const v = d ? (draft[p.k] ?? d[p.k]) : null
              const dirty = changed.includes(p.k)
              return (
                <div key={p.k} className={`aj-inst${dirty ? ' is-dirty' : ''}${settled.includes(p.k) ? ' is-settled' : ''}${d ? '' : ' is-skel'}`}>
                  <div className="aj-inst__top">
                    <label htmlFor={`aj-${p.k}`} className="aj-inst__name" title={p.hint}>{p.name}</label>
                    <output htmlFor={`aj-${p.k}`} className="aj-inst__val" aria-live="polite">
                      {settled.includes(p.k) && <span className="aj-inst__ok" aria-hidden="true">{I.check}</span>}
                      {v ?? '–'}<small>{p.unit}</small>
                    </output>
                  </div>
                  <Gauge k={p.k} v={v ?? p.min} p={p} />
                  <div className="aj-ruler">
                    <button type="button" className="aj-step" aria-label={`Bajar ${p.name}`} disabled={!d || v <= p.min} onClick={() => set(p.k, v - 1, p)}>{I.minus}</button>
                    <div className="aj-ruler__track" style={{ '--pct': d ? (v - p.min) / (p.max - p.min) : 0 }}>
                      <input id={`aj-${p.k}`} type="range" min={p.min} max={p.max} step={1} value={v ?? p.min} disabled={!d}
                        aria-valuetext={`${v} ${p.unit}`} aria-describedby={`aj-${p.k}-h`} onChange={(e) => set(p.k, e.target.value, p)} />
                      <span className="aj-ruler__ticks" aria-hidden="true">
                        {Array.from({ length: Math.min(p.max - p.min, 30) + 1 }, (_, i) => <i key={i} />)}
                      </span>
                    </div>
                    <button type="button" className="aj-step" aria-label={`Subir ${p.name}`} disabled={!d || v >= p.max} onClick={() => set(p.k, v + 1, p)}>{I.plus}</button>
                  </div>
                  <div className="aj-ruler__ends" aria-hidden="true"><span>{p.min}</span><span>{p.max}</span></div>
                  <span id={`aj-${p.k}-h`} className="sr-only">{p.hint}</span>
                </div>
              )
            })}
          </div>
          <div className={`aj-board__bar${changed.length ? ' is-on' : ''}`}>
            {save.isError ? <span className="aj-board__msg is-bad" role="alert">{errorText(save.error)}</span>
              : <span className="aj-board__msg" aria-live="polite">{changed.length ? `${changed.length} ${changed.length === 1 ? 'cambio' : 'cambios'} sin guardar` : settled.length ? 'Guardado' : 'Todo guardado'}</span>}
            <Btn size="sm" variant="ghost" disabled={!changed.length || save.isPending} onClick={() => { setDraft({}); save.reset() }}>Deshacer</Btn>
            <Btn size="sm" type="submit" variant="primary" loading={save.isPending} disabled={!changed.length}>Guardar</Btn>
          </div>
        </form>
      )}
    </section>
  )
}

// El efecto del valor, dibujado. Se redibuja mientras se mueve el control.
function Gauge({ k, v }) {
  const W = 200
  let body
  if (k === 'waveMinutes') {
    const span = 30, n = Math.floor(span / v) + 1
    body = (
      <>
        <line className="aj-g__axis" x1="6" y1="24" x2={W - 6} y2="24" />
        {Array.from({ length: n }, (_, i) => {
          const x = 6 + ((i * v) / span) * (W - 12)
          return <circle key={i} className={`aj-g__ring${i === 0 ? ' is-first' : ''}`} cx={x} cy="24" r={n > 16 ? 2.6 : 4} />
        })}
        <text x="6" y="42">0</text><text x={W - 6} y="42" textAnchor="end">30 min</text>
      </>
    )
  } else if (k === 'descansoMinH') {
    const gap = (v / 24) * 128
    body = (
      <>
        <rect className="aj-g__shift" x="6" y="14" width="30" height="16" rx="3" />
        <rect className="aj-g__shift" x={36 + gap} y="14" width="30" height="16" rx="3" />
        {v > 0 && <path className="aj-g__gap" d={`M38 22H${34 + gap}`} />}
        <text x={36 + gap / 2} y="42" textAnchor="middle">{v ? `${v} h libres` : 'seguidos'}</text>
      </>
    )
  } else if (k === 'topeSemanalH') {
    const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'], per = v / 7, H = 26
    body = days.map((dd, i) => {
      const h = (Math.min(per, 12) / 12) * H
      return (
        <g key={i}>
          <rect className="aj-g__slot" x={14 + i * 26} y={4} width="16" height={H} rx="2" />
          <rect className="aj-g__fill" x={14 + i * 26} y={4 + H - h} width="16" height={h} rx="2" />
          <text x={22 + i * 26} y="42" textAnchor="middle">{dd}</text>
        </g>
      )
    })
  } else if (k === 'standbyMax') {
    body = Array.from({ length: 10 }, (_, i) => (
      <circle key={i} className={`aj-g__seat${i < v ? ' is-on' : ''}`} cx={14 + i * 19} cy="20" r="7" />
    ))
    body = <>{body}<text x="6" y="42">{v ? `${v} en espera` : 'sin espera'}</text></>
  } else {
    body = (
      <>
        {Array.from({ length: 5 }, (_, i) => (
          <g key={i} className={`aj-g__loop${i < v ? ' is-on' : ''}`} transform={`translate(${22 + i * 38} 20)`}>
            <path d="M8 -3a8 8 0 1 0 1 6" /><path d="M9.5 -8v5.5h-5.5" />
          </g>
        ))}
        <text x="6" y="42">{v ? `hasta ${v} ${v === 1 ? 'vez' : 'veces'}` : 'no se relanza'}</text>
      </>
    )
  }
  return <svg className="aj-g" viewBox={`0 0 ${W} 46`} aria-hidden="true">{body}</svg>
}

/* ---------------- Centralita de avisos ---------------- */

function Switchboard({ q, locked }) {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (prefs) => api('/me/notification-prefs', { method: 'PUT', body: { prefs } }),
    onSuccess: (d) => qc.setQueryData(['me', 'prefs'], d),
  })
  const [last, setLast] = useState(null)
  const shown = save.isPending ? save.variables : q.data?.prefs
  const flip = (evento, c) => {
    setLast(`${evento}:${c}`)
    save.mutate(shown.map((x) => (x.evento === evento ? { ...x, [c]: !x[c] } : x)))
  }

  return (
    <section className="aj-sec" aria-labelledby="aj-av">
      <h2 id="aj-av" className="aj-sec__h">Avisos</h2>
      {q.isError ? <Retry q={q} /> : (
        <div className="aj-sw" role="table" aria-label="Avisos por evento y canal">
          <div className="aj-sw__row aj-sw__row--head" role="row">
            <span role="columnheader"><span className="sr-only">Evento</span></span>
            {CHANNELS.map(([c, l]) => (
              <span key={c} role="columnheader" className={`aj-sw__ch${locked[c] ? ' is-locked' : ''}`}
                title={locked[c] ? LOCK_HINT[c] : l}>
                <span className="aj-sw__ico">{locked[c] ? I.lock : I[c]}</span><span className="aj-sw__lbl">{l}</span>
              </span>
            ))}
          </div>
          {(shown ?? Object.keys(EVENTS).map((evento) => ({ evento }))).map((p) => {
            const [short, long] = EVENTS[p.evento] ?? [p.evento, p.evento]
            return (
              <div key={p.evento} className="aj-sw__row" role="row">
                <span role="rowheader" className="aj-sw__ev" title={long}>{short}</span>
                {CHANNELS.map(([c, , how]) => {
                  const isLocked = !!locked[c]
                  const busy = save.isPending && last === `${p.evento}:${c}`
                  return (
                    <span key={c} role="cell" className="aj-sw__cell">
                      <button type="button" role="switch" aria-checked={!!p[c]} aria-label={`${long} ${how}`}
                        disabled={!q.data || isLocked || save.isPending}
                        className={`aj-lever${p[c] ? ' is-on' : ''}${busy ? ' is-busy' : ''}${q.data ? '' : ' is-skel'}`}
                        onClick={() => flip(p.evento, c)}>
                        <i className="aj-lever__lamp" /><i className="aj-lever__slot"><i className="aj-lever__knob" /></i>
                      </button>
                    </span>
                  )
                })}
              </div>
            )
          })}
          {save.isError && <p className="aj-sw__err" role="alert">{errorText(save.error)}</p>}
        </div>
      )}
    </section>
  )
}

/* ---------------- Teléfono: mi WhatsApp ---------------- */

function Phone({ q }) {
  const qc = useQueryClient()
  const { user } = useSession()
  const [celular, setCelular] = useState('')
  const [consent, setConsent] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [justVerified, setJustVerified] = useState(false)
  const done = (d) => qc.setQueryData(['me', 'wa'], d)
  const start = useMutation({ mutationFn: () => api('/me/notification-whatsapp', { method: 'PUT', body: { celular, consentimiento: true } }), onSuccess: (d) => { setCelular(''); setConsent(false); done(d) } })
  const verify = useMutation({ mutationFn: (c) => api('/me/notification-whatsapp/verify', { method: 'POST', body: { codigo: c } }), onSuccess: (d) => { setCodigo(''); setJustVerified(true); done(d) } })
  const drop = useMutation({ mutationFn: () => api('/me/notification-whatsapp', { method: 'DELETE' }), onSuccess: (d) => { done(d); setJustVerified(false); qc.invalidateQueries({ queryKey: ['me', 'prefs'] }) } })
  const err = start.error ?? verify.error ?? drop.error
  const d = q.data
  const state = !d ? 'load' : d.verificado ? 'ok' : d.configurado ? 'code' : 'num'
  const reset = () => { start.reset(); verify.reset(); drop.reset() }

  return (
    <section className="aj-sec aj-sec--phone" aria-labelledby="aj-wa">
      <h2 id="aj-wa" className="aj-sec__h">Mi WhatsApp</h2>
      {q.isError ? <Retry q={q} /> : (
        <div className={`aj-phone is-${state}${err ? ' is-err' : ''}`}>
          <span className="aj-phone__cam" aria-hidden="true" />
          <div className="aj-phone__screen">
            <div className="aj-phone__bar"><span className="aj-phone__ico">{I.whatsapp}</span><span>WhatsApp</span><small>Avisos urgentes</small></div>

            {state === 'load' && <div className="aj-phone__skel" aria-busy="true"><i /><i /><i /></div>}

            {state === 'num' && (
              <form className="aj-scr" onSubmit={(e) => { e.preventDefault(); reset(); start.mutate() }}>
                <label className="aj-scr__lbl" htmlFor="aj-cel">Tu celular</label>
                <div className="aj-tel">
                  <span>+57</span>
                  <input id="aj-cel" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="300 123 4567" required maxLength={30}
                    value={celular} onChange={(e) => setCelular(e.target.value)} />
                </div>
                <label className="aj-consent">
                  <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span className="aj-consent__box" aria-hidden="true">{I.check}</span>
                  <span>Autorizo que TurnoExtra me escriba por WhatsApp avisos urgentes de <b>{user?.email}</b>.</span>
                </label>
                <Btn type="submit" variant="primary" loading={start.isPending} disabled={!consent || !celular.trim()}>Enviarme un código</Btn>
              </form>
            )}

            {state === 'code' && (
              <form className="aj-scr" onSubmit={(e) => { e.preventDefault(); if (codigo.length === 6) { reset(); verify.mutate(codigo) } }}>
                <div className="aj-bubble">
                  <span>Tu código de verificación de TurnoExtra es</span>
                  <b aria-hidden="true">••• •••</b>
                  <small>a {d.celular}</small>
                </div>
                <Otp value={codigo} busy={verify.isPending} onChange={(c) => {
                  setCodigo(c)
                  if (c.length === 6 && !verify.isPending) { reset(); verify.mutate(c) }
                }} />
                <Btn type="submit" variant="primary" loading={verify.isPending} disabled={codigo.length !== 6}>Verificar</Btn>
                <button type="button" className="aj-link" disabled={drop.isPending} onClick={() => { reset(); drop.mutate() }}>Cambiar número</button>
              </form>
            )}

            {state === 'ok' && (
              <div className={`aj-scr aj-scr--ok${justVerified ? ' is-new' : ''}`}>
                <svg className="aj-seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" pathLength="1" /><path d="M21 33l7.5 7.5L44 25" pathLength="1" /></svg>
                <strong>Verificado</strong>
                <span className="aj-scr__num">{d.celular}</span>
              </div>
            )}

            {err && <p className="aj-scr__err" role="alert">{errorText(err)}</p>}
          </div>
          <span className="aj-phone__home" aria-hidden="true" />
        </div>
      )}
      {state === 'ok' && (
        <Btn size="sm" variant="ghost" className="aj-drop" loading={drop.isPending} onClick={() => { reset(); drop.mutate() }}>Retirar mi consentimiento</Btn>
      )}
    </section>
  )
}

// Seis casillas: un solo input real (pegar, autocompletar del SO) y las casillas lo dibujan.
function Otp({ value, onChange, busy }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className={`aj-otp${busy ? ' is-busy' : ''}`} onClick={() => ref.current?.focus()}>
      <input ref={ref} aria-label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} aria-hidden="true" className={`aj-otp__box${i === Math.min(value.length, 5) ? ' is-at' : ''}${value[i] ? ' is-full' : ''}`}>{value[i] ?? ''}</span>
      ))}
    </div>
  )
}

/* ---------------- Teléfono: mi Telegram ---------------- */

const WAIT_MS = 15 * 60_000

function TgPhone({ q }) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(null) // { url, until } mientras se espera el «Iniciar» en el bot
  const [justLinked, setJustLinked] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const link = useMutation({
    mutationFn: () => api('/me/notification-telegram', { method: 'POST' }),
    onSuccess: (r) => setPending({ url: r.url, until: Math.min(Date.parse(r.expiresAt) || Infinity, Date.now() + WAIT_MS) }),
  })
  const drop = useMutation({
    mutationFn: () => api('/me/notification-telegram', { method: 'DELETE' }),
    onSuccess: (d) => { qc.setQueryData(['me', 'tg'], d); setConfirm(false); setJustLinked(false); qc.invalidateQueries({ queryKey: ['me', 'prefs'] }) },
  })
  const d = q.data
  const { refetch } = q

  // Con el enlace abierto se pregunta al backend cada 3 s hasta que confirma la vinculación (máx. 15 min).
  const waiting = !!pending && !d?.vinculado
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => {
      if (Date.now() > pending.until) { setPending(null); return }
      refetch()
    }, 3000)
    return () => clearInterval(t)
  }, [waiting, pending, refetch])
  useEffect(() => {
    if (pending && d?.vinculado) { setPending(null); setJustLinked(true); qc.invalidateQueries({ queryKey: ['me', 'prefs'] }) }
  }, [pending, d?.vinculado, qc])

  const state = !d ? 'load' : d.vinculado ? 'ok' : !d.disponible ? 'off' : pending ? 'wait' : 'idle'
  const err = link.error ?? drop.error

  return (
    <section className="aj-sec aj-sec--phone" aria-labelledby="aj-tg">
      <h2 id="aj-tg" className="aj-sec__h">Mi Telegram</h2>
      {q.isError ? <Retry q={q} /> : (
        <div className={`aj-phone aj-phone--tg is-${state}${err ? ' is-err' : ''}`}>
          <span className="aj-phone__cam" aria-hidden="true" />
          <div className="aj-phone__screen">
            <div className="aj-phone__bar"><span className="aj-phone__ico">{I.telegram}</span><span>Telegram</span><small>Avisos urgentes</small></div>

            {state === 'load' && <div className="aj-phone__skel" aria-busy="true"><i /><i /><i /></div>}

            {state === 'off' && (
              <div className="aj-scr aj-scr--off">
                <span className="aj-tg-off" aria-hidden="true">{I.telegram}</span>
                <strong>Telegram no disponible</strong>
                <span>El bot aún no está conectado</span>
              </div>
            )}

            {state === 'idle' && (
              <div className="aj-scr">
                <ol className="aj-tg-steps">
                  <li><span aria-hidden="true">{I.open}</span>Abre el enlace</li>
                  <li><span aria-hidden="true">{I.telegram}</span>Toca «Iniciar»</li>
                  <li><span aria-hidden="true">{I.check}</span>Queda vinculado</li>
                </ol>
                <Btn variant="primary" loading={link.isPending} onClick={() => { link.reset(); drop.reset(); link.mutate() }}>Vincular Telegram</Btn>
              </div>
            )}

            {state === 'wait' && (
              <div className="aj-scr aj-scr--wait">
                <TgQr url={pending.url} />
                <a className="btn btn--primary" href={pending.url} target="_blank" rel="noreferrer">{I.open}Abrir Telegram</a>
                <p className="aj-tg-wait" role="status"><i aria-hidden="true" />Esperando «Iniciar»</p>
                <button type="button" className="aj-link" onClick={() => setPending(null)}>Cancelar</button>
              </div>
            )}

            {state === 'ok' && (
              <div className={`aj-scr aj-scr--ok${justLinked ? ' is-new' : ''}`}>
                <svg className="aj-seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" pathLength="1" /><path d="M21 33l7.5 7.5L44 25" pathLength="1" /></svg>
                <strong>Vinculado</strong>
                {d.vinculadoAt && <span className="aj-scr__num">desde {fmtDate(d.vinculadoAt)}</span>}
                <span className="sr-only" role="status">{justLinked ? 'Telegram vinculado' : ''}</span>
              </div>
            )}

            {err && <p className="aj-scr__err" role="alert">{errorText(err)}</p>}
          </div>
          <span className="aj-phone__home" aria-hidden="true" />
        </div>
      )}
      {state === 'ok' && (confirm ? (
        <div className="aj-confirm" role="group" aria-label="Confirmar desvinculación">
          <span>¿Desvincular Telegram?</span>
          <Btn size="sm" variant="ghost" onClick={() => setConfirm(false)}>No</Btn>
          <Btn size="sm" loading={drop.isPending} onClick={() => { drop.reset(); drop.mutate() }}>Sí, desvincular</Btn>
        </div>
      ) : (
        <Btn size="sm" variant="ghost" className="aj-drop" onClick={() => setConfirm(true)}>Desvincular Telegram</Btn>
      ))}
    </section>
  )
}

// QR del enlace del bot, con la tinta del papel tomada del tema.
function TgQr({ url }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !url) return
    const css = getComputedStyle(document.documentElement)
    const dark = css.getPropertyValue('--on-paper').trim() || 'black'
    const light = css.getPropertyValue('--paper').trim() || 'white'
    QRCode.toCanvas(ref.current, url, { width: 148, margin: 0, color: { dark, light } })
  }, [url])
  return <div className="aj-tg-qr"><canvas ref={ref} role="img" aria-label="QR que abre el bot de TurnoExtra en Telegram" /></div>
}
