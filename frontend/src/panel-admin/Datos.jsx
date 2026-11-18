import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../shared/api'
import { Btn } from '../shared/ui'
import Masthead from './Masthead'
import { ICONS } from './icons'
import { DatosScene } from './scenes'
import { AkError, AkField, Alert, Ico, Panel } from './kit'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WORD = 'BORRAR'
const GONE = ['Nombre', 'Celular', 'Canales de contacto', 'Autorizaciones', 'Mensajes', 'Documentos']
const KEPT = ['Turnos, ofertas y asignaciones, ya anónimos', 'Bitácora de auditoría (solo identificadores)']

// `data delete`: mismo servicio que «BORRAR MIS DATOS». Borra nombre, celular, canales, autorizaciones, mensajes y documentos;
// se conservan turnos, ofertas y asignaciones ya anónimos, y la bitácora (solo ids).
// Tres pasos: identificar, revisar el alcance y confirmar escribiendo la palabra.
export default function Datos() {
  const [id, setId] = useState('')
  const [word, setWord] = useState('')
  const [done, setDone] = useState(null)
  const del = useMutation({
    mutationFn: () => api(`/admin/workers/${id.trim()}/data-delete`, { method: 'POST' }),
    onSuccess: () => { setDone(id.trim()); setId(''); setWord('') },
  })
  const v = id.trim()
  const idOk = UUID.test(v)
  const idStatus = !v ? null : idOk ? { tone: 'ok', text: 'Formato válido' } : { tone: 'bad', text: `Debe tener 36 caracteres (lleva ${v.length})` }
  const ready = idOk && word.trim().toUpperCase() === WORD
  const phase = done && !v ? 'done' : ready ? 'armed' : idOk ? 'ready' : 'idle'

  return (
    <>
      <Masthead title="Datos personales" art={<DatosScene phase={phase} id={phase === 'done' ? done : v} />}
        facts={[[GONE.length, 'tipos de dato se borran'], [KEPT.length, 'registros se conservan, anónimos'], ['Definitivo', 'no se puede deshacer']]}
        lede="Borrado a pedido de la persona. Igual que «Borrar mis datos»." />

      {done && <Alert>Datos de <span className="mono">{done}</span> borrados. La acción quedó en la auditoría.</Alert>}

      <Panel tone="danger" title="Borrar datos de una persona" icon={ICONS.shield}>
        <form className="ak-steps" onSubmit={(e) => { e.preventDefault(); if (ready) del.mutate() }}>
          <section className={`ak-step${idOk ? ' is-done' : ' is-now'}`}>
            <span className="ak-step__n" aria-hidden="true">{idOk ? Ico.check : '1'}</span>
            <div className="ak-step__body">
              <h3>Identifica a la persona</h3>
              <AkField label="Identificador" hint="UUID de la persona" placeholder="00000000-0000-0000-0000-000000000000" required
                className="ak-field--mono" status={idStatus} value={id} onChange={(e) => { setDone(null); setId(e.target.value) }} />
            </div>
          </section>

          <section className={`ak-step${idOk ? ' is-now' : ''}`}>
            <span className="ak-step__n" aria-hidden="true">2</span>
            <div className="ak-step__body">
              <h3>Revisa el alcance</h3>
              <div className="ak-scope">
                <div>
                  <h4>Se borra</h4>
                  <ul>{GONE.map((g) => <li key={g} className="is-gone">{Ico.x}{g}</li>)}</ul>
                </div>
                <div>
                  <h4>Se conserva</h4>
                  <ul>{KEPT.map((k) => <li key={k}>{Ico.check}{k}</li>)}</ul>
                </div>
              </div>
            </div>
          </section>

          <section className={`ak-step${idOk ? ' is-now' : ''}`}>
            <span className="ak-step__n" aria-hidden="true">3</span>
            <div className="ak-step__body">
              <h3>Confirma el borrado</h3>
              <AkField label={`Escribe ${WORD} para confirmar`} hint="no se puede deshacer" autoComplete="off" spellCheck={false}
                className="ak-field--mono" disabled={!idOk} value={word} onChange={(e) => setWord(e.target.value)} />
              <AkError error={del.error} />
              <div className="ak-form__foot ak-form__foot--start">
                <Btn type="submit" className="ak-danger" loading={del.isPending} disabled={!ready}>Borrar datos definitivamente</Btn>
              </div>
            </div>
          </section>
        </form>
      </Panel>
    </>
  )
}
