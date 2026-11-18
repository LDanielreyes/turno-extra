/** Normaliza un celular colombiano a E.164 (+573XXXXXXXXX). Devuelve null si no es válido. */
export function normalizeCoPhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('57') && d.length === 12) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? `+57${d}` : null;
}

/** +57 *** *** 4567: la interfaz y los logs nunca muestran el número completo. */
export const maskPhone = (e164: string | null) => (e164 ? `+57 *** *** ${e164.slice(-4)}` : null);
