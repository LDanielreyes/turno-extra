import './Audience.css'

// Dibujos de línea de cada tipo de negocio (24×24, trazo 1.5, un solo peso).
const Hotel = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M8 42V10h20v32M28 20h12v22M4 42h40" />
    <path className="aud__lit" d="M14 16h4M14 24h4M14 32h4" />
    <path d="M33 27h2M33 34h2" />
  </svg>
)
const Bar = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M10 10h28L24 26zM24 26v14M16 40h16" />
    <path className="aud__lit" d="M15 15h18" />
    <circle cx="35" cy="9" r="3" />
  </svg>
)
const Event = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 6v8M14 14h20l4 8H10zM12 22v20M36 22v20M8 30h32" />
    <path className="aud__lit" d="M18 18h12" />
  </svg>
)
const Clock = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="16" />
    <path className="aud__hand" d="M24 14v10l7 4" />
  </svg>
)
const icons = [Hotel, Bar, Event, Clock]

// Franja que avanza sola: para qué negocios sirve. Se detiene al pasar el cursor o con reduced-motion.
export default function Audience({ content }) {
  const list = (hidden) => (
    <ul className="aud__list" aria-hidden={hidden || undefined}>
      {content.items.map((item, i) => {
        const Icon = icons[i] || Clock
        return (
          <li key={item}>
            <Icon />
            <span>{item}</span>
          </li>
        )
      })}
    </ul>
  )

  return (
    <section className="aud" aria-labelledby="aud-title">
      <div className="container">
        <h2 id="aud-title" className="aud__title">{content.title}</h2>
      </div>
      <div className="aud__marquee">
        <div className="aud__track">
          {list(false)}
          {list(true)}
          {list(true)}
        </div>
      </div>
    </section>
  )
}
