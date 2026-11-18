export type ChannelName = 'whatsapp' | 'telegram' | 'email' | 'simulator';

/** Mensaje de salida neutral al canal. Los botones llevan un id que vuelve en la respuesta. */
export type OutMessage = {
  text: string;
  /** Solo lo usa el correo (asunto). */
  subject?: string;
  /** Máx. 3 (límite de WhatsApp); título ≤ 20 caracteres. */
  buttons?: { id: string; title: string }[];
};

export type SendResult = { externalId?: string };

/** Un canal solo sabe enviar. Recibir llega por webhooks que producen `InboundEvent`. */
export interface Channel {
  readonly name: ChannelName;
  send(to: string, msg: OutMessage): Promise<SendResult>;
}

/** Error de envío; `retryable=false` corta los reintentos (p. ej. destinatario inválido). */
export class SendError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.retryable = retryable;
  }
}

/** Mensaje entrante ya normalizado, igual para webhook real y simulador. */
export type InboundEvent = {
  canal: ChannelName;
  /** Id del mensaje en el canal (idempotencia). */
  externalId: string;
  /** Identificador del remitente en el canal (celular para WhatsApp). */
  from: string;
  text?: string;
  buttonId?: string;
};
