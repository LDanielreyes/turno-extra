import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { useSession } from '../shared/session'
import { fmtRange } from '../shared/format'
import { Async, Badge, Btn, Card, Empty, Field, FormError, PageTitle, Toggle } from '../shared/ui'

// Panel mínimo del candidato (doc §3, §6): mis turnos, mis canales, disputar una marca, baja y borrado.
//
// Rutas del backend (apps/api/src/routes/candidate.ts): GET /yo, PUT /yo/canales, POST /yo/disputas, /yo/baja, /yo/borrar.
// El acceso es POST /candidato/codigo → POST /candidato/verificar (cookie propia, 12 h); ver acceso/Login.jsx.
const CANAL = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Correo' }

export default function Yo() {
  const q = useQuery({ queryKey: ['yo'], queryFn: () => api('/yo') })
  return (
    <>
      <PageTitle title="Mi espacio" lede="Tus turnos, tus canales y tus datos. Las ofertas siguen llegando por el canal que elijas." />
      <Async skeleton="card" q={q}>
        {(d) => (
          <div className="stack">
            <Turnos turnos={d.turnos} />
            <Canales canales={d.canales} />
            <Datos />
          </div>
        )}
      </Async>
    </>
  )
}

function Turnos({ turnos }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(null)
  const [motivo, setMotivo] = useState('')
  const dispute = useMutation({
    mutationFn: (assignmentId) => api('/yo/disputas', { method: 'POST', body: { assignmentId, motivo: motivo.trim() } }),
    onSuccess: () => { setOpen(null); setMotivo(''); qc.invalidateQueries({ queryKey: ['yo'] }) },
  })
  return (
    <Card title="Mis turnos">
      {turnos.length === 0 ? <Empty title="Todavía no tienes turnos">Cuando aceptes una oferta, aparecerá aquí.</Empty> : (
        <ul className="plain">
          {turnos.map((t) => (
            <li key={t.assignmentId} className="stack">
              <div className="row row--between">
                <span><strong>{t.rol}</strong> · {t.org}<br /><span className="muted small">{fmtRange(t.inicio, t.fin)}</span></span>
                <span className="row"><Badge value={t.estado} />{t.disputable && <Btn size="sm" onClick={() => setOpen(open === t.assignmentId ? null : t.assignmentId)}>Disputar</Btn>}</span>
              </div>
              {open === t.assignmentId && (
                <form className="stack" onSubmit={(e) => { e.preventDefault(); dispute.mutate(t.assignmentId) }}>
                  <Field label="¿Qué pasó?" as="textarea" required minLength={10} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <FormError error={dispute.error} />
                  <Btn type="submit" variant="primary" loading={dispute.isPending}>Enviar disputa</Btn>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Canales({ canales }) {
  const qc = useQueryClient()
  const sorted = [...canales].sort((a, b) => a.prioridad - b.prioridad)
  const save = useMutation({
    mutationFn: (prioridad) => api('/yo/canales', { method: 'PUT', body: { prioridad } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yo'] }),
  })
  const makeFirst = (canal) => save.mutate([canal, ...sorted.filter((c) => c.habilitado && c.canal !== canal).map((c) => c.canal)])
  return (
    <Card title="Mis canales">
      <p className="small muted">Un canal se activa solo cuando tú lo inicias (WhatsApp con ALTA, Telegram con /start, correo con el enlace de verificación). La oferta llega por uno a la vez.</p>
      <ul className="plain">
        {sorted.map((c, i) => (
          <li key={c.canal} className="row row--between">
            <span>{CANAL[c.canal] ?? c.canal} {i === 0 && c.habilitado && <span className="badge badge--live">Prioritario</span>}</span>
            <span className="row">
              <Toggle label={`${CANAL[c.canal]} habilitado`} checked={c.habilitado} disabled onChange={() => {}} />
              {c.habilitado && i !== 0 && <Btn size="sm" onClick={() => makeFirst(c.canal)}>Hacer prioritario</Btn>}
            </span>
          </li>
        ))}
      </ul>
      <FormError error={save.error} />
    </Card>
  )
}

function Datos() {
  const { logout } = useSession()
  const [step, setStep] = useState(null) // 'baja' | 'borrar'
  const run = useMutation({
    mutationFn: () => api(step === 'baja' ? '/yo/baja' : '/yo/borrar', { method: 'POST' }),
    // Tras borrar, la sesión ya no es válida; tras BAJA se cierra para que no quede una sesión sin sentido.
    onSuccess: () => { setStep(null); logout() },
  })
  return (
    <Card title="Mis datos">
      <p className="small muted">BAJA detiene todas las ofertas y cancela tus turnos pendientes. Borrar mis datos elimina tu nombre, celular y canales; los turnos pasados quedan anónimos.</p>
      <div className="row">
        <Btn size="sm" onClick={() => setStep('baja')}>Darme de baja</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setStep('borrar')}>Borrar mis datos</Btn>
      </div>
      {step && (
        <div className="notice notice--warn row row--between" style={{ marginTop: 16 }}>
          <span>{step === 'baja' ? '¿Seguro? Dejarás de recibir ofertas de todas las organizaciones.' : '¿Seguro? No se puede deshacer.'}</span>
          <span className="row"><Btn size="sm" variant="primary" loading={run.isPending} onClick={() => run.mutate()}>Sí, continuar</Btn><Btn size="sm" variant="ghost" onClick={() => setStep(null)}>No</Btn></span>
        </div>
      )}
      <FormError error={run.error} />
    </Card>
  )
}
