import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { Btn, Toggle } from '../shared/ui'
import Crops from '../shared/Crops'
import { AkError, Ico } from './kit'

const PLUS = <svg className="rk-plus" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" /></svg>
import './rack.css'

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const docKey = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
const docName = (k) => k.replace(/_/g, ' ')
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// Sugerencias frecuentes; el administrador puede escribir cualquier otro tipo.
const COMMON = ['documento_identidad', 'carnet_manipulacion_alimentos', 'seguridad_social', 'certificado_alturas', 'curso_primeros_auxilios']
const SHOWN = 4

// Catálogo de roles como tablero de carnés colgados: cada carné es el rol y se edita sobre sí mismo.
// Lo que responde el backend se ve en el carné: cae al crearlo, se suelta de una cinta al desactivarlo
// y sus documentos se reimprimen al guardar.
export default function Roles() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
  const [open, setOpen] = useState(null)
  const [flash, setFlash] = useState(null)
  const [term, setTerm] = useState('')
  const [estado, setEstado] = useState('todos')

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [flash])

  const roles = q.data?.roles
  const active = roles?.filter((r) => r.activo).length
  const mustTotal = roles?.reduce((s, r) => s + r.requisitos.filter((x) => x.obligatorio).length, 0)
  const free = roles?.filter((r) => r.requisitos.length === 0).length

  const needle = norm(term.trim())
  const view = (roles ?? []).filter((r) =>
    (estado === 'todos' || (estado === 'activos' ? r.activo : !r.activo)) &&
    (!needle || norm(`${r.nombre} ${r.slug} ${r.requisitos.map((x) => docName(x.tipoDocumento)).join(' ')}`).includes(needle)))
  const filtered = needle || estado !== 'todos'

  const done = async (id) => { await refresh(); setOpen(null); setFlash(id) }

  return (
    <section className="rk">
      <Crops />
      <header className="rk__head">
        <div className="rk__title">
          <h1>Roles y requisitos</h1>
          <ul className="mh__key">
            <li><i className="mh-k mh-k--must" aria-hidden="true" />Obligatorio</li>
            <li><i className="mh-k mh-k--opt" aria-hidden="true" />Opcional</li>
            <li><span className="rk-key-clock" aria-hidden="true">{CLOCK}</span>Exige vigencia</li>
          </ul>
        </div>
        {roles && (
          <dl className="mh__facts rk__facts">
            <div><dt>{active === 1 ? 'rol activo' : 'roles activos'}</dt><dd>{active}</dd></div>
            <div><dt>documentos obligatorios</dt><dd>{mustTotal}</dd></div>
            <div><dt>{free === 1 ? 'rol sin requisitos' : 'roles sin requisitos'}</dt><dd>{free}</dd></div>
          </dl>
        )}
      </header>

      <div className="rk__tools">
        <label className="ak-search">
          {Ico.search}
          <input type="search" placeholder="Buscar rol o documento" aria-label="Buscar rol o documento" value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <div className="rk-seg" role="radiogroup" aria-label="Estado">
          {[['todos', 'Todos'], ['activos', 'Activos'], ['inactivos', 'Inactivos']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={estado === v} className={estado === v ? 'is-on' : ''} onClick={() => setEstado(v)}>{l}</button>
          ))}
        </div>
        <span className="rk__hint">Toca un carné para editarlo</span>
      </div>

      {q.isError ? (
        <div className="rk__msg"><AkError error={q.error} /> <Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn></div>
      ) : (
        <ul className="rk__stage">
          {q.isPending
            ? Array.from({ length: 5 }, (_, i) => <li key={i} className="rk-b is-skel" style={{ '--d': `${i * 0.08}s` }}><Rail /><Hanger /><div className="rk-b__card" /></li>)
            : view.map((r, i) => (
              <Badge key={r.id} role={r} i={i} isOpen={open === r.id} flash={flash === r.id}
                onOpen={() => setOpen(r.id)} onClose={() => setOpen(null)} onSaved={() => done(r.id)} onToggled={refresh} />
            ))}
          {!q.isPending && !filtered && <NewBadge i={view.length} onCreated={(r) => { refresh(); setOpen(r.id); setFlash(r.id) }} />}
        </ul>
      )}
      {roles && filtered && view.length === 0 && (
        <p className="rk__none">Ningún carné coincide. <button type="button" className="ak-linkbtn" onClick={() => { setTerm(''); setEstado('todos') }}>Ver todos</button></p>
      )}
    </section>
  )
}

const CLOCK = <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.4 1.6" /></svg>

const Person = () => (
  <svg className="rk-who" viewBox="-14 -16 28 30" aria-hidden="true"><circle cy="-6" r="6" /><path d="M-11 13a11 11 0 0 1 22 0z" /></svg>
)

// Riel, gancho y cintas. Inactivo = cuelga de una sola cinta.
const Rail = () => <span className="rk-b__rail" aria-hidden="true" />
const Hanger = () => (
  <>
    <svg className="rk-b__hang" viewBox="0 0 60 46" aria-hidden="true">
      <path className="rk-strap rk-strap--l" d="M30 6L15 46" />
      <path className="rk-strap rk-strap--r" d="M30 6L45 46" />
      <circle className="rk-hook" cx="30" cy="6" r="4.5" />
    </svg>
  </>
)

function Badge({ role, i, isOpen, flash, onOpen, onClose, onSaved, onToggled }) {
  const cls = `rk-b${role.activo ? '' : ' is-off'}${isOpen ? ' is-open' : ''}${flash ? ' is-flash' : ''}`
  return (
    <li className={cls} style={{ '--d': `${Math.min(i, 10) * 0.06}s`, '--sw': `${5.2 + (i % 3) * 0.9}s` }}>
      <Rail />
      <div className="rk-b__swing">
        <Hanger />
        <div className="rk-b__card">
          {isOpen
            ? <Editor role={role} onClose={onClose} onSaved={onSaved} onToggled={onToggled} />
            : <Face role={role} onOpen={onOpen} />}
        </div>
      </div>
    </li>
  )
}

function Face({ role, onOpen }) {
  const must = role.requisitos.filter((x) => x.obligatorio).length
  const docs = role.requisitos.slice(0, SHOWN)
  const extra = role.requisitos.length - docs.length
  return (
    <button type="button" className="rk-face" aria-expanded="false" onClick={onOpen}
      aria-label={`${role.nombre}: ${role.requisitos.length} documentos, ${must} obligatorios${role.activo ? '' : ', inactivo'}. Editar`}>
      <span className="rk-slot" />
      <strong className="rk-name">{role.nombre}</strong>
      <span className="rk-photo"><Person /></span>
      {docs.length === 0
        ? <span className="rk-free">Sin requisitos</span>
        : (
          <span className="rk-docs">
            {docs.map((d, j) => (
              <span key={d.tipoDocumento} className="rk-doc" style={{ '--j': j }}>
                <i className={`rk-dot${d.obligatorio ? ' is-must' : ''}`} />
                <span>{docName(d.tipoDocumento)}</span>
                {d.vigenciaRequerida && <span className="rk-clock">{CLOCK}</span>}
              </span>
            ))}
            {extra > 0 && <span className="rk-more">+{extra} más</span>}
          </span>
        )}
      <span className="rk-foot">{role.requisitos.length ? `${must}/${role.requisitos.length} obligatorios` : 'Cualquiera puede tomarlo'}</span>
      {!role.activo && <span className="rk-stamp">Inactivo</span>}
      <span className="rk-saved" aria-hidden="true">{Ico.check} Guardado</span>
    </button>
  )
}

const pick = (r) => r.requisitos.map((i) => ({ tipoDocumento: i.tipoDocumento, obligatorio: i.obligatorio, vigenciaRequerida: i.vigenciaRequerida ?? true }))

function Editor({ role, onClose, onSaved, onToggled }) {
  const [nombre, setNombre] = useState(role.nombre)
  const [items, setItems] = useState(() => pick(role))
  const [tipo, setTipo] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])

  const toggle = useMutation({ mutationFn: (activo) => api(`/admin/roles/${role.id}`, { method: 'PATCH', body: { activo } }), onSuccess: onToggled })
  const renamed = nombre.trim() !== role.nombre
  const changed = JSON.stringify(items) !== JSON.stringify(pick(role))
  const save = useMutation({
    mutationFn: async () => {
      if (renamed) await api(`/admin/roles/${role.id}`, { method: 'PATCH', body: { nombre: nombre.trim() } })
      if (changed) await api(`/admin/roles/${role.id}/requirements`, { method: 'PUT', body: items })
    },
    onSuccess: onSaved,
  })

  const has = (t) => items.some((i) => i.tipoDocumento === t)
  const add = (raw) => {
    const t = docKey(raw)
    if (t && !has(t) && items.length < 30) setItems([...items, { tipoDocumento: t, obligatorio: true, vigenciaRequerida: true }])
    setTipo('')
  }
  const upd = (i, k) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: !x[k] } : x)))
  const sugg = COMMON.filter((c) => !has(c))
  const must = items.filter((x) => x.obligatorio).length
  const dirty = (renamed && nombre.trim().length >= 2) || changed

  return (
    <div className="rk-edit" role="group" aria-label={`Editar ${role.nombre}`} tabIndex={-1} ref={ref}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <span className="rk-slot" />
      <div className="rk-edit__top">
        <span className="rk-photo rk-photo--sm"><Person /></span>
        <input className="rk-name-in" aria-label="Nombre del rol" value={nombre} minLength={2} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
        <label className="rk-live">
          <Toggle label={`${role.nombre} activo`} checked={role.activo} disabled={toggle.isPending} onChange={(v) => toggle.mutate(v)} />
          {role.activo ? 'Activo' : 'Inactivo'}
        </label>
      </div>

      {items.length === 0
        ? <p className="rk-edit__empty">Sin requisitos: cualquier persona activa puede tomarlo.</p>
        : (
          <ul className="rk-reqs">
            {items.map((it, i) => {
              const n = docName(it.tipoDocumento)
              return (
                <li key={it.tipoDocumento}>
                  <button type="button" className={`rk-dotbtn${it.obligatorio ? ' is-must' : ''}`} aria-pressed={it.obligatorio}
                    aria-label={`${n} obligatorio`} title={it.obligatorio ? 'Obligatorio · toca para hacerlo opcional' : 'Opcional · toca para hacerlo obligatorio'} onClick={() => upd(i, 'obligatorio')}>
                    <i className={`rk-dot${it.obligatorio ? ' is-must' : ''}`} />
                  </button>
                  <span className="rk-reqs__name">{n}</span>
                  <button type="button" className={`rk-clockbtn${it.vigenciaRequerida ? ' is-on' : ''}`} aria-pressed={it.vigenciaRequerida}
                    aria-label={`${n} exige vigencia`} title={it.vigenciaRequerida ? 'Exige vigencia' : 'No exige vigencia'} onClick={() => upd(i, 'vigenciaRequerida')}>
                    {CLOCK}
                  </button>
                  <button type="button" className="rk-xbtn" aria-label={`Quitar ${n}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>{Ico.x}</button>
                </li>
              )
            })}
          </ul>
        )}

      <div className="rk-add">
        {PLUS}
        <input placeholder="Agregar documento" aria-label="Agregar documento" value={tipo} maxLength={60}
          onChange={(e) => setTipo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(tipo) } }} />
        {docKey(tipo) && <button type="button" className="rk-add__go" onClick={() => add(tipo)}>Agregar</button>}
      </div>
      {sugg.length > 0 && (
        <div className="rk-sugg">
          {sugg.map((c) => <button key={c} type="button" onClick={() => add(c)}>{PLUS}{docName(c)}</button>)}
        </div>
      )}

      <AkError error={save.error || toggle.error} />
      <div className="rk-edit__foot">
        <span>{items.length ? `${must}/${items.length} obligatorios` : 'Sin documentos'}</span>
        <Btn size="sm" variant="ghost" onClick={onClose}>Cerrar</Btn>
        <Btn size="sm" variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>Guardar</Btn>
      </div>
    </div>
  )
}

// Carné en blanco al final del riel: se escribe el nombre sobre él y el backend lo imprime.
function NewBadge({ i, onCreated }) {
  const [on, setOn] = useState(false)
  const [nombre, setNombre] = useState('')
  const create = useMutation({
    mutationFn: () => api('/admin/roles', { method: 'POST', body: { nombre: nombre.trim(), slug: slugify(nombre) } }),
    onSuccess: (r) => { setNombre(''); setOn(false); onCreated(r) },
  })
  const cancel = () => { setOn(false); setNombre(''); create.reset() }
  const ok = nombre.trim().length >= 2 && slugify(nombre)

  return (
    <li className={`rk-b is-ghost${on ? ' is-open is-typing' : ''}`} style={{ '--d': `${Math.min(i, 10) * 0.06}s`, '--sw': '6s' }}>
      <Rail />
      <div className="rk-b__swing">
        <Hanger />
        <div className="rk-b__card">
          {on ? (
            <form className="rk-edit rk-new" onSubmit={(e) => { e.preventDefault(); if (ok) create.mutate() }}
              onKeyDown={(e) => { if (e.key === 'Escape') cancel() }} aria-busy={create.isPending || undefined}>
              <span className="rk-slot" />
              <input className="rk-name-in" autoFocus aria-label="Nombre del rol" placeholder="Nombre del rol" required minLength={2} maxLength={80}
                value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <span className="rk-new__id">{ok ? `id: ${slugify(nombre)}` : 'Steward, Recepción, Seguridad…'}</span>
              <span className="rk-photo"><Person /></span>
              <AkError error={create.error} />
              <div className="rk-edit__foot">
                <Btn size="sm" variant="ghost" onClick={cancel}>Cancelar</Btn>
                <Btn size="sm" variant="primary" type="submit" loading={create.isPending} disabled={!ok}>Crear rol</Btn>
              </div>
            </form>
          ) : (
            <button type="button" className="rk-face" onClick={() => setOn(true)}>
              <span className="rk-slot" />
              <strong className="rk-name">Nuevo rol</strong>
              <span className="rk-photo rk-photo--plus" aria-hidden="true">{PLUS}</span>
              <span className="rk-free">Escribe el nombre y se imprime el carné</span>
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
