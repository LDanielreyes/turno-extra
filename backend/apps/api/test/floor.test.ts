import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { computeFloor, type FloorParams } from '../src/services/floor.js';

const params: FloorParams = {
  smmlv: new Decimal(1750905),
  divisorHoras: new Decimal(210),
  recargoNocturno: new Decimal(0.35),
  recargoDominical: new Decimal(0.9),
  nocturnoDesdeHora: 19,
  nocturnoHastaHora: 6,
};

// Hora de Bogotá (UTC-5). Lunes 16-nov-2026, sábado 21, domingo 22.
const at = (day: number, hhmm: string) => new Date(`2026-11-${String(day).padStart(2, '0')}T${hhmm}:00-05:00`);

// Valores esperados calculados a mano con base = 8.338 (1.750.905 / 210 = 8.337,6 → 8.338),
// cada total redondeado al peso más cercano (v1 §8.2). Los casos v1 llevan las cifras del informe. Pendientes de validar con un contador.
describe('piso salarial: 6 casos de referencia', () => {
  const cases: [string, Date, Date, string][] = [
    ['1. diurno lunes 08:00–16:00 (8 h)', at(16, '08:00'), at(16, '16:00'), '66704'], // 8 × 8338
    ['2. nocturno lunes 20:00–04:00 (8 h)', at(16, '20:00'), at(17, '04:00'), '90050'], // 8 × 8338 × 1,35 = 90.050,4
    ['3. mixto lunes 15:00–23:00', at(16, '15:00'), at(16, '23:00'), '78377'], // 4×8338 + 4×8338×1,35 = 78.377,2
    ['4. domingo diurno 08:00–16:00', at(22, '08:00'), at(22, '16:00'), '126738'], // 8 × 8338 × 1,9 = 126.737,6
    ['5. domingo noche a lunes 20:00–04:00', at(22, '20:00'), at(23, '04:00'), '120067'], // 4×8338×2,25 + 4×8338×1,35 = 120.067,2
    ['v1-a. lunes 08:00–14:00 (6 h)', at(16, '08:00'), at(16, '14:00'), '50028'],
    ['v1-b. viernes 20:00–02:00 (6 h)', at(20, '20:00'), at(21, '02:00'), '67538'], // 67.537,8
    ['v1-c. sábado 20:00 a domingo 02:00 (6 h)', at(21, '20:00'), at(22, '02:00'), '82546'], // 82.546,2
    ['6. borde de franja lunes 18:30–21:00', at(16, '18:30'), at(16, '21:00'), '26682'], // 0,5×8338 + 2×8338×1,35 = 26.681,6
  ];
  it.each(cases)('%s', (_n, i, f, esperado) => {
    expect(computeFloor(i, f, params).pisoTotal).toBe(esperado);
  });

  it('expone el desglose de minutos y la base', () => {
    const r = computeFloor(at(22, '20:00'), at(23, '04:00'), params);
    expect(r).toMatchObject({ valorHoraBase: '8338', horas: '8.00', minutosNocturnos: 480, minutosDominicales: 240 });
  });
  it('sábado noche a domingo: el recargo dominical entra solo después de medianoche', () => {
    const r = computeFloor(at(21, '20:00'), at(22, '04:00'), params);
    expect(r.minutosDominicales).toBe(240);
    expect(r.pisoTotal).toBe('120067');
  });
  it('descarta segundos y milisegundos: no cuenta un minuto de más', () => {
    const r = computeFloor(new Date('2026-11-16T08:00:00.123-05:00'), new Date('2026-11-16T16:00:00.987-05:00'), params);
    expect(r.horas).toBe('8.00');
    expect(r.pisoTotal).toBe('66704');
  });
  it('rechaza turnos con fin anterior al inicio', () => {
    expect(() => computeFloor(at(16, '10:00'), at(16, '09:00'), params)).toThrow();
  });
});
