// Datos del sitio. Lo que aún no está definido va en null: no se inventa.
export const site = {
  name: 'TurnoExtra',
  locale: 'es-CO',
  contact: {
    email: null, // pendiente: definir correo oficial
    whatsapp: null, // pendiente: definir número oficial
  },
  links: {
    panel: '/login', // el panel vive en esta misma app
    legalPortal: null, // pendiente: URL del portal legal ya publicado
    formEndpoint: null, // pendiente: URL que recibe el formulario de demo
  },
  nav: [
    { label: 'Cómo funciona', to: '/como-funciona' },
    { label: 'Para negocios', to: '/para-negocios' },
    { label: 'Para el personal', to: '/para-personal' },
    { label: 'Legal', to: '/legal' },
  ],
  cta: { label: 'Solicitar demo', to: '/contacto' },
}
