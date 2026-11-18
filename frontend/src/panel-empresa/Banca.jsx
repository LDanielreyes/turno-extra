import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { api, errorText } from '../shared/api'
import { fmtDate } from '../shared/format'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, roleName, useOrg, useRoles } from './org'
import { CHANNEL_LABEL, Ico } from './live/icons'
import './banca.css'

// Banca como fichero de tarjetas de papel: cada tarjeta es una persona y se trabaja sobre ella.
// Lo que responde el backend se ve en la tarjeta: entra al fichero al crearla, la chinche se clava al
// marcarla favorita, el sello cae sobre el documento revisado y la tarjeta se endereza al reinvitar.
const CHANNELS = ['whatsapp', 'telegram', 'email']
const ESTADOS = [['todos', 'Todas'], ['activo', 'Activas'], ['pendiente', 'Pendientes'], ['fuera', 'Salieron']]
const GONE = ['baja', 'baja_org']
const STEP = 48
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Banca() {
  const { orgId } = useOrg()
  const qc = useQueryClient()
  const roles = useRoles()
  const q = useQuery({ queryKey: orgKey(orgId, 'workers'), queryFn: () => api(`/orgs/${orgId}/workers`) })
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId, 'workers') })
  const [open, setOpen] = useState(null)
  const [flash, setFlash] = useState(null)
  const [term, setTerm] = useState('')
  const [estado, setEstado] = useState('todos')
  const [rol, setRol] = useState('')
  const [canal, setCanal] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [limit, setLimit] = useState(STEP)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [flash])

  const ping = async (id) => { await refresh(); setFlash(id) }
  const fav = useMutation({ mutationFn: ({ id, favorito }) => api(`/orgs/${orgId}/workers/${id}`, { method: 'PATCH', body: { favorito } }), onSuccess: (_, v) => ping(v.id) })
  const reinvite = useMutation({ mutationFn: (id) => api(`/orgs/${orgId}/workers/${id}/reinvitar`, { method: 'POST' }), onSuccess: (_, id) => ping(id) })

  const workers = q.data?.workers
  const roleList = roles.data?.roles ?? []
  const n = (f) => workers?.filter(f).length ?? 0
  const needle = norm(term.trim())
  const view = (workers ?? []).filter((w) =>
    (estado === 'todos' || (estado === 'fuera' ? GONE.includes(w.estado) : w.estado === estado)) &&
    (!rol || w.roleId === rol) &&
    (!canal || (canal === 'ninguno' ? !(w.canales ?? []).length : (w.canales ?? []).includes(canal))) &&
    (!onlyFav || w.favorito) &&
    (!needle || norm(`${w.nombre} ${roleName(roles.data, w.roleId)}`).includes(needle)))
  const filtered = needle || estado !== 'todos' || rol || canal || onlyFav
  const clear = () => { setTerm(''); setEstado('todos'); setRol(''); setCanal(''); setOnlyFav(false) }

  return (
    <section className="bn">
      <Crops />
      <header className="bn__head">
        <div className="bn__title">
          <h1>Banca</h1>
          <ul className="bn-key" aria-label="Leyenda">
            <li><span className="bn-chan is-on" aria-hidden="true" />Canal activo</li>
            <li><span className="bn-chan" aria-hidden="true" />Sin activar</li>
            <li><span className="bn-chan is-on is-last" aria-hidden="true" />Respondió ahí</li>
            <li><span className="bn-pinkey" aria-hidden="true" />Favorita</li>
          </ul>
        </div>
        {workers && (
          <dl className="bn__facts">
            <div><dt>{n((w) => w.estado === 'activo') === 1 ? 'activa' : 'activas'}</dt><dd>{n((w) => w.estado === 'activo')}</dd></div>
            <div><dt>sin aceptar</dt><dd>{n((w) => w.estado === 'pendiente')}</dd></div>
            <div><dt>{n((w) => w.favorito) === 1 ? 'favorita' : 'favoritas'}</dt><dd>{n((w) => w.favorito)}</dd></div>
          </dl>
        )}
      </header>

      <div className="bn__body">
        <div className="bn__main">
          <div className="bn__tools">
            <label className="bn-search">
              <Ico name="people" size={14} />
              <input type="search" placeholder="Buscar nombre o rol" aria-label="Buscar por nombre o rol" value={term} onChange={(e) => setTerm(e.target.value)} />
            </label>
            <div className="bn-seg" role="radiogroup" aria-label="Estado">
              {ESTADOS.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={estado === v} className={estado === v ? 'is-on' : ''} onClick={() => setEstado(v)}>{l}</button>
              ))}
            </div>
            <select className="bn-select" aria-label="Rol" value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="">Todos los roles</option>
              {roleList.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <select className="bn-select" aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Cualquier canal</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              <option value="ninguno">Sin canal activo</option>
            </select>
            <button type="button" className={`bn-favbtn${onlyFav ? ' is-on' : ''}`} aria-pressed={onlyFav} onClick={() => setOnlyFav(!onlyFav)}>
              <span className="bn-pinkey" aria-hidden="true" />Favoritas
            </button>
          </div>

          {(fav.error || reinvite.error) && <p className="bn-err" role="alert">{errorText(fav.error || reinvite.error)}</p>}

          {q.isError ? (
            <div className="bn-err" role="alert">{errorText(q.error)} <Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn></div>
          ) : (
            <ul className="bn-file">
              {q.isPending
                ? Array.from({ length: 6 }, (_, i) => <li key={i} className="bn-card is-skel" style={{ '--d': `${i * 0.06}s` }}><div className="bn-card__paper" /></li>)
                : view.slice(0, limit).map((w, i) => (
                  <Card key={w.id} w={w} i={i} roles={roles.data} roleList={roleList} orgId={orgId}
                    isOpen={open === w.id} flash={flash === w.id}
                    onOpen={() => setOpen(w.id)} onClose={() => setOpen(null)}
                    onFav={() => fav.mutate({ id: w.id, favorito: !w.favorito })} favBusy={fav.isPending && fav.variables?.id === w.id}
                    onReinvite={() => reinvite.mutate(w.id)} reinviteBusy={reinvite.isPending && reinvite.variables === w.id}
                    onSaved={() => ping(w.id)} />
                ))}
              {!q.isPending && !filtered && (
                <NewCard orgId={orgId} roleList={roleList} i={Math.min(view.length, limit)}
                  onCreated={async (id) => { await refresh(); setOpen(null); setFlash(id) }} />
              )}
            </ul>
          )}
          {workers && view.length > limit && (
            <button type="button" className="bn-more" onClick={() => setLimit(limit + STEP)}>Ver {Math.min(STEP, view.length - limit)} más de {view.length - limit}</button>
          )}
          {workers && filtered && view.length === 0 && (
            <p className="bn-none">Ninguna tarjeta coincide. <button type="button" className="bn-link" onClick={clear}>Ver todas</button></p>
          )}
        </div>
        <Poster orgId={orgId} />
      </div>
    </section>
  )
}

// Luces de canal. Encendida = recibe ofertas ahí; aro de brasa = por ahí respondió la última vez.
function Lights({ w }) {
  const on = new Set(w.canales ?? [])
  return (
    <span className="bn-lights" role="list" aria-label="Canales">
      {CHANNELS.map((c) => {
        const lit = on.has(c)
        const last = w.respondioPor === c
        const label = `${CHANNEL_LABEL[c]}: ${lit ? 'activo' : 'sin activar'}${last ? ` · respondió por aquí${w.respondioAt ? ` el ${fmtDate(w.respondioAt)}` : ''}` : ''}`
        return (
          <span key={c} role="listitem" className={`bn-chan${lit ? ' is-on' : ''}${last ? ' is-last' : ''}`} title={label} aria-label={label}>
            <Ico name={c} size={13} />
          </span>
        )
      })}
    </span>
  )
}

const STAMP = { pendiente: 'Sin aceptar', baja: 'Se dio de baja', baja_org: 'Salió' }

function Card({ w, i, roles, roleList, orgId, isOpen, flash, onOpen, onClose, onFav, favBusy, onReinvite, reinviteBusy, onSaved }) {
  const gone = GONE.includes(w.estado)
  const cls = `bn-card is-${w.estado}${gone ? ' is-gone' : ''}${isOpen ? ' is-open' : ''}${flash ? ' is-flash' : ''}${w.favorito ? ' is-fav' : ''}`
  const rn = roleName(roles, w.roleId)
  return (
    <li className={cls} style={{ '--d': `${Math.min(i, 12) * 0.04}s`, '--tilt': `${((i * 7) % 5) - 2}` }}>
      <span className="bn-card__tab">{rn}</span>
      <div className="bn-card__paper">
        <button type="button" className={`bn-pin${w.favorito ? ' is-on' : ''}`} aria-pressed={w.favorito} disabled={favBusy}
          aria-label={w.favorito ? `Quitar a ${w.nombre} de favoritas` : `Marcar a ${w.nombre} como favorita`}
          title={w.favorito ? 'Favorita · toca para quitar' : 'Marcar favorita'} onClick={onFav}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle className="bn-pin__head" cx="12" cy="9" r="6" /><path className="bn-pin__needle" d="M12 15v6" /></svg>
        </button>
        {isOpen
          ? <Editor w={w} roleList={roleList} orgId={orgId} onClose={onClose} onSaved={onSaved} />
          : (
            <button type="button" className="bn-face" aria-expanded="false" onClick={onOpen}
              aria-label={`${w.nombre}, ${rn}, ${STAMP[w.estado] ?? 'activa'}. Abrir tarjeta`}>
              <strong className="bn-name">{w.nombre}</strong>
              <span className="bn-phone">{w.celular}</span>
              <span className="bn-face__foot">
                <Lights w={w} />
                <span className="bn-since">desde {fmtDate(w.createdAt)}</span>
              </span>
            </button>
          )}
        {STAMP[w.estado] && !isOpen && <span className={`bn-stamp${gone ? ' is-gone' : ''}`} aria-hidden="true">{STAMP[w.estado]}</span>}
        {gone && !isOpen && (
          <button type="button" className="bn-reinvite" disabled={reinviteBusy} aria-busy={reinviteBusy || undefined} onClick={onReinvite}>
            <Ico name="send" size={13} />{reinviteBusy ? 'Enviando' : 'Reinvitar'}
          </button>
        )}
        <span className="bn-saved" aria-hidden="true"><Ico name="check" size={12} />Listo</span>
      </div>
    </li>
  )
}

function Editor({ w, roleList, orgId, onClose, onSaved }) {
  const [nombre, setNombre] = useState(w.nombre)
  const [roleId, setRoleId] = useState(w.roleId)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const body = {}
  if (nombre.trim() !== w.nombre && nombre.trim().length >= 2) body.nombre = nombre.trim()
  if (roleId !== w.roleId) body.roleId = roleId
  const dirty = Object.keys(body).length > 0
  const save = useMutation({ mutationFn: () => api(`/orgs/${orgId}/workers/${w.id}`, { method: 'PATCH', body }), onSuccess: () => { onSaved(); onClose() } })

  return (
    <div className="bn-edit" role="group" aria-label={`Tarjeta de ${w.nombre}`} tabIndex={-1} ref={ref}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <input className="bn-name-in" aria-label="Nombre" value={nombre} minLength={2} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
      <div className="bn-edit__row">
        <span className="bn-phone">{w.celular}</span>
        <Lights w={w} />
      </div>
      <label className="bn-line">
        <span>Rol</span>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {!roleList.some((r) => r.id === w.roleId) && <option value={w.roleId}>Rol no habilitado</option>}
          {roleList.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </label>
      <Docs orgId={orgId} workerId={w.id} />
      {save.error && <p className="bn-err" role="alert">{errorText(save.error)}</p>}
      <div className="bn-edit__foot">
        <span>desde {fmtDate(w.createdAt)}</span>
        <Btn size="sm" variant="ghost" onClick={onClose}>Cerrar</Btn>
        <Btn size="sm" variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Guardar</Btn>
      </div>
    </div>
  )
}

// Documentos como papelitos grapados a la tarjeta; se aprueban o rechazan con un sello.
function Docs({ orgId, workerId }) {
  const qc = useQueryClient()
  const key = orgKey(orgId, 'workers', 'docs', workerId)
  const q = useQuery({ queryKey: key, queryFn: () => api(`/orgs/${orgId}/workers/${workerId}/documents`) })
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const review = useMutation({ mutationFn: ({ id, estado }) => api(`/orgs/${orgId}/documents/${id}`, { method: 'PATCH', body: { estado } }), onSuccess: refresh })
  // El archivo vive en un bucket privado: se pide con la sesión y se abre desde memoria, sin enlace público.
  const view = async (id) => {
    const w = window.open('', '_blank')
    try {
      const blob = await (await api(`/orgs/${orgId}/documents/${id}/archivo`, { raw: true })).blob()
      if (w) w.location.href = URL.createObjectURL(blob)
    } catch { w?.close() }
  }
  const docs = q.data?.documents ?? []
  const missing = (q.data?.requisitos ?? []).filter((r) => !docs.some((d) => d.tipoDocumento === r.tipo))

  return (
    <div className="bn-docs">
      {q.isPending ? <div className="bn-slip is-skel" /> : q.isError ? <p className="bn-err">{errorText(q.error)}</p> : (
        docs.length === 0 && missing.length === 0
          ? <p className="bn-docs__none">Este rol no pide documentos</p>
          : (
            <ul className="bn-slips">
              {docs.map((d, j) => {
                const name = d.tipoDocumento.replace(/_/g, ' ')
                const busy = review.isPending && review.variables?.id === d.id
                return (
                  <li key={d.id} className={`bn-slip is-${d.estado}`} style={{ '--j': j }}>
                    <span className="bn-slip__staple" aria-hidden="true" />
                    <span className="bn-slip__name">{name}</span>
                    <span className="bn-slip__when">{d.venceAt ? `vence ${fmtDate(d.venceAt)}` : 'sin vencimiento'}</span>
                    {d.estado !== 'pendiente' && (
                      <span key={d.estado} className="bn-seal" aria-label={d.estado === 'aprobado' ? 'Aprobado' : 'Rechazado'}>
                        <Ico name={d.estado === 'aprobado' ? 'check' : 'x'} size={12} />{d.estado === 'aprobado' ? 'Aprobado' : 'Rechazado'}
                      </span>
                    )}
                    <span className="bn-slip__acts">
                      {d.tieneArchivo && <button type="button" className="bn-sealbtn" aria-label={`Ver archivo de ${name}`} title="Ver archivo" onClick={() => view(d.id)}><Ico name="doc" size={14} /></button>}
                      <button type="button" className="bn-sealbtn is-ok" disabled={busy || d.estado === 'aprobado'} aria-label={`Aprobar ${name}`} title="Aprobar" onClick={() => review.mutate({ id: d.id, estado: 'aprobado' })}><Ico name="check" size={14} /></button>
                      <button type="button" className="bn-sealbtn is-bad" disabled={busy || d.estado === 'rechazado'} aria-label={`Rechazar ${name}`} title="Rechazar" onClick={() => review.mutate({ id: d.id, estado: 'rechazado' })}><Ico name="x" size={14} /></button>
                    </span>
                  </li>
                )
              })}
              {missing.map((r) => (
                <li key={r.tipo} className="bn-slip is-missing">
                  <span className="bn-slip__staple" aria-hidden="true" />
                  <span className="bn-slip__name">{r.tipo.replace(/_/g, ' ')}</span>
                  <span className="bn-slip__when">falta · lo sube la persona desde su panel</span>
                </li>
              ))}
            </ul>
          )
      )}
      {review.error && <p className="bn-err" role="alert">{errorText(review.error)}</p>}
    </div>
  )
}

// Tarjeta en blanco al final del fichero: se llena sobre ella y entra como pendiente.
function NewCard({ orgId, roleList, i, onCreated }) {
  const [on, setOn] = useState(false)
  const empty = { nombre: '', celular: '', roleId: '' }
  const [f, setF] = useState(empty)
  const add = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/workers`, { method: 'POST', body: { ...f, nombre: f.nombre.trim() } }),
    onSuccess: (r) => { setF(empty); setOn(false); onCreated(r.id) },
  })
  const cancel = () => { setOn(false); setF(empty); add.reset() }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const ok = f.nombre.trim().length >= 2 && f.celular.trim() && f.roleId

  return (
    <li className={`bn-card is-blank${on ? ' is-open is-typing' : ''}`} style={{ '--d': `${Math.min(i, 12) * 0.04}s`, '--tilt': '0' }}>
      <span className="bn-card__tab">Nueva</span>
      <div className="bn-card__paper">
        {on ? (
          <form className="bn-edit" onSubmit={(e) => { e.preventDefault(); if (ok) add.mutate() }} onKeyDown={(e) => { if (e.key === 'Escape') cancel() }} aria-busy={add.isPending || undefined}>
            <input className="bn-name-in" autoFocus aria-label="Nombre" placeholder="Nombre" required minLength={2} maxLength={120} value={f.nombre} onChange={set('nombre')} />
            <label className="bn-line"><span>Celular</span><input type="tel" inputMode="tel" placeholder="300 123 4567" required maxLength={30} value={f.celular} onChange={set('celular')} /></label>
            <label className="bn-line">
              <span>Rol</span>
              <select required value={f.roleId} onChange={set('roleId')}>
                <option value="">Elige</option>
                {roleList.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
            {add.error && <p className="bn-err" role="alert">{errorText(add.error)}</p>}
            <div className="bn-edit__foot">
              <span>Queda sin aceptar</span>
              <Btn size="sm" variant="ghost" onClick={cancel}>Cancelar</Btn>
              <Btn size="sm" variant="primary" type="submit" loading={add.isPending} disabled={!ok}>Agregar</Btn>
            </div>
          </form>
        ) : (
          <button type="button" className="bn-face bn-face--blank" onClick={() => setOn(true)}>
            <span className="bn-plus" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg></span>
            <strong className="bn-name">Agregar persona</strong>
          </button>
        )}
      </div>
    </li>
  )
}

// Afiche pegado en la placa: dos caminos de alta con el mismo peso (WhatsApp y Telegram), cada uno con su QR.
const PATHS = {
  whatsapp: { url: 'whatsappUrl', steps: [['qr', 'Escanea'], ['whatsapp', 'Envía el mensaje']], off: 'Número de WhatsApp sin configurar', qr: 'QR que abre WhatsApp con el mensaje de alta' },
  telegram: { url: 'telegramUrl', steps: [['qr', 'Escanea'], ['telegram', 'Toca «Iniciar»'], ['phone', 'Comparte tu celular']], off: 'Bot de Telegram sin conectar', qr: 'QR que abre el bot de Telegram con el código de alta' },
}

function Poster({ orgId }) {
  const q = useQuery({ queryKey: orgKey(orgId, 'invitacion'), queryFn: () => api(`/orgs/${orgId}/invitacion`) })
  const ref = useRef(null)
  const [pick, setPick] = useState(null)
  const d = q.data
  const via = pick ?? (d && !d.whatsappUrl && d.telegramUrl ? 'telegram' : 'whatsapp')
  const path = PATHS[via]
  const link = d?.[path.url]
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!ref.current || !link) return
    // El QR toma la tinta del papel desde el tema; el fondo queda transparente sobre el afiche.
    const css = getComputedStyle(document.documentElement)
    const dark = css.getPropertyValue('--on-paper').trim() || 'black'
    const light = css.getPropertyValue('--paper').trim() || 'white'
    QRCode.toCanvas(ref.current, link, { width: 156, margin: 0, color: { dark, light } })
  }, [link])
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* sin portapapeles */ } }
  const copyText = via === 'whatsapp' ? d?.texto : link

  return (
    <aside className="bn-poster" aria-label="Invitar con QR">
      <span className="bn-tape bn-tape--l" aria-hidden="true" />
      <span className="bn-tape bn-tape--r" aria-hidden="true" />
      <h2>Únete a la banca</h2>
      <div className="bn-via" role="tablist" aria-label="Canal de alta">
        {Object.keys(PATHS).map((c) => {
          const off = d && !d[PATHS[c].url]
          return (
            <button key={c} type="button" role="tab" aria-selected={via === c} className={`bn-via__tab${via === c ? ' is-on' : ''}${off ? ' is-off' : ''}`}
              onClick={() => { setPick(c); setCopied(false) }}>
              <Ico name={c} size={14} />{CHANNEL_LABEL[c]}
            </button>
          )
        })}
      </div>
      {q.isPending ? <div className="bn-poster__qr is-skel" /> : q.isError ? <p className="bn-err">{errorText(q.error)}</p> : (
        <div className="bn-via__panel" role="tabpanel" key={via}>
          {link
            ? <div className="bn-poster__qr"><canvas ref={ref} role="img" aria-label={path.qr} /></div>
            : <div className="bn-poster__qr is-off"><Ico name={via} size={30} /><span>{path.off}</span></div>}
          <ol className="bn-poster__steps">
            {path.steps.map(([i, t]) => <li key={t}><Ico name={i} size={13} />{t}</li>)}
          </ol>
          {via === 'whatsapp' && <code className="bn-poster__code">{d.texto}</code>}
          <div className="bn-poster__acts">
            {copyText && (
              <button type="button" className={`bn-poster__btn${copied ? ' is-done' : ''}`} onClick={() => copy(copyText)}>
                <Ico name={copied ? 'check' : 'doc'} size={13} />{copied ? 'Copiado' : via === 'whatsapp' ? 'Copiar mensaje' : 'Copiar enlace'}
              </button>
            )}
            {link && <a className="bn-poster__btn" href={link} target="_blank" rel="noreferrer"><Ico name="send" size={13} />Abrir {CHANNEL_LABEL[via]}</a>}
          </div>
          <span className="sr-only" role="status">{copied ? (via === 'whatsapp' ? 'Mensaje copiado' : 'Enlace copiado') : ''}</span>
        </div>
      )}
    </aside>
  )
}
