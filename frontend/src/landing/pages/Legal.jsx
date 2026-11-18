import PageHead from '../components/PageHead'
import useMeta from './useMeta'
import { site } from '../config/site'
import Backdrop from '../components/Backdrop'
import Crops from '../../shared/Crops'
import './pages.css'

// Vista de lectura: una columna de ~66 caracteres sobre una hoja clara.
export default function Legal({ content }) {
  useMeta(content.meta)
  const { whatWeDo, data, documents } = content
  return (
    <main>
      <PageHead title={content.hero.title} lede={content.hero.lede} />
      <section className="band band--tight">
        <Backdrop variant="ceil" />
        <div className="container">
          <article className="paper">
            <Crops />
            <h2>{whatWeDo.title}</h2>
            <ul className="paper__list paper__list--not">
              {whatWeDo.isNot.map((i) => (
                <li key={i}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>{i}</li>
              ))}
            </ul>

            <h2>{data.title}</h2>
            <p>{data.body}</p>

            <h2>{documents.title}</h2>
            <ul className="paper__list">
              {documents.items.map((i) => (
                <li key={i}>{site.links.legalPortal ? <a href={site.links.legalPortal} target="_blank" rel="noreferrer">{i}</a> : i}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </main>
  )
}
