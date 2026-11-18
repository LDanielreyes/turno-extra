import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../shared/api'
import { fmtDateTime } from '../shared/format'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { AkError, Ico } from './kit'
import './datos.css'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WORD = 'BORRAR'
const GONE = ['Nombre', 'Celular', 'Canales de contacto', 'Autorizaciones', 'Mensajes', 'Documentos']
const KEPT = ['Turnos, ofertas y asignaciones, ya anónimos', 'Bitácora de auditoría (solo identificadores)']

// `data delete`: mismo servicio que «BORRAR MIS DATOS». La ficha de la persona es la interfaz:
// se escribe su id sobre la ficha, la ficha tacha lo que se borra y marca lo que se conserva,
// se confirma escribiendo la palabra y, cuando el backend responde, la ficha entra a la trituradora
// y sale el comprobante sellado.
export default function Datos() {
  const [id, setId] = useState('')
  const [word, setWord] = useState('')
  const [done, setDone] = useState(null)
  const [shredding, setShredding] = useState(false)
  // La ficha termina de entrar a la trituradora antes de que salga el comprobante.
  const del = useMutation({
    mutationFn: (target) => api(`/admin/workers/${target}/data-delete`, { method: 'POST' }),
    onSuccess: (_, target) => {
      const finish = () => { setShredding(false); setDone({ id: target, at: new Date() }); setId(''); setWord('') }
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return finish()
      setShredding(true)
      setTimeout(finish, 950)
    },
  })
  const v = id.trim()
  const idOk = UUID.test(v)
  const ready = idOk && word.trim().toUpperCase() === WORD
  const phase = del.isPending || shredding ? 'shred' : done ? 'done' : ready ? 'armed' : idOk ? 'ready' : 'idle'
  const restart = () => { setDone(null); del.reset() }

  return (
    <section className="dt">
      <Crops />
      <header className="dt__head">
        <div className="dt__title">
          <h1>Datos personales</h1>
          <ul className="mh__key">
            <li><span className="dt-k dt-k--gone" aria-hidden="true">{Ico.x}</span>Se borra</li>
            <li><span className="dt-k dt-k--kept" aria-hidden="true">{Ico.check}</span>Se conserva, anónimo</li>
          </ul>
        </div>
        <dl className="mh__facts dt__facts">
          <div><dt>tipos de dato se borran</dt><dd>{GONE.length}</dd></div>
          <div><dt>registros se conservan</dt><dd>{KEPT.length}</dd></div>
          <div><dt>no se puede deshacer</dt><dd>Definitivo</dd></div>
        </dl>
      </header>

      <div className={`dt-stage is-${phase}`}>
        {done ? (
          <Receipt done={done} onAgain={restart} />
        ) : (
          <form className={`dt-file${del.isError ? ' is-bad' : ''}`} aria-label="Ficha de la persona" onSubmit={(e) => { e.preventDefault(); if (ready && !del.isPending && !shredding) del.mutate(v) }}>
            <span className="dt-file__tab" aria-hidden="true">Expediente</span>
            <div className="dt-file__sheet">
              <div className="dt-who">
                <span className={`dt-photo${idOk ? ' is-on' : ''}`} aria-hidden="true">
                  <svg viewBox="-14 -16 28 30"><circle cy="-6" r="6" /><path d="M-11 13a11 11 0 0 1 22 0z" /></svg>
                </span>
                <label className="dt-id">
                  <span>Persona</span>
                  <input value={id} placeholder="00000000-0000-0000-0000-000000000000" spellCheck={false} autoComplete="off" required
                    aria-invalid={v && !idOk ? 'true' : undefined} aria-describedby="dt-id-msg" disabled={del.isPending || shredding}
                    onChange={(e) => { del.reset(); setId(e.target.value) }} />
                  <small id="dt-id-msg" className={!v ? '' : idOk ? 'is-ok' : 'is-bad'}>
                    {!v ? 'Identificador de la persona (UUID)' : idOk ? 'Formato válido' : `Debe tener 36 caracteres (lleva ${v.length})`}
                  </small>
                </label>
              </div>

              <div className="dt-scope">
                <div>
                  <h2>Se borra</h2>
                  <ul>
                    {GONE.map((g, i) => (
                      <li key={g} className="is-gone" style={{ '--i': i }}>
                        <span className="dt-mark" aria-hidden="true">{Ico.x}</span>
                        <span className="dt-strike">{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2>Se conserva</h2>
                  <ul>
                    {KEPT.map((k) => (
                      <li key={k} className="is-kept">
                        <span className="dt-mark" aria-hidden="true">{Ico.check}</span>
                        <span>{k}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="dt-confirm">
                <label className="dt-word">
                  <span>Escribe {WORD} para confirmar</span>
                  <input value={word} autoComplete="off" spellCheck={false} disabled={!idOk || del.isPending}
                    onChange={(e) => setWord(e.target.value)} aria-describedby="dt-word-msg" />
                  <small id="dt-word-msg">{idOk ? 'No se puede deshacer' : 'Primero el identificador'}</small>
                </label>
                <Btn type="submit" className="ak-danger dt-go" loading={del.isPending} disabled={!ready}>Borrar datos</Btn>
              </div>
              {del.error && <div className="dt-err"><AkError error={del.error} /></div>}
            </div>
          </form>
        )}

        <div className="dt-shredder" aria-hidden="true">
          <span className="dt-shredder__mouth" />
          <span className="dt-shredder__led" />
          {done && (
            <span className="dt-strips">
              {Array.from({ length: 11 }, (_, i) => <i key={i} style={{ '--i': i, '--h': `${26 + ((i * 37) % 30)}px` }} />)}
            </span>
          )}
        </div>
        <p className="sr-only" role="status">{del.isPending || shredding ? 'Borrando datos…' : done ? `Datos de ${done.id} borrados.` : ''}</p>
      </div>
    </section>
  )
}

function Receipt({ done, onAgain }) {
  return (
    <div className="dt-receipt">
      <span className="dt-stamp" aria-hidden="true">Borrado</span>
      <h2>Comprobante de borrado</h2>
      <dl>
        <div><dt>Persona</dt><dd className="mono">{done.id}</dd></div>
        <div><dt>Hora</dt><dd>{fmtDateTime(done.at)}</dd></div>
        <div><dt>Se borró</dt><dd>{GONE.join(', ')}</dd></div>
        <div><dt>Registro</dt><dd>Quedó en la auditoría</dd></div>
      </dl>
      <div className="dt-receipt__foot">
        <Btn size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(done.id)}>Copiar id</Btn>
        <Btn size="sm" onClick={onAgain}>Borrar otra persona</Btn>
      </div>
    </div>
  )
}
