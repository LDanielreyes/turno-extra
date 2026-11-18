import { useEffect, useRef } from 'react'
import Backdrop from './Backdrop'
import ProblemArt from './ProblemArt'
import './Problem.css'

// Declaración grande: las palabras se encienden al desplazarse. Es el único efecto ligado al scroll.
export default function Problem({ content }) {
  const root = useRef(null)
  const words = content.title.split(' ')

  useEffect(() => {
    const el = root.current
    const spans = [...el.querySelectorAll('.prob__w')]
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spans.forEach((s) => s.classList.add('is-on'))
      return
    }
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 cuando la sección entra por abajo, 1 cuando su centro pasa el 40 % de la pantalla
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.3)))
      const lit = Math.round(p * 1.25 * spans.length)
      spans.forEach((s, i) => s.classList.toggle('is-on', i < lit))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section ref={root} className="prob" aria-labelledby="prob-title">
      <Backdrop variant="side" />
      <div className="container prob__in">
        <h2 id="prob-title" className="prob__title">
          {words.map((w, i) => (
            <span key={i} className="prob__w">{w} </span>
          ))}
        </h2>
        <p className="sr-only">{content.body}</p>
        <ProblemArt before={content.before} after={content.after} />
      </div>
    </section>
  )
}
