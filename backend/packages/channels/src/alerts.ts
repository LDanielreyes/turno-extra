import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  alerts, emit, managerContacts, managerTelegram, member, notificationPrefs, roles, shifts, user, type AlertType, type Tx,
} from '@turnoextra/db';
import { enqueue } from './outbox.js';
import { slotLabel } from './messages.js';

/** Un aviso es urgente si el turno empieza en menos de este tiempo. */
export const URGENT_HOURS = 3;

/** ¿El turno empieza en menos de `URGENT_HOURS`? (y todavía no empezó). */
export async function startsSoon(tx: Tx, shiftId: string): Promise<boolean> {
  const [r] = await tx
    .select({ soon: sql<boolean>`${shifts.inicio} > now() AND ${shifts.inicio} <= now() + make_interval(hours => ${URGENT_HOURS})` })
    .from(shifts)
    .where(eq(shifts.id, shiftId));
  return !!r?.soon;
}

/** Texto para correo y WhatsApp. Sin nombres ni celulares: el detalle se ve en el panel. */
async function alertText(tx: Tx, tipo: AlertType, shiftId: string | null, urgente: boolean): Promise<{ subject: string; text: string }> {
  let turno = '';
  if (shiftId) {
    const [s] = await tx
      .select({ inicio: shifts.inicio, rol: roles.nombre })
      .from(shifts)
      .innerJoin(roles, eq(roles.id, shifts.roleId))
      .where(eq(shifts.id, shiftId));
    if (s) turno = ` (${s.rol}, ${slotLabel(s.inicio)})`;
  }
  const body: Record<AlertType, string> = {
    cancelacion_asistencia: `Un candidato canceló su asistencia a un turno${turno}.`,
    baja_con_turnos: `Un candidato se dio de baja y tenía un turno confirmado${turno}.`,
    turno_vencido: `Un turno venció sin cubrirse${turno}.`,
    disputa_abierta: `Un candidato disputó una inasistencia${turno}.`,
  };
  const prefix = urgente ? 'URGENTE · ' : '';
  return { subject: `${prefix}TurnoExtra: ${tipo === 'turno_vencido' ? 'turno sin cubrir' : 'requiere tu atención'}`, text: `${prefix}${body[tipo]} Revisa los detalles en el panel de TurnoExtra.` };
}

/**
 * Crea la alerta del panel, avisa por SSE (solo el id) y encola correo, Telegram y, si es urgente, WhatsApp según las
 * preferencias de cada administrador. Todo dentro de la transacción del cambio que la origina.
 * Requiere contexto de sistema (encola en la cola de salida).
 */
export async function raiseAlert(
  tx: Tx,
  a: { orgId: string; tipo: AlertType; shiftId?: string | null; workerId?: string | null; urgente?: boolean },
): Promise<string> {
  const urgente = a.urgente ?? false;
  const [row] = await tx
    .insert(alerts)
    .values({ orgId: a.orgId, tipo: a.tipo, urgente, shiftId: a.shiftId ?? null, workerId: a.workerId ?? null })
    .returning({ id: alerts.id });
  await emit(tx, { org: a.orgId, type: 'alert.created', id: row!.id, ...(a.shiftId ? { shift: a.shiftId } : {}) });

  const recipients = await tx
    .select({
      email: user.email,
      emailPref: notificationPrefs.email,
      waPref: notificationPrefs.whatsapp,
      tgPref: notificationPrefs.telegram,
      tgChat: managerTelegram.chatId,
      celular: managerContacts.celular,
      verifiedAt: managerContacts.verifiedAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(notificationPrefs, and(eq(notificationPrefs.userId, member.userId), eq(notificationPrefs.evento, a.tipo)))
    .leftJoin(managerContacts, eq(managerContacts.userId, member.userId))
    .leftJoin(managerTelegram, eq(managerTelegram.userId, member.userId))
    .where(and(eq(member.organizationId, a.orgId), inArray(member.role, ['admin', 'owner']), or(isNull(user.banned), eq(user.banned, false))));

  const { subject, text } = await alertText(tx, a.tipo, a.shiftId ?? null, urgente);
  for (const r of recipients) {
    // Sin fila de preferencias rigen los valores por defecto: correo sí, WhatsApp no.
    if (r.emailPref ?? true) await enqueue(tx, { canal: 'email', to: r.email, msg: { text, subject }, orgId: a.orgId });
    if (urgente && (r.waPref ?? false) && r.celular && r.verifiedAt) {
      await enqueue(tx, { canal: 'whatsapp', to: r.celular, msg: { text }, orgId: a.orgId });
    }
    // Telegram no tiene costo por mensaje: llega para todo evento que la persona activó (urgente o no).
    if ((r.tgPref ?? false) && r.tgChat) await enqueue(tx, { canal: 'telegram', to: r.tgChat, msg: { text }, orgId: a.orgId });
  }
  return row!.id;
}
