import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { ICONS } from './icons'
import { AkError } from './kit'
import './terminos.css'

// La hoja es el editor: se elige para quién con la pestaña, se escribe título y texto sobre el papel
// tal como lo leerá quien deba aceptarlo, y al publicar cae el sello con la versión que asigna el backend.
// Detrás asoman las versiones ya publicadas de ese público.

const AUD = {
  org: { label: 'Empresas', icon: ICONS.orgs, effect: 'Cada organización deberá aceptarla para seguir operando.' },
  candidato: { label: 'Candidatos', icon: ICONS.datos, effect: 'Será la versión vigente para el personal de la banca.' },
}
const paraList = (s) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

// Versión vigente por público; 404 = aún no hay ninguna publicada.
function useCurrent(audience) {
  return useQuery({
    queryKey: ['admin', 'terms', audience],
    queryFn: async () => {
      try { return await api(`/terms/current?audience=${audience}`) } catch (e) { if (e.status === 404) return null; throw e }
    },
    staleTime: 60_000,
  })
}

export default function Terminos() {
  const qc = useQueryClient()
  const [f, setF] = useState({ audience: 'org', titulo: '', cuerpo: '' })
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState(null)
  const cur = { org: useCurrent('org'), candidato: useCurrent('candidato') }
  const titleRef = useRef(null)

  const set = (k) => (e) => { setConfirm(false); setF({ ...f, [k]: e.target.value }) }
  const publish = useMutation({
    mutationFn: () => api('/admin/terms', { method: 'POST', body: { ...f, titulo: f.titulo.trim() } }),
    onSuccess: (t) => {
      setDone({ ...t, audience: f.audience, titulo: f.titulo.trim(), cuerpo: f.cuerpo })
      setConfirm(false)
      qc.invalidateQueries({ queryKey: ['admin', 'terms', f.audience] })
    },
  })
  const fresh = () => { setDone(null); setF({ ...f, titulo: '', cuerpo: '' }); publish.reset(); requestAnimationFrame(() => titleRef.current?.focus()) }

  const sheet = done ?? f
  const words = sheet.cuerpo.trim() ? sheet.cuerpo.trim().split(/\s+/).length : 0
  const paras = paraList(sheet.cuerpo).length
  const live = cur[f.audience].data
  const nextV = (live?.version ?? 0) + 1
  const ok = f.titulo.trim().length >= 2 && f.cuerpo.trim().length >= 10
  const phase = done ? 'done' : confirm ? 'confirm' : 'draft'
  const pastSheets = Math.min(done ? (done.version ?? 1) - 1 : live?.version ?? 0, 3)

  useEffect(() => {
    if (!confirm) return
    const k = (e) => { if (e.key === 'Escape') setConfirm(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [confirm])

  return (
    <section className="tm">
      <Crops />
      <header className="tm__head">
        <div className="tm__title">
          <h1>Términos</h1>
          <ul className="mh__key">
            <li><i className="mh-k mh-k--must" aria-hidden="true" />Vigente</li>
            <li><i className="tm-k tm-k--ribbon" aria-hidden="true" />Por confirmar</li>
            <li><i className="tm-k tm-k--stamp" aria-hidden="true" />Publicada</li>
          </ul>
        </div>
        <dl className="mh__facts tm__facts">
          <div><dt>{words === 1 ? 'palabra' : 'palabras'}</dt><dd>{words}</dd></div>
          <div><dt>{paras === 1 ? 'párrafo' : 'párrafos'}</dt><dd>{paras}</dd></div>
          <div><dt>deberán aceptarla</dt><dd>{AUD[sheet.audience].label}</dd></div>
        </dl>
      </header>

      <div className="tm__stage">
        {/* pestañas de la carpeta: para quién es la hoja y qué versión rige hoy */}
        <div className="tm-tabs" role="radiogroup" aria-label="Para quién">
          {Object.entries(AUD).map(([k, a]) => {
            const c = cur[k]
            const on = sheet.audience === k
            return (
              <button key={k} type="button" role="radio" aria-checked={on} disabled={!!done || publish.isPending}
                className={`tm-tab${on ? ' is-on' : ''}`} onClick={() => { setConfirm(false); setF({ ...f, audience: k }) }}>
                <span className="tm-tab__ico">{a.icon}</span>
                <span className="tm-tab__t">{a.label}</span>
                <span className="tm-tab__v" key={c.data?.version ?? 'none'}>
                  {c.isPending ? <span className="skel-inline" aria-hidden="true" /> : c.isError ? 'Sin dato' : c.data ? <><i className="tm-dot" />v{c.data.version} vigente</> : 'Sin publicar'}
                </span>
              </button>
            )
          })}
        </div>

        <div className={`tm-desk is-${phase}`}>
          {Array.from({ length: pastSheets }, (_, i) => <span key={i} className="tm-past" style={{ '--j': i + 1 }} aria-hidden="true" />)}
          <form className="tm-sheet" aria-label={`Hoja de términos para ${AUD[sheet.audience].label.toLowerCase()}`}
            onSubmit={(e) => { e.preventDefault(); if (!ok || done) return; if (!confirm) setConfirm(true); else publish.mutate() }}>
            <div className="tm-sheet__bar">
              <span>{AUD[sheet.audience].label} · {done ? `versión ${done.version}` : `versión ${cur[f.audience].isPending ? '…' : nextV} · borrador`}</span>
              <span>{words} {words === 1 ? 'palabra' : 'palabras'}</span>
            </div>
            <textarea ref={titleRef} className="tm-sheet__title" rows={1} aria-label="Título" placeholder="Título de los términos" required minLength={2} maxLength={160}
              readOnly={!!done} value={sheet.titulo} onChange={set('titulo')} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
            <i className="tm-sheet__rule" aria-hidden="true" />
            <textarea className="tm-sheet__body" aria-label="Texto" required minLength={10} readOnly={!!done}
              placeholder={'Pega o escribe el texto completo.\n\nSepara los párrafos con una línea en blanco.'}
              value={sheet.cuerpo} onChange={set('cuerpo')} />
            <div className="tm-sheet__sign" aria-hidden="true"><i /><span>Aceptación</span></div>

            {phase === 'confirm' && (
              <svg className="tm-ribbon" viewBox="0 0 28 60" aria-hidden="true"><path d="M0 0h28v60l-14-11L0 60z" /></svg>
            )}
            {phase === 'done' && (
              <svg className="tm-stamp" viewBox="0 0 120 120" role="img" aria-label={`Publicada versión ${done.version}`}>
                <circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="45" className="tm-stamp__in" />
                <text x="60" y="56" textAnchor="middle">Publicada</text>
                <text x="60" y="78" textAnchor="middle" className="tm-stamp__v">v{done.version}</text>
              </svg>
            )}

            <div className="tm-sheet__foot">
              <AkError error={publish.error} />
              {phase === 'draft' && (
                <div className="tm-act">
                  <span className="tm-act__hint">{ok ? `Saldrá como v${nextV}` : 'Título y texto para publicar'}</span>
                  <Btn type="submit" variant="primary" disabled={!ok || cur[f.audience].isPending}>Publicar v{cur[f.audience].isPending ? '' : nextV}</Btn>
                </div>
              )}
              {phase === 'confirm' && (
                <div className="tm-act is-confirm" role="alert">
                  <span className="tm-act__hint"><b>{AUD[f.audience].effect}</b></span>
                  <Btn variant="ghost" onClick={() => setConfirm(false)} disabled={publish.isPending}>Seguir editando</Btn>
                  <Btn type="submit" variant="primary" loading={publish.isPending}>Sí, publicar v{nextV}</Btn>
                </div>
              )}
              {phase === 'done' && (
                <div className="tm-act" role="status">
                  <span className="tm-act__hint">Vigente para {AUD[done.audience].label.toLowerCase()}</span>
                  <Btn variant="primary" onClick={fresh}>Nueva versión</Btn>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
