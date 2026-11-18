// Íconos de trazo propios (DESIGN.md §1.1): 16 px, trazo 1.5. Genéricos, no logos de marca.
const P = {
  whatsapp: <path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7.5L4.5 14v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" />,
  telegram: <path d="M14 2.5 2 7.2l4.2 1.6L12 4.6 7.6 9.6l.1 3.9 2-2.6 2.9 2.1z" />,
  email: <><rect x="2" y="3.5" width="12" height="9" rx="1" /><path d="m2.5 4.5 5.5 4 5.5-4" /></>,
  star: <path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z" />,
  people: <><circle cx="6" cy="5.5" r="2.3" /><path d="M1.8 13.5c.4-2.4 2.1-3.7 4.2-3.7s3.8 1.3 4.2 3.7M10.6 3.4a2.2 2.2 0 1 1 .3 4.3M11.6 9.9c1.4.3 2.3 1.5 2.6 3.6" /></>,
  clock: <><circle cx="8" cy="8.5" r="5.5" /><path d="M8 5.5v3l2 1.5M6.5 1.5h3" /></>,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  x: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  qr: <><rect x="2" y="2" width="4.5" height="4.5" /><rect x="9.5" y="2" width="4.5" height="4.5" /><rect x="2" y="9.5" width="4.5" height="4.5" /><path d="M9.5 9.5h2v2M14 9.5v4.5h-2.5M9.5 13v1" /></>,
  phone: <><rect x="4.5" y="1.5" width="7" height="13" rx="1.5" /><path d="M7 12.5h2" /></>,
  key: <><circle cx="5.5" cy="8" r="3" /><path d="M8.5 8h6M12.5 8v2.5M14.5 8v2" /></>,
  doc: <><path d="M4 1.8h5.2L12 4.6v9.6H4z" /><path d="M9 1.8v3h3M6 8h4M6 10.5h4" /></>,
  download: <path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M2.5 13.5h11" />,
  mask: <><path d="M2 6.5h12M2 9.5h12" /><path d="M4.5 4v1M7 4v1M9.5 4v1M12 4v1M4.5 11v1M7 11v1M9.5 11v1M12 11v1" /></>,
  bell: <><path d="M4 11V7.3a4 4 0 0 1 8 0V11l1 1.4H3z" /><path d="M6.7 14h2.6" /></>,
  door: <><path d="M3.5 14V2h7v12M2 14h12" /><path d="M10.5 8h3.5M12.5 6.5 14 8l-1.5 1.5" /></>,
  scale: <><path d="M8 2.5v11M5 13.5h6M2.5 5h11" /><path d="M2.5 5 1.2 8.6a1.4 1.4 0 0 0 2.6 0zM13.5 5l-1.3 3.6a1.4 1.4 0 0 0 2.6 0z" /></>,
  panel: <><rect x="1.8" y="2.5" width="12.4" height="9" rx="1" /><path d="M5.5 14h5M8 11.5V14" /></>,
  trash: <><path d="M2.5 4.5h11M6 4.5V2.8h4v1.7M4 4.5l.7 9h6.6l.7-9" /></>,
  up: <path d="M8 13V3.5M4.5 7 8 3.5 11.5 7" />,
  send: <path d="M2 8h9M8 4.5 11.5 8 8 11.5M14 3v10" />,
  shield: <><path d="M8 1.8 13 4v3.8c0 3.2-2.1 5.4-5 6.5-2.9-1.1-5-3.3-5-6.5V4z" /><path d="M5.8 8.2 7.3 9.7 10.4 6.6" /></>,
}
export const CHANNEL_LABEL = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Correo' }

export function Ico({ name, size = 16, label, ...p }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className="lv-ico" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} {...p}>
      {P[name] ?? P.whatsapp}
    </svg>
  )
}

// Para usar dentro de otro <svg>: el mismo trazo en un <g> desplazado y escalado.
export function IcoG({ name, x, y, size = 16 }) {
  return <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 16})`} className="lv-ico">{P[name] ?? P.whatsapp}</g>
}
