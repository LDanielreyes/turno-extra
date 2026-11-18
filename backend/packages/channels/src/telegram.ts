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
      ...(msg.buttons?.length ? { reply_markup: { inline_keyboard: [msg.buttons.map((b) => ({ text: b.title, callback_data: b.id }))] } } : {}),
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

/** Telegram manda el secreto del webhook en `X-Telegram-Bot-Api-Secret-Token`; se compara en tiempo constante. */
export function verifyTelegramSecret(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type TgUpdate = {
  update_id?: number;
  message?: { chat?: { id?: number; type?: string }; text?: string };
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
    return [{ canal: 'telegram', externalId, from: String(u.message.chat.id), text: u.message.text ?? '' }];
  }
  return [];
}
