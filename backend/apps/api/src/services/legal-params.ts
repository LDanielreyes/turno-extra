import { Decimal } from 'decimal.js';
import { and, desc, eq, lte } from 'drizzle-orm';
import { legalParams, type Db, type Tx } from '@turnoextra/db';
import type { FloorParams } from './floor.js';

export const LEGAL_KEYS = [
  'smmlv', 'divisor_horas', 'recargo_nocturno', 'recargo_dominical', 'nocturno_desde_hora', 'nocturno_hasta_hora',
] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

export class LegalParamMissing extends Error {
  constructor(public clave: string, public fecha: string) {
    super(`legal_param_missing:${clave}@${fecha}`);
  }
}

/** Fecha local de Bogotá (YYYY-MM-DD) de un instante. */
export const bogotaDate = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

/** Valor vigente de cada parámetro en la fecha local del turno. Falla si falta alguno. */
export async function floorParamsAt(db: Db | Tx, at: Date): Promise<FloorParams> {
  const fecha = bogotaDate(at);
  const get = async (clave: LegalKey) => {
    const [r] = await db
      .select({ valor: legalParams.valor })
      .from(legalParams)
      .where(and(eq(legalParams.clave, clave), lte(legalParams.vigenteDesde, fecha)))
      .orderBy(desc(legalParams.vigenteDesde))
      .limit(1);
    if (!r) throw new LegalParamMissing(clave, fecha);
    return new Decimal(r.valor);
  };
  return {
    smmlv: await get('smmlv'),
    divisorHoras: await get('divisor_horas'),
    recargoNocturno: await get('recargo_nocturno'),
    recargoDominical: await get('recargo_dominical'),
    nocturnoDesdeHora: (await get('nocturno_desde_hora')).toNumber(),
    nocturnoHastaHora: (await get('nocturno_hasta_hora')).toNumber(),
  };
}

/** Solo la franja nocturna vigente ese día (el reporte de horas no necesita salarios ni recargos). */
export async function nightWindowAt(db: Db | Tx, at: Date): Promise<{ nocturnoDesdeHora: number; nocturnoHastaHora: number }> {
  const fecha = bogotaDate(at);
  const get = async (clave: LegalKey) => {
    const [r] = await db
      .select({ valor: legalParams.valor })
      .from(legalParams)
      .where(and(eq(legalParams.clave, clave), lte(legalParams.vigenteDesde, fecha)))
      .orderBy(desc(legalParams.vigenteDesde))
      .limit(1);
    if (!r) throw new LegalParamMissing(clave, fecha);
    return new Decimal(r.valor).toNumber();
  };
  return { nocturnoDesdeHora: await get('nocturno_desde_hora'), nocturnoHastaHora: await get('nocturno_hasta_hora') };
}
