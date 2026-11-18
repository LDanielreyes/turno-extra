import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtCOP } from '../shared/format'
import { Async, Btn } from '../shared/ui'
import Masthead from './Masthead'
import { ICONS } from './icons'
import { LegalScene, LegalSceneSkeleton, VacantArt } from './scenes'
import { AkError, AkField, Alert, Badge, Choice, Panel, Vacant } from './kit'

// Cada parámetro con su unidad y cómo se lee su valor.
const pct = (v) => `${Math.round(Number(v) * 1000) / 10} %`
const hour = (v) => `${String(Math.trunc(Number(v))).padStart(2, '0')}:00`
const KEYS = {
  smmlv: { label: 'Salario mínimo', short: 'SMMLV mensual', prefix: '$', suffix: 'COP', step: '1', show: (v) => fmtCOP(v) },
  divisor_horas: { label: 'Divisor de horas', short: 'horas al mes', suffix: 'h / mes', step: '1', show: (v) => `${Number(v)} h` },
  recargo_nocturno: { label: 'Recargo nocturno', short: 'sobre la hora ordinaria', suffix: '× hora', step: '0.01', show: pct, hint: '0.35 = 35 %' },
  recargo_dominical: { label: 'Recargo dominical', short: 'sobre la hora ordinaria', suffix: '× hora', step: '0.01', show: pct, hint: '0.90 = 90 %' },
  nocturno_desde_hora: { label: 'Nocturno desde', short: 'hora de inicio', suffix: 'h', step: '1', max: 23, show: hour, hint: '0 a 23' },
  nocturno_hasta_hora: { label: 'Nocturno hasta', short: 'hora de fin', suffix: 'h', step: '1', max: 23, show: hour, hint: '0 a 23' },
}
const iso = (d) => String(d).slice(0, 10)
const longDate = (d) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso(d)}T00:00:00Z`))

// Parámetros del piso salarial con fecha de vigencia. No se editan: se agrega uno nuevo con su fecha (queda historial).
export default function Legal() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'legal'], queryFn: () => api('/admin/legal') })
  const [f, setF] = useState({ clave: 'smmlv', valor: '', vigenteDesde: '', nota: '' })
  const [done, setDone] = useState(null)
  const add = useMutation({
    mutationFn: () => api('/admin/legal', { method: 'POST', body: { clave: f.clave, valor: Number(f.valor), vigenteDesde: f.vigenteDesde, nota: f.nota.trim() || undefined } }),
    onSuccess: () => { setDone({ clave: f.clave, valor: f.valor, desde: f.vigenteDesde }); setF({ ...f, valor: '', nota: '' }); qc.invalidateQueries({ queryKey: ['admin', 'legal'] }) },
  })

  const today = new Date().toISOString().slice(0, 10)
  const params = q.data?.params ?? []
  const byKey = (k) => params.filter((p) => p.clave === k).sort((a, b) => iso(b.vigenteDesde).localeCompare(iso(a.vigenteDesde)))
  const current = (k) => byKey(k).find((p) => iso(p.vigenteDesde) <= today)

  const k = KEYS[f.clave]
  const nextJan = `${new Date().getFullYear() + 1}-01-01`
  const valStatus = f.valor !== '' && Number(f.valor) > 0 ? { tone: 'muted', text: `Se leerá como ${k.show(f.valor)}` } : null
  const missing = Object.keys(KEYS).filter((x) => !current(x)).length
  const val = (key) => { const c = current(key); return c ? Number(c.valor) : undefined }
  const v = { smmlv: val('smmlv'), divisor: val('divisor_horas'), noct: val('recargo_nocturno'), dom: val('recargo_dominical'), desde: val('nocturno_desde_hora'), hasta: val('nocturno_hasta_hora') }
  const hora = v.smmlv && v.divisor ? v.smmlv / v.divisor : null
  // efecto del valor que se está escribiendo sobre la hora: hoy frente a «con este valor»
  const n = Number(f.valor)
  const effect = !(f.valor !== '' && n > 0) ? null : {
    smmlv: v.divisor && ['Hora ordinaria', hora, n / v.divisor],
    divisor_horas: v.smmlv && ['Hora ordinaria', hora, v.smmlv / n],
    recargo_nocturno: hora && ['Hora nocturna', v.noct != null ? hora * (1 + v.noct) : null, hora * (1 + n)],
    recargo_dominical: hora && ['Hora dominical', v.dom != null ? hora * (1 + v.dom) : null, hora * (1 + n)],
  }[f.clave]

  return (
    <>
      <Masthead title="Parámetros legales" art={(q.isPending ? <LegalSceneSkeleton /> : <LegalScene v={v} />)}
        facts={hora ? [[fmtCOP(Math.round(hora)), 'hora ordinaria'], [v.noct != null ? pct(v.noct) : '—', 'recargo nocturno'], [v.dom != null ? pct(v.dom) : '—', 'recargo dominical']] : null}
        lede="Piso salarial por vigencia: nada se edita, todo queda en el historial. Validar con contador o abogado laboralista." />

      {q.isSuccess && missing > 0 && (
        <Alert tone="warn">Faltan {missing} {missing === 1 ? 'parámetro vigente' : 'parámetros vigentes'}. Sin ellos no se puede calcular el piso ni publicar turnos.</Alert>
      )}

      <div className="ak-split">
        <Panel title="Registrar valor" icon={ICONS.plus}>
          <form className="ak-form" onSubmit={(e) => { e.preventDefault(); setDone(null); add.mutate() }}>
            <fieldset className="ak-fieldset">
              <legend>Parámetro</legend>
              <Choice name="clave" value={f.clave} onChange={(clave) => { setDone(null); setF({ ...f, clave, valor: '' }) }}
                options={Object.entries(KEYS).map(([key, m]) => {
                  const c = current(key)
                  return { value: key, label: m.label, sub: q.isPending ? <span className="skel-inline" aria-hidden="true" /> : c ? m.show(c.valor) : 'Sin valor vigente' }
                })} />
            </fieldset>
            <div className="ak-row2">
              <AkField label="Valor" hint={k.hint} prefix={k.prefix} suffix={k.suffix} type="number" inputMode="decimal" step={k.step} min="0" max={k.max} required
                status={valStatus} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
              <div className="ak-field">
                <AkField label="Vigente desde" type="date" required value={f.vigenteDesde} onChange={(e) => setF({ ...f, vigenteDesde: e.target.value })} />
                <div className="ak-quick">
                  <button type="button" className="ak-chipbtn" onClick={() => setF({ ...f, vigenteDesde: today })}>Hoy</button>
                  <button type="button" className="ak-chipbtn" onClick={() => setF({ ...f, vigenteDesde: nextJan })}>1 ene {nextJan.slice(0, 4)}</button>
                </div>
              </div>
            </div>
            {effect && (
              <div className="ak-effect" role="status">
                <div><span>{effect[0]} hoy</span><b>{effect[1] ? fmtCOP(Math.round(effect[1])) : '—'}</b></div>
                <div className="is-new"><span>Con este valor</span><b>{fmtCOP(Math.round(effect[2]))}</b></div>
                <div><span>Diferencia</span><b>{effect[1] ? `${effect[2] >= effect[1] ? '+' : '−'}${Math.abs(Math.round(((effect[2] - effect[1]) / effect[1]) * 1000) / 10)} %` : '—'}</b></div>
              </div>
            )}
            <AkField label="Fuente" hint="opcional" placeholder="Decreto o resolución" maxLength={300} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} />
            <AkError error={add.error} />
            {done && <Alert>{KEYS[done.clave].label}: {KEYS[done.clave].show(done.valor)} desde el {longDate(done.desde)}.</Alert>}
            <div className="ak-form__foot">
              <Btn type="submit" variant="primary" loading={add.isPending}>Registrar valor</Btn>
            </div>
          </form>
        </Panel>

        <Panel className="ak-panel--flush" title="Historial" icon={ICONS.history} meta="más reciente primero">
          <Async skeleton="table" q={q} empty={Object.assign((d) => d.params.length === 0, { node: <Vacant art={VacantArt.legal} title="Sin parámetros">Registra el primer valor con el formulario.</Vacant> })}>
            {() => (
              <div className="ak-ledger">
                {Object.entries(KEYS).map(([key, m]) => {
                  const list = byKey(key)
                  const cur = current(key)
                  return (
                    <section key={key} className="ak-ledger__group">
                      <h3>{m.label}<span>{m.short}</span></h3>
                      {list.length === 0 ? <p className="ak-none">Sin valores registrados.</p> : (
                        <ol>
                          {list.map((p) => {
                            const st = iso(p.vigenteDesde) > today ? 'next' : p === cur ? 'now' : 'old'
                            return (
                              <li key={p.id} className={`is-${st}`}>
                                <b>{m.show(p.valor)}</b>
                                <span className="ak-ledger__when">desde {longDate(p.vigenteDesde)}</span>
                                {st === 'now' ? <Badge tone="on">Vigente</Badge> : st === 'next' ? <Badge tone="next">Programado</Badge> : <span />}
                                {p.nota && <small>{p.nota}</small>}
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </Async>
        </Panel>
      </div>
    </>
  )
}
