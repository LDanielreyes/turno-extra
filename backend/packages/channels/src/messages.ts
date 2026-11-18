import type { OutMessage } from './types.js';

/** Textos W1–W19 del documento «Mensajes WhatsApp — para revisar». Borradores a validar con el dueño y un abogado. */
/** Nombre para mostrar de un tipo de documento. */
export const docLabel = (t: string) => (t === 'cedula' ? 'cédula de ciudadanía' : t.replace(/_/g, ' '));

export const msg = {
  w1Consent: (org: string, orgId: string, policyUrl: string, via = 'WhatsApp'): OutMessage => ({
    text: `${org} quiere enviarte ofertas de turnos extra por ${via}. Para eso necesitamos tu autorización: tratamos tu nombre y tu celular, y los compartimos con ${org} solo para ofrecerte turnos. Puedes retirarla cuando quieras escribiendo BAJA. Política completa: ${policyUrl}. ¿Aceptas?`,
    buttons: [
      { id: `CONSENT_YES:${orgId}`, title: 'Acepto' },
      { id: `CONSENT_NO:${orgId}`, title: 'No acepto' },
    ],
  }),
  w2Joined: (org: string, docs: string[] = [], portalUrl?: string): OutMessage => ({
    text: `Listo, quedas en la lista de ${org}. Te avisaremos de turnos extra. Escribe BAJA cuando quieras dejar de recibirlos.${
      docs.length && portalUrl
        ? `

Último paso: para recibir ofertas debes subir tus documentos (${docs.map(docLabel).join(', ')}). Entra a ${portalUrl} con tu celular (te llega un código por aquí), ve a «Mis documentos» y sube una foto o PDF de cada uno. ${org} los revisa y, cuando estén aprobados, empiezan a llegarte ofertas.`
        : ''
    }`,
  }),
  w24InviteInvalid: (): OutMessage => ({ text: 'Ese enlace venció, ya se usó o no es válido. Pídele a tu empresa que te genere uno nuevo.' }),
  w2bAlready: (org: string): OutMessage => ({ text: `Ya estás en la lista de ${org}. Te avisaremos de turnos extra.` }),
  w2cDeclined: (org: string): OutMessage => ({
    text: `Entendido, no te enviaremos ofertas de ${org}. Si fue un error, pídele a la empresa que te invite de nuevo.`,
  }),
  w3NotFound: (org: string): OutMessage => ({
    text: `No encontramos tu número en la lista de ${org}. Pídele a la empresa que te registre.`,
  }),
  w4Help: (canal: 'whatsapp' | 'telegram' | 'email' | 'simulator' = 'whatsapp'): OutMessage => ({
    text: canal === 'telegram'
      ? 'Para unirte, abre el enlace o escanea el código QR que te dio tu empresa y toca «Iniciar». Para dejar de recibir mensajes escribe BAJA.'
      : 'Para unirte escribe ALTA y el código de tu empresa. Para dejar de recibir mensajes escribe BAJA.',
  }),
  w12Baja: (): OutMessage => ({
    text: 'Listo: no recibirás más mensajes de TurnoExtra. Para volver, pide el enlace de tu empresa y escribe ALTA.',
  }),
  w16Salir: (org: string): OutMessage => ({
    text: `Listo, saliste de la lista de ${org}. Con las demás empresas sigues igual. Para dejar todo, escribe BAJA.`,
  }),
  w16bSalirHelp: (): OutMessage => ({
    text: 'No identificamos la empresa. Escribe SALIR y el nombre de la empresa, por ejemplo: SALIR Hotel Demo.',
  }),
  w17ConfirmDelete: (): OutMessage => ({
    text: 'Vamos a borrar tu nombre, celular y autorizaciones de TurnoExtra. No se puede deshacer. ¿Confirmas?',
    buttons: [
      { id: 'DELETE_YES', title: 'Sí, borrar' },
      { id: 'DELETE_NO', title: 'Cancelar' },
    ],
  }),
  w17bDeleteCancelled: (): OutMessage => ({ text: 'Listo, no borramos nada.' }),
  w17cDeleteExpired: (): OutMessage => ({
    text: 'Esa confirmación venció. Si quieres borrar tus datos, escribe BORRAR MIS DATOS de nuevo.',
  }),
  w18Deleted: (): OutMessage => ({ text: 'Listo, tus datos fueron borrados. Gracias por haber usado TurnoExtra.' }),

  // --- H4: ofertas y asignación ------------------------------------------------------------------
  w5Offer: (o: ShiftInfo, offerId: string): OutMessage => ({
    text: `${o.org} te ofrece un turno de ${o.rol}: ${o.dia} de ${o.inicio} a ${o.fin}. Pago bruto: ${o.pago} COP.${o.notas ? ` ${o.notas}.` : ''} ${o.org} es quien te contrata y te paga. ¿Te interesa?`,
    buttons: [
      { id: `OFFER_ACCEPT:${offerId}`, title: 'Aceptar' },
      { id: `OFFER_DECLINE:${offerId}`, title: 'No puedo' },
    ],
  }),
  w6Confirmed: (nombre: string, o: ShiftInfo): OutMessage => ({
    text: `Listo, ${nombre}: tienes el turno en ${o.org}, ${o.dia} de ${o.inicio} a ${o.fin}. Si no puedes ir, escribe NO PUEDO IR.`,
  }),
  w7Standby: (o: ShiftInfo): OutMessage => ({
    text: `Quedas en lista de espera para el turno de ${o.dia}. Si se libera un cupo, te avisamos.`,
  }),
  w8Full: (): OutMessage => ({ text: 'Ese turno ya se cubrió. Gracias por responder.' }),
  w9Promoted: (o: ShiftInfo): OutMessage => ({
    text: `Se liberó un cupo: ahora tienes el turno en ${o.org}, ${o.dia} de ${o.inicio} a ${o.fin}.`,
  }),
  w10Declined: (): OutMessage => ({ text: 'Entendido, no te avisaremos más de este turno.' }),
  w11ShiftCancelled: (o: ShiftInfo): OutMessage => ({ text: `${o.org} canceló el turno de ${o.dia}. Ya no tienes que ir.` }),
  w13Unavailable: (): OutMessage => ({ text: 'Ese turno ya no está disponible.' }),
  w14Released: (): OutMessage => ({ text: 'Listo, liberamos tu cupo. Gracias por avisar.' }),
  w14bNothingToRelease: (): OutMessage => ({ text: 'No encontramos un turno tuyo próximo para liberar.' }),
  w14cChoose: (items: { assignmentId: string; title: string }[]): OutMessage => ({
    text: 'Tienes más de un turno. ¿Cuál quieres liberar?',
    buttons: items.slice(0, 3).map((i) => ({ id: `RELEASE:${i.assignmentId}`, title: i.title.slice(0, 20) })),
  }),
  w15AlreadyAnswered: (): OutMessage => ({ text: 'Ya respondiste a este turno, no hace falta que lo hagas otra vez.' }),

  // --- H6: asistencia y disputas ----------------------------------------------------------------
  w19NoShow: (o: ShiftInfo): OutMessage => ({
    text: `${o.org} registró que no asististe al turno del ${o.dia}. Si no es correcto, puedes responder aquí con tu explicación o evidencia.`,
  }),
  w19bDisputeReceived: (o: ShiftInfo): OutMessage => ({
    text: `Recibimos tu explicación sobre el turno del ${o.dia}. ${o.org} la va a revisar y te avisaremos la decisión.`,
  }),
  w19cDisputeResolved: (o: ShiftInfo, reversed: boolean): OutMessage => ({
    text: reversed
      ? `${o.org} revisó tu explicación y corrigió el registro del turno del ${o.dia}: queda como asistido.`
      : `${o.org} revisó tu explicación y mantiene el registro de inasistencia del turno del ${o.dia}.`,
  }),

  // --- H4: vinculación de canales ---------------------------------------------------------------
  w20TelegramLink: (bot: string, code: string): OutMessage => ({
    text: `Para recibir turnos también por Telegram, abre https://t.me/${bot}?start=${code} y toca «Iniciar». El enlace vale 15 minutos y solo sirve una vez.`,
  }),
  w20bTelegramOff: (): OutMessage => ({ text: 'Telegram no está disponible por ahora.' }),
  w21TelegramLinked: (): OutMessage => ({
    text: 'Listo, Telegram quedó activado. Los turnos te llegarán primero por WhatsApp; Telegram es el respaldo. Escribe BAJA cuando quieras dejar de recibirlos.',
  }),
  w21bLinkInvalid: (): OutMessage => ({
    text: 'Ese código venció o no es válido. Escribe TELEGRAM por WhatsApp para pedir uno nuevo.',
  }),
  w21cLinkTaken: (): OutMessage => ({ text: 'Ese canal ya está vinculado a otra cuenta.' }),

  // --- H8: alta directa por Telegram ------------------------------------------------------------
  w23AskContact: (org: string): OutMessage => ({
    text: `Hola. Vas a unirte a la lista de ${org} por Telegram.

Paso siguiente: toca el botón «Compartir mi celular» que aparece abajo, donde escribes los mensajes. Si no lo ves, toca el icono de cuadritos al lado del campo de texto.

Usamos tu celular solo para encontrarte en la lista donde te registró la empresa; después te pediremos que aceptes recibir ofertas.`,
    requestContact: 'Compartir mi celular',
  }),
  w23bContactNotOwn: (): OutMessage => ({
    text: 'Ese contacto no es el de tu cuenta. Toca el botón «Compartir mi celular» de abajo (no elijas un contacto de tu agenda).',
    requestContact: 'Compartir mi celular',
  }),
  w23cContactReceived: (): OutMessage => ({ text: 'Recibimos tu celular.', removeKeyboard: true }),
  w23dAltaExpired: (): OutMessage => ({
    text: 'Ese enlace venció. Vuelve a escanear el código de la empresa para unirte.',
    removeKeyboard: true,
  }),
  w23eInvalidPhone: (): OutMessage => ({
    text: 'Ese celular no es un número colombiano válido. Pídele a la empresa que te registre con tu número.',
    removeKeyboard: true,
  }),

  // --- H8: Telegram del gerente -----------------------------------------------------------------
  g1TelegramLinked: (): OutMessage => ({
    text: 'Listo, Telegram quedó vinculado a tu panel de TurnoExtra. Los avisos que actives para Telegram en Ajustes te llegarán por aquí.',
  }),
  g1bTelegramInvalid: (): OutMessage => ({
    text: 'Ese enlace venció o ya se usó. Pide uno nuevo en Ajustes, en tu panel de TurnoExtra.',
  }),
  g1cTelegramTaken: (): OutMessage => ({ text: 'Este Telegram ya está vinculado a otra cuenta del panel de TurnoExtra.' }),
  w22EmailSent: (): OutMessage => ({
    text: 'Te enviamos un correo para confirmar la dirección. Toca el enlace del correo; vale 24 horas.',
  }),
  w22bEmailInvalid: (): OutMessage => ({ text: 'Ese correo no parece válido. Escribe CORREO y tu dirección, por ejemplo: CORREO ana@ejemplo.com' }),
  w22cNeedActive: (): OutMessage => ({ text: 'Primero únete a una empresa: escribe ALTA y el código que te dio.' }),
  emailVerify: (code: string): OutMessage => ({
    text: 'Confirma tu correo para recibir ofertas de turnos extra de TurnoExtra. Si no lo pediste, ignora este mensaje.',
    buttons: [{ id: `VERIFY_EMAIL:${code}`, title: 'Confirmar correo' }],
  }),
  w23EmailLinked: (): OutMessage => ({ text: 'Listo, tu correo quedó activado como canal de respaldo.' }),
};

/** Datos del turno ya formateados (hora de Bogotá) para armar los mensajes. */
export type ShiftInfo = { org: string; rol: string; dia: string; inicio: string; fin: string; pago: string; notas?: string | null };

const TZ = 'America/Bogota';
const dayFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const hourFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const copFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const slotFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
/** Etiqueta corta para un botón (≤ 20 caracteres), p. ej. «vie 20, 18:00». */
export const slotLabel = (d: Date) => slotFmt.format(d).replace('.', '');

export function shiftInfo(s: { org: string; rol: string; inicio: Date; fin: Date; pago: string | number; notas?: string | null }): ShiftInfo {
  return {
    org: s.org, rol: s.rol, dia: dayFmt.format(s.inicio), inicio: hourFmt.format(s.inicio), fin: hourFmt.format(s.fin),
    pago: `$${copFmt.format(Number(s.pago))}`, notas: s.notas ?? null,
  };
}
