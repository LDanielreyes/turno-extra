import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtCOP } from '../shared/format'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { AkError, Ico } from './kit'
import './legal.css'

// Parámetros del piso salarial con vigencia, sobre el reloj de recargos. Nada se edita: cada valor nuevo
// se registra con su fecha y queda en la tira de historial de su ficha. El reloj y la semana son el control:
// tocar el tramo nocturno, sus extremos, el domingo o la hora ordinaria abre la ficha que lo define,
// y mientras se escribe el reloj muestra cómo quedaría.

const pct = (v) => `${Math.round(Number(v) * 1000) / 10} %`
const hour = (v) => `${String(Math.trunc(Number(v))).padStart(2, '0')}:00`
const KEYS = {
  smmlv: { label: 'Salario mínimo', prefix: '$', suffix: 'COP', step: '1', show: (v) => fmtCOP(v), v: 'smmlv' },
  divisor_horas: { label: 'Divisor de horas', suffix: 'h / mes', step: '1', show: (v) => `${Number(v)} h`, v: 'divisor' },
  nocturno_desde_hora: { label: 'Nocturno desde', suffix: 'h', step: '1', max: 23, show: hour, hint: '0 a 23', v: 'desde' },
  nocturno_hasta_hora: { label: 'Nocturno hasta', suffix: 'h', step: '1', max: 23, show: hour, hint: '0 a 23', v: 'hasta' },
  recargo_nocturno: { label: 'Recargo nocturno', suffix: '× hora', step: '0.01', show: pct, hint: '0.35 = 35 %', v: 'noct' },
  recargo_dominical: { label: 'Recargo dominical', suffix: '× hora', step: '0.01', show: pct, hint: '0.90 = 90 %', v: 'dom' },
}
const iso = (d) => String(d).slice(0, 10)
const longDate = (d) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso(d)}T00:00:00Z`))
const validDraft = (clave, valor) => {
  const n = Number(valor)
  if (valor === '' || !(n > 0)) return false
  return KEYS[clave].max ? Number.isInteger(n) && n <= KEYS[clave].max : true
}

export default function Legal() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'legal'], queryFn: () => api('/admin/legal') })
  const [open, setOpen] = useState(null)
  const [draft, setDraft] = useState('')
  const [flash, setFlash] = useState(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(t)
  }, [flash])

  const today = new Date().toISOString().slice(0, 10)
  const params = q.data?.params ?? []
  const byKey = (k) => params.filter((p) => p.clave === k).sort((a, b) => iso(b.vigenteDesde).localeCompare(iso(a.vigenteDesde)))
  const current = (k) => byKey(k).find((p) => iso(p.vigenteDesde) <= today)
  const val = (k) => { const c = current(k); return c ? Number(c.valor) : undefined }
  const v = Object.fromEntries(Object.entries(KEYS).map(([k, m]) => [m.v, val(k)]))
  // vista previa: el valor que se está escribiendo reemplaza al vigente en el reloj
  const preview = open && validDraft(open, draft) ? { ...v, [KEYS[open].v]: Number(draft) } : null
  const shown = preview ?? v
  const hora = (x) => (x.smmlv && x.divisor ? x.smmlv / x.divisor : null)
  const missing = q.isSuccess ? Object.keys(KEYS).filter((k) => !current(k)).length : 0
  const h0 = hora(v)

  const openKey = (k) => { setOpen(k); setDraft('') }
  const close = () => { setOpen(null); setDraft('') }

  return (
    <section className="lg">
      <Crops />
      <header className="lg__head">
        <div className="lg__title">
          <h1>Parámetros legales</h1>
          <ul className="mh__key">
            <li><i className="lg-k lg-k--arc" aria-hidden="true" />Tramo nocturno</li>
            <li><i className="mh-k mh-k--must" aria-hidden="true" />Vigente</li>
            <li><i className="mh-k mh-k--dash" aria-hidden="true" />Programado</li>
          </ul>
        </div>
        {h0 && (
          <dl className="mh__facts lg__facts">
            <div><dt>hora ordinaria</dt><dd>{fmtCOP(Math.round(h0))}</dd></div>
            <div><dt>recargo nocturno</dt><dd>{v.noct != null ? pct(v.noct) : '—'}</dd></div>
            <div><dt>recargo dominical</dt><dd>{v.dom != null ? pct(v.dom) : '—'}</dd></div>
          </dl>
        )}
      </header>

      {missing > 0 && (
        <p className="lg__warn" role="status"><i className="mh-k mh-k--dash" aria-hidden="true" />Faltan {missing} · sin ellos no se publican turnos</p>
      )}

      {q.isError ? (
        <div className="lg__msg"><AkError error={q.error} /><Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn></div>
      ) : (
        <div className="lg__stage">
          <div className={`lg-scene${preview ? ' is-preview' : ''}`}>
            {q.isPending ? <DialSkeleton /> : <Dial v={shown} base={v} open={open} onPick={openKey} preview={!!preview} />}
            <span className="lg-scene__tag" aria-hidden={!preview}>Vista previa</span>
          </div>
          <ul className="lg-tags" aria-label="Parámetros">
            {Object.entries(KEYS).map(([k, m], i) => q.isPending
              ? <li key={k} className="lg-tag is-skel" style={{ '--i': i }}><div className="lg-tag__face" /></li>
              : (
                <Tag key={k} k={k} m={m} i={i} list={byKey(k)} cur={current(k)} today={today}
                  isOpen={open === k} flash={flash === k} draft={open === k ? draft : ''} setDraft={setDraft}
                  v={v} onOpen={() => openKey(k)} onClose={close}
                  onSaved={async () => { await qc.invalidateQueries({ queryKey: ['admin', 'legal'] }); close(); setFlash(k) }} />
              ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/* ---------- la ficha de un parámetro ---------- */
function Tag({ k, m, i, list, cur, today, isOpen, flash, draft, setDraft, v, onOpen, onClose, onSaved }) {
  const next = list.filter((p) => iso(p.vigenteDesde) > today).at(-1)
  const old = list.filter((p) => p !== cur && iso(p.vigenteDesde) <= today).length
  const cls = `lg-tag${cur ? '' : ' is-missing'}${isOpen ? ' is-open' : ''}${flash ? ' is-flash' : ''}`
  return (
    <li className={cls} style={{ '--i': i }}>
      {Array.from({ length: Math.min(old, 2) }, (_, j) => <span key={j} className="lg-tag__old" style={{ '--j': j + 1 }} aria-hidden="true" />)}
      {isOpen
        ? <Editor k={k} m={m} list={list} cur={cur} today={today} draft={draft} setDraft={setDraft} v={v} onClose={onClose} onSaved={onSaved} />
        : (
          <button type="button" className="lg-tag__face" onClick={onOpen}
            aria-label={`${m.label}: ${cur ? `${m.show(cur.valor)} desde ${longDate(cur.vigenteDesde)}` : 'sin valor vigente'}${next ? `; programado ${m.show(next.valor)} desde ${longDate(next.vigenteDesde)}` : ''}. Registrar valor`}>
            <span className="lg-tag__label">{m.label}</span>
            {cur
              ? <strong className="lg-tag__val" key={cur.id}>{m.show(cur.valor)}</strong>
              : <strong className="lg-tag__val is-none">Falta</strong>}
            <span className="lg-tag__since">
              {cur ? <><i className="lg-dot" />desde {longDate(cur.vigenteDesde)}</> : 'Sin valor vigente'}
            </span>
            {next && <span className="lg-tag__next"><i className="lg-dot is-next" />{m.show(next.valor)} · {longDate(next.vigenteDesde)}</span>}
            {old > 0 && <span className="lg-tag__hist">{old} {old === 1 ? 'anterior' : 'anteriores'}</span>}
            <span className="lg-tag__ok" aria-hidden="true">{Ico.check} Registrado</span>
          </button>
        )}
    </li>
  )
}

function Editor({ k, m, list, cur, today, draft, setDraft, v, onClose, onSaved }) {
  const nextJan = `${new Date().getFullYear() + 1}-01-01`
  const [desde, setDesde] = useState('')
  const [nota, setNota] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const add = useMutation({
    mutationFn: () => api('/admin/legal', { method: 'POST', body: { clave: k, valor: Number(draft), vigenteDesde: desde, nota: nota.trim() || undefined } }),
    onSuccess: onSaved,
  })
  const ok = validDraft(k, draft)
  // efecto sobre la hora: hoy frente a «con este valor»
  const n = Number(draft)
  const hora = v.smmlv && v.divisor ? v.smmlv / v.divisor : null
  const effect = !ok ? null : {
    smmlv: v.divisor && ['Hora ordinaria', hora, n / v.divisor],
    divisor_horas: v.smmlv && ['Hora ordinaria', hora, v.smmlv / n],
    recargo_nocturno: hora && ['Hora nocturna', v.noct != null ? hora * (1 + v.noct) : null, hora * (1 + n)],
    recargo_dominical: hora && ['Hora dominical', v.dom != null ? hora * (1 + v.dom) : null, hora * (1 + n)],
  }[k]

  return (
    <form className="lg-edit" aria-label={`Registrar ${m.label}`} onSubmit={(e) => { e.preventDefault(); if (ok && desde) add.mutate() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <div className="lg-edit__top">
        <span className="lg-tag__label">{m.label}</span>
        <span className="lg-edit__now">{cur ? <>Hoy <b>{m.show(cur.valor)}</b></> : 'Sin valor vigente'}</span>
      </div>
      <label className="lg-big">
        <span className="sr-only">Nuevo valor</span>
        {m.prefix && <span className="lg-big__fix">{m.prefix}</span>}
        <input ref={ref} type="number" inputMode="decimal" step={m.step} min="0" max={m.max} required placeholder={cur ? String(Number(cur.valor)) : '0'}
          value={draft} onChange={(e) => setDraft(e.target.value)} />
        <span className="lg-big__fix">{m.suffix}</span>
      </label>
      <span className="lg-edit__read">{ok ? `Se leerá como ${m.show(draft)}` : m.hint ?? ' '}</span>

      {effect && (
        <div className="lg-effect" role="status">
          <div><span>{effect[0]} hoy</span><b>{effect[1] ? fmtCOP(Math.round(effect[1])) : '—'}</b></div>
          <div className="is-new"><span>Con este valor</span><b>{fmtCOP(Math.round(effect[2]))}</b></div>
          <div><span>Cambio</span><b>{effect[1] ? `${effect[2] >= effect[1] ? '+' : '−'}${Math.abs(Math.round(((effect[2] - effect[1]) / effect[1]) * 1000) / 10)} %` : '—'}</b></div>
        </div>
      )}

      <div className="lg-edit__row">
        <label className="lg-in">
          <span>Vigente desde</span>
          <input type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <div className="lg-chips">
          <button type="button" className={desde === today ? 'is-on' : ''} onClick={() => setDesde(today)}>Hoy</button>
          <button type="button" className={desde === nextJan ? 'is-on' : ''} onClick={() => setDesde(nextJan)}>1 ene {nextJan.slice(0, 4)}</button>
        </div>
      </div>
      <label className="lg-in">
        <span>Fuente <small>opcional</small></span>
        <input placeholder="Decreto o resolución" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>

      {list.length > 0 && (
        <ol className="lg-hist" aria-label="Historial">
          {list.map((p) => {
            const st = iso(p.vigenteDesde) > today ? 'next' : p === cur ? 'now' : 'old'
            return (
              <li key={p.id} className={`is-${st}`}>
                <i className={`lg-dot${st === 'next' ? ' is-next' : st === 'old' ? ' is-old' : ''}`} aria-hidden="true" />
                <b>{m.show(p.valor)}</b>
                <span>{longDate(p.vigenteDesde)}</span>
                <em>{st === 'now' ? 'Vigente' : st === 'next' ? 'Programado' : ''}</em>
                {p.nota && <small>{p.nota}</small>}
              </li>
            )
          })}
        </ol>
      )}

      <AkError error={add.error} />
      <div className="lg-edit__foot">
        <Btn size="sm" variant="ghost" onClick={onClose}>Cerrar</Btn>
        <Btn size="sm" variant="primary" type="submit" loading={add.isPending} disabled={!ok || !desde}>Registrar valor</Btn>
      </div>
    </form>
  )
}

/* ---------- el reloj de recargos: esfera de 24 h + semana + valor de la hora ---------- */
const polar = (cx, cy, r, deg) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)]
const arc = (cx, cy, r, a0, a1) => {
  const sweep = ((a1 - a0) % 360 + 360) % 360 || 360
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a0 + Math.min(sweep, 359.9))
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}
const bogota = (d) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).split(':').map(Number)
  return { h: h % 24, m }
}
function useNow(every) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), every); return () => clearInterval(t) }, [every])
  return now
}
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const plus = (x) => `+${Math.round(x * 100)} %`

// Zona tocable del dibujo: abre la ficha del parámetro que la define.
function Hit({ k, open, onPick, label, children }) {
  return (
    <g className={`lg-hit${open === k ? ' is-sel' : ''}`} role="button" tabIndex={0} aria-label={label}
      onClick={() => onPick(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(k) } }}>
      {children}
    </g>
  )
}

function Dial({ v, base, open, onPick, preview }) {
  const { h, m } = bogota(useNow(60_000))
  const cx = 160, cy = 160, r = 118
  const hasNight = v.desde != null && v.hasta != null
  const a0 = (v.desde ?? 0) * 15, a1 = (v.hasta ?? 0) * 15
  const mid = a0 + ((((a1 - a0) % 360) + 360) % 360) / 2
  const [lx, ly] = polar(cx, cy, r + 26, mid)
  const [nx, ny] = polar(cx, cy, r - 38, (h + m / 60) * 15)
  const [sx, sy] = polar(cx, cy, r + 10, a0)
  const [ex, ey] = polar(cx, cy, r + 10, a1)
  const hora = v.smmlv && v.divisor ? v.smmlv / v.divisor : null
  const hora0 = base.smmlv && base.divisor ? base.smmlv / base.divisor : null
  const rows = [
    ['smmlv', 'Hora ordinaria', hora, hora0],
    ['recargo_nocturno', 'Nocturna', hora && v.noct != null ? hora * (1 + v.noct) : null, hora0 && base.noct != null ? hora0 * (1 + base.noct) : null],
    ['recargo_dominical', 'Dominical', hora && v.dom != null ? hora * (1 + v.dom) : null, hora0 && base.dom != null ? hora0 * (1 + base.dom) : null],
  ]
  const band = (from, to) => (from <= to ? [[from, to]] : [[from, 24], [0, to]])
  const WX = 352, WY = 40, WH = 124, CW = 28, CS = 34

  return (
    <svg className="lg-dial" viewBox="0 0 600 330" preserveAspectRatio="xMidYMid meet">
      <title>{hasNight ? `Tramo nocturno de ${hour(v.desde)} a ${hour(v.hasta)}` : 'Sin tramo nocturno'}</title>
      <circle className="lg-dial__halo" cx={cx} cy={cy} r={r + 34} />
      <circle className="lg-dial__face" cx={cx} cy={cy} r={r} />
      {Array.from({ length: 96 }, (_, i) => {
        const major = i % 4 === 0
        const [x1, y1] = polar(cx, cy, r - (i % 24 === 0 ? 16 : major ? 10 : 5), i * 3.75)
        const [x2, y2] = polar(cx, cy, r - 2, i * 3.75)
        return <line key={i} className={major ? 'lg-dial__hr' : 'lg-dial__min'} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      {[0, 6, 12, 18].map((hh) => {
        const [x, y] = polar(cx, cy, r - 30, hh * 15)
        return <text key={hh} className="lg-dial__num" x={x} y={y + 4} textAnchor="middle">{String(hh).padStart(2, '0')}</text>
      })}

      {hasNight ? (
        <>
          <Hit k="recargo_nocturno" open={open} onPick={onPick} label={`Recargo nocturno ${v.noct != null ? pct(v.noct) : 'sin valor'}. Cambiar`}>
            <path className="lg-dial__hitband" d={arc(cx, cy, r + 10, a0, a1)} />
            <path className="lg-dial__night-bg" d={arc(cx, cy, r + 10, a0, a1)} />
            <path key={`${v.desde}-${v.hasta}`} className="lg-dial__night" pathLength="100" d={arc(cx, cy, r + 10, a0, a1)} />
            <text className="lg-dial__tag" x={lx} y={ly + 4} textAnchor={lx < cx - 10 ? 'end' : lx > cx + 10 ? 'start' : 'middle'}>
              {v.noct != null ? plus(v.noct) : '+ ?'}
            </text>
          </Hit>
          <Hit k="nocturno_desde_hora" open={open} onPick={onPick} label={`Nocturno desde ${hour(v.desde)}. Cambiar`}>
            <circle className="lg-handle__hit" cx={sx} cy={sy} r="16" />
            <circle className="lg-handle" cx={sx} cy={sy} r="7" />
          </Hit>
          <Hit k="nocturno_hasta_hora" open={open} onPick={onPick} label={`Nocturno hasta ${hour(v.hasta)}. Cambiar`}>
            <circle className="lg-handle__hit" cx={ex} cy={ey} r="16" />
            <circle className="lg-handle is-end" cx={ex} cy={ey} r="7" />
          </Hit>
        </>
      ) : (
        <Hit k={v.desde == null ? 'nocturno_desde_hora' : 'nocturno_hasta_hora'} open={open} onPick={onPick} label="Definir tramo nocturno">
          <circle className="lg-dial__hitring" cx={cx} cy={cy} r={r + 10} />
          <circle className="lg-dial__night-bg is-empty" cx={cx} cy={cy} r={r + 10} />
        </Hit>
      )}
      <text className="lg-dial__label" x={cx} y={cy - 12} textAnchor="middle">{hasNight ? 'Nocturno' : 'Sin tramo'}</text>
      {hasNight && <text className="lg-dial__range" x={cx} y={cy + 12} textAnchor="middle">{`${hour(v.desde)} – ${hour(v.hasta)}`}</text>}
      <line className="lg-dial__now" x1={cx} y1={cy} x2={nx} y2={ny} />
      <circle className="lg-dial__nowdot" cx={nx} cy={ny} r="4.5" />
      <circle className="lg-dial__pv" cx={cx} cy={cy} r="5" />

      {/* la semana: cada columna son 24 h con el tramo nocturno; el domingo entero con su recargo */}
      {DAYS.map((d, i) => {
        const x = WX + i * CS
        const sun = i === 6
        const col = (
          <g className={`lg-day${sun ? ' is-sun' : ''}`} style={{ '--d': `${0.15 + i * 0.06}s` }}>
            <rect className="lg-day__col" x={x} y={WY} width={CW} height={WH} rx="5" />
            {hasNight && band(v.desde, v.hasta).map(([f, t]) => (
              <rect key={`${f}-${t}`} className="lg-day__night" x={x + 3} y={WY + (f / 24) * WH} width={CW - 6} height={((t - f) / 24) * WH} rx="2" />
            ))}
            <text className="lg-day__l" x={x + CW / 2} y={WY + WH + 16} textAnchor="middle">{d}</text>
            {sun && <text className="lg-dial__tag" x={x + CW / 2} y={WY - 10} textAnchor="middle">{v.dom != null ? plus(v.dom) : '+ ?'}</text>}
          </g>
        )
        return sun
          ? <Hit key={i} k="recargo_dominical" open={open} onPick={onPick} label={`Recargo dominical ${v.dom != null ? pct(v.dom) : 'sin valor'}. Cambiar`}>{col}</Hit>
          : <g key={i}>{col}</g>
      })}

      {rows.map(([k, label, val, val0], i) => (
        <Hit key={k} k={k} open={open} onPick={onPick} label={`${label} ${val ? fmtCOP(Math.round(val)) : 'sin calcular'}. Cambiar`}>
          <g transform={`translate(${WX} ${WY + WH + 50 + i * 30})`}>
            <rect className="lg-pay__hit" x="-8" y="-17" width={7 * CS + 2} height="28" rx="4" />
            <text className="lg-pay__l">{label}</text>
            <text key={val ?? 'x'} className={`lg-pay__v${preview && val0 !== val ? ' is-new' : ''}`} x={7 * CS - 6} textAnchor="end">{val ? fmtCOP(Math.round(val)) : '—'}</text>
            <line className="lg-pay__rule" x1="0" y1="8" x2={7 * CS - 6} y2="8" />
          </g>
        </Hit>
      ))}
    </svg>
  )
}

function DialSkeleton() {
  return (
    <svg className="lg-dial is-loading" viewBox="0 0 600 330" preserveAspectRatio="xMidYMid meet" aria-busy="true" aria-label="Cargando parámetros">
      <circle className="lg-skel" cx="160" cy="160" r="118" />
      {DAYS.map((_, i) => <rect key={i} className="lg-skel" x={352 + i * 34} y="40" width="28" height="124" rx="5" style={{ animationDelay: `${i * 0.08}s` }} />)}
      {[0, 1, 2].map((i) => <rect key={i} className="lg-skel" x="352" y={204 + i * 30} width="232" height="10" rx="5" style={{ animationDelay: `${i * 0.12}s` }} />)}
    </svg>
  )
}
