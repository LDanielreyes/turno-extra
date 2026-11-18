// Marcas de corte de la placa de instrumento (DESIGN.md §1.1). El padre necesita la clase .plate o position: relative.
export default function Crops() {
  return (
    <>
      <i className="crop crop--tl" aria-hidden="true" />
      <i className="crop crop--tr" aria-hidden="true" />
      <i className="crop crop--bl" aria-hidden="true" />
      <i className="crop crop--br" aria-hidden="true" />
    </>
  )
}
