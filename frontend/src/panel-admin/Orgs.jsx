import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorText } from '../shared/api'
import { fmtDate } from '../shared/format'
import { Async, Btn } from '../shared/ui'
import { NoMatch, Pager, SortTh, TableTools, useTable } from '../shared/table'
import { Wordmark } from '../landing/components/Logo'
import Masthead from './Masthead'
import { ICONS } from './icons'
import { Building, OrgsScene, VacantArt } from './scenes'
import { AkError, AkField, Alert, Badge, Ico, Panel, Vacant } from './kit'

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_ADMINS = 3

export default function Orgs() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'orgs'], queryFn: () => api('/admin/orgs') })
  const [f, setF] = useState({ nombre: '', slug: '', contactEmail: '' })
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(null)
  const create = useMutation({
    mutationFn: () => api('/admin/orgs', { method: 'POST', body: { ...f, nombre: f.nombre.trim() } }),
    onSuccess: () => {
      setSent({ email: f.contactEmail, nombre: f.nombre.trim() })
      setF({ nombre: '', slug: '', contactEmail: '' })
      setTouched(false)
      qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
    },
  })
  const edit = (patch) => { setSent(null); setF({ ...f, ...patch }) }
  const slugStatus = f.slug && (SLUG_RE.test(f.slug) ? { tone: 'ok', text: 'Identificador válido' } : { tone: 'bad', text: 'Solo minúsculas, números y guiones entre palabras' })

  const orgs = q.data?.orgs ?? []
  const managers = orgs.reduce((s, o) => s + o.admins, 0)
  const pending = orgs.filter((o) => o.admins === 0).length
  // la carta muestra lo que se escribe; tras enviar, la última invitación queda sellada dentro del sobre
  const letter = sent ?? { nombre: f.nombre.trim(), email: f.contactEmail }

  return (
    <>
      <Masthead title="Organizaciones" art={<OrgsScene orgs={orgs} />}
        legend={[['lit', 'Gerente activo'], ['dash', 'Invitación pendiente']]}
        facts={q.isSuccess ? [[orgs.length, orgs.length === 1 ? 'organización' : 'organizaciones'], [managers, 'gerentes'], [pending, pending === 1 ? 'invitación pendiente' : 'invitaciones pendientes']] : null} />

      <div className="ak-split">
        <Panel title="Invitar organización" icon={ICONS.invite}>
          <form className="ak-form" onSubmit={(e) => { e.preventDefault(); setSent(null); create.mutate() }}>
            <AkField label="Nombre" placeholder="Hotel Las Palmas" required minLength={2} maxLength={120} value={f.nombre}
              onChange={(e) => edit({ nombre: e.target.value, slug: touched ? f.slug : slugify(e.target.value) })} />
            <AkField label="Identificador" hint="sale del nombre" prefix="id /" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60}
              className="ak-field--mono" status={slugStatus} value={f.slug} onChange={(e) => { setTouched(true); edit({ slug: e.target.value }) }} />
            <AkField label="Correo del primer gerente" type="email" placeholder="gerencia@empresa.co" required
              value={f.contactEmail} onChange={(e) => edit({ contactEmail: e.target.value })} />
            <AkError error={create.error} />
            {sent && <Alert>Invitación enviada a <b>{sent.email}</b> para {sent.nombre}.</Alert>}
            <div className="ak-form__foot">
              <Btn type="submit" variant="primary" loading={create.isPending}>Enviar invitación</Btn>
            </div>
          </form>
        </Panel>

        {/* lo que recibe el contacto: el mismo texto de la pantalla de invitación */}
        <div className={`ak-letter${sent ? ' is-sent' : ''}`} aria-label="Vista previa de la invitación">
          <p className="ak-letter__to"><span>Para <b>{letter.email || 'contacto@empresa.co'}</b></span><span>De TurnoExtra</span></p>
          <div className="ak-letter__sheet">
            <Wordmark height={18} />
            <h3>Te invitaron a TurnoExtra</h3>
            <p>Únete a <b>{letter.nombre || 'tu organización'}</b> para publicar turnos y administrar tu banca.</p>
            <span className="ak-letter__cta" aria-hidden="true">Aceptar invitación</span>
          </div>
          <div className="ak-letter__env" aria-hidden="true">
            <svg viewBox="0 0 400 96" preserveAspectRatio="none">
              <path className="env-back" d="M0 0h400v96H0z" />
              <path className="env-front" d="M0 14L200 66 400 14V96H0z" />
            </svg>
          </div>
          {sent && <span className="ak-letter__stamp" aria-hidden="true">Enviada</span>}
          <ol className="ak-steps-inline is-letter" aria-label="Qué hace el contacto después">
            <li><b>1</b>Crea su cuenta</li>
            <li><b>2</b>Acepta los términos</li>
            <li><b>3</b>Entra a su panel</li>
          </ol>
        </div>
      </div>

      <Directory q={q} />
    </>
  )
}

function Directory({ q }) {
  const [open, setOpen] = useState(null)
  const count = q.data?.orgs.length
  return (
    <Panel className="ak-panel--flush" title="Directorio" icon={ICONS.orgs} meta={count != null ? count : null}
>
      <Async skeleton="table" q={q} empty={Object.assign((d) => d.orgs.length === 0, { node: <Vacant art={VacantArt.orgs} title="Aún no hay organizaciones">Envía la primera invitación: su edificio aparecerá en la ciudad.</Vacant> })}>
        {({ orgs }) => <OrgsTable orgs={orgs} open={open} setOpen={setOpen} />}
      </Async>
    </Panel>
  )
}

function OrgsTable({ orgs, open, setOpen }) {
  const t = useTable(orgs, {
    initialSort: { key: 'creada', dir: 'desc' },
    sorters: {
      nombre: (o) => o.nombre,
      gerentes: { by: (o) => o.admins, first: 'desc' },
      creada: { by: (o) => +new Date(o.createdAt), first: 'desc' },
    },
    search: (o) => `${o.nombre} ${o.slug ?? ''}`,
    filters: { estado: (o, v) => (v === 'pendiente' ? o.admins === 0 : o.admins > 0) },
  })
  return (
    <>
      <TableTools t={t} placeholder="Buscar nombre o identificador" filters={[
        { key: 'estado', label: 'Todas', options: [['activa', 'Con gerente activo'], ['pendiente', 'Invitación pendiente']] },
      ]} />
      {t.total === 0 ? <NoMatch t={t} /> : (
        <table className="ak-table">
          <thead>
            <tr>
              <SortTh t={t} k="nombre">Organización</SortTh>
              <SortTh t={t} k="gerentes">Gerentes</SortTh>
              <SortTh t={t} k="creada">Creada</SortTh>
              <th className="end"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {t.view.map((o) => (
              <Fragment key={o.id}>
                <tr className={`ak-row${open === o.id ? ' is-open' : ''}`}>
                  <td>
                    <div className="ak-name">
                      <Building admins={o.admins} seed={o.slug ?? o.id} />
                      <div><strong>{o.nombre}</strong><span className="mono">{o.slug}</span></div>
                    </div>
                  </td>
                  <td>{o.admins === 0 ? <Badge tone="next">Invitación pendiente</Badge> : <span className="num">{o.admins} de {MAX_ADMINS}</span>}</td>
                  <td className="t dim">{fmtDate(o.createdAt)}</td>
                  <td className="end">
                    {o.admins === 0 && o.pendingEmail && <ResendInvite org={o} />}
                    <Btn size="sm" variant="ghost" aria-expanded={open === o.id} onClick={() => setOpen(open === o.id ? null : o.id)}>
                      Roles {Ico.chev}
                    </Btn>
                  </td>
                </tr>
                {open === o.id && (
                  <tr><td colSpan={4} className="ak-cell-drawer"><OrgRoles orgId={o.id} onClose={() => setOpen(null)} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      <Pager t={t} />
    </>
  )
}

// Reenvía la invitación pendiente (y la verificación de correo si el contacto ya creó su cuenta sin verificarla).
function ResendInvite({ org }) {
  const m = useMutation({ mutationFn: () => api(`/admin/orgs/${org.id}/reenviar-invitacion`, { method: 'POST' }) })
  return (
    <>
      {m.isSuccess && <span className="small muted" role="status">Enviado a {m.data.email}{m.data.verificacion ? ' · con verificación' : ''}</span>}
      {m.isError && <span className="small" role="alert">{errorText(m.error)}</span>}
      <Btn size="sm" variant="ghost" loading={m.isPending} onClick={() => m.mutate()}>
        {m.isSuccess ? 'Reenviar de nuevo' : 'Reenviar invitación'}
      </Btn>
    </>
  )
}

// Roles que la organización puede usar. Parte de los habilitados hoy; al guardar reemplaza el conjunto.
function OrgRoles({ orgId, onClose }) {
  const qc = useQueryClient()
  const cat = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') })
  const cur = useQuery({ queryKey: ['admin', 'org-roles', orgId], queryFn: () => api(`/admin/orgs/${orgId}/roles`) })
  const [sel, setSel] = useState(null)
  const chosen = sel ?? new Set(cur.data?.roleIds ?? [])
  const save = useMutation({
    mutationFn: () => api(`/admin/orgs/${orgId}/roles`, { method: 'PUT', body: { roleIds: [...chosen] } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'org-roles', orgId] }); onClose() },
  })
  const toggle = (id) => { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); setSel(n) }
  return (
    <div className="ak-drawer">
      <p className="ak-drawer__lede">Roles que esta organización puede publicar.</p>
      <Async skeleton="card" q={cur.isPending || cur.isError ? cur : cat}>
        {({ roles }) => (
          <>
            <div className="ak-tags">
              {roles.filter((r) => r.activo).map((r) => (
                <label key={r.id} className={`ak-tag${chosen.has(r.id) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="ak-tag__box" aria-hidden="true">{Ico.check}</span>
                  {r.nombre}
                  <small>{r.requisitos.length} doc.</small>
                </label>
              ))}
            </div>
            <AkError error={save.error} />
            <div className="ak-form__foot">
              <span className="ak-count">{chosen.size} {chosen.size === 1 ? 'rol habilitado' : 'roles habilitados'}</span>
              <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
              <Btn size="sm" loading={save.isPending} onClick={() => save.mutate()}>Guardar roles</Btn>
            </div>
          </>
        )}
      </Async>
    </div>
  )
}
