import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2,
      refetchOnWindowFocus: true,
    },
  },
})
