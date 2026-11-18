import { Link } from 'react-router-dom'
import Backdrop from './Backdrop'
import { Isotype } from './Logo'
import './PageHead.css'

// Encabezado de las vistas interiores: fondo de haz suave, título grande y, a la derecha,
// el isotipo en grande como marca de agua dibujada. Sin etiqueta previa: el título dice dónde estás.
export default function PageHead({ title, lede, cta, art, children }) {
  return (
    <header className={`phead${art ? ' phead--art' : ''}`}>
      <Backdrop variant="soft" />
      {art ? <div className="phead__art" aria-hidden="true">{art}</div> : <Isotype size={420} decorative className="phead__iso" />}
      <div className="container phead__in">
        <h1 className="phead__title">{Array.isArray(title) ? title.join(' ') : title}</h1>
        {lede && <p className="phead__lede">{lede}</p>}
        {cta && <Link to={cta.to} className="btn btn--primary btn--lg">{cta.label}</Link>}
        {children}
      </div>
    </header>
  )
}
