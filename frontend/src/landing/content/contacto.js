export const contacto = {
  meta: {
    title: 'Solicitar demo · TurnoExtra',
    description: 'Cuéntanos de tu negocio y te mostramos TurnoExtra con tu caso.',
  },
  hero: {
    title: 'Cuéntanos de tu negocio',
    lede: 'Te mostramos el panel y el flujo por WhatsApp con tu caso.',
  },
  // qué pasa después de enviar, en tres pasos dibujados
  next: ['Nos escribes', 'Te contactamos', 'Demo con tu caso'],
  form: {
    fields: [
      { name: 'nombre', label: 'Tu nombre', type: 'text', required: true },
      { name: 'negocio', label: 'Negocio', type: 'text', required: true },
      {
        name: 'tipo',
        label: 'Tipo de negocio',
        type: 'select',
        required: true,
        options: ['Hotel', 'Restaurante o bar', 'Eventos o banquetes', 'Otro'],
      },
      { name: 'cargo', label: 'Cargo', type: 'text', required: false },
      { name: 'celular', label: 'Celular (WhatsApp)', type: 'tel', required: true },
      { name: 'correo', label: 'Correo', type: 'email', required: true },
      { name: 'mensaje', label: '¿Qué turnos te cuesta más cubrir?', type: 'textarea', required: false },
    ],
    submit: 'Enviar solicitud',
    consent: 'Usaremos estos datos solo para responder tu solicitud.',
    success: 'Recibimos tu solicitud. Te contactamos pronto.',
    error: 'No pudimos enviar tu solicitud. Inténtalo de nuevo.',
  },
}
