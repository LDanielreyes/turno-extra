import { createHmac, timingSafeEqual } from 'node:crypto';
import { SendError, type Channel, type OutMessage, type SendResult } from './types.js';

export type EmailSender = (m: { to: string; subject: string; text: string }) => Promise<void>;
export type EmailChannelConfig = { send: EmailSender; /** URL pública de la API (base de los enlaces). */ baseUrl: string; secret: string };

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url');

/** Enlace firmado que lleva un id de botón y vence solo. El correo no tiene botones: cada uno se vuelve un enlace. */
export function signLink(buttonId: string, secret: string, ttlMs: number, now = Date.now()): string {
  const payload = b64(`${now + ttlMs}.${buttonId}`);
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve el id de botón si la firma es válida y no venció; `null` en cualquier otro caso. */
export function verifyLink(token: string, secret: string, now = Date.now()): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const decoded = Buffer.from(payload, 'base64url').toString();
  const dot = decoded.indexOf('.');
  if (dot < 1 || Number(decoded.slice(0, dot)) < now) return null;
  return decoded.slice(dot + 1);
}

const DAY = 86_400_000;

/** Correo como canal de respaldo. Las respuestas llegan por enlaces firmados a `/r/:token` (página con botón, POST). */
export class EmailChannel implements Channel {
  readonly name = 'email' as const;
  constructor(private readonly cfg: EmailChannelConfig) {}

  async send(to: string, msg: OutMessage): Promise<SendResult> {
    const links = (msg.buttons ?? []).map((b) => {
      const ttl = b.id.startsWith('VERIFY_EMAIL') ? DAY : 7 * DAY;
      return `${b.title}: ${this.cfg.baseUrl}/r/${signLink(b.id, this.cfg.secret, ttl)}`;
    });
    const first = msg.buttons?.[0]?.id ?? '';
    const subject =
      msg.subject ??
      (first.startsWith('OFFER_') ? 'Oferta de turno extra' : first.startsWith('VERIFY_EMAIL') ? 'Confirma tu correo en TurnoExtra' : 'TurnoExtra');
    try {
      await this.cfg.send({ to, subject, text: [msg.text, ...links].join('\n\n') });
    } catch {
      throw new SendError('email: no se pudo enviar'); // sin detalle: podría incluir la dirección
    }
    return {};
  }
}
