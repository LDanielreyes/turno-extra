import { createContext, useContext, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, auth } from './api'

const Ctx = createContext(null)

// /me → { user, memberships }. 401 = sin sesión (no es un error de la app).
export function SessionProvider({ children }) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      // Gerente / super admin: sesión de Better Auth. Sin ella, se prueba la del candidato (cookie propia).
      try { return await api('/me') } catch (e) { if (e.status !== 401) throw e }
      try {
        const c = await api('/yo/sesion')
        return { user: { id: c.id, name: c.nombre ?? 'Mi espacio', email: '', role: 'candidato', candidate: true }, memberships: [] }
      } catch (e) { if (e.status === 401) return null; throw e }
    },
    staleTime: 60_000,
  })
  const value = useMemo(() => {
    const me = q.data ?? null
    return {
      loading: q.isPending,
      error: q.error,
      user: me?.user ?? null,
      memberships: me?.memberships ?? [],
      isSuper: me?.user?.role === 'super_admin',
      refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
      // Cierra ambas sesiones (gerente y candidato) y recarga en /login: así no queda ningún dato en memoria.
      // (qc.clear() desconectaba al observador de /me y la pantalla se quedaba sin reaccionar.)
      logout: async () => {
        await Promise.all([
          auth('/sign-out', {}).catch(() => {}),
          api('/candidato/salir', { method: 'POST', body: {} }).catch(() => {}),
        ])
        window.location.replace('/login')
      },
    }
  }, [q.data, q.isPending, q.error, qc])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)

// Dónde aterriza cada rol tras entrar.
export function homeFor(s) {
  if (s.isSuper) return '/admin/orgs'
  if (s.memberships.length) return '/turnos'
  if (s.user?.candidate) return '/yo'
  return '/'
}
