import { timingSafeEqual } from 'node:crypto';
import { SendError, type Channel, type InboundEvent, type OutMessage, type SendResult } from './types.js';

export type TelegramConfig = { token: string; fetchFn?: typeof fetch };

/** Telegram Bot API: texto con botones en línea. `to` es el chat_id que el candidato abrió él mismo con `/start CÓDIGO`. */
export class TelegramChannel implements Channel {
  readonly name = 'telegram' as const;
  constructor(private readonly cfg: TelegramConfig) {}

  async send(to: string, msg: OutMessage): Promise<SendResult> {
    const body = {
      chat_id: to,
      text: msg.text,
      ...(replyMarkup(msg) ? { reply_markup: replyMarkup(msg) } : {}),
    };
    let res: Response;
    try {
      res = await (this.cfg.fetchFn ?? fetch)(`https://api.telegram.org/bot${this.cfg.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // El mensaje de error del fetch podría incluir la URL con el token: nunca se propaga.
      throw new SendError('telegram: sin respuesta de la API');
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { description?: string };
      // 403 (el candidato bloqueó el bot) y 400 (chat inexistente) no mejoran al reintentar; 429 y 5xx sí.
      throw new SendError(`telegram ${res.status}: ${detail.description ?? 'error'}`, res.status >= 500 || res.status === 429);
    }
    const ok = (await res.json()) as { result?: { message_id?: number } };
    return { externalId: ok.result?.message_id !== undefined ? String(ok.result.message_id) : undefined };
  }
}

/** Telegram admite un solo teclado por mensaje: botones en línea, pedir contacto o quitar el teclado. */
function replyMarkup(msg: OutMessage) {
  if (msg.buttons?.length) return { inline_keyboard: [msg.buttons.map((b) => ({ text: b.title, callback_data: b.id }))] };
  if (msg.requestContact) return { keyboard: [[{ text: msg.requestContact, request_contact: true }]], resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Toca el botón de abajo' };
  if (msg.removeKeyboard) return { remove_keyboard: true };
  return undefined;
}

/** Telegram manda el secreto del webhook en `X-Telegram-Bot-Api-Secret-Token`; se compara en tiempo constante. */
export function verifyTelegramSecret(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type TgUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number };
    text?: string;
    contact?: { phone_number?: string; user_id?: number };
  };
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number; type?: string } } };
};

/** Normaliza un update de Telegram. Solo chats privados; lo demás se ignora. */
export function parseTelegramUpdate(payload: unknown): InboundEvent[] {
  const u = payload as TgUpdate;
  if (u.update_id === undefined) return [];
  const externalId = `u${u.update_id}`;
  if (u.callback_query?.data && u.callback_query.message?.chat?.type === 'private' && u.callback_query.message.chat.id !== undefined) {
    return [{ canal: 'telegram', externalId, from: String(u.callback_query.message.chat.id), buttonId: u.callback_query.data }];
  }
  if (u.message?.chat?.type === 'private' && u.message.chat.id !== undefined) {
    const c = u.message.contact;
    if (c?.phone_number) {
      // Solo cuenta como propio si el contacto es el de quien escribe (no una tarjeta reenviada de otra persona).
      const own = c.user_id !== undefined && u.message.from?.id !== undefined && c.user_id === u.message.from.id;
      return [{ canal: 'telegram', externalId, from: String(u.message.chat.id), contact: { phone: c.phone_number, own } }];
    }
    return [{ canal: 'telegram', externalId, from: String(u.message.chat.id), text: u.message.text ?? '' }];
  }
  return [];
}
