import { EVENTS_CHANNEL, type DomainEvent, type Listen } from '@turnoextra/db';

export type Subscriber = {
  /** Escribe un evento ya serializado; devuelve false si el cliente no da abasto (se le corta). */
  push: (ev: DomainEvent) => boolean;
  /** Solo recibe eventos de este turno (los eventos sin turno no le llegan). */
  shiftId?: string;
};

/** Máximo de conexiones SSE abiertas por organización (un panel suele abrir 1–3). */
export const MAX_STREAMS_PER_ORG = 30;

/**
 * Un solo LISTEN por proceso que reparte cada NOTIFY a los suscriptores de esa org.
 * Un suscriptor nunca recibe eventos de otra org: el reparto es por `org`.
 */
export async function createRealtime(listen: Listen) {
  const subs = new Map<string, Set<Subscriber>>();

  const unlisten = await listen(EVENTS_CHANNEL, (payload) => {
    let ev: DomainEvent;
    try {
      ev = JSON.parse(payload) as DomainEvent;
    } catch {
      return;
    }
    const set = subs.get(ev.org);
    if (!set) return;
    for (const s of set) {
      if (s.shiftId && ev.shift !== s.shiftId) continue;
      if (!s.push(ev)) set.delete(s);
    }
  });

  return {
    /** Registra un suscriptor; devuelve cómo darlo de baja, o `null` si la org llegó a su tope. */
    subscribe(orgId: string, sub: Subscriber): (() => void) | null {
      let set = subs.get(orgId);
      if (!set) subs.set(orgId, (set = new Set()));
      if (set.size >= MAX_STREAMS_PER_ORG) return null;
      set.add(sub);
      return () => {
        set.delete(sub);
        if (!set.size) subs.delete(orgId);
      };
    },
    count: (orgId: string) => subs.get(orgId)?.size ?? 0,
    close: () => unlisten(),
  };
}

export type Realtime = Awaited<ReturnType<typeof createRealtime>>;
