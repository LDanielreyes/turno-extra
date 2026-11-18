import { useEffect, useState, useSyncExternalStore } from 'react'
import { fmtCOP } from '../shared/format'
import './scenes.css'

// Escenas del super admin. Regla: cada dibujo se arma con los datos reales de su sección (nada inventado)
// y con los objetos del producto: el reloj del turno, la persona de la banca, la hoja que se acepta.
// Sin movimiento, cada escena queda en su estado final.

/* ---------- utilidades ---------- */
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const subscribe = (cb) => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb) }
export const useReduced = () => useSyncExternalStore(subscribe, () => !!mq?.matches, () => true)

export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), every); return () => clearInterval(t) }, [every])
  return now
}
// Hora de Bogotá en horas decimales (0–24).
const bogota = (d) => {
  const [h, m, s] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).split(':').map(Number)
  return { h: h % 24, m, s }
}
const hash = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const polar = (cx, cy, r, deg) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)]
const arc = (cx, cy, r, a0, a1) => {
  const sweep = ((a1 - a0) % 360 + 360) % 360 || 360
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a0 + Math.min(sweep, 359.9))
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

const Person = ({ x, y, s = 1, className = '' }) => (
  <g className={`sc-person ${className}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <circle cy="-6" r="6" />
    <path d="M-11 13a11 11 0 0 1 22 0z" />
  </g>
)
const Envelope = () => (
  <g className="sc-env">
    <rect x="-13" y="-9" width="26" height="18" rx="2.5" />
    <path d="M-13 -8l13 10 13-10" />
  </g>
)

// Reloj pequeño con la hora de Bogotá: el mismo dial de la marca.
export function MiniClock({ cx, cy, r }) {
  const { h, m, s } = bogota(useNow(30_000))
  const [hx, hy] = polar(cx, cy, r * 0.5, ((h % 12) + m / 60) * 30)
  const [mx, my] = polar(cx, cy, r * 0.74, m * 6)
  return (
    <g className="sc-clock">
      <circle className="sc-clock__halo" cx={cx} cy={cy} r={r + 16} />
      <circle className="sc-clock__face" cx={cx} cy={cy} r={r} />
      {Array.from({ length: 12 }, (_, i) => {
        const [x1, y1] = polar(cx, cy, r - (i % 3 ? 5 : 8), i * 30)
        const [x2, y2] = polar(cx, cy, r - 2, i * 30)
        return <line key={i} className={i === 0 ? 'sc-clock__tick is-top' : 'sc-clock__tick'} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      <line className="sc-clock__h" x1={cx} y1={cy} x2={hx} y2={hy} />
      <line className="sc-clock__m" x1={cx} y1={cy} x2={mx} y2={my} />
      <line className="sc-clock__s" x1={cx} y1={cy + 5} x2={cx} y2={cy - r + 4}
        style={{ transformOrigin: `${cx}px ${cy}px`, animationDelay: `-${s}s` }} />
      <circle className="sc-clock__pv" cx={cx} cy={cy} r="2.6" />
    </g>
  )
}

/* ---------- Organizaciones: la ciudad de noche ---------- */
// Un edificio por organización (las 12 más recientes, la más nueva a la derecha).
// Ventanas encendidas = gerentes (0 a 3). Sin gerente = invitación pendiente: contorno punteado y un sobre en camino.
const LIT = [0, 35, 60, 85]
export function OrgsScene({ orgs = [] }) {
  const reduced = useReduced()
  const sorted = [...orgs].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const shown = sorted.slice(-12)
  const extra = sorted.length - shown.length
  const ghost = shown.length === 0
  const items = ghost ? ['a', 'bb', 'ccc'].map((s) => ({ id: s, slug: s, nombre: '', admins: 0, ghost: true })) : shown
  const n = items.length
  const G = 262, L = 30, R = 530, gap = 9
  const w = Math.min(64, (R - L - (n - 1) * gap) / n)
  const x0 = (L + R) / 2 - (n * w + (n - 1) * gap) / 2

  const blds = items.map((o, b) => {
    const k = hash(o.slug || o.id)
    const h = o.ghost ? [120, 160, 104][b] : 96 + (k % 100)
    const x = x0 + b * (w + gap)
    const top = G - h
    const cols = Math.max(1, Math.floor((w - 8) / 11))
    const rows = Math.max(1, Math.floor((h - 40) / 15))
    const ox = x + (w - (cols * 11 - 5)) / 2
    const pct = o.ghost ? 0 : LIT[Math.min(o.admins, 3)]
    const wins = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      const lit = hash(`${o.slug}${i}`) % 100 < pct
      wins.push({ i, x: ox + c * 11, y: top + 14 + r * 15, lit, tw: lit && hash(`${o.id}${i}`) % 19 === 0 })
    }
    return { o, b, x, top, h, k, wins, pending: o.ghost || o.admins === 0 }
  })
  const target = [...blds].reverse().find((d) => d.pending)
  const newest = !ghost && blds[blds.length - 1]
  const tx = target ? target.x + w / 2 : 0
  const path = target ? `M-30 120Q${(tx - 40).toFixed(0)} 10 ${tx.toFixed(1)} ${G - 24}` : ''

  return (
    <svg className="sc sc-orgs" viewBox="0 0 560 300" preserveAspectRatio="xMidYMax meet">
      {Array.from({ length: 22 }, (_, i) => {
        const k = hash(`star${i}`)
        const x = 14 + (k % 532), y = 14 + ((k >> 9) % 110)
        if (Math.hypot(x - 470, y - 66) < 56) return null
        return <circle key={i} className={`sc-star${i % 5 === 0 ? ' is-tw' : ''}`} cx={x} cy={y} r={i % 4 ? 0.9 : 1.4} style={{ '--d': `${(i % 7) * 0.7}s` }} />
      })}
      <MiniClock cx={470} cy={66} r={30} />

      {blds.map(({ o, b, x, top, h, k, wins, pending }) => (
        <g key={o.id} className={`sc-bld${pending ? ' is-pending' : ''}`} style={{ '--d': `${0.1 + b * 0.06}s` }}>
          <title>{o.ghost ? 'Organización por invitar' : `${o.nombre} · ${o.admins === 0 ? 'invitación pendiente' : `${o.admins} de 3 gerentes`}`}</title>
          {k % 3 === 1 && <rect className="sc-bld__body" x={x + w * 0.22} y={top - 14} width={w * 0.56} height="16" />}
          {k % 3 === 2 && <><line className="sc-bld__ant" x1={x + w * 0.7} y1={top} x2={x + w * 0.7} y2={top - 22} /><circle className="sc-bld__beacon" cx={x + w * 0.7} cy={top - 23} r="2" /></>}
          <rect className="sc-bld__body" x={x} y={top} width={w} height={h} />
          {wins.map((wi) => (
            <rect key={wi.i} className={`sc-win${wi.lit ? ' is-lit' : ''}${wi.tw ? ' is-tw' : ''}`} x={wi.x} y={wi.y} width="6" height="8" rx="1"
              style={{ '--wd': `${0.3 + b * 0.06 + (wi.i % 9) * 0.05}s` }} />
          ))}
          <rect className="sc-bld__door" x={x + w / 2 - 6} y={G - 16} width="12" height="16" rx="1.5" />
        </g>
      ))}

      {newest && (
        <g className="sc-label">
          <line x1={newest.x + w / 2} y1={newest.top - (newest.k % 3 ? 28 : 6)} x2={newest.x + w / 2} y2={Math.max(newest.top - 40, 92)} />
          <text x={Math.min(Math.max(newest.x + w / 2, 70), 500)} y={Math.max(newest.top - 46, 86)} textAnchor="middle">{cut(newest.o.nombre, 22)}</text>
        </g>
      )}

      <line className="sc-ground" x1="14" y1={G} x2="546" y2={G} />
      {Array.from({ length: 34 }, (_, i) => <line key={i} className="sc-ground__dash" x1={16 + i * 16} y1={G + 12} x2={24 + i * 16} y2={G + 12} />)}
      {extra > 0 && <text className="sc-note" x="546" y={G + 30} textAnchor="end">+{extra} más</text>}

      {target && (reduced
        ? <g transform={`translate(${tx} ${G - 40})`}><Envelope /></g>
        : (
          <g>
            <path className="sc-trail" d={path} />
            <g>
              <Envelope />
              <animateMotion dur="7s" repeatCount="indefinite" path={path} keyPoints="0;1;1" keyTimes="0;0.62;1" calcMode="spline" keySplines="0.3 0 0.2 1;0 0 1 1" />
              <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.08;0.6;0.7;1" dur="7s" repeatCount="indefinite" />
            </g>
          </g>
        ))}
    </svg>
  )
}

// Glifo de fila: el mismo edificio, ventanas encendidas por gerente.
export function Building({ admins = 0, seed = '' }) {
  const k = hash(seed)
  const lit = new Set(Array.from({ length: Math.min(admins, 3) }, (_, i) => (k + i * 2) % 6))
  return (
    <svg className={`sc-glyph${admins === 0 ? ' is-pending' : ''}`} viewBox="0 0 28 32" aria-hidden="true">
      <rect className="sc-glyph__body" x="4.5" y="3.5" width="19" height="25" rx="1.5" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} className={lit.has(i) ? 'sc-glyph__w is-lit' : 'sc-glyph__w'} x={8 + (i % 2) * 8} y={7 + Math.floor(i / 2) * 6} width="4" height="4" rx="0.8" />
      ))}
      <rect className="sc-glyph__door" x="11.5" y="23" width="5" height="5.5" />
    </svg>
  )
}

/* ---------- Roles: credenciales colgadas ---------- */
// Una credencial por rol (activos primero, hasta 5). Cada línea es un documento: punto lleno = obligatorio.
export function RolesScene({ roles = [] }) {
  const list = [...roles].sort((a, b) => Number(b.activo) - Number(a.activo)).slice(0, 5)
  const ghost = list.length === 0
  const items = ghost ? [{ id: 'g', nombre: 'Nuevo rol', activo: true, requisitos: [], ghost: true }] : list
  const n = items.length
  const slot = 500 / n
  const RAIL = 32
  return (
    <svg className="sc sc-roles" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
      <line className="sc-rail" x1="24" y1={RAIL} x2="536" y2={RAIL} />
      {items.map((r, i) => {
        const cx = 30 + slot * (i + 0.5)
        const y = 74, cw = 94, ch = 168
        const docs = r.requisitos.slice(0, 5)
        const must = r.requisitos.filter((d) => d.obligatorio).length
        return (
          <g key={r.id} className={`sc-badge${r.activo ? '' : ' is-off'}${r.ghost ? ' is-ghost' : ''}`}
            style={{ '--d': `${i * 0.12}s`, '--sw': `${5.5 + (i % 3) * 0.9}s`, transformOrigin: `${cx}px ${RAIL}px` }}>
            <title>{r.ghost ? 'Rol por crear' : `${r.nombre} · ${r.requisitos.length} documentos, ${must} obligatorios${r.activo ? '' : ' · inactivo'}`}</title>
            <circle className="sc-hook" cx={cx} cy={RAIL} r="4" />
            <path className="sc-strap" d={`M${cx} ${RAIL}L${cx - 16} ${y + 2}M${cx} ${RAIL}L${cx + 16} ${y + 2}`} />
            <rect className="sc-badge__card" x={cx - cw / 2} y={y} width={cw} height={ch} rx="9" />
            <rect className="sc-badge__slot" x={cx - 11} y={y + 7} width="22" height="5" rx="2.5" />
            <text className="sc-badge__name" x={cx} y={y + 32} textAnchor="middle">{cut(r.nombre, 12)}</text>
            <circle className="sc-badge__photo" cx={cx} cy={y + 60} r="17" />
            <Person x={cx} y={y + 62} s={0.82} className="sc-badge__who" />
            {docs.length === 0
              ? <text className="sc-badge__free" x={cx} y={y + 106} textAnchor="middle">{r.ghost ? 'sin documentos' : 'Sin requisitos'}</text>
              : docs.map((d, j) => (
                <g key={d.tipoDocumento} className="sc-badge__doc" style={{ '--j': j }}>
                  <circle className={d.obligatorio ? 'is-must' : ''} cx={cx - cw / 2 + 15} cy={y + 96 + j * 13} r="3" />
                  <rect x={cx - cw / 2 + 24} y={y + 94 + j * 13} width={Math.min(54, 18 + d.tipoDocumento.length * 1.5)} height="4" rx="2" />
                </g>
              ))}
            <text className="sc-badge__foot" x={cx} y={y + ch - 12} textAnchor="middle">{r.ghost ? '' : r.activo ? `${must}/${r.requisitos.length} obligatorios` : 'Inactivo'}</text>
          </g>
        )
      })}
      {roles.length > 5 && <text className="sc-note" x="536" y="290" textAnchor="end">+{roles.length - 5} roles más</text>}
    </svg>
  )
}

/* ---------- Parámetros legales: el reloj de recargos ---------- */
// Esfera de 24 h con el tramo nocturno vigente, la hora actual en Bogotá, la semana con el dominical
// y el valor de la hora calculado con los parámetros vigentes (SMMLV / divisor).
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const pctTxt = (v) => `+${Math.round(v * 100)} %`
// Esqueleto de la escena: mismo encuadre y tamaño, sin esfera ni textos hasta que lleguen los parámetros.
export function LegalSceneSkeleton() {
  return (
    <svg className="sc sc-legal is-loading" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet" aria-busy="true">
      <circle className="sc-skel" cx="150" cy="150" r="112" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} className="sc-skel" x={318 + i * 31} y="44" width="24" height="112" rx="5" style={{ animationDelay: `${i * 0.1}s` }} />)}
      {[0, 1, 2].map((i) => <rect key={i} className="sc-skel" x="318" y={200 + i * 24} width="210" height="10" rx="5" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </svg>
  )
}
export function LegalScene({ v = {} }) {
  const { h, m } = bogota(useNow(60_000))
  const cx = 150, cy = 150, r = 112
  const hasNight = v.desde != null && v.hasta != null
  const a0 = (v.desde ?? 0) * 15, a1 = (v.hasta ?? 0) * 15
  const mid = a0 + ((((a1 - a0) % 360) + 360) % 360) / 2
  const [lx, ly] = polar(cx, cy, r + 22, mid)
  const [nx, ny] = polar(cx, cy, r - 34, (h + m / 60) * 15)
  const hora = v.smmlv && v.divisor ? v.smmlv / v.divisor : null
  const rows = [
    ['Hora ordinaria', hora],
    ['Nocturna', hora && v.noct != null ? hora * (1 + v.noct) : null],
    ['Dominical', hora && v.dom != null ? hora * (1 + v.dom) : null],
  ]
  const band = (from, to) => (from <= to ? [[from, to]] : [[from, 24], [0, to]])
  const WX = 318, WY = 44, WH = 112

  return (
    <svg className="sc sc-legal" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
      <circle className="sc-dial__halo" cx={cx} cy={cy} r={r + 30} />
      <circle className="sc-dial__face" cx={cx} cy={cy} r={r} />
      {Array.from({ length: 96 }, (_, i) => {
        const major = i % 4 === 0
        const [x1, y1] = polar(cx, cy, r - (i % 24 === 0 ? 16 : major ? 10 : 5), i * 3.75)
        const [x2, y2] = polar(cx, cy, r - 2, i * 3.75)
        return <line key={i} className={major ? 'sc-dial__hr' : 'sc-dial__min'} x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      {[0, 6, 12, 18].map((hh) => {
        const [x, y] = polar(cx, cy, r - 30, hh * 15)
        return <text key={hh} className="sc-dial__num" x={x} y={y + 4} textAnchor="middle">{String(hh).padStart(2, '0')}</text>
      })}
      {hasNight
        ? (
          <>
            <path className="sc-dial__night-bg" d={arc(cx, cy, r + 9, a0, a1)} />
            <path className="sc-dial__night" pathLength="100" d={arc(cx, cy, r + 9, a0, a1)} />
            <text className="sc-dial__tag" x={lx} y={ly + 4} textAnchor={lx < cx - 10 ? 'end' : lx > cx + 10 ? 'start' : 'middle'}>
              {v.noct != null ? pctTxt(v.noct) : ''}
            </text>
          </>
        )
        : <circle className="sc-dial__night-bg is-empty" cx={cx} cy={cy} r={r + 9} />}
      <text className="sc-dial__label" x={cx} y={cy - 14} textAnchor="middle">{hasNight ? 'Nocturno' : 'Sin tramo nocturno'}</text>
      {hasNight && <text className="sc-dial__range" x={cx} y={cy + 12} textAnchor="middle">{`${String(v.desde).padStart(2, '0')}:00 – ${String(v.hasta).padStart(2, '0')}:00`}</text>}
      <line className="sc-dial__now" x1={cx} y1={cy} x2={nx} y2={ny} />
      <circle className="sc-dial__nowdot" cx={nx} cy={ny} r="4.5" />
      <circle className="sc-dial__pv" cx={cx} cy={cy} r="5" />

      {/* la semana: cada columna son 24 h; el tramo nocturno marcado; el domingo completo con su recargo */}
      {DAYS.map((d, i) => {
        const x = WX + i * 31
        const sun = i === 6
        return (
          <g key={i} className={`sc-day${sun ? ' is-sun' : ''}`} style={{ '--d': `${0.2 + i * 0.07}s` }}>
            <rect className="sc-day__col" x={x} y={WY} width="24" height={WH} rx="5" />
            {hasNight && band(v.desde, v.hasta).map(([f, t]) => (
              <rect key={f} className="sc-day__night" x={x + 3} y={WY + (f / 24) * WH} width="18" height={((t - f) / 24) * WH} rx="2" />
            ))}
            <text className="sc-day__l" x={x + 12} y={WY + WH + 16} textAnchor="middle">{d}</text>
          </g>
        )
      })}
      {v.dom != null && <text className="sc-dial__tag" x={WX + 6 * 31 + 12} y={WY - 9} textAnchor="middle">{pctTxt(v.dom)}</text>}

      <g className="sc-pay">
        {rows.map(([label, val], i) => (
          <g key={label} transform={`translate(${WX} ${WY + WH + 44 + i * 24})`}>
            <text className="sc-pay__l">{label}</text>
            <text className={`sc-pay__v${i === 0 ? '' : ' is-up'}`} x="210" textAnchor="end">{val ? fmtCOP(Math.round(val)) : '—'}</text>
            <line className="sc-pay__rule" x1="0" y1="9" x2="210" y2="9" />
          </g>
        ))}
      </g>
    </svg>
  )
}

/* ---------- Términos: la hoja que se firma ---------- */
// La hoja se escribe con el título y los párrafos del borrador; a la izquierda, quién deberá aceptarla.
// Al confirmar aparece la cinta de revisión; al publicar, el sello con la versión.
export function TermsScene({ titulo = '', paras = [], audience = 'org', phase = 'draft', version }) {
  const lines = []
  let y = 116
  for (const p of paras.slice(0, 6)) {
    const n = Math.min(3, Math.max(1, Math.ceil(p.length / 70)))
    for (let i = 0; i < n && y < 228; i++) { lines.push({ y, w: i === n - 1 ? 40 + ((p.length * 7) % 90) : 170 }); y += 11 }
    y += 7
  }
  const empty = lines.length === 0
  const last = lines[lines.length - 1]
  const penX = 216 + (last ? last.w : 60), penY = last ? last.y : 116
  return (
    <svg className="sc sc-terms" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
      {/* firmantes */}
      <g className={`sc-signer${audience === 'org' ? ' is-on' : ''}`}>
        <rect className="sc-signer__plate" x="34" y="70" width="104" height="58" rx="10" />
        <path className="sc-signer__ico" d="M58 116V90l12-6v32M70 116V94l16 5v17M54 116h36" />
        <text className="sc-signer__t" x="100" y="104">Empresas</text>
      </g>
      <g className={`sc-signer${audience === 'candidato' ? ' is-on' : ''}`}>
        <rect className="sc-signer__plate" x="34" y="150" width="104" height="58" rx="10" />
        <Person x={66} y={180} s={0.9} className="sc-signer__who" />
        <text className="sc-signer__t" x="86" y="184">Candidatos</text>
      </g>
      <path className="sc-signer__link" d={audience === 'org' ? 'M138 99C170 99 170 150 196 150' : 'M138 179C170 179 170 150 196 150'} />

      {/* versiones anteriores y la hoja nueva */}
      <rect className="sc-sheet is-old" x="206" y="30" width="236" height="252" rx="8" transform="rotate(-5 324 156)" />
      <rect className="sc-sheet is-old2" x="206" y="30" width="236" height="252" rx="8" transform="rotate(-2.2 324 156)" />
      <g className={`sc-page is-${phase}`} transform="rotate(1.6 324 156)">
        <rect className="sc-sheet" x="200" y="26" width="248" height="256" rx="8" />
        <text className={`sc-page__title${titulo ? '' : ' is-ph'}`} x="216" y="66">{cut(titulo || 'Título de los términos', 26)}</text>
        <rect className="sc-page__rule" x="216" y="80" width="56" height="3" rx="1.5" />
        {empty
          ? [0, 1, 2, 3].map((i) => <rect key={i} className="sc-page__ghost" x="216" y={116 + i * 14} width={i === 3 ? 90 : 190} height="5" rx="2.5" />)
          : lines.map((l, i) => <rect key={i} className="sc-page__line" x="216" y={l.y} width={l.w} height="5" rx="2.5" style={{ '--i': i }} />)}
        <line className="sc-page__sign" x1="216" y1="256" x2="330" y2="256" />
        <text className="sc-page__signt" x="216" y="270">Aceptación</text>
        {phase === 'confirm' && <path className="sc-ribbon" d="M410 26v46l-12-9-12 9V26z" />}
        {phase === 'done' && (
          <g className="sc-stamp" style={{ transformOrigin: '384px 214px' }}>
            <circle cx="384" cy="214" r="38" />
            <circle cx="384" cy="214" r="31" className="sc-stamp__in" />
            <text x="384" y="210" textAnchor="middle">Publicada</text>
            <text x="384" y="228" textAnchor="middle" className="sc-stamp__v">{version ? `v${version}` : ''}</text>
          </g>
        )}
      </g>
      {phase === 'draft' && (
        <g className="sc-pen" style={{ '--px': `${penX}px`, '--py': `${penY}px` }}>
          <g transform={`translate(${penX} ${penY}) rotate(-38)`}>
            <rect className="sc-pen__body" x="-4" y="-62" width="8" height="54" rx="3" />
            <path className="sc-pen__tip" d="M-4 -8L0 2 4 -8z" />
          </g>
        </g>
      )}
    </svg>
  )
}

/* ---------- Auditoría: el sismógrafo ---------- */
// Actividad de las últimas 24 h por hora (escala logarítmica), escrita por una aguja que llega hasta ahora.
export function AuditScene({ entries = [] }) {
  const now = useNow(60_000).getTime()
  const b = Array(24).fill(0)
  for (const e of entries) {
    const ago = Math.floor((now - new Date(e.at).getTime()) / 3_600_000)
    if (ago >= 0 && ago < 24) b[23 - ago]++
  }
  const total = b.reduce((s, c) => s + c, 0)
  const max = Math.max(1, ...b)
  const X0 = 40, X1 = 500, BASE = 232, TOP = 70
  const step = (X1 - X0) / 23
  const pts = b.map((c, i) => [X0 + i * step, BASE - (c ? 12 + (BASE - TOP - 12) * (Math.log1p(c) / Math.log1p(max)) : 3)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  const [lx, ly] = pts[23]
  return (
    <svg className="sc sc-audit" viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
      <rect className="sc-tape" x="22" y="48" width="500" height="206" rx="10" />
      {[0, 1, 2, 3].map((i) => <line key={i} className="sc-tape__h" x1="22" y1={TOP + i * 54} x2="522" y2={TOP + i * 54} />)}
      {Array.from({ length: 24 }, (_, i) => <line key={i} className={i % 6 === 0 ? 'sc-tape__v is-6' : 'sc-tape__v'} x1={X0 + i * step} y1="48" x2={X0 + i * step} y2="254" />)}
      {pts.map(([x, y], i) => b[i] > 0 && <rect key={i} className="sc-bar" x={x - 5} y={y} width="10" height={BASE - y} rx="2" style={{ '--i': i }} />)}
      <path className="sc-trace" pathLength="100" d={d} />
      <g className="sc-needle">
        <line className="sc-needle__arm" x1="548" y1="22" x2={lx} y2={ly} />
        <circle className="sc-needle__pv" cx="548" cy="22" r="6" />
        <circle className="sc-needle__tip" cx={lx} cy={ly} r="5" />
      </g>
      <text className="sc-note" x="40" y="276">hace 24 h</text>
      <text className="sc-note" x={X0 + 12 * step} y="276" textAnchor="middle">hace 12 h</text>
      <text className="sc-note is-now" x={X1} y="276" textAnchor="middle">ahora</text>
      <text className="sc-tape__sum" x="40" y="36">{total ? `${total} ${total === 1 ? 'evento' : 'eventos'} en 24 h` : 'Sin eventos en 24 h'}</text>
    </svg>
  )
}

/* ---------- Datos personales: la ficha que se anonimiza ---------- */
// phase: idle (sin id) → ready (id válido: se escanea) → armed (confirmado: lo que se borra se marca) → done (anonimizada).
const GONE_ROWS = ['Nombre', 'Celular', 'Canales', 'Autorizaciones', 'Mensajes', 'Documentos']
const KEPT_ROWS = ['Turnos y ofertas', 'Auditoría']
export function DatosScene({ phase = 'idle', id = '' }) {
  const X = 160, Y = 24, W = 250
  const rowY = (i) => Y + 82 + i * 22
  const keptY = (i) => Y + 82 + GONE_ROWS.length * 22 + 26 + i * 22
  return (
    <svg className={`sc sc-datos is-${phase}`} viewBox="0 0 560 300" preserveAspectRatio="xMidYMid meet">
      <rect className="sc-ficha" x={X} y={Y} width={W} height="262" rx="12" />
      <circle className="sc-ficha__photo" cx={X + 34} cy={Y + 36} r="20" />
      {phase !== 'done' && <Person x={X + 34} y={Y + 38} s={0.95} className="sc-ficha__who" />}
      <rect className="sc-ficha__name" x={X + 64} y={Y + 24} width="110" height="8" rx="4" />
      <text className="sc-ficha__id" x={X + 64} y={Y + 50}>{phase === 'idle' ? 'id ········' : `id ${id.slice(0, 8)}`}</text>
      <line className="sc-ficha__rule" x1={X + 16} y1={Y + 66} x2={X + W - 16} y2={Y + 66} />
      {GONE_ROWS.map((r, i) => (
        <g key={r} className="sc-row is-gone" style={{ '--i': i }}>
          <text className="sc-row__l" x={X + 18} y={rowY(i) + 4}>{r}</text>
          <rect className="sc-row__v" x={X + 120} y={rowY(i) - 3} width={44 + (hash(r) % 70)} height="7" rx="3.5" />
          <line className="sc-row__x" x1={X + 116} y1={rowY(i) + 0.5} x2={X + 120 + 48 + (hash(r) % 70)} y2={rowY(i) + 0.5} />
          {Array.from({ length: 8 }, (_, j) => <circle key={j} className="sc-row__dot" cx={X + 124 + j * 9} cy={rowY(i) + 0.5} r="1.6" />)}
        </g>
      ))}
      <line className="sc-ficha__cut" x1={X + 16} y1={keptY(0) - 16} x2={X + W - 16} y2={keptY(0) - 16} />
      {KEPT_ROWS.map((r, i) => (
        <g key={r} className="sc-row is-kept">
          <text className="sc-row__l" x={X + 18} y={keptY(i) + 4}>{r}</text>
          <path className="sc-row__ok" d={`M${X + W - 34} ${keptY(i)}l4 4 8-8`} />
        </g>
      ))}
      {phase === 'ready' && <rect className="sc-scan" x={X + 6} y={Y + 70} width={W - 12} height="3" rx="1.5" />}

      <path className="sc-brace" d={`M${X + W + 14} ${rowY(0) - 8}h8v${rowY(5) - rowY(0) + 16}h-8`} />
      <text className="sc-brace__t is-gone" x={X + W + 32} y={(rowY(0) + rowY(5)) / 2 + 4}>se borra</text>
      <path className="sc-brace is-kept" d={`M${X + W + 14} ${keptY(0) - 8}h8v${keptY(1) - keptY(0) + 16}h-8`} />
      <text className="sc-brace__t" x={X + W + 32} y={(keptY(0) + keptY(1)) / 2 + 4}>se conserva</text>

      {phase === 'done' && (
        <g className="sc-stamp" style={{ transformOrigin: `${X + W - 70}px ${Y + 120}px` }}>
          <rect x={X + W - 140} y={Y + 100} width="132" height="40" rx="8" />
          <text x={X + W - 74} y={Y + 126} textAnchor="middle">Anonimizada</text>
        </g>
      )}
      <Person x={88} y={150} s={2.2} className={`sc-ghostp${phase === 'done' ? ' is-gone' : ''}`} />
      <path className="sc-flow" d={`M118 150H${X - 8}`} />
    </svg>
  )
}

/* ---------- estados vacíos ---------- */
export const VacantArt = {
  orgs: (
    <svg viewBox="0 0 120 64" aria-hidden="true"><path className="sc-va" d="M10 58h100M22 58V26h22v32M50 58V12h24v46M80 58V32h20v26" /><path className="sc-va is-on" d="M58 58v-8h8v8" /></svg>
  ),
  roles: (
    <svg viewBox="0 0 120 64" aria-hidden="true"><path className="sc-va" d="M30 6h60M60 6l-10 12M60 6l10 12" /><rect className="sc-va" x="42" y="18" width="36" height="42" rx="5" /><circle className="sc-va is-on" cx="60" cy="34" r="6" /></svg>
  ),
  audit: (
    <svg viewBox="0 0 120 64" aria-hidden="true"><path className="sc-va" d="M6 44h28l6-4 6 4h68" /><circle className="sc-va is-on" cx="114" cy="44" r="3" /></svg>
  ),
  legal: (
    <svg viewBox="0 0 120 64" aria-hidden="true"><circle className="sc-va" cx="60" cy="32" r="26" /><path className="sc-va is-on" d="M60 6a26 26 0 0 1 22.5 13" /><path className="sc-va" d="M60 32V18" /></svg>
  ),
}
