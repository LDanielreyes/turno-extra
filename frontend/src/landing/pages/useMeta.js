import { useEffect } from 'react'

export default function useMeta(meta) {
  useEffect(() => {
    document.title = meta?.title ?? 'TurnoExtra'
    const tag = document.querySelector('meta[name="description"]')
    if (tag && meta?.description) tag.setAttribute('content', meta.description)
  }, [meta])
}
