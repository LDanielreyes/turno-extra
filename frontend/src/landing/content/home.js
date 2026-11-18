// Copy de la landing (/). Fuente: brand book v1.1 y documento de diseño del MVP.
// Solo describe lo que el producto hace según el documento. Sin cifras, clientes ni testimonios.
export const home = {
  meta: {
    title: 'TurnoExtra · Cubre turnos extra con tu propia banca de personal',
    description:
      'Publica el turno en el panel y la oferta llega por WhatsApp al personal que tu negocio ya conoce. El primero que acepta ocupa el cupo.',
  },

  hero: {
    title: ['El cupo vacío,', 'cubierto en', 'minutos.'], // la última línea va en acento
    lede: 'Publica el turno. La oferta llega por WhatsApp a tu banca de personal y el primero que acepta lo ocupa.',
    primaryCta: { label: 'Solicitar demo', to: '/contacto' },
    secondaryCta: { label: 'Ver cómo funciona', to: '/como-funciona' },
    cardTitle: 'Míralo con tu caso',
    // Sectores con picos de demanda; el producto no se limita a uno.
    sectors: ['Hotel', 'Restaurante', 'Eventos', 'Catering', 'Bar', 'Retail'],
    order: { title: 'Cubre tu próximo turno', sub: 'WhatsApp · sin instalar nada' },
    // Estados reales del flujo de una oferta (documento de diseño, sección 6).
    chips: ['Oferta enviada', 'Aceptado', 'Cupo cubierto'],
    // Datos del producto, no métricas de clientes.
    facts: [
      { value: 'WhatsApp', label: 'el personal no instala nada' },
      { value: 'En vivo', label: 'cupos y respuestas en el panel' },
      { value: 'Tu banca', label: 'solo personas que tu negocio registra' },
    ],
  },

  // Secciones 2 a 5: provisionales hasta recibir el wireframe.
  sections: {
    audience: {
      title: 'Para cualquier negocio con turnos',
      items: ['Hoteles', 'Restaurantes y bares', 'Eventos y banquetes', 'Cualquier negocio con turnos que cubrir'],
    },
    problem: {
      title: 'Cubrir un turno a último minuto no debería ser una cadena de llamadas',
      body:
        'TurnoExtra convierte el cupo vacío en una oferta que sale a toda tu banca a la vez y se cierra sola cuando se llenan los cupos.',
      // comparación dibujada: la cadena de llamadas frente al aviso simultáneo
      before: { label: 'Hoy', caption: 'Llamada por llamada' },
      after: { label: 'Con TurnoExtra', caption: 'A toda tu banca a la vez' },
    },
    steps: {
      title: 'De publicar a turno cubierto, en tres pasos',
      // Tarjeta trasera detrás del paso 2: las oleadas (documento de diseño, sección 6).
      peek: 'Si nadie acepta a tiempo, pasa al resto de tu banca.',
      items: [
        { n: '01', title: 'Publicas el turno', body: 'Rol, horario, cupos, pago y lugar.' },
        { n: '02', title: 'Llega por WhatsApp', body: 'Primero a tus favoritos; luego, al resto.' },
        { n: '03', title: 'El primero que acepta, lo ocupa', body: 'Un cupo, una persona. Lo ves en vivo.' },
      ],
    },
    features: {
      title: 'Seis cosas que el panel resuelve por ti',
      cta: 'Ver cómo funciona',
      controls: { prev: 'Anterior', next: 'Siguiente', pause: 'Pausar carrusel', play: 'Reanudar carrusel' },
      // body corto; la micro-interfaz de cada función muestra el resto
      items: [
        { title: 'Rondas por prioridad', body: 'Primero tus favoritos; a los 3 min, el resto.' },
        { title: 'Lista de espera', body: 'Si alguien cancela, sube la reserva más antigua.' },
        { title: 'Piso legal calculado', body: 'Con recargos; no deja publicar por debajo.' },
        { title: 'Solo personal elegible', body: 'Fuera carnet vencido, cruces, poco descanso y bajas.' },
        { title: 'Panel en vivo', body: 'Enviado, leído, aceptado y cupos, al instante.' },
        { title: 'Reporte para tu PILA', body: 'Un CSV por persona: días, horas, recargos.' },
      ],
    },
    trust: {
      title: 'Tú contratas y pagas',
      // reparto de papeles dibujado: qué hace cada parte y qué no hace TurnoExtra
      roles: [
        { who: 'TurnoExtra', does: 'Conecta la oferta con tu banca' },
        { who: 'Tu negocio', does: 'Contrata y paga' },
      ],
      nots: ['No recluta', 'No paga', 'Sin comisión por turno', 'No es empleador'],
      body:
        'TurnoExtra es el software que conecta la oferta con tu banca. No recluta, no paga, no cobra comisión por turno y no es empleador: tu negocio contrata y paga. El pago bruto se muestra a la persona en la oferta.',
      points: [
        { key: 'ALTA', text: 'Entra a tu banca solo si escribe ALTA y acepta el uso de sus datos.' },
        { key: 'BAJA', text: 'Sale cuando quiera escribiendo BAJA.' },
        { key: 'LOG', text: 'Cada oferta, aceptación y cancelación queda registrada.' },
      ],
    },
    // Hoja de ruta honesta (DESIGN.md §8): lo que ya funciona en el piloto y lo que viene después.
    roadmap: {
      title: 'Qué hay hoy y qué viene',
      now: {
        label: 'En este piloto',
        items: ['Publicar turnos', 'Oferta por WhatsApp', 'Panel en vivo', 'Rondas y lista de espera', 'Piso legal', 'Reporte para PILA'],
      },
      next: {
        label: 'Próximamente',
        items: ['Portal de vacantes', 'Subida de documentos', 'Ranking de personal', 'Pagos'],
      },
      // Tablero de impacto: solo mediciones reales del piloto; mientras no haya, se dice.
      impact: {
        label: 'Tablero de impacto',
        empty: 'sin datos aún',
        metrics: ['Tiempo hasta cubrir', 'Turnos cubiertos', 'Respuesta por WhatsApp'],
      },
    },
  },

  finalCta: {
    title: 'Mira cómo se cubre un turno, de punta a punta',
    body: 'Te mostramos el panel y el flujo por WhatsApp con tu caso.',
    cta: { label: 'Solicitar demo', to: '/contacto' },
    note: 'Sin instalar nada',
  },
}
