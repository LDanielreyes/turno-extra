import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../shared/api'
import { useSession } from '../shared/session'
import { Btn, ErrorState, FormError, Skeleton } from '../shared/ui'
import AccessFrame from './AccessFrame'

// Términos vigentes para empresas. Mientras no se acepten, el panel de empresa no opera (el backend responde 403 terms_required).
export default function Terminos() {
  const { memberships, user, loading } = useSession()
  const nav = useNavigate()
  const qc = useQueryClient()
  const orgId = memberships[0]?.orgId
  const terms = useQuery({ queryKey: ['terms', 'org'], queryFn: () => api('/terms/current?audience=org'), enabled: !!user })
  const status = useQuery({ queryKey: ['org', orgId, 'terms-status'], queryFn: () => api(`/orgs/${orgId}/terms/status`), enabled: !!orgId })
  const accept = useMutation({
    mutationFn: () => api(`/orgs/${orgId}/terms/accept`, { method: 'POST', body: { termsVersionId: terms.data.id } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['org', orgId] }); nav('/turnos', { replace: true }) },
  })

  if (loading) return <AccessFrame title="Términos"><Skeleton variant="text" /></AccessFrame>
  if (!user) return <Navigate to="/login" replace state={{ from: '/terminos' }} />
  if (!orgId) return <Navigate to="/" replace />
  if (terms.isPending || status.isPending) return <AccessFrame title="Términos para empresas"><Skeleton variant="text" /></AccessFrame>
  if (terms.isError) {
    // 404 = el super admin aún no publicó términos: no hay nada que aceptar
    if (terms.error.status === 404) return <Navigate to="/turnos" replace />
    return <AccessFrame title="Términos para empresas"><ErrorState error={terms.error} onRetry={terms.refetch} /></AccessFrame>
  }
  if (status.data?.accepted) return <Navigate to="/turnos" replace />

  return (
    <AccessFrame wide title={terms.data.titulo} lede={`Versión ${terms.data.version}. Para operar el panel debes aceptarlos.`}>
      <div className="access__terms" tabIndex={0}>{terms.data.cuerpo}</div>
      <FormError error={accept.error} />
      <div className="row">
        <Btn variant="primary" loading={accept.isPending} onClick={() => accept.mutate()}>Acepto los términos</Btn>
      </div>
    </AccessFrame>
  )
}
