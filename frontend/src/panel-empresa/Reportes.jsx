import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, errorText } from '../shared/api'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { useOrg } from './org'
import './reportes.css'

// Reporte mensual por persona. La hoja sale de la impresora con lo que devolvió el backend
// (las mismas filas del CSV) y el archivo se descarga a la vez. Cada impresión queda en la bitácora.

const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const thisMonth = () => keyOf(new Date())
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const label = (mes) => { const [y, m] = mes.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}` }
const lastMonths = (n) => {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => keyOf(new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)))
}

// Columnas que trae el CSV, en el orden del backend.
const COLS = [
  ['dias', 'Días'], ['turnos', 'Turnos'], ['horas', 'Horas'], ['horas_nocturnas', 'Noct.'],
  ['horas_dominicales', 'Dom.'], ['no_shows', 'Faltas'], ['sin_marcar', 'Sin marcar'], ['en_disputa', 'Disputa'],
]
const TITLES = {
  dias: 'Días trabajados', turnos: 'Turnos', horas: 'Horas', horas_nocturnas: 'Horas nocturnas',
  horas_dominicales: 'Horas dominicales', no_shows: 'Inasistencias', sin_marcar: 'Asistencia sin marcar', en_disputa: 'En disputa',
}

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [head = [], ...body] = rows
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const num = (v) => Number(String(v).replace(',', '.')) || 0
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

function save(blob, mes) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `turnoextra-${mes}.csv` })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Reportes() {
  const { orgId } = useOrg()
  const months = lastMonths(12)
  const [mes, setMes] = useState(thisMonth())
  const [printed, setPrinted] = useState({}) // mes → { rows, blob }
  const dl = useMutation({
    mutationFn: async (m) => {
      const res = await api(`/orgs/${orgId}/reports/monthly?mes=${m}`, { raw: true })
      const blob = await res.blob()
      const rows = parseCsv(await blob.text())
      return { m, rows, blob }
    },
    onSuccess: ({ m, rows, blob }) => { setPrinted((p) => ({ ...p, [m]: { rows, blob } })); save(blob, m) },
  })
  const pick = (m) => { setMes(m); if (dl.isError) dl.reset() }
  // La cinta abre en el mes más reciente (a la derecha), no en el de hace un año.
  const stripRef = useRef(null)
  useEffect(() => { const el = stripRef.current; if (el) el.scrollLeft = el.scrollWidth }, [])

  const sheet = printed[mes]
  const busy = dl.isPending && dl.variables === mes
  const failed = dl.isError && dl.variables === mes
  const older = !months.includes(mes)
  const count = Object.keys(printed).length

  return (
    <section className="rp" aria-labelledby="rp-title">
      <Crops />
      <header className="rp__head">
        <div className="rp__title">
          <h1 id="rp-title">Reportes</h1>
          <ul className="rp-key">
            <li><i className="rp-k rp-k--on" aria-hidden="true" />Mes elegido</li>
            <li><i className="rp-k rp-k--done" aria-hidden="true" />Ya impreso</li>
          </ul>
        </div>
        <dl className="rp__facts">
          <div><dt>mes en la impresora</dt><dd>{label(mes)}</dd></div>
          <div><dt>{count === 1 ? 'hoja impresa' : 'hojas impresas'}</dt><dd>{count}</dd></div>
        </dl>
      </header>

      {/* Calendario de pared: un mes por hoja; se elige tocándolo. */}
      <div className="rp-cal">
        <ol ref={stripRef} className="rp-cal__strip" role="radiogroup" aria-label="Mes del reporte">
          {months.map((m, i) => {
            const [y, mm] = m.split('-').map(Number)
            const on = m === mes
            return (
              <li key={m} style={{ '--i': i }}>
                <button type="button" role="radio" aria-checked={on} aria-label={`${label(m)}${printed[m] ? ', ya impreso' : ''}`}
                  className={`rp-page${on ? ' is-on' : ''}${printed[m] ? ' is-done' : ''}`} onClick={() => pick(m)}>
                  <span className="rp-page__rings" aria-hidden="true"><i /><i /></span>
                  <span className="rp-page__m">{MONTHS[mm - 1]}</span>
                  <span className="rp-page__y">{y}</span>
                  {printed[m] && <svg className="rp-page__tick" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" /></svg>}
                </button>
              </li>
            )
          })}
        </ol>
        <label className={`rp-other${older ? ' is-on' : ''}`}>
          <span>Otro mes</span>
          <input type="month" max={thisMonth()} value={mes} onChange={(e) => e.target.value && pick(e.target.value)} aria-label="Elegir otro mes" />
        </label>
      </div>

      {/* Impresora: el botón está en la máquina; la hoja sale con los datos que devolvió el backend. */}
      <div className="rp-press">
        <div className={`rp-printer${busy ? ' is-busy' : ''}${failed ? ' is-jam' : ''}`}>
          <div className="rp-printer__top">
            <span className={`rp-led${busy ? ' is-busy' : failed ? ' is-jam' : sheet ? ' is-ok' : ''}`} aria-hidden="true" />
            <span className="rp-printer__lcd" aria-live="polite">
              {busy ? 'Imprimiendo…' : failed ? 'Atasco' : sheet ? 'Listo' : label(mes)}
            </span>
            <Btn variant="primary" loading={busy} onClick={() => dl.mutate(mes)}>
              <svg className="rp-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8V3h8v5M6 14H4V8h12v6h-2" /><path d="M6 11h8v6H6z" /></svg>
              {sheet ? 'Imprimir de nuevo' : 'Imprimir y descargar'}
            </Btn>
          </div>
          <div className="rp-printer__slot" aria-hidden="true" />
        </div>

        <div className="rp-feed">
          {failed ? (
            <article className="rp-sheet is-jam" role="alert">
              <svg className="rp-jam" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 8l14 25H6z" /><path d="M20 17v7M20 28v.4" /></svg>
              <strong>La hoja no salió</strong>
              <p>{errorText(dl.error)}</p>
              <Btn size="sm" onClick={() => dl.mutate(mes)}>Reintentar</Btn>
            </article>
          ) : sheet ? (
            <Sheet key={mes} mes={mes} rows={sheet.rows} onAgain={() => save(sheet.blob, mes)} />
          ) : (
            <article className={`rp-sheet is-blank${busy ? ' is-printing' : ''}`} aria-label={`Hoja de ${label(mes)} sin imprimir`}>
              <SheetHead mes={mes} />
              <table className="rp-tbl" aria-hidden="true">
                <ColHead />
                <tbody>
                  {[0, 1, 2, 3].map((r) => (
                    <tr key={r}><td><i className="rp-bar" style={{ width: `${70 - r * 9}%` }} /></td>{COLS.map(([k]) => <td key={k}><i className="rp-bar rp-bar--n" /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </article>
          )}
        </div>
      </div>
    </section>
  )
}

const SheetHead = ({ mes, n }) => (
  <header className="rp-sheet__head">
    <span className="rp-sheet__brand">TurnoExtra</span>
    <strong>{label(mes)}</strong>
    <span className="rp-sheet__n">{n == null ? 'Por persona' : `${n} ${n === 1 ? 'persona' : 'personas'}`}</span>
  </header>
)

const ColHead = () => (
  <thead>
    <tr>
      <th scope="col">Persona</th>
      {COLS.map(([k, l]) => <th key={k} scope="col" title={TITLES[k]}><abbr title={TITLES[k]}>{l}</abbr></th>)}
    </tr>
  </thead>
)

const SHOW = 8

function Sheet({ mes, rows, onAgain }) {
  const tot = Object.fromEntries(COLS.map(([k]) => [k, rows.reduce((s, r) => s + num(r[k]), 0)]))
  const view = rows.slice(0, SHOW)
  return (
    <article className="rp-sheet is-out" aria-label={`Reporte de ${label(mes)}`}>
      <SheetHead mes={mes} n={rows.length} />
      {rows.length === 0 ? (
        <p className="rp-sheet__empty">Nadie trabajó este mes.</p>
      ) : (
        <div className="rp-tbl-wrap">
          <table className="rp-tbl">
            <ColHead />
            <tbody>
              {view.map((r, i) => (
                <tr key={i} style={{ '--r': i }}>
                  <th scope="row"><div className="rp-who"><span>{r.nombre}</span>{r.celular && <small>{r.celular}</small>}</div></th>
                  {COLS.map(([k]) => {
                    const v = num(r[k])
                    const warn = (k === 'no_shows' || k === 'en_disputa' || k === 'sin_marcar') && v > 0
                    return <td key={k} className={v === 0 ? 'is-zero' : warn ? 'is-warn' : ''}>{fmt(v)}</td>
                  })}
                </tr>
              ))}
              {rows.length > SHOW && (
                <tr className="rp-tbl__more"><th scope="row" colSpan={COLS.length + 1}>+{rows.length - SHOW} personas más en el archivo</th></tr>
              )}
            </tbody>
            <tfoot>
              <tr><th scope="row">Total</th>{COLS.map(([k]) => <td key={k}>{fmt(tot[k])}</td>)}</tr>
            </tfoot>
          </table>
        </div>
      )}
      <footer className="rp-sheet__foot">
        <span className="rp-stamp" aria-hidden="true">Descargado</span>
        <span className="rp-file">turnoextra-{mes}.csv</span>
        <button type="button" className="rp-again" onClick={onAgain}>Guardar otra copia</button>
      </footer>
    </article>
  )
}
