import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { addHours, defaultStart, fmtCOP, localToIso } from '../shared/format'
import { Btn, Card, ErrorState, Field, FormError, PageTitle } from '../shared/ui'
import { orgKey, useOrg, useRoles } from './org'
import Decimal from 'decimal.js'
import './live/floor.css'

// Piso en vivo: cada cambio de horario recalcula el mínimo legal con el servidor (los parámetros viven allá).
function useDebounced(v, ms = 350) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

export default function TurnoNuevo() {
  const { orgId } = useOrg()
  const nav = useNavigate()
  const qc = useQueryClient()
  const roles = useRoles()
  const [f, setF] = useState(() => { const i = defaultStart(); return { roleId: '', inicio: i, fin: addHours(i, 6), cupos: 1, pago: '', notas: '' } })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const win = useDebounced({ inicio: f.inicio, fin: f.fin })
  const validWin = win.inicio && win.fin && new Date(win.fin) > new Date(win.inicio)

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
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: orgKey(orgId, 'shifts') }); nav(`/turnos/${r.id}`) },
  })

  if (roles.isError) return <ErrorState error={roles.error} onRetry={roles.refetch} />
  const noRoles = roles.data && roles.data.roles.length === 0

  return (
    <>
      <PageTitle title="Publicar turno" lede="Al publicar, la oferta sale a las personas elegibles de tu banca." actions={<Link className="btn btn--ghost" to="/turnos">Cancelar</Link>} />
      {noRoles && <p className="notice notice--warn">Tu organización aún no tiene roles habilitados. Pídele al administrador de TurnoExtra que los active.</p>}
      <div className="grid2">
        <Card title="Datos del turno">
          <form className="formgrid" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
            <Field wide label="Rol" as="select" required value={f.roleId} onChange={set('roleId')}>
              <option value="">Elige un rol</option>
              {roles.data?.roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </Field>
            <Field label="Inicio" type="datetime-local" required value={f.inicio} onChange={set('inicio')} />
            <Field label="Fin" type="datetime-local" required value={f.fin} onChange={set('fin')} error={validWin === false ? 'Debe ser posterior al inicio' : undefined} />
            <Field label="Cupos" type="number" min={1} max={50} required value={f.cupos} onChange={set('cupos')} />
            <Field label="Pago total por persona" hint="(COP)" type="number" min={1} step={1} required value={f.pago} onChange={set('pago')}
              error={below ? `Está por debajo del piso (${fmtCOP(piso.toString())})` : undefined} />
            <Field wide label="Notas" hint="(opcional)" as="textarea" maxLength={500} value={f.notas} onChange={set('notas')} />
            <div className="field--wide stack">
              <FormError error={create.error} />
              <Btn type="submit" variant="primary" loading={create.isPending} disabled={below || noRoles || !f.roleId}>Publicar y enviar ofertas</Btn>
            </div>
          </form>
        </Card>
        <FloorCard floor={floor} pago={pago} onUse={() => floor.data && setF({ ...f, pago: floor.data.pisoTotal })} />
      </div>
    </>
  )
}

// Piso en vivo, mostrado (DESIGN.md §1.2): regla de pago contra piso, barra base + recargos y reparto de horas.
function FloorCard({ floor, pago, onUse }) {
  const d = floor.data
  let view = null
  if (d) {
    const piso = new Decimal(d.pisoTotal)
    const base = Decimal.min(piso, new Decimal(d.horas).mul(d.valorHoraBase).toDecimalPlaces(0))
    const recargos = piso.minus(base)
    const totalMin = new Decimal(d.horas).mul(60)
    const pct = (x) => (totalMin.isZero() ? 0 : Decimal.min(100, new Decimal(x).div(totalMin).mul(100)).toNumber())
    // escala de la regla: hasta 1,5 × piso o el pago, lo que sea mayor
    const top = Decimal.max(piso.mul('1.5'), pago ?? 0)
    const at = (x) => (top.isZero() ? 0 : new Decimal(x).div(top).mul(100).toNumber())
    const diff = pago ? pago.minus(piso) : null
    view = { piso, base, recargos, pct, at, diff }
  }
  return (
    <Card title="Piso legal en vivo">
      {floor.isFetching && !d && <p className="muted">Calculando…</p>}
      {floor.isError && <ErrorState error={floor.error} onRetry={floor.refetch} />}
      {d && view && (
        <div className="stack bar-in fl">
          <div className="kpi"><b className="mono">{fmtCOP(d.pisoTotal)}</b><span>mínimo por persona</span></div>

          <div className="fl-rule" role="img" aria-label={pago ? `Pago ${fmtCOP(pago.toString())}, ${view.diff.gte(0) ? 'sobre' : 'bajo'} el piso` : 'Escribe el pago para compararlo con el piso'}>
            <span className="fl-rule__floor" style={{ left: `${view.at(view.piso)}%` }}><i />piso</span>
            {pago && <span className={view.diff.gte(0) ? 'fl-rule__fill is-ok' : 'fl-rule__fill is-low'} style={{ width: `${view.at(pago)}%` }} />}
          </div>
          {pago && (
            <p className={view.diff.gte(0) ? 'fl-diff is-ok' : 'fl-diff is-low'}>
              <b className="mono">{view.diff.gte(0) ? '+' : '−'}{fmtCOP(view.diff.abs().toString())}</b>
              {view.diff.gte(0) ? 'sobre el piso' : 'bajo el piso'}
            </p>
          )}

          <div className="fl-bar" aria-hidden="true">
            <span style={{ flexGrow: view.base.toNumber() }} className="fl-bar__base" />
            {view.recargos.gt(0) && <span style={{ flexGrow: view.recargos.toNumber() }} className="fl-bar__extra" />}
          </div>
          <dl className="fl-legend">
            <div><dt><i className="fl-sw fl-sw--base" />Base · <span className="mono">{d.horas} h</span></dt><dd className="mono">{fmtCOP(view.base.toString())}</dd></div>
            <div><dt><i className="fl-sw fl-sw--extra" />Recargos</dt><dd className="mono">{fmtCOP(view.recargos.toString())}</dd></div>
          </dl>

          <div className="fl-hours" aria-label="Reparto de horas">
            <span><i style={{ width: `${view.pct(d.minutosNocturnos)}%` }} className="fl-h--night" /><small>Nocturnas <b className="mono">{(d.minutosNocturnos / 60).toFixed(1)} h</b></small></span>
            <span><i style={{ width: `${view.pct(d.minutosDominicales)}%` }} className="fl-h--sun" /><small>Dominicales <b className="mono">{(d.minutosDominicales / 60).toFixed(1)} h</b></small></span>
          </div>

          <Btn size="sm" onClick={onUse}>Usar el piso como pago</Btn>
          <p className="small muted">TurnoExtra no paga ni contrata: el pago lo hace tu organización. Este cálculo es una guía y no reemplaza asesoría laboral.</p>
        </div>
      )}
    </Card>
  )
}
