import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, auth, errorText } from '../shared/api'
import { fmtDate } from '../shared/format'
import { useSession } from '../shared/session'
import { Btn } from '../shared/ui'
import Crops from '../shared/Crops'
import { orgKey, useOrg } from './org'
import { Ico } from './live/icons'
import './equipo.css'

// Equipo como tablero de llaves con tantos ganchos como gerentes caben (3).
// Llave colgada = gerente; etiqueta punteada = invitación en camino; gancho libre = se escribe el correo ahí.
// Lo que responde el backend se ve en el tablero: la llave cae al quitarla, la etiqueta se cuelga al invitar.
export default function Equipo() {
  const { orgId } = useOrg()
  const { user } = useSession()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: orgKey(orgId, 'team'), queryFn: () => api(`/orgs/${orgId}/team`) })
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId, 'team') })
  const [falling, setFalling] = useState(null)
  const [fresh, setFresh] = useState(null)

  // La llave cae y luego el tablero se actualiza con lo que dice el backend.
  const drop = (id) => { setFalling(id); setTimeout(async () => { await refresh(); setFalling(null) }, 650) }
  const remove = useMutation({ mutationFn: (memberId) => auth('/organization/remove-member', { memberIdOrEmail: memberId, organizationId: orgId }), onSuccess: (_, id) => drop(id) })
  const cancelInv = useMutation({ mutationFn: (invitationId) => auth('/organization/cancel-invitation', { invitationId }), onSuccess: (_, id) => drop(id) })
  const invite = useMutation({
    mutationFn: (email) => auth('/organization/invite-member', { email, role: 'admin', organizationId: orgId }),
    onSuccess: async (_, email) => { await refresh(); setFresh(email) },
  })

  useEffect(() => {
    if (!fresh) return
    const t = setTimeout(() => setFresh(null), 2200)
    return () => clearTimeout(t)
  }, [fresh])

  const d = q.data
  const max = d?.maxAdmins ?? 3
  const slots = d ? [
    ...d.members.map((m) => ({ kind: 'member', id: m.id, m })),
    ...d.invitations.map((i) => ({ kind: 'invite', id: i.id, i })),
  ] : []
  while (d && slots.length < max) slots.push({ kind: 'free', id: `free-${slots.length}` })
  const free = d ? max - d.members.length - d.invitations.length : 0

  return (
    <section className="eq">
      <Crops />
      <header className="eq__head">
        <div className="eq__title">
          <h1>Equipo</h1>
          <ul className="eq-key" aria-label="Leyenda">
            <li><span className="eq-k eq-k--key" aria-hidden="true" />Gerente</li>
            <li><span className="eq-k eq-k--inv" aria-hidden="true" />Invitación en camino</li>
            <li><span className="eq-k eq-k--free" aria-hidden="true" />Gancho libre</li>
          </ul>
        </div>
        {d && (
          <dl className="eq__facts">
            <div><dt>{d.members.length === 1 ? 'gerente' : 'gerentes'}</dt><dd>{d.members.length}</dd></div>
            <div><dt>en camino</dt><dd>{d.invitations.length}</dd></div>
            <div><dt>{free === 1 ? 'gancho libre' : 'ganchos libres'}</dt><dd>{free}<span>/{max}</span></dd></div>
          </dl>
        )}
      </header>

      {q.isError ? (
        <p className="eq-err" role="alert">{errorText(q.error)} <Btn size="sm" onClick={() => q.refetch()}>Reintentar</Btn></p>
      ) : (
        <div className="eq-board">
          <span className="eq-board__bar" aria-hidden="true" />
          <ul className="eq-hooks" style={{ '--n': q.isPending ? 3 : max }}>
            {q.isPending
              ? [0, 1, 2].map((i) => <li key={i} className="eq-slot is-skel" style={{ '--d': `${i * 0.08}s` }}><Hook /><div className="eq-tag" /></li>)
              : slots.map((s, i) => (
                <li key={s.id} className={`eq-slot is-${s.kind}${falling === s.id ? ' is-falling' : ''}${s.kind === 'invite' && fresh === s.i.email ? ' is-fresh' : ''}`} style={{ '--d': `${i * 0.08}s`, '--sw': `${5 + i * 0.8}s` }}>
                  <Hook />
                  {s.kind === 'member' && <MemberTag m={s.m} me={s.m.userId === user?.id} busy={remove.isPending && remove.variables === s.id} onRemove={() => remove.mutate(s.id)} />}
                  {s.kind === 'invite' && <InviteTag i={s.i} busy={cancelInv.isPending && cancelInv.variables === s.id} onCancel={() => cancelInv.mutate(s.id)} />}
                  {s.kind === 'free' && <FreeTag invite={invite} />}
                </li>
              ))}
          </ul>
        </div>
      )}
      {(remove.error || cancelInv.error) && <p className="eq-err" role="alert">{errorText(remove.error || cancelInv.error)}</p>}
      <span className="sr-only" role="status">{fresh ? `Invitación enviada a ${fresh}` : ''}</span>
    </section>
  )
}

// Clavo, gancho y argolla.
const Hook = () => (
  <svg className="eq-hook" viewBox="0 0 60 64" aria-hidden="true">
    <circle className="eq-hook__nail" cx="30" cy="8" r="5" />
    <path className="eq-hook__arm" d="M30 8v14a6 6 0 0 0 12 0" />
    <circle className="eq-hook__ring" cx="30" cy="40" r="12" />
  </svg>
)

const Key = () => (
  <svg className="eq-key-art" viewBox="0 0 40 92" aria-hidden="true">
    <circle className="eq-key-art__bow" cx="20" cy="16" r="12" />
    <circle className="eq-key-art__hole" cx="20" cy="16" r="4" />
    <path className="eq-key-art__blade" d="M17 28h6v52l-3 6-3-6zM23 58h7v5h-7M23 68h5v5h-5" />
  </svg>
)

function MemberTag({ m, me, busy, onRemove }) {
  const [ask, setAsk] = useState(false)
  return (
    <div className="eq-hang">
      <Key />
      <div className={`eq-tag${ask ? ' is-ask' : ''}`}>
        <span className="eq-tag__hole" aria-hidden="true" />
        <strong className="eq-tag__name">{m.name}{me && <span className="eq-me">Tú</span>}</strong>
        <span className="eq-tag__mail">{m.email}</span>
        <span className="eq-tag__since">desde {fmtDate(m.since)}</span>
        {!me && (ask ? (
          <div className="eq-ask" role="group" aria-label={`Quitar a ${m.name}`}>
            <span>¿Quitar?</span>
            <button type="button" className="eq-tagbtn" onClick={() => setAsk(false)} disabled={busy}>No</button>
            <button type="button" className="eq-tagbtn is-danger" onClick={onRemove} disabled={busy} aria-busy={busy || undefined}>{busy ? 'Quitando' : 'Sí, quitar'}</button>
          </div>
        ) : (
          <button type="button" className="eq-tagbtn eq-tag__act" onClick={() => setAsk(true)} aria-label={`Descolgar a ${m.name}`}>
            <Ico name="door" size={13} />Descolgar
          </button>
        ))}
      </div>
    </div>
  )
}

function InviteTag({ i, busy, onCancel }) {
  return (
    <div className="eq-hang">
      <div className="eq-tag eq-tag--inv">
        <span className="eq-tag__hole" aria-hidden="true" />
        <span className="eq-env" aria-hidden="true"><Ico name="email" size={16} /></span>
        <strong className="eq-tag__mail eq-tag__mail--strong">{i.email}</strong>
        <span className="eq-tag__since">vence {fmtDate(i.expiresAt)}</span>
        <button type="button" className="eq-tagbtn eq-tag__act" onClick={onCancel} disabled={busy} aria-busy={busy || undefined} aria-label={`Cancelar invitación a ${i.email}`}>
          <Ico name="x" size={13} />{busy ? 'Cancelando' : 'Cancelar'}
        </button>
      </div>
    </div>
  )
}

// Gancho libre: la etiqueta en blanco donde se escribe el correo del nuevo gerente.
function FreeTag({ invite }) {
  const [on, setOn] = useState(false)
  const [email, setEmail] = useState('')
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const send = (e) => {
    e.preventDefault()
    if (!ok) return
    invite.mutate(email.trim().toLowerCase(), { onSuccess: () => { setEmail(''); setOn(false) } })
  }
  if (!on) {
    return (
      <div className="eq-hang">
        <button type="button" className="eq-tag eq-tag--free" onClick={() => { invite.reset(); setOn(true) }}>
          <span className="eq-tag__hole" aria-hidden="true" />
          <span className="eq-plus" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" /></svg></span>
          <strong>Invitar gerente</strong>
        </button>
      </div>
    )
  }
  return (
    <div className="eq-hang">
      <form className="eq-tag eq-tag--writing" onSubmit={send} onKeyDown={(e) => { if (e.key === 'Escape') setOn(false) }} aria-busy={invite.isPending || undefined}>
        <span className="eq-tag__hole" aria-hidden="true" />
        <label className="eq-mailin">
          <span className="sr-only">Correo del gerente</span>
          <input type="email" autoFocus required placeholder="correo@empresa.com" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <span className="eq-tag__since">Vence en 7 días</span>
        {invite.error && <p className="eq-tag__err" role="alert">{errorText(invite.error)}</p>}
        <div className="eq-tag__row">
          <button type="button" className="eq-tagbtn" onClick={() => setOn(false)}>Cancelar</button>
          <button type="submit" className="eq-tagbtn is-primary" disabled={!ok || invite.isPending} aria-busy={invite.isPending || undefined}>
            <Ico name="send" size={13} />{invite.isPending ? 'Enviando' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  )
}
