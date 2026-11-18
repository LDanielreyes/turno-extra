// Iconos de la navegación del panel de empresa: mismo trazo de 1.5 sobre 24 px que el super admin.
const I = ({ children }) => <svg className="shell__ico" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>

export const NAV_ICONS = {
  turnos: <I><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></I>,
  banca: <I><circle cx="8.5" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.4" /><path d="M3 19a5.5 5.5 0 0 1 11 0M14.5 15.2a4.4 4.4 0 0 1 6.5 3.8" /></I>,
  alertas: <I><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5h4" /></I>,
  disputas: <I><path d="M12 4v16M6 20h12M4 8h16" /><path d="M4 8l-2 5a2.2 2.2 0 0 0 4 0zM20 8l-2 5a2.2 2.2 0 0 0 4 0z" /></I>,
  reportes: <I><path d="M4 20h16" /><path d="M7 16v-5M12 16V7M17 16v-8" /></I>,
  equipo: <I><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /><path d="M4 11.5h2M18 11.5h2" /></I>,
  ajustes: <I><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></I>,
  yo: <I><circle cx="12" cy="9" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></I>,
}
