import { Decimal } from 'decimal.js';

/**
 * Piso salarial de un turno (doc v1 §8.2, mantenido en la v2).
 * Reglas:
 *  - valor hora base = redondeo al peso de SMMLV / divisor_horas (1.750.905 / 210 ≈ 8.338).
 *  - recargo nocturno (35 %) entre `nocturno_desde_hora` y `nocturno_hasta_hora`, hora de Colombia.
 *  - recargo dominical (90 %) en domingo; festivos fuera del MVP.
 *  - los recargos son acumulables y se suman sobre la base (no se componen entre sí).
 *  - sin horas extra ni dominical compensatorio: fuera de alcance del MVP.
 * El total se redondea al peso más cercano (ROUND_HALF_UP), como en la v1 (§8.2).
 */
export type FloorParams = {
  smmlv: Decimal;
  divisorHoras: Decimal;
  recargoNocturno: Decimal;
  recargoDominical: Decimal;
  nocturnoDesdeHora: number;
  nocturnoHastaHora: number;
};

export type FloorResult = {
  valorHoraBase: string;
  horas: string;
  minutosNocturnos: number;
  minutosDominicales: number;
  pisoTotal: string;
  pisoPorHoraPromedio: string;
};

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000; // Colombia no tiene horario de verano

/** Los turnos se manejan al minuto: se descartan segundos y milisegundos. */
export const toMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export function computeFloor(inicioIn: Date, finIn: Date, p: FloorParams): FloorResult {
  const inicio = toMinute(inicioIn);
  const fin = toMinute(finIn);
  if (!(fin > inicio)) throw new Error('fin debe ser posterior a inicio');
  const base = p.smmlv.div(p.divisorHoras).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  // Se acumulan multiplicadores exactos (múltiplos de 0,05) y se divide una sola vez al final:
  // dividir por 60 en cada minuto deja residuos que el redondeo hacia arriba convierte en 1 peso.
  let units = new Decimal(0);
  let minutes = 0;
  let night = 0;
  let sunday = 0;
  for (let t = inicio.getTime(); t < fin.getTime(); t += 60_000) {
    const local = new Date(t + BOGOTA_OFFSET_MS); // campos UTC = hora local de Bogotá
    const h = local.getUTCHours();
    const isNight =
      p.nocturnoDesdeHora > p.nocturnoHastaHora
        ? h >= p.nocturnoDesdeHora || h < p.nocturnoHastaHora
        : h >= p.nocturnoDesdeHora && h < p.nocturnoHastaHora;
    const isSunday = local.getUTCDay() === 0;
    let mult = new Decimal(1);
    if (isNight) mult = mult.plus(p.recargoNocturno);
    if (isSunday) mult = mult.plus(p.recargoDominical);
    units = units.plus(mult);
    minutes += 1;
    if (isNight) night += 1;
    if (isSunday) sunday += 1;
  }
  const horas = new Decimal(minutes).div(60);
  const piso = base.times(units).div(60).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return {
    valorHoraBase: base.toFixed(0),
    horas: horas.toFixed(2),
    minutosNocturnos: night,
    minutosDominicales: sunday,
    pisoTotal: piso.toFixed(0),
    pisoPorHoraPromedio: piso.div(horas).toDecimalPlaces(0, Decimal.ROUND_CEIL).toFixed(0),
  };
}
