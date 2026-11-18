import './FeatureIcons.css'

// Íconos 2D animados, uno por función. Solo formas y movimiento: sin cifras ni datos.
const Svg = ({ children }) => (
  <svg className="ficon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

// Oleadas: un pulso que se expande desde el centro
export const IconWaves = () => (
  <Svg>
    <circle className="ficon__wave" cx="32" cy="32" r="8" />
    <circle className="ficon__wave ficon__wave--2" cx="32" cy="32" r="8" />
    <circle className="ficon__dot" cx="32" cy="32" r="4" />
  </Svg>
)

// Lista de espera: la primera de la fila sube y las demás avanzan
export const IconQueue = () => (
  <Svg>
    <rect className="ficon__q ficon__q--1" x="12" y="14" width="40" height="10" rx="3" />
    <rect className="ficon__q ficon__q--2" x="12" y="28" width="40" height="10" rx="3" />
    <rect className="ficon__q ficon__q--3" x="12" y="42" width="40" height="10" rx="3" />
  </Svg>
)

// Piso legal: la barra sube y se detiene en la línea
export const IconFloor = () => (
  <Svg>
    <line x1="8" y1="26" x2="56" y2="26" strokeDasharray="3 4" />
    <rect className="ficon__rise" x="22" y="26" width="20" height="26" rx="3" />
    <line x1="8" y1="52" x2="56" y2="52" />
  </Svg>
)

// Solo personal elegible: pasan unos y otros se apagan
export const IconEligible = () => (
  <Svg>
    <circle className="ficon__p" cx="14" cy="20" r="5" />
    <circle className="ficon__p ficon__p--off" cx="32" cy="20" r="5" />
    <circle className="ficon__p" cx="50" cy="20" r="5" />
    <path d="M8 34h48L38 46v8l-12-5v-3z" />
    <circle className="ficon__dot" cx="32" cy="42" r="2.5" />
  </Svg>
)

// Panel en vivo: barras que respiran y un punto en vivo
export const IconLive = () => (
  <Svg>
    <line x1="10" y1="52" x2="54" y2="52" />
    <rect className="ficon__bar ficon__bar--1" x="14" y="26" width="8" height="26" rx="2" />
    <rect className="ficon__bar ficon__bar--2" x="28" y="14" width="8" height="38" rx="2" />
    <rect className="ficon__bar ficon__bar--3" x="42" y="32" width="8" height="20" rx="2" />
    <circle className="ficon__dot ficon__dot--live" cx="52" cy="12" r="3" />
  </Svg>
)

// Reporte: las filas se dibujan y baja una flecha
export const IconReport = () => (
  <Svg>
    <rect x="14" y="8" width="36" height="48" rx="4" />
    <line className="ficon__row ficon__row--1" x1="22" y1="20" x2="42" y2="20" />
    <line className="ficon__row ficon__row--2" x1="22" y1="30" x2="42" y2="30" />
    <line className="ficon__row ficon__row--3" x1="22" y1="40" x2="34" y2="40" />
    <path className="ficon__arrow" d="M32 44v8m-4-4 4 4 4-4" />
  </Svg>
)
