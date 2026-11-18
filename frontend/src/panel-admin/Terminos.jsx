import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../shared/api'
import { Btn } from '../shared/ui'
import Masthead from './Masthead'
import { ICONS } from './icons'
import { TermsScene } from './scenes'
import { AkError, AkField, Alert, Choice, Panel } from './kit'

const EFFECT = {
  org: 'Cada organización deberá aceptar esta versión para seguir operando su panel.',
  candidato: 'Pasará a ser la versión vigente de los términos para candidatos.',
}

// Publicar una versión nueva de términos obliga a cada organización a volver a aceptarlos para operar.
export default function Terminos() {
  const [f, setF] = useState({ audience: 'org', titulo: '', cuerpo: '' })
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState(null)
  const set = (k) => (e) => { setConfirm(false); setF({ ...f, [k]: e.target.value }) }
  const publish = useMutation({
    mutationFn: () => api('/admin/terms', { method: 'POST', body: { ...f, titulo: f.titulo.trim() } }),
    onSuccess: (t) => { setDone({ ...t, audience: f.audience, titulo: f.titulo.trim(), cuerpo: f.cuerpo }); setConfirm(false); setF({ ...f, titulo: '', cuerpo: '' }) },
  })
  const words = f.cuerpo.trim() ? f.cuerpo.trim().split(/\s+/).length : 0
  const paraList = (s) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const paras = paraList(f.cuerpo).length
  // la escena: el borrador mientras se escribe; tras publicar, la hoja publicada con su sello
  const sealed = done && !f.titulo && !f.cuerpo
  const phase = sealed ? 'done' : confirm ? 'confirm' : 'draft'

  return (
    <>
      <Masthead title="Términos"
        art={<TermsScene phase={phase} audience={sealed ? done.audience : f.audience} version={done?.version}
          titulo={sealed ? done.titulo : f.titulo.trim()} paras={paraList(sealed ? done.cuerpo : f.cuerpo)} />}
        facts={[[words, words === 1 ? 'palabra' : 'palabras'], [paras, paras === 1 ? 'párrafo' : 'párrafos'], [f.audience === 'org' ? 'Empresas' : 'Candidatos', 'deberán aceptarla']]}
        lede="Una versión nueva por público. Revísala con un abogado antes de publicar." />

      <div className="ak-split ak-split--doc">
        <Panel title="Redactar versión" icon={ICONS.pen}>
          <form className="ak-form" onSubmit={(e) => { e.preventDefault(); setDone(null); if (!confirm) setConfirm(true); else publish.mutate() }}>
            <fieldset className="ak-fieldset">
              <legend>Para quién</legend>
              <Choice name="audience" value={f.audience} onChange={(audience) => { setConfirm(false); setF({ ...f, audience }) }}
                options={[
                  { value: 'org', label: 'Empresas', sub: 'Gerentes y administradores' },
                  { value: 'candidato', label: 'Candidatos', sub: 'Personal de la banca' },
                ]} />
            </fieldset>
            <AkField label="Título" placeholder="Términos y condiciones para empresas" required minLength={2} maxLength={160} value={f.titulo} onChange={set('titulo')}
              hint={`${f.titulo.length}/160`} />
            <AkField label="Texto" as="textarea" rows={16} required minLength={10} placeholder="Pega o escribe el texto completo. Separa los párrafos con una línea en blanco."
              value={f.cuerpo} onChange={set('cuerpo')} hint={`${words} palabras · ${paras} ${paras === 1 ? 'párrafo' : 'párrafos'}`} className="ak-field--doc" />
            <AkError error={publish.error} />
            {done && <Alert>Publicada la versión {done.version} para {done.audience === 'org' ? 'empresas' : 'candidatos'}.</Alert>}
            {confirm && <Alert tone="warn">{EFFECT[f.audience]} Revisa el texto antes de confirmar.</Alert>}
            <div className="ak-form__foot">
              {confirm && <Btn variant="ghost" onClick={() => setConfirm(false)}>Seguir editando</Btn>}
              <Btn type="submit" variant="primary" loading={publish.isPending}>{confirm ? 'Sí, publicar versión' : 'Publicar'}</Btn>
            </div>
          </form>
        </Panel>

        {/* vista previa sobre papel: así lo lee quien debe aceptarlo */}
        <aside className="ak-paper" aria-label="Vista previa">
          <div className="ak-paper__bar">
            <span>Vista previa</span>
            <span>{f.audience === 'org' ? 'Empresas' : 'Candidatos'} · versión siguiente</span>
          </div>
          <article className="ak-paper__sheet">
            <h3>{f.titulo.trim() || 'Título de los términos'}</h3>
            {f.cuerpo.trim()
              ? f.cuerpo.split(/\n\s*\n/).filter((p) => p.trim()).map((p, i) => <p key={i}>{p.trim()}</p>)
              : <p className="ak-paper__ph">El texto aparecerá aquí tal como lo leerá quien deba aceptarlo.</p>}
            <div className="ak-paper__sign">
              <span>Aceptación</span>
              <i />
            </div>
          </article>
        </aside>
      </div>
    </>
  )
}
