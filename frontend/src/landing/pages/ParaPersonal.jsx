import PageHead from '../components/PageHead'
import useMeta from './useMeta'
import Backdrop from '../components/Backdrop'
import { PhoneChat } from '../components/PageArt'
import './pages.css'

export default function ParaPersonal({ content }) {
  useMeta(content.meta)
  const { control } = content
  return (
    <main>
      <PageHead title={content.hero.title} lede={content.hero.lede} art={<PhoneChat flow="alta" />} />

      <section className="band band--light" aria-labelledby="per-steps">
        <Backdrop variant="paper" />
        <div className="container">
          <h2 id="per-steps" className="h2 h2--wide">{content.stepsTitle}</h2>
          <ol className="quad">
            {content.steps.map((s) => (
              <li key={s.n}>
                <span className="quad__n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band" aria-labelledby="per-ctl">
        <Backdrop variant="side" />
        <div className="container split">
          <div className="per__side">
            <h2 id="per-ctl" className="h2">{control.title}</h2>
            <PhoneChat flow="baja" />
          </div>
          <dl className="keys">
            {control.items.map((i) => (
              <div key={i.key} className="keys__row">
                <dt>{i.key}</dt>
                <dd>{i.text}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="container"><p className="statement">{content.note}</p></div>
      </section>
    </main>
  )
}
