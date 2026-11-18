import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { useSession } from '../shared/session'
import { Async, Btn, Card, Field, FormError, PageTitle, Toggle } from '../shared/ui'
import { orgKey, useOrg } from './org'

const FIELDS = [
  ['waveMinutes', 'Minutos entre oleadas', 1, 30, 'Cada cuánto sale la siguiente tanda de ofertas.'],
  ['descansoMinH', 'Descanso mínimo (horas)', 0, 24, 'Entre un turno y el siguiente de la misma persona.'],
  ['topeSemanalH', 'Tope semanal (horas)', 1, 60, 'Horas máximas por persona y semana.'],
  ['standbyMax', 'Lista de espera', 0, 10, 'Reservas por turno cuando se llenan los cupos.'],
  ['relaunchLimit', 'Relanzamientos', 0, 5, 'Veces que se vuelve a buscar si nadie acepta.'],
]
const EVENTS = {
  cancelacion_asistencia: 'Cancelación de asistencia',
  baja_con_turnos: 'Baja de alguien con turnos confirmados',
  turno_vencido: 'Turno vencido sin cubrir',
  disputa_abierta: 'Disputa abierta',
}

export default function Ajustes() {
  return (
    <>
      <PageTitle title="Ajustes" lede="Parámetros de tu organización y tus avisos." />
      <Params />
      <Notifications />
      <WhatsApp />
    </>
  )
}

function Params() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: orgKey(orgId, 'settings'), queryFn: () => api(`/orgs/${orgId}/settings`) })
  const [draft, setDraft] = useState(null)
  const save = useMutation({
    mutationFn: (body) => api(`/orgs/${orgId}/settings`, { method: 'PATCH', body }),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: orgKey(orgId, 'settings') }) },
  })
  return (
    <Card title="Parámetros de la organización">
      <Async skeleton="card" q={q}>
        {(d) => {
          const v = { ...d, ...draft }
          return (
            <form className="formgrid" onSubmit={(e) => { e.preventDefault(); save.mutate(Object.fromEntries(Object.entries(draft ?? {}).map(([k, x]) => [k, Number(x)]))) }}>
              {FIELDS.map(([k, label, min, max, hint]) => (
                <Field key={k} label={label} hint={`(${hint})`} type="number" min={min} max={max} required value={v[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              ))}
              <div className="field--wide stack">
                <FormError error={save.error} />
                {save.isSuccess && !draft && <p className="notice notice--ok" role="status">Guardado.</p>}
                <Btn type="submit" variant="primary" loading={save.isPending} disabled={!draft}>Guardar parámetros</Btn>
              </div>
            </form>
          )
        }}
      </Async>
    </Card>
  )
}

function Notifications() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['me', 'prefs'], queryFn: () => api('/me/notification-prefs') })
  const wa = useQuery({ queryKey: ['me', 'wa'], queryFn: () => api('/me/notification-whatsapp') })
  const save = useMutation({
    mutationFn: (prefs) => api('/me/notification-prefs', { method: 'PUT', body: { prefs } }),
    onSuccess: (d) => qc.setQueryData(['me', 'prefs'], d),
  })
  return (
    <Card title="Avisos">
      <p className="muted small">El panel y el correo son los canales base. WhatsApp es solo para urgentes y requiere verificar tu número.</p>
      <Async skeleton="table" q={q}>
        {({ prefs }) => (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Evento</th><th>Panel</th><th>Correo</th><th>WhatsApp</th></tr></thead>
              <tbody>
                {prefs.map((p) => {
                  const change = (k) => (val) => save.mutate(prefs.map((x) => (x.evento === p.evento ? { ...x, [k]: val } : x)))
                  return (
                    <tr key={p.evento}>
                      <td>{EVENTS[p.evento] ?? p.evento}</td>
                      <td><Toggle label={`${EVENTS[p.evento]} en panel`} checked={p.panel} onChange={change('panel')} /></td>
                      <td><Toggle label={`${EVENTS[p.evento]} por correo`} checked={p.email} onChange={change('email')} /></td>
                      <td><Toggle label={`${EVENTS[p.evento]} por WhatsApp`} checked={p.whatsapp} disabled={!wa.data?.verificado} onChange={change('whatsapp')} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      <FormError error={save.error} />
    </Card>
  )
}

// Verificación del WhatsApp del gerente: celular + consentimiento → código por WhatsApp → verificar.
function WhatsApp() {
  const qc = useQueryClient()
  const { user } = useSession()
  const q = useQuery({ queryKey: ['me', 'wa'], queryFn: () => api('/me/notification-whatsapp') })
  const [celular, setCelular] = useState('')
  const [consent, setConsent] = useState(false)
  const [codigo, setCodigo] = useState('')
  const done = (d) => qc.setQueryData(['me', 'wa'], d)
  const start = useMutation({ mutationFn: () => api('/me/notification-whatsapp', { method: 'PUT', body: { celular, consentimiento: true } }), onSuccess: done })
  const verify = useMutation({ mutationFn: () => api('/me/notification-whatsapp/verify', { method: 'POST', body: { codigo: codigo.trim() } }), onSuccess: (d) => { setCodigo(''); done(d) } })
  const drop = useMutation({ mutationFn: () => api('/me/notification-whatsapp', { method: 'DELETE' }), onSuccess: (d) => { done(d); qc.invalidateQueries({ queryKey: ['me', 'prefs'] }) } })
  return (
    <Card title="Mi WhatsApp para avisos urgentes">
      <Async skeleton="card" q={q}>
        {(d) => d.verificado ? (
          <div className="row row--between">
            <p>Verificado: <span className="mono">{d.celular}</span></p>
            <Btn variant="ghost" size="sm" loading={drop.isPending} onClick={() => drop.mutate()}>Retirar mi consentimiento</Btn>
          </div>
        ) : d.configurado ? (
          <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); verify.mutate() }}>
            <Field label={`Código enviado a ${d.celular}`} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <Btn type="submit" variant="primary" loading={verify.isPending}>Verificar</Btn>
            <Btn variant="ghost" onClick={() => drop.mutate()}>Cambiar número</Btn>
          </form>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); start.mutate() }}>
            <Field label="Celular" type="tel" placeholder="300 123 4567" required value={celular} onChange={(e) => setCelular(e.target.value)} />
            <label className="row small"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Autorizo que TurnoExtra me escriba por WhatsApp avisos urgentes de {user?.email}.</label>
            <Btn type="submit" variant="primary" loading={start.isPending} disabled={!consent}>Enviarme un código</Btn>
          </form>
        )}
      </Async>
      <FormError error={start.error ?? verify.error ?? drop.error} />
    </Card>
  )
}
