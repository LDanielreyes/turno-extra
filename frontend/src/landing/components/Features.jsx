import { Link } from 'react-router-dom'
import Backdrop from './Backdrop'
import Crops from '../../shared/Crops'
import './Features.css'
import { ArtWaves, ArtQueue, ArtFloor, ArtEligible, ArtLive, ArtReport } from './TileArt'

// Cada función se muestra con su micro-interfaz (TileArt), no con un icono suelto.
const icons = [ArtWaves, ArtQueue, ArtFloor, ArtEligible, ArtLive, ArtReport]
// Mosaico de tamaños distintos (cols de 6): lo importante ocupa más.
const spans = ['a', 'b', 'c', 'd', 'e', 'f']

function Tile({ item, index }) {
  const Icon = icons[index]
  return (
    <li className={`tile tile--${spans[index]}`}>
      <div className="tile__art"><Icon /></div>
      <div className="tile__copy">
        <h3 className="tile__title">{item.title}</h3>
        <p className="tile__body">{item.body}</p>
      </div>
    </li>
  )
}

export default function Features({ content }) {
  return (
    <section className="feat" aria-labelledby="feat-title">
      <Backdrop variant="ceil" />
      <div className="container">
        <header className="feat__head">
          <h2 id="feat-title" className="feat__title">{content.title}</h2>
          <div className="feat__side">
            <Link to="/como-funciona" className="btn btn--ghost">{content.cta}</Link>
          </div>
        </header>

        <div className="feat__plate plate">
          <Crops />
          <ul className="feat__grid">
            {content.items.map((item, i) => <Tile key={item.title} item={item} index={i} />)}
          </ul>
        </div>
      </div>
    </section>
  )
}
