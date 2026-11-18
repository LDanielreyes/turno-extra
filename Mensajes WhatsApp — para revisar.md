# Mensajes de TurnoExtra — para revisar

Edita directamente el texto de la columna «Texto». Las variables van entre llaves. Horas en America/Bogota.
**Tipo:** *Libre* = texto normal, solo dentro de las 24 h desde que la persona escribió. *Plantilla* = debe aprobarla Meta (o se usa solo con el simulador mientras tanto).

Los mensajes W1–W14 vienen del documento v1 (sección 6, páginas 17–19). Los marcados **NUEVO** los agregó la v2.

| ID | Cuándo sale | Tipo | Texto |
| --- | --- | --- | --- |
| W1 | Escribe ALTA con código válido y su celular está pendiente | Libre + botones «Acepto» / «No acepto» | **NUEVO borrador** (el v1 decía «texto del portal», que no tengo): «{org} quiere enviarte ofertas de turnos extra por WhatsApp. Para eso necesitamos tu autorización: tratamos tu nombre y tu celular, y los compartimos con {org} solo para ofrecerte turnos. Puedes retirarla cuando quieras escribiendo BAJA. Política completa: {enlace_politica}. ¿Aceptas?» |
| W2 | Toca «Acepto» | Libre | Listo, quedas en la lista de {org}. Te avisaremos de turnos extra. Escribe BAJA cuando quieras dejar de recibirlos. |
| W3 | ALTA con celular que la empresa no registró | Libre | No encontramos tu número en la lista de {org}. Pídele a la empresa que te registre. |
| W4 | Texto no reconocido o código inválido | Libre | Para unirte escribe ALTA y el código de tu empresa. Para dejar de recibir mensajes escribe BAJA. |
| W5 | Oferta de turno | Plantilla (marketing) + botones «Aceptar» / «No puedo» | {org} te ofrece un turno de {rol}: {día} de {inicio} a {fin}, en {lugar}. Pago bruto: {pago} COP{incluye}. {org} es quien te contrata y te paga. ¿Te interesa? |
| W6 | Quedas confirmado | Libre o plantilla (utilidad) | Listo, {nombre}: tienes el turno en {org}, {día} de {inicio} a {fin}, en {lugar}. Si no puedes ir, escribe NO PUEDO IR. |
| W7 | Quedas en lista de espera | Libre | Quedas en lista de espera para el turno de {día}. Si se libera un cupo, te avisamos. |
| W8 | Sin cupo ni reserva | Libre o plantilla (utilidad) | Ese turno ya se cubrió. Gracias por responder. |
| W9 | Subes desde la lista de espera | Plantilla (utilidad) | Se liberó un cupo: ahora tienes el turno en {org}, {día} de {inicio} a {fin}, en {lugar}. |
| W10 | Toca «No puedo» | Libre | Entendido, no te avisaremos más de este turno. |
| W11 | La empresa cancela el turno | Plantilla (utilidad) | {org} canceló el turno de {día}. Ya no tienes que ir. |
| W12 | Escribe BAJA | Libre | Listo: no recibirás más mensajes de TurnoExtra. Para volver, pide el enlace de tu empresa y escribe ALTA. |
| W13 | Responde a una oferta de un turno vencido o cancelado | Libre | Ese turno ya no está disponible. |
| W14 | NO PUEDO IR estando confirmado | Libre | Listo, liberamos tu cupo. Gracias por avisar. |
| W15 **NUEVO** | Responde por otro canal a una oferta ya respondida | Libre | Ya respondiste a este turno, no hace falta que lo hagas otra vez. |
| W16 **NUEVO** | Escribe SALIR {empresa} | Libre | Listo, saliste de la lista de {org}. Con las demás empresas sigues igual. Para dejar todo, escribe BAJA. |
| W17 **NUEVO** | Escribe BORRAR MIS DATOS (pide confirmar) | Libre + botones «Sí, borrar» / «Cancelar» | Vamos a borrar tu nombre, celular y autorizaciones de TurnoExtra. No se puede deshacer. ¿Confirmas? |
| W18 **NUEVO** | Confirma el borrado (último mensaje antes de borrar) | Libre | Listo, tus datos fueron borrados. Gracias por haber usado TurnoExtra. |
| W19 **NUEVO** | La empresa marca no asistió | Libre | {org} registró que no asististe al turno del {día}. Si no es correcto, puedes responder aquí con tu explicación o evidencia. |

## Cosas a decidir al revisar
- Tono: tuteo, directo. ¿Quieres usar «usted» con alguna empresa o sector?
- Si el pago y el nombre de la empresa deben ir siempre en el primer mensaje (W5 los lleva por transparencia).
- Si W6 y W8 se mandan como plantilla o como texto libre (libre es gratis dentro de la ventana de 24 h, pero la plantilla garantiza entrega fuera de ella).
- Revisión jurídica del texto de W1 (consentimiento) y W17–W18 (borrado).
