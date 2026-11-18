import { useEffect } from 'react'

// Inercia "cremosa": el scroll y el cursor se suavizan (lerp) y se publican como variables CSS
// en el elemento que se pasa. Solo ese elemento las hereda, así el resto de la página no se recalcula.
//   --sy px suavizados · --sp avance 0..1 · --sv velocidad -1..1 · --px --py cursor -1..1
export default function useSmoothScroll(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const touch = window.matchMedia('(hover: none)').matches // sin cursor: no se sigue el puntero
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
    let sy = scrollY, sv = 0
    let px = 0, py = 0, tpx = 0, tpy = 0
    let raf = 0
    let max = 0
    // el alto total se mide solo cuando cambia, no en cada cuadro
    const measure = () => { max = document.documentElement.scrollHeight - innerHeight }
    measure()
    const ro = new ResizeObserver(() => { measure(); wake() })
    ro.observe(document.body)

    const tick = () => {
      raf = 0
      const prev = sy
      sy += (scrollY - sy) * 0.1
      sv += (clamp((sy - prev) / 28, -1, 1) - sv) * 0.12
      px += (tpx - px) * 0.06; py += (tpy - py) * 0.06
      const f = (n) => n.toFixed(3)
      el.style.setProperty('--sy', f(sy))
      el.style.setProperty('--sp', f(max > 0 ? clamp(sy / max, 0, 1) : 0))
      el.style.setProperty('--sv', f(sv))
      if (!touch) { el.style.setProperty('--px', f(px)); el.style.setProperty('--py', f(py)) }
      const moving = Math.abs(scrollY - sy) > 0.5 || Math.abs(sv) > 0.004 || Math.abs(tpx - px) > 0.004 || Math.abs(tpy - py) > 0.004
      if (moving) raf = requestAnimationFrame(tick)
    }
    function wake() { if (!raf) raf = requestAnimationFrame(tick) }
    const onPointer = (e) => {
      tpx = (e.clientX / innerWidth - 0.5) * 2; tpy = (e.clientY / innerHeight - 0.5) * 2
      wake()
    }
    wake()
    addEventListener('scroll', wake, { passive: true })
    addEventListener('resize', wake)
    if (!touch) addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      removeEventListener('scroll', wake); removeEventListener('resize', wake); removeEventListener('pointermove', onPointer)
      ro.disconnect(); cancelAnimationFrame(raf)
    }
  }, [ref])
}
