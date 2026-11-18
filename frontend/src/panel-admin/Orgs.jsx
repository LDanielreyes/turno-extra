import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorText } from '../shared/api'
import { fmtDate } from '../shared/format'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { AkError, Ico } from './kit'
import './orgs.css'

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_ADMINS = 3
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Organizaciones como una calle: cada organización es un edificio y se administra sobre él.
// Gerentes = ventanas encendidas en la planta baja; invitación pendiente = edificio en obra con el sobre en la puerta.
// Lo que responde el backend se ve en el edificio: sube desde el suelo al crearlo, el sobre sale volando
// al reenviar y las ventanas de roles se encienden al guardar.
export default function Orgs() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'orgs'], queryFn: () => api('/admin/orgs') })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'orgs'] })
  const [open, setOpen] = useState(null)
  const [flash, setFlash] = useState(null)
  const [term, setTerm] = useState('')
  const [estado, setEstado] = useState('todas')

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(t)
  }, [flash])

  const orgs = q.data?.orgs
  // la calle crece hacia la derecha: la más antigua primero, la recién creada junto al solar
  const street = orgs ? [...orgs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)) : []
  const managers = orgs?.reduce((s, o) => s + o.admins, 0)
  const pending = orgs?.filter((o) => o.admins === 0).length

  const needle = norm(term.trim())
  const view = street.filter((o) =>
    (estado === 'todas' || (estado === 'pendiente' ? o.admins === 0 : o.admins > 0)) &&
    (!needle || norm(`${o.nombre} ${o.slug ?? ''} ${o.pendingEmail ?? ''}`).includes(needle)))
  const filtered = needle || estado !== 'todas'

  return (
    <section className="og">
      <Crops />
      <header className="og__head">
        <div className="og__title">
          <h1>Organizaciones</h1>
          <ul className="mh__key">
            <li><i className="og-k og-k--lit" aria-hidden="true" />Gerente</li>
            <li><i className="og-k og-k--dash" aria-hidden="true" />Invitación pendiente</li>
            <li><i className="og-k og-k--role" aria-hidden="true" />Rol habilitado</li>
          </ul>
        </div>
        {orgs && (
          <dl className="mh__facts og__facts">
            <div><dt>{orgs.length === 1 ? 'organización' : 'organizaciones'}</dt><dd>{orgs.length}</dd></div>
            <div><dt>gerentes</dt><dd>{managers}</dd></div>
            <div><dt>{pending === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}</dt><dd>{pending}</dd></div>
          </dl>
        )}
      </header>

      <div className="og__tools">
        <label className="ak-search">
          {Ico.search}
          <input type="search" placeholder="Buscar nombre o identificador" aria-label="Buscar nombre o identificador" value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <div className="og-seg" role="radiogroup" aria-label="Estado">
          {[['todas', 'Todas'], ['activa', 'Con gerente'], ['pendiente', 'Pendientes']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={estado === v} className={estado === v ? 'is-on' : ''} onClick={() => setEstado(v)}>{l}</button>
          ))}
        </div>
        <span className="og__hint">Toca un edificio para abrirlo</span>
      </div>

      {q.isError ? (
        <div className="og__msg"><AkError error={q.error} /><Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn></div>
      ) : (
        <ul className="og__street">
          {q.isPending
            ? [4, 3, 5, 4].map((f, i) => (
              <li key={i} className="og-b is-skel" style={{ '--d': `${i * 0.08}s` }}>
                <div className="og-b__bld" style={{ '--floors': f }} />
                <span className="og-b__ground" aria-hidden="true" />
              </li>
            ))
            : view.map((o, i) => (
              <Building key={o.id} org={o} i={i} isOpen={open === o.id} flash={flash?.id === o.id ? flash : null}
                onOpen={() => setOpen(o.id)} onClose={() => setOpen(null)}
                onSaved={(kind) => { setOpen(null); setFlash({ id: o.id, kind }) }} onResent={refresh} />
            ))}
          {!q.isPending && !filtered && (
            <Lot i={view.length} onCreated={async (r, email) => { await refresh(); setFlash({ id: r.id, kind: 'new', email }) }} />
          )}
        </ul>
      )}
      {orgs && filtered && view.length === 0 && (
        <p className="og__none">Ningún edificio coincide. <button type="button" className="ak-linkbtn" onClick={() => { setTerm(''); setEstado('todas') }}>Ver todas</button></p>
      )}
    </section>
  )
}

/* ---------- piezas dibujadas ---------- */

const Envelope = ({ className = '' }) => (
  <svg className={`og-env ${className}`} viewBox="0 0 24 18" aria-hidden="true">
    <rect x="1.5" y="1.5" width="21" height="15" rx="1.5" />
    <path d="M2.5 2.5l9.5 7 9.5-7" />
  </svg>
)

const Plus = () => <svg className="og-plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>

// Planta baja: tres ventanas, una por puesto de gerente. Encendida = gerente activo.
function Seats({ admins }) {
  return (
    <span className="og-seats" aria-hidden="true">
      {Array.from({ length: MAX_ADMINS }, (_, i) => <i key={i} className={i < admins ? 'is-lit' : ''} />)}
    </span>
  )
}

function Building({ org, i, isOpen, flash, onOpen, onClose, onSaved, onResent }) {
  const k = hash(org.slug ?? org.id)
  // Altura = roles habilitados: un piso cada 3 roles, más un piso libre y la planta baja (máximo 7).
  const floors = Math.min(7, 2 + Math.ceil((org.roles ?? 0) / 3))
  const pend = org.admins === 0
  const cls = `og-b${pend ? ' is-pending' : ''}${isOpen ? ' is-open' : ''}${flash ? ` is-flash is-${flash.kind}` : ''}`
  return (
    <li className={cls} style={{ '--d': `${Math.min(i, 10) * 0.06}s` }}>
      <div className="og-b__bld" style={{ '--floors': floors }}>
        <span className="og-ant" aria-hidden="true"><i /></span>
        {isOpen
          ? <Editor org={org} onClose={onClose} onSaved={onSaved} onResent={onResent} />
          : <Facade org={org} k={k} floors={floors} onOpen={onOpen} />}
        {flash && (
          <span className="og-toast" role="status">
            {Ico.check} {flash.kind === 'new' ? 'Invitación enviada' : flash.kind === 'sent' ? 'Reenviada' : 'Guardado'}
          </span>
        )}
      </div>
      <span className="og-b__ground" aria-hidden="true" />
      <span className="og-b__addr">
        <span className="mono">{org.slug ?? '—'}</span>
        <span>{fmtDate(org.createdAt)}</span>
      </span>
    </li>
  )
}

function Facade({ org, k, floors, onOpen }) {
  const pend = org.admins === 0
  const windows = (floors - 1) * 3
  const lit = org.roles ?? 0
  return (
    <button type="button" className="og-face" aria-expanded="false" onClick={onOpen}
      aria-label={`${org.nombre}: ${pend ? `invitación pendiente${org.pendingEmail ? ` para ${org.pendingEmail}` : ''}` : `${org.admins} de ${MAX_ADMINS} gerentes`}, ${lit} ${lit === 1 ? 'rol habilitado' : 'roles habilitados'}. Abrir`}>
      <span className="og-sign">{org.nombre}</span>
      <span className="og-wins" aria-hidden="true">
        {Array.from({ length: windows }, (_, j) => <i key={j} className={j < lit ? 'is-warm' : ''} style={{ '--d': `${j * 0.05}s` }} />)}
      </span>
      <span className="og-floor0">
        <Seats admins={org.admins} />
        <span className="og-door">{pend && <Envelope />}</span>
      </span>
    </button>
  )
}

// El edificio abierto: los roles del catálogo son ventanas que se encienden y apagan.
function Editor({ org, onClose, onSaved, onResent }) {
  const qc = useQueryClient()
  const cat = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') })
  const cur = useQuery({ queryKey: ['admin', 'org-roles', org.id], queryFn: () => api(`/admin/orgs/${org.id}/roles`) })
  const [sel, setSel] = useState(null)
  const base = new Set(cur.data?.roleIds ?? [])
  const chosen = sel ?? base
  const save = useMutation({
    mutationFn: () => api(`/admin/orgs/${org.id}/roles`, { method: 'PUT', body: { roleIds: [...chosen] } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'org-roles', org.id] }); qc.invalidateQueries({ queryKey: ['admin', 'orgs'] }); onSaved('roles') },
  })
  const resend = useMutation({ mutationFn: () => api(`/admin/orgs/${org.id}/reenviar-invitacion`, { method: 'POST' }), onSuccess: onResent })
  const toggle = (id) => { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); setSel(n) }
  const dirty = sel != null && (sel.size !== base.size || [...sel].some((x) => !base.has(x)))
  const roles = cat.data?.roles.filter((r) => r.activo || base.has(r.id))
  const loading = cat.isPending || cur.isPending
  const failed = cat.error || cur.error
  const pend = org.admins === 0
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])

  return (
    <div className="og-edit" role="group" aria-label={`${org.nombre}: roles habilitados`} tabIndex={-1} ref={ref} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <span className="og-sign">{org.nombre}</span>

      {loading ? (
        <span className="og-rooms is-loading" aria-busy="true">{Array.from({ length: 6 }, (_, j) => <i key={j} />)}</span>
      ) : failed ? (
        <div className="og-edit__err"><AkError error={failed} /><Btn size="sm" onClick={() => { cat.refetch(); cur.refetch() }}>Reintentar</Btn></div>
      ) : roles.length === 0 ? (
        <p className="og-edit__empty">El catálogo no tiene roles activos.</p>
      ) : (
        <ul className="og-rooms" aria-label="Roles habilitados">
          {roles.map((r, j) => {
            const on = chosen.has(r.id)
            return (
              <li key={r.id} style={{ '--j': j }}>
                <button type="button" className={`og-room${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggle(r.id)}
                  title={`${r.requisitos.length} documentos${r.activo ? '' : ' · rol inactivo'}`}>
                  <i className="og-room__win" aria-hidden="true" />
                  <span>{r.nombre}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="og-floor0 og-floor0--open">
        <span className="og-floor0__seats">
          <Seats admins={org.admins} />
          <span>{pend ? 'Sin gerente' : `${org.admins} de ${MAX_ADMINS} gerentes`}</span>
        </span>
        {pend && org.pendingEmail && (
          <span className={`og-mail${resend.isSuccess ? ' is-sent' : ''}`}>
            <span className="og-door og-door--open"><Envelope className={resend.isSuccess ? 'is-flying' : ''} /></span>
            <span className="og-mail__txt">
              <span className="og-mail__to">{resend.isSuccess ? `Enviado a ${resend.data.email}${resend.data.verificacion ? ' · con verificación' : ''}` : org.pendingEmail}</span>
              <Btn size="sm" variant="ghost" loading={resend.isPending} onClick={() => resend.mutate()}>
                {resend.isSuccess ? 'Reenviar de nuevo' : 'Reenviar invitación'}
              </Btn>
            </span>
          </span>
        )}
        {resend.isError && <p className="og-edit__bad" role="alert">{errorText(resend.error)}</p>}
      </div>

      <AkError error={save.error} />
      <div className="og-edit__foot">
        <span>{roles ? `${chosen.size} ${chosen.size === 1 ? 'rol' : 'roles'}` : ''}</span>
        <Btn size="sm" variant="ghost" onClick={onClose}>Cerrar</Btn>
        <Btn size="sm" variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Guardar roles</Btn>
      </div>
    </div>
  )
}

// Solar al final de la calle: el plano de la nueva organización. Al enviarse, el edificio sube aquí al lado.
function Lot({ i, onCreated }) {
  const [on, setOn] = useState(false)
  const [f, setF] = useState({ nombre: '', slug: '', contactEmail: '' })
  const [touched, setTouched] = useState(false)
  const create = useMutation({
    mutationFn: () => api('/admin/orgs', { method: 'POST', body: { ...f, nombre: f.nombre.trim(), contactEmail: f.contactEmail.trim() } }),
    onSuccess: (r) => { const email = f.contactEmail.trim(); reset(); onCreated(r, email) },
  })
  const reset = () => { setOn(false); setTouched(false); setF({ nombre: '', slug: '', contactEmail: '' }); create.reset() }
  const slugBad = f.slug && !SLUG_RE.test(f.slug)
  const ok = f.nombre.trim().length >= 2 && SLUG_RE.test(f.slug) && EMAIL_RE.test(f.contactEmail.trim())

  return (
    <li className={`og-b is-lot${on ? ' is-open is-typing' : ''}`} style={{ '--d': `${Math.min(i, 10) * 0.06}s` }}>
      <div className="og-b__bld" style={{ '--floors': 4 }}>
        {on ? (
          <form className="og-edit og-plan" onSubmit={(e) => { e.preventDefault(); if (ok) create.mutate() }}
            onKeyDown={(e) => { if (e.key === 'Escape') reset() }} aria-busy={create.isPending || undefined}>
            <label className="og-plan__f">
              <span>Nombre</span>
              <input autoFocus required minLength={2} maxLength={120} placeholder="Hotel Las Palmas" value={f.nombre}
                onChange={(e) => setF({ ...f, nombre: e.target.value, slug: touched ? f.slug : slugify(e.target.value) })} />
            </label>
            <label className={`og-plan__f og-plan__f--mono${slugBad ? ' is-bad' : ''}`}>
              <span>Identificador</span>
              <input required maxLength={60} placeholder="hotel-las-palmas" value={f.slug} aria-invalid={slugBad || undefined}
                onChange={(e) => { setTouched(true); setF({ ...f, slug: e.target.value }) }} />
              {slugBad && <small>Solo minúsculas, números y guiones</small>}
            </label>
            <label className="og-plan__f">
              <span>Correo del primer gerente</span>
              <input type="email" required placeholder="gerencia@empresa.co" value={f.contactEmail}
                onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
            </label>
            <span className="og-plan__door" aria-hidden="true"><Envelope /></span>
            <AkError error={create.error} />
            <div className="og-edit__foot">
              <Btn size="sm" variant="ghost" onClick={reset}>Cancelar</Btn>
              <Btn size="sm" variant="primary" type="submit" loading={create.isPending} disabled={!ok}>Enviar invitación</Btn>
            </div>
          </form>
        ) : (
          <button type="button" className="og-face og-face--lot" onClick={() => setOn(true)}>
            <span className="og-lot__plus"><Plus /></span>
            <strong>Nueva organización</strong>
          </button>
        )}
      </div>
      <span className="og-b__ground" aria-hidden="true" />
      <span className="og-b__addr"><span>Solar libre</span></span>
    </li>
  )
}
