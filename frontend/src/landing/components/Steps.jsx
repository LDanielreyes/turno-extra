import Backdrop from './Backdrop'
import './Steps.css'
import { ArtPublish, ArtOffer, ArtAccept } from './StepArt'

// Tres pasos sobre papel hueso. Aquí el orden sí informa, por eso cada paso lleva su número.
// Cada fila alterna el lado del dibujo para dar ritmo; el dibujo vive en una ventana oscura.
const arts = [ArtPublish, ArtOffer, ArtAccept]

export default function Steps({ content }) {
  return (
    <section className="steps" aria-labelledby="steps-title">
      <Backdrop variant="paper" />
      <div className="container">
        <h2 id="steps-title" className="steps__title">{content.title}</h2>

        <ol className="steps__list">
          {content.items.map((item, i) => {
            const Art = arts[i]
            return (
              <li key={item.n} className="step">
                <div className="step__text">
                  <span className="step__n" aria-hidden="true">{item.n}</span>
                  <h3 className="step__title">{item.title}</h3>
                  <p className="step__body">{item.body}</p>
                  {i === 1 && <p className="step__note">{content.peek}</p>}
                </div>
                <div className="step__window" aria-hidden="true">
                  <Art />
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
