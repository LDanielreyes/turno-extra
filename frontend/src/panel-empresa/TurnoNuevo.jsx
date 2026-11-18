import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'
import { api, errorText } from '../shared/api'
import { addHours, defaultStart, fmtCOP, localToIso } from '../shared/format'
import { ErrorState } from '../shared/ui'
import { orgKey, useOrg, useRoles } from './org'
import { Plate, Seats, TkIco, dayNum, hhmm, hoursText, month, reducedMotion, weekday } from './turnos-kit'

// Piso en vivo: cada cambio de horario recalcula el mínimo legal con el servidor (los parámetros viven allá).
function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

const MAX_SEATS = 50
const SHOW_SEATS = 12
const QUICK_H = [4, 6, 8]

// El boleto es el formulario: se escribe sobre el papel y el talón resume lo que va a salir.
// Al publicar, el talón se desprende por la perforación y se abre el detalle en vivo.
export default function TurnoNuevo() {
  const { orgId } = useOrg()
  const nav = useNavigate()
  const qc = useQueryClient()
  const roles = useRoles()
  const [f, setF] = useState(() => { const i = defaultStart(); return { roleId: '', inicio: i, fin: addHours(i, 6), cupos: 1, pago: '', notas: '' } })
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const win = useDebounced({ inicio: f.inicio, fin: f.fin })
  const validWin = win.inicio && win.fin && new Date(win.fin) > new Date(win.inicio)
  const badWin = f.inicio && f.fin && !(new Date(f.fin) > new Date(f.inicio))

  const floor = useQuery({
    queryKey: orgKey(orgId, 'floor', win.inicio, win.fin),
    queryFn: () => api(`/orgs/${orgId}/shifts/floor-preview`, { method: 'POST', body: { inicio: localToIso(win.inicio), fin: localToIso(win.fin) } }),
    enabled: !!validWin,
    retry: false,
  })
  // Dinero con decimal.js: nada de flotantes al comparar contra el piso.
  const piso = floor.data ? new Decimal(floor.data.pisoTotal) : null
  const pagoOk = /^\d+$/.test(String(f.pago).trim())
  const pago = pagoOk ? new Decimal(String(f.pago).trim()) : null
  const below = piso != null && pago != null && pago.lt(piso)

  const create = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/shifts`, {
      method: 'POST',
      body: { roleId: f.roleId, inicio: localToIso(f.inicio), fin: localToIso(f.fin), cupos: Number(f.cupos), pagoTotal: pago ? pago.toNumber() : Number(f.pago), notas: f.notas.trim() || undefined },
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: orgKey(orgId, 'shifts') })
      setSent(true)
      setTimeout(() => nav(`/turnos/${r.id}`), reducedMotion() ? 0 : 650)
    },
  })

  if (roles.isError) return <ErrorState error={roles.error} onRetry={roles.refetch} />
  const roleList = roles.data?.roles ?? []
  const noRoles = roles.data && roleList.length === 0
  const role = roleList.find((r) => r.id === f.roleId)
  const cupos = Math.max(1, Math.min(MAX_SEATS, Number(f.cupos) || 1))
  const setCupos = (n) => setF({ ...f, cupos: Math.max(1, Math.min(MAX_SEATS, n)) })
  const ready = !!f.roleId && !badWin && pagoOk && !below && !noRoles
  const startOk = f.inicio && !Number.isNaN(+new Date(f.inicio))

  return (
    <Plate title="Publicar turno" legend={[['on', 'Puesto'], ['floor', 'Piso legal']]}
      side={<Link className="tk-back" to="/turnos"><TkIco name="back" />Turnos</Link>}>
      {noRoles && <p className="tk-warn" role="alert">Tu organización aún no tiene roles habilitados. Pídele al administrador de TurnoExtra que los active.</p>}

      <form className={`tk-form${sent ? ' is-sent' : ''}`} onSubmit={(e) => { e.preventDefault(); if (ready) create.mutate() }} aria-busy={create.isPending || undefined}>
        <div className="tk-form__paper">
          <div className="tk-form__body">
            {/* Rol */}
            <fieldset className="tk-f">
              <legend>Rol</legend>
              {roles.isPending ? <span className="tk-skel" style={{ height: 34, width: '60%' }} /> : (
                <div className="tk-roles">
                  {roleList.map((r) => (
                    <label key={r.id} className={`tk-chip${f.roleId === r.id ? ' is-on' : ''}`}>
                      <input type="radio" name="rol" value={r.id} required checked={f.roleId === r.id} onChange={set('roleId')} />
                      {r.nombre}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            {/* Horario */}
            <fieldset className="tk-f">
              <legend>Horario</legend>
              <div className="tk-when">
                <label className="tk-in"><span>Inicio</span><input type="datetime-local" required value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value, fin: f.fin && f.inicio && new Date(f.fin) > new Date(f.inicio) && e.target.value ? addHours(e.target.value, (new Date(f.fin) - new Date(f.inicio)) / 3_600_000) : f.fin })} /></label>
                <span className="tk-when__dur mono" aria-live="polite">{badWin ? '—' : hoursText(f.inicio, f.fin)}</span>
                <label className={`tk-in${badWin ? ' is-bad' : ''}`}><span>Fin</span><input type="datetime-local" required value={f.fin} aria-invalid={badWin || undefined} onChange={set('fin')} /></label>
              </div>
              <div className="tk-quick">
                {QUICK_H.map((h) => (
                  <button key={h} type="button" className={!badWin && hoursText(f.inicio, f.fin) === `${h} h` ? 'is-on' : ''} disabled={!startOk}
                    onClick={() => setF({ ...f, fin: addHours(f.inicio, h) })}>{h} h</button>
                ))}
                {badWin && <span className="tk-err">El fin debe ser posterior al inicio</span>}
              </div>
            </fieldset>

            {/* Puestos */}
            <fieldset className="tk-f">
              <legend>Puestos</legend>
              <div className="tk-seatpick">
                <button type="button" className="tk-step" aria-label="Quitar un puesto" disabled={cupos <= 1} onClick={() => setCupos(cupos - 1)}><TkIco name="minus" /></button>
                <span className="tk-seatpick__row">
                  {Array.from({ length: Math.min(cupos + 1, SHOW_SEATS) }, (_, i) => (
                    <button key={i} type="button" className={`tk-seat tk-seat--btn${i < cupos ? ' is-on' : ' is-ghost'}`}
                      aria-label={`${i + 1} ${i === 0 ? 'puesto' : 'puestos'}`} aria-pressed={i < cupos} onClick={() => setCupos(i + 1)} />
                  ))}
                  {cupos >= SHOW_SEATS && <b className="tk-seats__more">{cupos > SHOW_SEATS ? `+${cupos - SHOW_SEATS + 1}` : ''}</b>}
                </span>
                <button type="button" className="tk-step" aria-label="Agregar un puesto" disabled={cupos >= MAX_SEATS} onClick={() => setCupos(cupos + 1)}><TkIco name="plus" /></button>
                <input className="tk-seatpick__n mono" type="number" min={1} max={MAX_SEATS} aria-label="Número de puestos" value={f.cupos} onChange={set('cupos')} />
              </div>
            </fieldset>

            {/* Pago */}
            <fieldset className="tk-f">
              <legend>Pago por persona</legend>
              <Pay value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value.replace(/\D/g, '') })} pago={pago} floor={floor} below={below}
                onUse={() => floor.data && setF({ ...f, pago: floor.data.pisoTotal })} />
            </fieldset>

            <label className="tk-f tk-notes">
              <span className="tk-f__lbl">Notas <small>opcional</small></span>
              <textarea maxLength={500} rows={2} placeholder="Uniforme, punto de encuentro…" value={f.notas} onChange={set('notas')} />
            </label>

            <p className="tk-fine">TurnoExtra no paga ni contrata: el pago lo hace tu organización. El piso es una guía y no reemplaza asesoría laboral.</p>
          </div>

          {/* Talón: resumen de lo que sale y la acción */}
          <aside className="tk-form__stub" aria-label="Resumen del turno">
            <div className="tk-stubday">
              {startOk ? (
                <>
                  <small>{weekday(new Date(f.inicio))}</small>
                  <b>{dayNum(new Date(f.inicio))}</b>
                  <span>{month(new Date(f.inicio))}</span>
                </>
              ) : <b>—</b>}
            </div>
            <strong className={`tk-stub__role${role ? '' : ' is-empty'}`}>{role?.nombre ?? 'Elige un rol'}</strong>
            <span className="tk-stub__time mono">{startOk && !badWin ? `${hhmm(new Date(f.inicio))}–${hhmm(new Date(f.fin))}` : '—'}</span>
            <Seats cupos={cupos} filled={0} max={10} label={`${cupos} ${cupos === 1 ? 'puesto' : 'puestos'}`} />
            <span className={`tk-stub__pay mono${below ? ' is-bad' : ''}`}>{pago ? fmtCOP(pago.toString()) : '$ —'}</span>
            {create.error && <p className="tk-err" role="alert">{errorText(create.error)}</p>}
            <button type="submit" className="btn btn--primary tk-stub__go" disabled={!ready || sent} aria-busy={create.isPending || undefined}>
              {sent ? 'Enviado' : 'Publicar'} <TkIco name="arrow" />
            </button>
            <Link className="tk-stub__cancel" to="/turnos">Cancelar</Link>
          </aside>
        </div>
      </form>
    </Plate>
  )
}

// Pago sobre una regla: la marca del piso legal, el relleno del pago, y la base + recargos debajo.
function Pay({ value, onChange, pago, floor, below, onUse }) {
  const d = floor.data
  let v = null
  if (d) {
    const piso = new Decimal(d.pisoTotal)
    const base = Decimal.min(piso, new Decimal(d.horas).mul(d.valorHoraBase).toDecimalPlaces(0))
    const recargos = piso.minus(base)
    const top = Decimal.max(piso.mul('1.5'), pago ?? 0)
    const at = (x) => (top.isZero() ? 0 : new Decimal(x).div(top).mul(100).toNumber())
    const diff = pago ? pago.minus(piso) : null
    v = { piso, base, recargos, at, diff }
  }
  return (
    <div className="tk-pay">
      <div className="tk-pay__top">
        <label className={`tk-in tk-in--money${below ? ' is-bad' : ''}`}>
          <span className="sr-only">Pago total por persona en pesos</span>
          <i aria-hidden="true">$</i>
          <input inputMode="numeric" pattern="\d*" required placeholder="0" value={value} onChange={onChange} aria-invalid={below || undefined} />
          <small>COP</small>
        </label>
        {d && <button type="button" className="tk-usefloor" onClick={onUse}>Usar el piso <b className="mono">{fmtCOP(d.pisoTotal)}</b></button>}
      </div>

      {floor.isError ? <ErrorState error={floor.error} onRetry={floor.refetch} />
        : !d ? <div className="tk-rule is-loading" aria-label="Calculando el piso legal" />
        : (
          <>
            <div className={`tk-rule${floor.isFetching ? ' is-stale' : ''}`} role="img"
              aria-label={pago ? `Pago ${fmtCOP(pago.toString())}, ${v.diff.gte(0) ? 'sobre' : 'bajo'} el piso de ${fmtCOP(d.pisoTotal)}` : `Piso legal ${fmtCOP(d.pisoTotal)}`}>
              {pago && <span className={`tk-rule__fill${v.diff.gte(0) ? ' is-ok' : ' is-low'}`} style={{ width: `${v.at(pago)}%` }} />}
              <span className="tk-rule__floor" style={{ left: `${v.at(v.piso)}%` }}><i /><small>piso</small></span>
            </div>
            <div className="tk-pay__read">
              {pago
                ? <span className={v.diff.gte(0) ? 'is-ok' : 'is-low'}><b className="mono">{v.diff.gte(0) ? '+' : '−'}{fmtCOP(v.diff.abs().toString())}</b> {v.diff.gte(0) ? 'sobre el piso' : 'bajo el piso'}</span>
                : <span>Mínimo <b className="mono">{fmtCOP(d.pisoTotal)}</b></span>}
              <span className="tk-pay__split">
                <i className="tk-sw tk-sw--base" />Base <b className="mono">{fmtCOP(v.base.toString())}</b>
                {v.recargos.gt(0) && <><i className="tk-sw tk-sw--extra" />Recargos <b className="mono">{fmtCOP(v.recargos.toString())}</b></>}
              </span>
              {(d.minutosNocturnos > 0 || d.minutosDominicales > 0) && (
                <span className="tk-pay__split">
                  {d.minutosNocturnos > 0 && <>Nocturnas <b className="mono">{(d.minutosNocturnos / 60).toFixed(1)} h</b></>}
                  {d.minutosDominicales > 0 && <>Dominicales <b className="mono">{(d.minutosDominicales / 60).toFixed(1)} h</b></>}
                </span>
              )}
            </div>
          </>
        )}
    </div>
  )
}
