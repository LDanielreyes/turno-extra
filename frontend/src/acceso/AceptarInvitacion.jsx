import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { auth } from '../shared/api'
import { useSession } from '../shared/session'
import { Btn, Field, FormError } from '../shared/ui'
import AccessFrame from './AccessFrame'

// El correo de invitación lleva a /aceptar-invitacion/:id. Sin cuenta: se crea (el backend solo permite registrarse con invitación vigente).
// Con cuenta: se inicia sesión y se acepta.
export default function AceptarInvitacion() {
  const { id } = useParams()
  const s = useSession()
  const nav = useNavigate()
  const [mode, setMode] = useState('signup') // signup | signin
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [verify, setVerify] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const accept = async () => {
    await auth('/organization/accept-invitation', { invitationId: id })
    await s.refresh()
    nav('/terminos', { replace: true })
  }
  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      if (s.user) return await accept()
      if (mode === 'signup') {
        const r = await auth('/sign-up/email', { name: f.name.trim(), email: f.email.trim(), password: f.password })
        // Con verificación de correo obligatoria no hay sesión hasta confirmar.
        if (!r?.token) { setVerify(true); return }
      } else {
        await auth('/sign-in/email', { email: f.email.trim(), password: f.password })
      }
      await accept()
    } catch (x) { setErr(x) } finally { setBusy(false) }
  }

  if (verify) {
    return (
      <AccessFrame title="Revisa tu correo" lede={`Te enviamos un enlace a ${f.email} para verificar tu cuenta. Al confirmarlo vuelve a abrir la invitación para unirte a la organización.`}>
        <Link className="btn btn--primary" to="/login">Ir a entrar</Link>
      </AccessFrame>
    )
  }

  return (
    <AccessFrame title="Te invitaron a TurnoExtra" lede="Únete a tu organización para publicar turnos y administrar tu banca.">
      {s.user ? (
        <div className="stack">
          <p>Entraste como <strong>{s.user.email}</strong>.</p>
          <FormError error={err} />
          <Btn variant="primary" loading={busy} onClick={submit}>Aceptar invitación</Btn>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          {mode === 'signup' && <Field label="Nombre" autoComplete="name" required minLength={2} value={f.name} onChange={set('name')} />}
          <Field label="Correo" hint="(el de la invitación)" type="email" autoComplete="username" required value={f.email} onChange={set('email')} />
          <Field label="Contraseña" hint={mode === 'signup' ? '(mínimo 12 caracteres)' : undefined} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 12 : undefined} required value={f.password} onChange={set('password')} />
          <FormError error={err} />
          <Btn type="submit" variant="primary" loading={busy}>{mode === 'signup' ? 'Crear cuenta y unirme' : 'Entrar y unirme'}</Btn>
          <Btn variant="ghost" size="sm" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErr(null) }}>
            {mode === 'signup' ? 'Ya tengo cuenta' : 'Crear cuenta nueva'}
          </Btn>
        </form>
      )}
    </AccessFrame>
  )
}
