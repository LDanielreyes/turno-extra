import { createHmac, timingSafeEqual } from 'node:crypto';
import { SendError, type Channel, type InboundEvent, type OutMessage, type SendResult } from './types.js';

export type WhatsAppConfig = { token: string; phoneId: string; apiVersion: string; fetchFn?: typeof fetch };

/** WhatsApp Cloud API. Texto libre o interactivo con botones (dentro de la ventana de 24 h). */
export class WhatsAppChannel implements Channel {
  readonly name = 'whatsapp' as const;
  constructor(private readonly cfg: WhatsAppConfig) {}

  async send(to: string, msg: OutMessage): Promise<SendResult> {
    const dest = to.replace(/\D/g, '');
    const body = msg.buttons?.length
      ? {
          messaging_product: 'whatsapp',
          to: dest,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: msg.text },
            action: {
              buttons: msg.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
            },
          },
        }
      : { messaging_product: 'whatsapp', to: dest, type: 'text', text: { body: msg.text } };

    let res: Response;
    try {
      res = await (this.cfg.fetchFn ?? fetch)(`https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.cfg.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SendError('whatsapp: sin respuesta de la API'); // red: se reintenta
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } };
      // 4xx (salvo 429) no mejora al reintentar: destinatario no permitido, ventana de 24 h vencida, token inválido…
      const retryable = res.status >= 500 || res.status === 429;
      throw new SendError(`whatsapp ${res.status} código ${detail.error?.code ?? '?'}: ${detail.error?.message ?? 'error'}`, retryable);
    }
    const ok = (await res.json()) as { messages?: { id: string }[] };
    return { externalId: ok.messages?.[0]?.id };
  }
}

/** Firma HMAC-SHA256 del cuerpo crudo, cabecera `x-hub-signature-256: sha256=<hex>`. */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type WaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } };
  button?: { payload?: string };
};
type WaPayload = { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] };

/** Extrae los mensajes de un webhook de Meta. Ignora estados de entrega; lo no soportado produce texto vacío (ayuda). */
export function parseWhatsAppWebhook(payload: unknown): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const e of (payload as WaPayload).entry ?? []) {
    for (const c of e.changes ?? []) {
      for (const m of c.value?.messages ?? []) {
        const buttonId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? m.button?.payload;
        if (m.type === 'text') out.push({ canal: 'whatsapp', externalId: m.id, from: m.from, text: m.text?.body ?? '' });
        else if (buttonId) out.push({ canal: 'whatsapp', externalId: m.id, from: m.from, buttonId });
        else out.push({ canal: 'whatsapp', externalId: m.id, from: m.from, text: '' });
      }
    }
  }
  return out;
}
