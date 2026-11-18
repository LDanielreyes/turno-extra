import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { Async, Btn, Toggle } from '../shared/ui'
import { NoMatch, Pager, SortTh, TableTools, useTable } from '../shared/table'
import Masthead from './Masthead'
import { ICONS } from './icons'
import { RolesScene, VacantArt } from './scenes'
import { AkError, AkField, Ico, Panel, Vacant } from './kit'

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const docKey = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
const docName = (k) => k.replace(/_/g, ' ')
// Sugerencias frecuentes; el administrador puede escribir cualquier otro tipo.
const COMMON = ['documento_identidad', 'carnet_manipulacion_alimentos', 'seguridad_social', 'certificado_alturas', 'curso_primeros_auxilios']

// Catálogo de roles y los documentos que exige cada uno (tipo, obligatorio, vigencia).
export default function Roles() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] })
  const [nombre, setNombre] = useState('')
  const create = useMutation({ mutationFn: () => api('/admin/roles', { method: 'POST', body: { nombre: nombre.trim(), slug: slugify(nombre) } }), onSuccess: () => { setNombre(''); refresh() } })
  const toggle = useMutation({ mutationFn: ({ id, activo }) => api(`/admin/roles/${id}`, { method: 'PATCH', body: { activo } }), onSuccess: refresh })
  const [edit, setEdit] = useState(null)
  const roles = q.data?.roles
  const active = roles?.filter((r) => r.activo).length
  const mustTotal = roles?.reduce((s, r) => s + r.requisitos.filter((x) => x.obligatorio).length, 0)
  const free = roles?.filter((r) => r.requisitos.length === 0).length

  return (
    <>
      <Masthead title="Roles y requisitos" art={<RolesScene roles={roles ?? []} />}
        legend={[['must', 'Documento obligatorio'], ['opt', 'Opcional']]}
        facts={roles ? [[active, active === 1 ? 'rol activo' : 'roles activos'], [mustTotal, 'documentos obligatorios'], [free, free === 1 ? 'rol sin requisitos' : 'roles sin requisitos']] : null} />

      <Panel title="Nuevo rol" icon={ICONS.plus}>
        <form className="ak-inline" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <AkField label="Nombre del rol" placeholder="Steward, Recepción, Seguridad…" required minLength={2} maxLength={80}
            hint={nombre.trim().length >= 2 ? `id: ${slugify(nombre) || '—'}` : null}
            value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Btn type="submit" variant="primary" loading={create.isPending}>Crear rol</Btn>
          <div className="ak-inline__msg"><AkError error={create.error} /></div>
        </form>
      </Panel>

      <Panel className="ak-panel--flush" title="Catálogo" icon={ICONS.roles} meta={roles ? `${active} activos de ${roles.length}` : null}>
        {toggle.error && <div style={{ padding: '16px 20px 0' }}><AkError error={toggle.error} /></div>}
        <Async skeleton="table" q={q} empty={Object.assign((d) => d.roles.length === 0, { node: <Vacant art={VacantArt.roles} title="Sin roles todavía">Crea el primero con el formulario de arriba.</Vacant> })}>
          {({ roles }) => <RolesTable roles={roles} edit={edit} setEdit={setEdit} toggle={toggle} refresh={refresh} />}
        </Async>
      </Panel>
    </>
  )
}

function RolesTable({ roles, edit, setEdit, toggle, refresh }) {
  const t = useTable(roles, {
    initialSort: { key: 'nombre', dir: 'asc' },
    sorters: {
      nombre: (r) => r.nombre,
      docs: { by: (r) => r.requisitos.length, first: 'desc' },
      estado: { by: (r) => (r.activo ? 1 : 0), first: 'desc' },
    },
    search: (r) => `${r.nombre} ${r.slug} ${r.requisitos.map((x) => x.tipoDocumento).join(' ')}`,
    filters: {
      estado: (r, v) => (v === 'activo' ? r.activo : !r.activo),
      docs: (r, v) => (v === 'con' ? r.requisitos.length > 0 : r.requisitos.length === 0),
    },
  })
  return (
    <>
      <TableTools t={t} placeholder="Buscar rol o documento" filters={[
        { key: 'estado', label: 'Todos los estados', options: [['activo', 'Activos'], ['inactivo', 'Inactivos']] },
        { key: 'docs', label: 'Con o sin requisitos', options: [['con', 'Con requisitos'], ['sin', 'Sin requisitos']] },
      ]} />
      {t.total === 0 ? <NoMatch t={t} /> : (
        <table className="ak-table">
          <thead>
            <tr>
              <SortTh t={t} k="nombre">Rol</SortTh>
              <SortTh t={t} k="docs">Documentos <span className="sr-only">(punto: obligatorio)</span></SortTh>
              <SortTh t={t} k="estado">Estado</SortTh>
              <th className="end"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {t.view.map((r) => {
              const must = r.requisitos.filter((x) => x.obligatorio).length
              return (
                <Fragment key={r.id}>
                  <tr className={`ak-row${edit === r.id ? ' is-open' : ''}${r.activo ? '' : ' is-off'}`}>
                    <td>
                      <div className="ak-name"><div><strong>{r.nombre}</strong><span className="mono">{r.slug}</span></div></div>
                    </td>
                    <td>
                      {r.requisitos.length === 0
                        ? <span className="dim">Sin requisitos</span>
                        : (
                          <div className="ak-docs">
                            {r.requisitos.map((x) => (
                              <span key={x.tipoDocumento} className={`ak-doc${x.obligatorio ? ' is-must' : ''}`} title={x.obligatorio ? 'Obligatorio' : 'Opcional'}>
                                {docName(x.tipoDocumento)}
                              </span>
                            ))}
                          </div>
                        )}
                    </td>
                    <td>
                      <span className="ak-state">
                        <Toggle label={`${r.nombre} activo`} checked={r.activo} disabled={toggle.isPending} onChange={(activo) => toggle.mutate({ id: r.id, activo })} />
                        {r.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="end">
                      <Btn size="sm" variant="ghost" aria-expanded={edit === r.id} onClick={() => setEdit(edit === r.id ? null : r.id)}>
                        Requisitos{r.requisitos.length ? ` ${must}/${r.requisitos.length}` : ''} {Ico.chev}
                      </Btn>
                    </td>
                  </tr>
                  {edit === r.id && (
                    <tr><td colSpan={4} className="ak-cell-drawer">
                      <Requirements role={r} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh() }} />
                    </td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      <Pager t={t} />
    </>
  )
}

function Requirements({ role, onSaved, onClose }) {
  const [items, setItems] = useState(role.requisitos.map((i) => ({ tipoDocumento: i.tipoDocumento, obligatorio: i.obligatorio, vigenciaRequerida: i.vigenciaRequerida ?? true })))
  const [tipo, setTipo] = useState('')
  const save = useMutation({ mutationFn: () => api(`/admin/roles/${role.id}/requirements`, { method: 'PUT', body: items }), onSuccess: onSaved })
  const has = (t) => items.some((i) => i.tipoDocumento === t)
  const add = (raw) => {
    const t = docKey(raw)
    if (t && !has(t) && items.length < 30) setItems([...items, { tipoDocumento: t, obligatorio: true, vigenciaRequerida: true }])
    setTipo('')
  }
  const upd = (i, k, v) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const sugg = COMMON.filter((c) => !has(c))

  return (
    <div className="ak-drawer">
      {items.length === 0
        ? <p className="ak-drawer__lede">Sin requisitos: cualquier persona activa es elegible para {role.nombre}.</p>
        : (
          <ul className="ak-reqs">
            {items.map((it, i) => (
              <li key={it.tipoDocumento}>
                <span className="ak-reqs__name">{docName(it.tipoDocumento)}</span>
                <label className="ak-reqs__opt"><Toggle label={`${docName(it.tipoDocumento)} obligatorio`} checked={it.obligatorio} onChange={(v) => upd(i, 'obligatorio', v)} />Obligatorio</label>
                <label className="ak-reqs__opt"><Toggle label={`${docName(it.tipoDocumento)} exige vigencia`} checked={it.vigenciaRequerida} onChange={(v) => upd(i, 'vigenciaRequerida', v)} />Exige vigencia</label>
                <button type="button" className="ak-iconbtn" aria-label={`Quitar ${docName(it.tipoDocumento)}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>{Ico.x}</button>
              </li>
            ))}
          </ul>
        )}

      <div className="ak-inline">
        <AkField label="Agregar documento" placeholder="Tipo de documento" value={tipo} maxLength={60}
          hint={tipo.trim() ? `se guarda como ${docKey(tipo) || '—'}` : 'Enter para agregar'}
          onChange={(e) => setTipo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(tipo) } }} />
        <Btn onClick={() => add(tipo)} disabled={!docKey(tipo)}>Agregar</Btn>
      </div>
      {sugg.length > 0 && (
        <div className="ak-sugg">
          <span>Frecuentes:</span>
          {sugg.map((c) => <button key={c} type="button" className="ak-chipbtn" onClick={() => add(c)}>{docName(c)}</button>)}
        </div>
      )}

      <AkError error={save.error} />
      <div className="ak-form__foot">
        <span className="ak-count">{items.length} {items.length === 1 ? 'documento' : 'documentos'} · {items.filter((x) => x.obligatorio).length} obligatorios</span>
        <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
        <Btn size="sm" loading={save.isPending} onClick={() => save.mutate()}>Guardar requisitos</Btn>
      </div>
    </div>
  )
}
