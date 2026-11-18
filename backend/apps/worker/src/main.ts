import nodemailer from 'nodemailer';
import pino from 'pino';
import { loadEnv } from '@turnoextra/shared';
import { createDb } from '@turnoextra/db';
import {
  EmailChannel, SimulatorChannel, TelegramChannel, WhatsAppChannel, dispatchOnce, handleInbound, parseTelegramUpdate, tick, type Channel,
} from '@turnoextra/channels';

// Proceso aparte: motor de turnos (oleadas, relanzamientos, escalada) y vaciado de la cola `outbox`
// (FOR UPDATE SKIP LOCKED: varios workers no se pisan).
const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const { db, close } = createDb(env.DATABASE_URL);
const scrub = (s: string) => s.replace(/\+?\d[\d\s-]{6,}\d/g, '***');

const channels = new Map<string, Channel>();
if (env.WHATSAPP_ENABLED && env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID) {
  channels.set('whatsapp', new WhatsAppChannel({ token: env.WHATSAPP_TOKEN, phoneId: env.WHATSAPP_PHONE_ID, apiVersion: env.WHATSAPP_API_VERSION }));
}
if (env.TELEGRAM_BOT_TOKEN) channels.set('telegram', new TelegramChannel({ token: env.TELEGRAM_BOT_TOKEN }));
if (env.SMTP_URL) {
  const transport = nodemailer.createTransport(env.SMTP_URL);
  channels.set('email', new EmailChannel({
    send: (m) => transport.sendMail({ from: env.EMAIL_FROM, ...m }).then(() => undefined),
    baseUrl: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
  }));
}
if (env.DEMO_MODE) {
  const sim = new SimulatorChannel(db);
  channels.set('simulator', sim);
  // Plan B: sin WhatsApp real, los mensajes que irían por WhatsApp caen en la bandeja del simulador (rotulada como simulación).
  if (!channels.has('whatsapp')) channels.set('whatsapp', sim);
}

let running = true;
const stop = () => {
  running = false;
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (!env.WHATSAPP_ENABLED) log.warn('WhatsApp apagado (WHATSAPP_ENABLED=false): las ofertas salen por Telegram o correo');
log.info({ canales: [...channels.keys()] }, 'worker iniciado');
if (!channels.size) log.warn('sin canales configurados: los mensajes quedan en cola');

// Telegram sin URL pública: getUpdates en vez de webhook. Entra por el mismo `handleInbound` que el webhook.
async function pollTelegram(token: string) {
  const api = (method: string, body: object) =>
    fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40_000),
    }).then((r) => r.json() as Promise<{ ok: boolean; result?: { update_id: number; callback_query?: { id: string } }[]; description?: string }>);
  const engine = { policyUrl: env.POLICY_URL ?? `${env.APP_URL}/legal`, telegramBot: env.TELEGRAM_BOT_USERNAME };
  await api('deleteWebhook', {}).catch(() => undefined);
  log.info('telegram: leyendo mensajes por sondeo (TELEGRAM_POLLING=true)');
  let offset = 0;
  while (running) {
    try {
      const r = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      if (!r.ok) throw new Error(r.description ?? 'getUpdates falló');
      for (const u of r.result ?? []) {
        offset = u.update_id + 1;
        for (const ev of parseTelegramUpdate(u)) {
          const h = await handleInbound(db, engine, ev);
          log.info({ handled: h.handled, canal: ev.canal }, 'mensaje entrante');
        }
        if (u.callback_query) await api('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => undefined);
      }
    } catch (err) {
      // Nunca se registra la URL (lleva el token).
      log.warn({ err: { message: err instanceof Error ? scrub(err.message).replace(token, '***') : 'error' } }, 'telegram: fallo al sondear');
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}
if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_POLLING) void pollTelegram(env.TELEGRAM_BOT_TOKEN);

while (running) {
  try {
    const t = await tick(db);
    if (t.expired || t.waves || t.relaunches || t.escalated) log.info(t, 'motor de turnos');
    const r = await dispatchOnce(db, channels);
    if (r.claimed) log.info(r, 'outbox procesado');
    // Con trabajo pendiente vuelve enseguida; sin él, espera un segundo.
    if (r.claimed === 0) await new Promise((res) => setTimeout(res, 1000));
  } catch (err) {
    log.error({ err: { message: err instanceof Error ? scrub(err.message) : 'error' } }, 'fallo en el ciclo del worker');
    await new Promise((res) => setTimeout(res, 5000));
  }
}
await close();
log.info('worker detenido');
