import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth.js';

/** Monta Better Auth en /api/auth/* convirtiendo la petición de Fastify a Request web. */
export function mountAuth(app: FastifyInstance, auth: Auth) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (req, reply) => {
      const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
      const hasBody = req.method !== 'GET' && req.body !== undefined && req.body !== null;
      const res = await auth.handler(
        new Request(url, {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
          body: hasBody ? JSON.stringify(req.body) : undefined,
        }),
      );
      reply.status(res.status);
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(res.body ? await res.text() : null);
    },
  });
}
