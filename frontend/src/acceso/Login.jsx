import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { api, auth } from '../shared/api'
import { homeFor, useSession } from '../shared/session'
import { Btn, Field, FormError } from '../shared/ui'
import AccessFrame from './AccessFrame'
import AccessStage from './AccessStage'

// Un solo login para todos. Administradores: correo + contraseña.
// Candidatos: código de un solo uso enviado por su canal activo.
export default function Login() {
  const s = useSession()
  const loc = useLocation()
  const [mode, setMode] = useState('admin') // admin | candidato
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ email: '', password: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const [cand, setCand] = useState({ celular: '', code: '', sent: false })

  if (!s.loading && s.user) return <Navigate to={loc.state?.from ?? homeFor(s)} replace />

  // Al llegar la sesión, el <Navigate> de arriba lleva a cada rol a su panel.
  const finish = () => s.refresh()
  const run = (fn) => async (e) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try { await fn() } catch (x) { setErr(x) } finally { setBusy(false) }
  }

  const signIn = run(async () => {
    await auth('/sign-in/email', { email: f.email.trim(), password: f.password })
    await finish()
  })

  // Candidato: pide código → lo recibe por su canal → lo verifica.
  const askCode = run(async () => {
    await api('/candidato/codigo', { method: 'POST', body: { celular: cand.celular } })
    setCand({ ...cand, sent: true })
  })
  const verifyCode = run(async () => {
    await api('/candidato/verificar', { method: 'POST', body: { celular: cand.celular, code: cand.code.trim() } })
    await finish()
  })

  return (
    <AccessFrame
      title="Entra a TurnoExtra"
      lede="Un solo acceso. Te llevamos al panel que te corresponde."
      stage={<AccessStage mode={mode} />}
      foot={<><Link to="/legal">Política de datos y términos</Link><Link to="/">Volver al inicio</Link></>}
    >
      <div className="seg" role="tablist" aria-label="Tipo de acceso">
          <button role="tab" aria-selected={mode === 'admin'} className={mode === 'admin' ? 'is-on' : ''} onClick={() => { setMode('admin'); setErr(null) }}>Empresa</button>
          <button role="tab" aria-selected={mode === 'candidato'} className={mode === 'candidato' ? 'is-on' : ''} onClick={() => { setMode('candidato'); setErr(null) }}>Personal</button>
      </div>

      {mode === 'admin' && (
        <form className="stack" onSubmit={signIn}>
          <Field label="Correo" type="email" autoComplete="username" required value={f.email} onChange={set('email')} />
          <Field label="Contraseña" type="password" autoComplete="current-password" required value={f.password} onChange={set('password')} />
          <FormError error={err} />
          <Btn type="submit" variant="primary" loading={busy}>Entrar</Btn>
          <p className="small muted">¿Te invitaron a una organización? Abre el enlace del correo de invitación.</p>
        </form>
      )}

      {mode === 'candidato' && !cand.sent && (
        <form className="stack" onSubmit={askCode}>
          <p className="muted">Escribe tu celular. Te enviamos un código por el canal que tienes activo (WhatsApp, Telegram o correo).</p>
          <Field label="Celular" type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" required value={cand.celular} onChange={(e) => setCand({ ...cand, celular: e.target.value })} />
          <FormError error={err} />
          <Btn type="submit" variant="primary" loading={busy}>Enviarme el código</Btn>
        </form>
      )}
      {mode === 'candidato' && cand.sent && (
        <form className="stack" onSubmit={verifyCode}>
          <p className="muted">Te enviamos un código. Vence en 10 minutos.</p>
          <Field label="Código" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus value={cand.code} onChange={(e) => setCand({ ...cand, code: e.target.value })} />
          <FormError error={err} />
          <Btn type="submit" variant="primary" loading={busy}>Entrar</Btn>
          <Btn variant="ghost" size="sm" onClick={() => setCand({ ...cand, sent: false, code: '' })}>Cambiar celular</Btn>
        </form>
      )}
    </AccessFrame>
  )
}

