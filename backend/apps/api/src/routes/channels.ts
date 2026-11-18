import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { asc, eq, or } from 'drizzle-orm';
import { demoMessages, withSuper, type Db } from '@turnoextra/db';
import {
  SimulatorChannel, dispatchOnce, handleInbound, handleLinkButton, parseTelegramUpdate, parseWhatsAppWebhook, verifyLink,
  verifyMetaSignature, verifyTelegramSecret, type Channel,
} from '@turnoextra/channels';
import { normalizeCoPhone, type Env } from '@turnoextra/shared';
import type { Guards } from '../auth/guards.js';

type ChannelEnv = Pick<
  Env,
  'WHATSAPP_APP_SECRET' | 'WHATSAPP_VERIFY_TOKEN' | 'DEMO_MODE' | 'POLICY_URL' | 'APP_URL' | 'TELEGRAM_WEBHOOK_SECRET' | 'TELEGRAM_BOT_USERNAME'
> & { BETTER_AUTH_SECRET?: string };

/** Webhook de WhatsApp (firmado) y simulador /demo (plan B). Ambos entran por `handleInbound`. */
export function channelRoutes(app: FastifyInstance, deps: { db: Db; guards: Guards; env: ChannelEnv }) {
  const { db, guards, env } = deps;
  const engine = { policyUrl: env.POLICY_URL ?? `${env.APP_URL}/legal`, telegramBot: env.TELEGRAM_BOT_USERNAME };

  // Plugin encapsulado: aquí el cuerpo llega crudo (hace falta para la firma HMAC); el resto de rutas no cambia.
  void app.register(async (wa) => {
    wa.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    // Verificación inicial que hace Meta al configurar el webhook.
    wa.get('/webhooks/whatsapp', async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      if (env.WHATSAPP_VERIFY_TOKEN && q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === env.WHATSAPP_VERIFY_TOKEN) {
        return reply.type('text/plain').send(q['hub.challenge'] ?? '');
      }
      return reply.status(403).send({ error: 'forbidden', message: 'Verificación inválida' });
    });

    wa.post('/webhooks/whatsapp', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
      // Sin secreto configurado nada se acepta: jamás se procesan mensajes sin firma válida.
      if (!env.WHATSAPP_APP_SECRET) return reply.status(503).send({ error: 'not_configured', message: 'WhatsApp no configurado' });
      const raw = req.body as Buffer;
      if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'] as string | undefined, env.WHATSAPP_APP_SECRET)) {
        return reply.status(401).send({ error: 'invalid_signature', message: 'Firma inválida' });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        return reply.status(400).send({ error: 'bad_json', message: 'Cuerpo inválido' });
      }
      // TEMPORAL (depuración): estados de entrega que manda Meta (sent/delivered/failed y su error).
      for (const e of (payload as { entry?: { changes?: { value?: { statuses?: { status?: string; errors?: { code?: number; title?: string; message?: string }[] }[] } }[] }[] }).entry ?? []) {
        for (const c of e.changes ?? []) {
          for (const s of c.value?.statuses ?? []) req.log.info({ status: s.status, errors: s.errors }, 'estado de entrega WhatsApp');
        }
      }
      for (const ev of parseWhatsAppWebhook(payload)) {
        // Si falla, responder 500 hace que Meta reintente; el procesamiento es idempotente por id de mensaje.
        const r = await handleInbound(db, engine, ev);
        req.log.info({ handled: r.handled, canal: ev.canal }, 'mensaje entrante');
      }
      return { ok: true };
    });

    // Telegram: el secreto del webhook llega en una cabecera; sin secreto configurado no se acepta nada.
    wa.post('/webhooks/telegram', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
      if (!env.TELEGRAM_WEBHOOK_SECRET) return reply.status(503).send({ error: 'not_configured', message: 'Telegram no configurado' });
      if (!verifyTelegramSecret(req.headers['x-telegram-bot-api-secret-token'] as string | undefined, env.TELEGRAM_WEBHOOK_SECRET)) {
        return reply.status(401).send({ error: 'invalid_secret', message: 'Secreto inválido' });
      }
      let payload: unknown;
      try {
        payload = JSON.parse((req.body as Buffer).toString('utf8'));
      } catch {
        return reply.status(400).send({ error: 'bad_json', message: 'Cuerpo inválido' });
      }
      for (const ev of parseTelegramUpdate(payload)) {
        const r = await handleInbound(db, engine, ev);
        req.log.info({ handled: r.handled, canal: ev.canal }, 'mensaje entrante');
      }
      return { ok: true };
    });
  });

  // Enlaces de correo (respuesta a ofertas y verificación). GET solo muestra la página; la acción es un POST,
  // así los escáneres de enlaces de los proveedores de correo no aceptan turnos por accidente.
  void app.register(async (r) => {
    r.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, _body, done) => done(null, {}));
    const secret = env.BETTER_AUTH_SECRET;
    const page = (reply: FastifyReply, status: number, body: string) =>
      reply
        .status(status)
        .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
        .header('cache-control', 'no-store')
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TurnoExtra</title>` +
            `<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5}button{font:inherit;padding:.6rem 1.2rem}</style></head><body>${body}</body></html>`,
        );
    const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const label: Record<string, string> = {
      OFFER_ACCEPT: 'Aceptar el turno',
      OFFER_DECLINE: 'No puedo ir a este turno',
      VERIFY_EMAIL: 'Confirmar mi correo',
    };
    const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

    r.get('/r/:token', limit, async (req, reply) => {
      const id = secret ? verifyLink((req.params as { token: string }).token, secret) : null;
      const kind = id?.split(':')[0] ?? '';
      if (!id || !label[kind]) return page(reply, 404, '<p>Este enlace no es válido o venció.</p>');
      return page(reply, 200, `<h1>TurnoExtra</h1><form method="post"><button type="submit">${esc(label[kind]!)}</button></form>`);
    });

    r.post('/r/:token', limit, async (req, reply) => {
      const id = secret ? verifyLink((req.params as { token: string }).token, secret) : null;
      if (!id || !label[id.split(':')[0] ?? '']) return page(reply, 404, '<p>Este enlace no es válido o venció.</p>');
      const res = await handleLinkButton(db, id);
      return page(reply, 200, `<h1>TurnoExtra</h1><p>${esc(res.text)}</p>`);
    });
  });

  // --- Simulador: solo DEMO_MODE=true y super admin ---------------------------------------
  if (env.DEMO_MODE) {
    const sim = new SimulatorChannel(db);
    const channels = new Map<string, Channel>([['simulator', sim]]);
    const opts = { preHandler: guards.requireSuperAdmin };

    app.post('/demo/inbound', opts, async (req, reply) => {
      const body = z
        .object({ celular: z.string().max(30), text: z.string().max(1000).optional(), buttonId: z.string().max(100).optional() })
        .refine((b) => b.text !== undefined || b.buttonId !== undefined)
        .parse(req.body);
      const phone = normalizeCoPhone(body.celular);
      if (!phone) return reply.status(422).send({ error: 'invalid_phone', message: 'Celular colombiano inválido' });
      const r = await handleInbound(db, engine, {
        canal: 'simulator', externalId: randomUUID(), from: phone, text: body.text, buttonId: body.buttonId,
      });
      // Mismo camino que producción; aquí se despacha al instante para que la demo responda sin esperar al worker.
      await dispatchOnce(db, channels);
      return { handled: r.handled };
    });

    app.get('/demo/messages', opts, async (req, reply) => {
      const { celular } = z.object({ celular: z.string().max(30) }).parse(req.query);
      const phone = normalizeCoPhone(celular);
      if (!phone) return reply.status(422).send({ error: 'invalid_phone', message: 'Celular colombiano inválido' });
      return withSuper(db, async (tx) => ({
        simulacion: true,
        messages: await tx.select({ id: demoMessages.id, texto: demoMessages.texto, botones: demoMessages.botones, at: demoMessages.at })
          .from(demoMessages)
          .where(or(eq(demoMessages.destinatario, phone), eq(demoMessages.destinatario, phone.replace(/\D/g, ''))))
          .orderBy(asc(demoMessages.id)),
      }));
    });
  }
}
