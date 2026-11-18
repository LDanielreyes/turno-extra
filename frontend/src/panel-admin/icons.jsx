// Iconos del super admin: dibujados a mano, un solo trazo de 1.5 sobre 24 px.
const I = ({ children }) => <svg className="shell__ico" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>

export const ICONS = {
  orgs: <I><path d="M4 20V7.5L10 4v16M10 20V9.5l10 3V20M2.5 20h19" /><path d="M6.5 9.5h1M6.5 13h1M6.5 16.5h1M13.5 14.5h1M16.5 14.5h1M13.5 17.5h1M16.5 17.5h1" /></I>,
  roles: <I><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14.5 10h3M14.5 13.5h3" /></I>,
  legal: <I><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17" strokeWidth="3" /><path d="M12 7.5V12l-2.5 2" /></I>,
  terms: <I><path d="M6.5 3.5h8l3.5 3.5v13.5h-11.5z" /><path d="M14.5 3.5V7H18M9 11h6M9 14h6M9 17h3.5" /></I>,
  audit: <I><path d="M3 13h4l2-5 3 10 3-8 2 3h4" /></I>,
  datos: <I><circle cx="10" cy="8" r="3.5" /><path d="M3.5 19.5a6.5 6.5 0 0 1 10-5.5M15.5 15.5l5 5M20.5 15.5l-5 5" /></I>,
  invite: <I><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6.5L20.5 7" /></I>,
  plus: <I><path d="M12 5v14M5 12h14" /></I>,
  history: <I><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4l3 2" /></I>,
  pen: <I><path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z" /><path d="M13.5 7.5l3 3" /></I>,
  shield: <I><path d="M12 3l7 3v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6z" /><path d="M9 12l2 2 4-4" /></I>,
}

// Glifo por acción de la bitácora (por prefijo de la clave).
export const actionIcon = (accion = '') => {
  if (accion.startsWith('org')) return ICONS.orgs
  if (accion.startsWith('role')) return ICONS.roles
  if (accion.startsWith('terms')) return ICONS.terms
  if (accion.startsWith('legal')) return ICONS.legal
  if (accion.includes('data') || accion.includes('worker')) return ICONS.datos
  return ICONS.history
}
