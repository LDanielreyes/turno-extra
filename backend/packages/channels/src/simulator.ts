import { sql } from 'drizzle-orm';
import { demoMessages, type Db } from '@turnoextra/db';
import type { Channel, OutMessage, SendResult } from './types.js';

/** Plan B: en vez de enviar, deja el mensaje en la bandeja del simulador (rotulada como simulación en la UI). */
export class SimulatorChannel implements Channel {
  readonly name = 'simulator' as const;
  constructor(private readonly db: Db) {}

  async send(to: string, msg: OutMessage): Promise<SendResult> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.is_super', 'on', true)`);
      await tx.insert(demoMessages).values({ destinatario: to, texto: msg.text, botones: msg.buttons ?? null });
    });
    return {};
  }
}
