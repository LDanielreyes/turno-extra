import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, auth } from '../shared/api'
import { fmtDate } from '../shared/format'
import { useSession } from '../shared/session'
import { Async, Btn, Card, Field, FormError, PageTitle } from '../shared/ui'
import { orgKey, useOrg } from './org'

// Hasta 3 gerentes (invitaciones pendientes cuentan). Invitar y quitar usan Better Auth; toda acción queda en bitácora.
export default function Equipo() {
  const { orgId } = useOrg()
  const { user } = useSession()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: orgKey(orgId, 'team'), queryFn: () => api(`/orgs/${orgId}/team`) })
  const refresh = () => qc.invalidateQueries({ queryKey: orgKey(orgId, 'team') })
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const invite = useMutation({
    mutationFn: () => auth('/organization/invite-member', { email: email.trim().toLowerCase(), role: 'admin', organizationId: orgId }),
    onSuccess: () => { setEmail(''); setSent(true); refresh() },
  })
  const remove = useMutation({
    mutationFn: (memberId) => auth('/organization/remove-member', { memberIdOrEmail: memberId, organizationId: orgId }),
    onSuccess: refresh,
  })
  const cancelInv = useMutation({ mutationFn: (invitationId) => auth('/organization/cancel-invitation', { invitationId }), onSuccess: refresh })

  return (
    <>
      <PageTitle title="Equipo" lede="Los gerentes que administran esta organización. Máximo 3." />
      <Async skeleton="table" q={q}>
        {({ members, invitations, maxAdmins }) => {
          const used = members.length + invitations.length
          return (
            <div className="grid2">
              <Card title={`Gerentes (${used}/${maxAdmins})`}>
                <ul className="plain">
                  {members.map((m) => (
                    <li key={m.id} className="row row--between">
                      <span><strong>{m.name}</strong><br /><span className="muted small">{m.email} · desde {fmtDate(m.since)}</span></span>
                      {m.userId !== user.id && <Btn size="sm" variant="ghost" loading={remove.isPending} onClick={() => remove.mutate(m.id)}>Quitar</Btn>}
                    </li>
                  ))}
                  {invitations.map((i) => (
                    <li key={i.id} className="row row--between">
                      <span>{i.email}<br /><span className="muted small">Invitación pendiente · vence {fmtDate(i.expiresAt)}</span></span>
                      <Btn size="sm" variant="ghost" onClick={() => cancelInv.mutate(i.id)}>Cancelar</Btn>
                    </li>
                  ))}
                </ul>
                <FormError error={remove.error ?? cancelInv.error} />
              </Card>
              <Card title="Invitar a un gerente">
                {used >= maxAdmins ? <p className="notice">Ya alcanzaste el máximo de {maxAdmins} gerentes. Quita a alguien o cancela una invitación.</p> : (
                  <form className="stack" onSubmit={(e) => { e.preventDefault(); setSent(false); invite.mutate() }}>
                    <Field label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    <FormError error={invite.error} />
                    {sent && <p className="notice notice--ok" role="status">Invitación enviada. Vence en 7 días.</p>}
                    <Btn type="submit" variant="primary" loading={invite.isPending}>Enviar invitación</Btn>
                  </form>
                )}
              </Card>
            </div>
          )
        }}
      </Async>
    </>
  )
}
