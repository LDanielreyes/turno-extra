import { useEffect } from 'react'

// Entrada al hacer scroll: lo que queda bajo el primer pantallazo aparece al acercarse.
// Solo titulares: el resto de la página ya se mueve con sus propios dibujos.
// Lo que ya está a la vista nunca se oculta (sin parpadeo) y con movimiento reducido no se toca nada.
const SEL = [
  '.aud__title', '.steps__title', '.feat__head', '.tr__title', '.cta__title',
  '.band .h2', '.band .prose', '.flow__row', '.ledger__item', '.quad li', '.keys__row',
  '.ruled li', '.sheet', '.ticks li', '.statement', '.paper', '.foot__sign',
].join(',')

export default function useReveal(key) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const vh = window.innerHeight
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target) }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    )
    // una sola pasada de lecturas, luego las escrituras: sin layout forzado repetido
    const all = [...document.querySelectorAll(SEL)]
    const below = all.filter((el) => el.getBoundingClientRect().top > vh * 0.92)
    const count = new Map() // posición entre hermanos que también entran, O(n)
    const els = below.map((el) => {
      const p = el.parentElement
      const i = count.get(p) ?? 0
      count.set(p, i + 1)
      return [el, i]
    })
    els.forEach(([el, i]) => {
      el.style.setProperty('--rv-d', `${Math.min(i, 5) * 90}ms`)
      el.classList.add('rv')
      io.observe(el)
    })
    return () => {
      io.disconnect()
      els.forEach(([el]) => { el.classList.remove('rv', 'rv-in'); el.style.removeProperty('--rv-d') })
    }
  }, [key])
}
