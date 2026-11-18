import PageHead from '../components/PageHead'
import CtaBand from '../components/CtaBand'
import useMeta from './useMeta'
import Backdrop from '../components/Backdrop'
import { SceneBoth } from '../components/PageArt'
import './pages.css'

// Una sola secuencia de seis pasos: aquí el orden sí informa, por eso van numerados.
export default function ComoFunciona({ content }) {
  useMeta(content.meta)
  return (
    <main>
      <PageHead title={content.hero.title} lede={content.hero.lede} art={<SceneBoth />} />
      <section className="band" aria-label={content.stepsLabel}>
        <Backdrop variant="side" />
        <div className="container">
          <ol className="flow">
            {content.steps.map((s) => (
              <li key={s.n} className="flow__row">
                <span className="flow__n">{s.n}</span>
                <h2 className="flow__title">{s.title}</h2>
                <p className="flow__body">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <CtaBand title={content.cta.title} cta={content.cta.cta} />
    </main>
  )
}
