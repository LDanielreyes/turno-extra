import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../shared/api'

// Organización activa del panel (id y nombre) + consultas comunes.
export const OrgCtx = createContext(null)
export const useOrg = () => useContext(OrgCtx)

// Todas las consultas de la org cuelgan de ['org', orgId, …]: el stream SSE las invalida de una vez.
export const orgKey = (orgId, ...rest) => ['org', orgId, ...rest]

export const useRoles = () => {
  const { orgId } = useOrg()
  return useQuery({ queryKey: orgKey(orgId, 'roles'), queryFn: () => api(`/orgs/${orgId}/roles`), staleTime: 5 * 60_000 })
}

export const roleName = (roles, id) => roles?.roles?.find((r) => r.id === id)?.nombre ?? '—'
