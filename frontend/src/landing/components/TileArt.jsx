import './TileArt.css'

// Micro-interfaces del producto para el mosaico de funciones. Solo usan lo que ya dice el copy de cada función:
// sin cifras ni datos de clientes.

const Check = () => (
  <svg className="ta__ck" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" pathLength="1" /></svg>
)

// Oleadas por prioridad: favoritos primero (00:00), el resto de la banca después (03:00 por defecto).
export function ArtWaves() {
  return (
    <div className="ta ta--waves">
      <span className="ta__ring ta__ring--1" />
      <span className="ta__ring ta__ring--2" />
      <span className="ta__ring ta__ring--3" />
      <span className="ta__core" />
      <span className="ta__tag ta__tag--1 mono"><b>00:00</b> Favoritos</span>
      <span className="ta__tag ta__tag--2 mono"><b>03:00</b> Resto de la banca</span>
    </div>
  )
}

// Lista de espera: la reserva más antigua sube cuando se libera un cupo.
export function ArtQueue() {
  return (
    <div className="ta ta--rows" role="presentation">
      <p className="ta__row is-on"><span>Titular</span><Check /></p>
      <p className="ta__row"><span>Reserva 1</span><em className="mono">sube primero</em></p>
      <p className="ta__row"><span>Reserva 2</span></p>
    </div>
  )
}

// Piso legal: el formulario suma recargos y no deja publicar por debajo.
export function ArtFloor() {
  return (
    <div className="ta ta--rows" role="presentation">
      <p className="ta__row"><span>Valor hora base</span><Check /></p>
      <p className="ta__row"><span>Recargo nocturno</span><Check /></p>
      <p className="ta__row"><span>Recargo dominical</span><Check /></p>
      <p className="ta__row ta__row--sum"><span>Piso del turno</span><em className="mono">calculado</em></p>
    </div>
  )
}

// Solo personal elegible.
export function ArtEligible() {
  return (
    <div className="ta ta--rows" role="presentation">
      <p className="ta__row"><span>Carnet vigente</span><Check /></p>
      <p className="ta__row"><span>Sin turno cruzado</span><Check /></p>
      <p className="ta__row"><span>Descanso suficiente</span><Check /></p>
      <p className="ta__row"><span>Activo en tu banca</span><Check /></p>
    </div>
  )
}

// Panel en vivo: el recorrido de una oferta y los cupos.
export function ArtLive() {
  return (
    <div className="ta ta--live" role="presentation">
      <ol className="ta__flow mono">
        <li>Enviado</li><li>Entregado</li><li>Leído</li><li className="is-on">Aceptado</li>
      </ol>
      <p className="ta__slots"><span>Cupos</span><b className="mono">1/2</b></p>
      <div className="ta__bar"><i /></div>
    </div>
  )
}

// Reporte mensual: columnas del CSV.
export function ArtReport() {
  return (
    <div className="ta ta--table" role="presentation">
      <div className="ta__cols mono"><span>Trabajador</span><span>Días</span><span>Horas</span><span>Noct.</span><span>Dom.</span></div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="ta__line"><i /><i /><i /><i /><i /></div>
      ))}
    </div>
  )
}
