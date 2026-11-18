import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import './ScrollRail.css'

// Riel de navegación junto a la barra de scroll: un punto por sección, sección activa,
// subir/bajar de sección y volver arriba.
function labelOf(el) {
  const id = el.getAttribute('aria-labelledby')
  const ref = id && document.getElementById(id)
  return (ref?.textContent || el.getAttribute('aria-label') || '').trim()
}

export default function ScrollRail() {
  const { pathname } = useLocation()
  const [items, setItems] = useState([])
  const [active, setActive] = useState(0)
  const [pct, setPct] = useState(0)

  const collect = useCallback(() => {
    const secs = [...document.querySelectorAll('main > section')]
    setItems(secs.map((el, i) => ({ el, label: labelOf(el) || `Sección ${i + 1}` })))
  }, [])

  // las vistas son lazy: se reintenta hasta que las secciones existan en el DOM
  useEffect(() => {
    let tries = 0, t = 0
    const run = () => {
      collect()
      if (!document.querySelector('main > section') && tries++ < 40) t = setTimeout(run, 60)
    }
    t = setTimeout(run, 60)
    return () => clearTimeout(t)
  }, [pathname, collect])

  // sección activa: la que cruza la línea al 40 % de la pantalla (sin leer layout en cada scroll)
  useEffect(() => {
    if (!items.length) return
    const visible = new Set()
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { e.isIntersecting ? visible.add(e.target) : visible.delete(e.target) })
      const idx = items.findIndex((it) => visible.has(it.el))
      if (idx >= 0) setActive(idx)
    }, { rootMargin: '-40% 0px -60% 0px' })
    items.forEach((it) => io.observe(it.el))
    return () => io.disconnect()
  }, [items])

  // porcentaje: alto total medido solo al cambiar el tamaño; el estado solo cambia si el número cambia
  useEffect(() => {
    let raf = 0, max = 0
    const measure = () => { max = document.documentElement.scrollHeight - innerHeight }
    const update = () => {
      raf = 0
      setPct(max > 0 ? Math.min(100, Math.round((scrollY / max) * 100)) : 0)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(update) }
    const ro = new ResizeObserver(() => { measure(); on() })
    ro.observe(document.body)
    measure(); update()
    addEventListener('scroll', on, { passive: true })
    return () => { removeEventListener('scroll', on); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  const go = (i) => {
    const it = items[Math.max(0, Math.min(items.length - 1, i))]
    it?.el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const top = () => scrollTo({ top: 0, behavior: 'smooth' })

  if (items.length < 2) return null
  return (
    <nav className="rail" aria-label="Secciones de la página" data-show={pct > 2 || active > 0 ? 'true' : 'false'}>
      <button type="button" className="rail__btn" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Sección anterior">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <ol className="rail__dots">
        {items.map((it, i) => (
          <li key={i}>
            <button type="button" className="rail__dot" aria-current={i === active ? 'true' : undefined} onClick={() => go(i)} aria-label={it.label}>
              <span className="rail__tip">{it.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="rail__btn" onClick={() => go(active + 1)} disabled={active === items.length - 1} aria-label="Sección siguiente">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button type="button" className="rail__top" onClick={top} aria-label="Volver arriba">{String(pct).padStart(2, '0')}<small>%</small></button>
    </nav>
  )
}
