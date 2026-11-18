import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { audit, managerTelegram, type Tx } from '@turnoextra/db';
import { msg } from './messages.js';
import type { OutMessage } from './types.js';

/** Vigencia del enlace `t.me/<bot>?start=G-<código>` que vincula el Telegram del gerente. */
export const MANAGER_TG_TTL_MIN = 15;

/** Código de un solo uso para el parámetro `start` de Telegram ([A-Z0-9], 12 caracteres). */
export const newManagerTelegramCode = () => randomBytes(6).toString('hex').toUpperCase();

/** Solo se guarda el hash del código (se busca por él, así que es determinista). */
export const managerTelegramCodeHash = (code: string) => createHash('sha256').update(`tg-manager:${code.toUpperCase()}`).digest('hex');

/**
 * `/start G-<código>` desde un chat privado: vincula ese chat al gerente que pidió el código en su panel.
 * Requiere contexto de sistema. El código se consume aunque el chat ya esté tomado por otra cuenta.
 */
export async function linkManagerTelegram(
  tx: Tx,
  code: string,
  chatId: string,
  reply: (m: OutMessage) => Promise<void>,
): Promise<{ handled: string }> {
  const [m] = code
    ? await tx.select().from(managerTelegram)
      .where(and(eq(managerTelegram.codeHash, managerTelegramCodeHash(code)), gt(managerTelegram.codeExpiresAt, sql`now()`)))
    : [];
  if (!m) {
    await reply(msg.g1bTelegramInvalid());
    return { handled: 'manager_telegram_invalid' };
  }
  const [other] = await tx.select({ userId: managerTelegram.userId }).from(managerTelegram)
    .where(and(eq(managerTelegram.chatId, chatId), ne(managerTelegram.userId, m.userId)));
  if (other) {
    await tx.update(managerTelegram).set({ codeHash: null, codeExpiresAt: null }).where(eq(managerTelegram.userId, m.userId));
    await reply(msg.g1cTelegramTaken());
    return { handled: 'manager_telegram_taken' };
  }
  await tx.update(managerTelegram)
    .set({ chatId, linkedAt: sql`now()`, codeHash: null, codeExpiresAt: null })
    .where(eq(managerTelegram.userId, m.userId));
  await audit(tx, { orgId: null, actorId: m.userId, accion: 'manager.telegram_linked', entidad: 'user', entidadId: m.userId });
  await reply(msg.g1TelegramLinked());
  return { handled: 'manager_telegram_linked' };
}
