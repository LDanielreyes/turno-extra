import PageHead from '../components/PageHead'
import CtaBand from '../components/CtaBand'
import useMeta from './useMeta'
import Backdrop from '../components/Backdrop'
import { ScenePanel } from '../components/PageArt'
import './pages.css'

export default function ParaNegocios({ content }) {
  useMeta(content.meta)
  const { audience, benefits, panel } = content
  return (
    <main>
      <PageHead title={content.hero.title} lede={content.hero.lede} cta={content.hero.cta} art={<ScenePanel />} />

      <section className="band band--light" aria-labelledby="neg-aud">
        <Backdrop variant="paper" />
        <div className="container split">
          <div>
            <h2 id="neg-aud" className="h2">{audience.title}</h2>
            <p className="prose">{audience.body}</p>
          </div>
          <div>
            <ul className="ruled">
              {audience.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
            <p className="small">{audience.note}</p>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="neg-ben">
        <Backdrop variant="ceil" />
        <div className="container">
          <h2 id="neg-ben" className="h2 h2--wide">{content.benefitsTitle}</h2>
          <dl className="ledger">
            {benefits.map((b) => (
              <div key={b.title} className="ledger__item">
                <dt>{b.title}</dt>
                <dd>{b.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="band band--tight" aria-labelledby="neg-panel">
        <Backdrop variant="rings" className="bd--trust" />
        <div className="container">
          <div className="sheet split">
            <h2 id="neg-panel" className="h2">{panel.title}</h2>
            <ul className="ticks">
              {panel.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
          <p className="statement">{content.disclaimer}</p>
        </div>
      </section>

      <CtaBand title="¿Quieres verlo con tu negocio?" cta={content.hero.cta} />
    </main>
  )
}
