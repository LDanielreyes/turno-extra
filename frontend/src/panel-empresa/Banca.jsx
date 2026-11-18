import { Fragment, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { api } from '../shared/api'
import { fmtDate } from '../shared/format'
import { Async, Badge, Btn, Card, Empty, Field, FormError, PageTitle } from '../shared/ui'
import { NoMatch, Pager, SortTh, TableTools, useTable } from '../shared/table'
import { orgKey, roleName, useOrg, useRoles } from './org'
import { CHANNEL_LABEL, Ico } from './live/icons'

const ESTADOS = [['activo', 'Activos'], ['pendiente', 'Pendientes'], ['baja', 'Baja'], ['baja_org', 'Salieron']]
const CANALES = [['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'], ['email', 'Correo'], ['ninguno', 'Sin canal activo']]

export default function Banca() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const roles = useRoles()
  const q = useQuery({ queryKey: orgKey(orgId, 'workers'), queryFn: () => api(`/orgs/${orgId}/workers`) })
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId, 'workers') })
  const fav = useMutation({ mutationFn: ({ id, favorito }) => api(`/orgs/${orgId}/workers/${id}`, { method: 'PATCH', body: { favorito } }), onSuccess: refresh })
  const reinvite = useMutation({ mutationFn: (id) => api(`/orgs/${orgId}/workers/${id}/reinvitar`, { method: 'POST' }), onSuccess: refresh })

  return (
    <>
      <PageTitle title="Banca" lede="Tu personal de confianza. Nadie recibe ofertas hasta que acepta por su canal (ALTA → «Acepto»)." />
      <div className="grid2">
        <AddWorker orgId={orgId} roles={roles.data?.roles ?? []} onAdded={refresh} />
        <Invite orgId={orgId} />
      </div>

      <Card title="Personas" className="bar-in">
        <FormError error={fav.error ?? reinvite.error} />
        <Async skeleton="table" q={q}>
          {({ workers }) => workers.length === 0 ? (
            <Empty title="Aún no hay personas">Agrega a alguien arriba: queda pendiente hasta que escanee el QR y acepte.</Empty>
          ) : <WorkersTable workers={workers} roles={roles.data} orgId={orgId} fav={fav} reinvite={reinvite} />}
        </Async>
      </Card>
    </>
  )
}

function WorkersTable({ workers, roles, orgId, fav, reinvite }) {
  const [open, setOpen] = useState(null)
  const t = useTable(workers, {
    initialSort: { key: 'alta', dir: 'desc' },
    sorters: {
      nombre: (w) => w.nombre,
      rol: (w) => roleName(roles, w.roleId),
      canales: { by: (w) => (w.canales ?? []).length, first: 'desc' },
      respondio: { by: (w) => (w.respondioAt ? +new Date(w.respondioAt) : null), first: 'desc' },
      estado: (w) => w.estado,
      alta: { by: (w) => +new Date(w.createdAt), first: 'desc' },
    },
    search: (w) => `${w.nombre} ${roleName(roles, w.roleId)}`,
    filters: {
      estado: (w, v) => w.estado === v,
      rol: (w, v) => w.roleId === v,
      favorito: (w) => w.favorito,
      canal: (w, v) => (v === 'ninguno' ? !(w.canales ?? []).length : (w.canales ?? []).includes(v)),
    },
  })
  const roleOptions = (roles?.roles ?? []).map((r) => [r.id, r.nombre])
  const nFav = workers.filter((w) => w.favorito).length

  return (
    <>
      <TableTools t={t} placeholder="Buscar por nombre o rol" filters={[
        { key: 'estado', label: 'Todos los estados', options: ESTADOS },
        { key: 'rol', label: 'Todos los roles', options: roleOptions },
        { key: 'canal', label: 'Cualquier canal', options: CANALES },
        { key: 'favorito', label: 'Todas las personas', options: [['1', `Favoritos (${nFav})`]] },
      ]} />
      <p className="small muted row tt-key" style={{ gap: 14 }} aria-label="Leyenda de canales">
        <span className="row" style={{ gap: 6 }}><span className="chan is-on"><Ico name="whatsapp" size={14} /></span><span className="chan is-on"><Ico name="telegram" size={14} /></span><span className="chan is-on"><Ico name="email" size={14} /></span>activo</span>
        <span className="row" style={{ gap: 6 }}><span className="chan"><Ico name="telegram" size={14} /></span>sin activar</span>
        <span className="row" style={{ gap: 6 }}><span className="chan is-on is-last"><Ico name="email" size={14} /></span>respondió por ahí la última vez</span>
      </p>
      {t.total === 0 ? <NoMatch t={t} /> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <SortTh t={t} k="nombre">Nombre</SortTh>
                <SortTh t={t} k="rol">Rol</SortTh>
                <th>Celular</th>
                <SortTh t={t} k="canales">Canales</SortTh>
                <SortTh t={t} k="estado">Estado</SortTh>
                <SortTh t={t} k="alta">Alta</SortTh>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {t.view.map((w) => (
                <Fragment key={w.id}>
                  <tr>
                    <td>{w.favorito && <span className="tt-star" title="Favorito" aria-label="Favorito">★ </span>}{w.nombre}</td>
                    <td>{roleName(roles, w.roleId)}</td>
                    <td className="mono">{w.celular}</td>
                    <td><Channels w={w} /></td>
                    <td><Badge value={w.estado} /></td>
                    <td className="mono small muted">{fmtDate(w.createdAt)}</td>
                    <td className="tbl__end">
                      <span className="row" style={{ justifyContent: 'flex-end' }}>
                        <Btn size="sm" variant="ghost" aria-pressed={w.favorito} onClick={() => fav.mutate({ id: w.id, favorito: !w.favorito })}>{w.favorito ? '★ Favorito' : '☆ Favorito'}</Btn>
                        <Btn size="sm" variant="ghost" aria-expanded={open === w.id} onClick={() => setOpen(open === w.id ? null : w.id)}>Documentos</Btn>
                        {['baja', 'baja_org'].includes(w.estado) && <Btn size="sm" onClick={() => reinvite.mutate(w.id)}>Reinvitar</Btn>}
                      </span>
                    </td>
                  </tr>
                  {open === w.id && <tr><td colSpan={7}><Documents orgId={orgId} workerId={w.id} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager t={t} />
    </>
  )
}

// Canales que la persona activó. Encendido = puede recibir ofertas ahí; con punto = por ahí respondió la última vez.
function Channels({ w }) {
  const on = new Set(w.canales ?? [])
  return (
    <span className="chans" role="list" aria-label="Canales activos">
      {['whatsapp', 'telegram', 'email'].map((c) => {
        const lit = on.has(c)
        const last = w.respondioPor === c
        const label = `${CHANNEL_LABEL[c]}: ${lit ? 'activo' : 'sin activar'}${last ? ` · respondió por aquí${w.respondioAt ? ` el ${fmtDate(w.respondioAt)}` : ''}` : ''}`
        return (
          <span key={c} role="listitem" className={`chan${lit ? ' is-on' : ''}${last ? ' is-last' : ''}`} title={label} aria-label={label}>
            <Ico name={c} size={14} />
          </span>
        )
      })}
    </span>
  )
}

function AddWorker({ orgId, roles, onAdded }) {
  const [f, setF] = useState({ nombre: '', celular: '', roleId: '' })
  const add = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/workers`, { method: 'POST', body: { ...f, nombre: f.nombre.trim() } }),
    onSuccess: () => { setF({ nombre: '', celular: '', roleId: '' }); onAdded() },
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <Card title="Agregar a la banca">
      <form className="formgrid" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
        <Field wide label="Nombre" required minLength={2} value={f.nombre} onChange={set('nombre')} />
        <Field label="Celular" type="tel" placeholder="300 123 4567" required value={f.celular} onChange={set('celular')} />
        <Field label="Rol" as="select" required value={f.roleId} onChange={set('roleId')}>
          <option value="">Elige</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </Field>
        <div className="field--wide stack">
          <FormError error={add.error} />
          <Btn type="submit" variant="primary" loading={add.isPending}>Agregar como pendiente</Btn>
        </div>
      </form>
    </Card>
  )
}

// Código de ALTA, enlace de WhatsApp y QR para que la persona se una.
function Invite({ orgId }) {
  const q = useQuery({ queryKey: orgKey(orgId, 'invitacion'), queryFn: () => api(`/orgs/${orgId}/invitacion`) })
  const ref = useRef(null)
  const link = q.data?.whatsappUrl
  useEffect(() => { if (ref.current && link) QRCode.toCanvas(ref.current, link, { width: 168, margin: 0 }) }, [link])
  return (
    <Card title="Invitar con QR">
      <Async skeleton="card" q={q}>
        {(d) => (
          <div className="stack">
            {link ? (
              <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
                <div className="access__qr"><canvas ref={ref} role="img" aria-label="QR para abrir WhatsApp con el mensaje de alta" /></div>
                <div className="stack">
                  <p className="muted small">La persona escanea, WhatsApp abre con el mensaje listo y solo lo envía.</p>
                  <a className="btn btn--sm" href={link} target="_blank" rel="noreferrer">Abrir enlace</a>
                </div>
              </div>
            ) : <p className="notice notice--warn">El número público de WhatsApp aún no está configurado: comparte el mensaje de abajo.</p>}
            <p className="small muted">Mensaje de alta</p>
            <p className="access__code">{d.texto}</p>
            <Btn size="sm" onClick={() => navigator.clipboard?.writeText(d.texto)}>Copiar mensaje</Btn>
          </div>
        )}
      </Async>
    </Card>
  )
}

function Documents({ orgId, workerId }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: orgKey(orgId, 'workers', 'docs', workerId), queryFn: () => api(`/orgs/${orgId}/workers/${workerId}/documents`) })
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId, 'workers', 'docs', workerId) })
  const review = useMutation({ mutationFn: ({ id, estado }) => api(`/orgs/${orgId}/documents/${id}`, { method: 'PATCH', body: { estado } }), onSuccess: refresh })
  const [f, setF] = useState({ tipoDocumento: '', venceAt: '' })
  const add = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/workers/${workerId}/documents`, {
      method: 'POST', body: { tipoDocumento: f.tipoDocumento.trim().toLowerCase().replace(/\s+/g, '_'), venceAt: f.venceAt || null },
    }),
    onSuccess: () => { setF({ tipoDocumento: '', venceAt: '' }); refresh() },
  })
  return (
    <div className="stack" style={{ padding: '8px 0 16px' }}>
      <Async skeleton="text" q={q}>
        {({ documents }) => documents.length === 0 ? <p className="muted small">Sin documentos registrados.</p> : (
          <ul className="plain">
            {documents.map((d) => (
              <li key={d.id} className="row row--between">
                <span>{d.tipoDocumento.replace(/_/g, ' ')} <span className="muted small">{d.venceAt ? `vence ${fmtDate(d.venceAt)}` : 'sin vencimiento'}</span> <Badge value={d.estado} /></span>
                <span className="row">
                  <Btn size="sm" onClick={() => review.mutate({ id: d.id, estado: 'aprobado' })}>Aprobar</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => review.mutate({ id: d.id, estado: 'rechazado' })}>Rechazar</Btn>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Async>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
        <Field label="Tipo de documento" placeholder="carnet_manipulacion" required pattern="[A-Za-z0-9_ ]+" value={f.tipoDocumento} onChange={(e) => setF({ ...f, tipoDocumento: e.target.value })} />
        <Field label="Vence" hint="(opcional)" type="date" value={f.venceAt} onChange={(e) => setF({ ...f, venceAt: e.target.value })} />
        <Btn type="submit" size="sm" loading={add.isPending} style={{ alignSelf: 'flex-end' }}>Registrar</Btn>
      </form>
      <FormError error={review.error ?? add.error} />
    </div>
  )
}
