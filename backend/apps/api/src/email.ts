import nodemailer from 'nodemailer';

export type EmailMessage = { to: string; subject: string; text: string };

/** Interfaz de correo; Gmail/Nodemailer hoy, Resend/Postmark después sin tocar al resto. */
export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

export class SmtpEmailProvider implements EmailProvider {
  private transport;
  constructor(smtpUrl: string, private from: string) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(msg: EmailMessage) {
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}

/** Desarrollo: deja el correo en el log en lugar de enviarlo. */
export class LogEmailProvider implements EmailProvider {
  constructor(private log: (o: object, m: string) => void) {}
  async send(msg: EmailMessage) {
    this.log({ to: msg.to, subject: msg.subject, text: msg.text }, 'correo (no enviado, modo log)');
  }
}

/** Guarda lo enviado, para pruebas. */
export class MemoryEmailProvider implements EmailProvider {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
  }
}
