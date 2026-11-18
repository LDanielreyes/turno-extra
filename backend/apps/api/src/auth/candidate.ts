import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { workers, withSuper, type Db } from '@turnoextra/db';

/**
 * Sesión del candidato (panel `/yo`). No usa Better Auth: el candidato no tiene correo ni contraseña, entra con un
 * código de un solo uso enviado por su canal activo. La sesión es una cookie httpOnly firmada (HMAC) con la persona y
 * su vencimiento; en cada petición se vuelve a comprobar que la persona exista y no haya borrado sus datos.
 */
export const CANDIDATE_COOKIE = 'te_cand';
export const SESSION_TTL_S = 12 * 60 * 60;
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;
/** No se reenvía un código a la misma persona antes de este tiempo (evita usar el sistema para molestar a alguien). */
export const CODE_COOLDOWN_MS = 60_000;

export type Candidate = { id: string; nombre: string | null };

declare module 'fastify' {
  interface FastifyRequest {
    candidate?: Candidate;
  }
}

const b64 = (b: Buffer) => b.toString('base64url');
const sign = (payload: string, secret: string) => b64(createHmac('sha256', secret).update(`candidate:${payload}`).digest());

export const hashCode = (workerId: string, code: string) => createHash('sha256').update(`candidate:${workerId}:${code}`).digest('hex');

export function makeSessionToken(workerId: string, secret: string, now = Date.now()): string {
  const payload = `${workerId}.${Math.floor(now / 1000) + SESSION_TTL_S}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve el id de la persona si la firma y el vencimiento son válidos. */
export function readSessionToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts as [string, string, string];
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(`${id}.${exp}`, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return null;
  return id;
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export const sessionCookie = (token: string, secure: boolean) =>
  `${CANDIDATE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}${secure ? '; Secure' : ''}`;
export const clearCookie = (secure: boolean) =>
  `${CANDIDATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

export function createCandidateGuard(db: Db, secret: string, allowedOrigins: string[]) {
  /** Sesión válida de candidato; 401 si falta, venció o la persona borró sus datos. */
  const requireCandidate = async (req: FastifyRequest, reply: FastifyReply) => {
    const id = readSessionToken(cookieValue(req.headers.cookie, CANDIDATE_COOKIE), secret);
    const [w] = id ? await withSuper(db, (tx) => tx.select({ id: workers.id, nombre: workers.nombre, deletedAt: workers.deletedAt }).from(workers).where(eq(workers.id, id))) : [];
    if (!w || w.deletedAt) return reply.status(401).send({ error: 'unauthorized', message: 'Inicia sesión' });
    req.candidate = { id: w.id, nombre: w.nombre };
  };

  /** Defensa extra contra CSRF en rutas que cambian datos: si el navegador manda Origin, debe ser uno conocido. */
  const sameOrigin = async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) return reply.status(403).send({ error: 'forbidden', message: 'Origen no permitido' });
  };

  return { requireCandidate, sameOrigin };
}
