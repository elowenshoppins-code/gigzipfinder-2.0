/**
 * Cálculos de deducción por millaje (método de tarifa estándar del IRS).
 *
 * Esto es solo una estimación; el usuario debe consultar a un profesional.
 */

export const DEDUCTION_DISCLAIMER = 'Estimación, no asesoría fiscal.';

/**
 * Tarifa estándar del IRS por milla según la fecha.
 * 2026: $0.725 (1-ene → 30-jun), $0.76 (desde 1-jul).
 * Años < 2026: $0.67. Años > 2026: $0.76.
 */
export function irsRateFor(date: Date): number {
  const year = date.getFullYear();
  if (year < 2026) return 0.67;
  if (year > 2026) return 0.76;
  // 2026: corte el 1 de julio (mes índice 6)
  const midYear = new Date(2026, 6, 1);
  return date < midYear ? 0.725 : 0.76;
}

/** Deducción estimada para unas millas dadas en una fecha. */
export function estimateDeduction(
  miles: number,
  date: Date = new Date(),
): { miles: number; rate: number; total: number } {
  const safeMiles = Number.isFinite(miles) && miles > 0 ? miles : 0;
  const rate = irsRateFor(date);
  return { miles: safeMiles, rate, total: safeMiles * rate };
}

type TripLike = {
  startTime: number;
  distanceMiles: number;
  purpose: string;
};

/**
 * Suma las millas de trabajo, aplica la tarifa según la fecha de cada
 * viaje y devuelve el total con un desglose legible por tarifa.
 */
export function deductionForPeriod(trips: TripLike[]): {
  miles: number;
  total: number;
  breakdown: string;
} {
  const workTrips = trips.filter(
    (t) =>
      t.purpose === 'work' &&
      Number.isFinite(t.distanceMiles) &&
      t.distanceMiles > 0,
  );

  if (workTrips.length === 0) {
    return { miles: 0, total: 0, breakdown: 'Sin viajes de trabajo en el periodo.' };
  }

  // Agrupa millas por tarifa aplicable
  const byRate = new Map<number, number>();
  for (const t of workTrips) {
    const rate = irsRateFor(new Date(t.startTime));
    byRate.set(rate, (byRate.get(rate) ?? 0) + t.distanceMiles);
  }

  const parts: string[] = [];
  let miles = 0;
  let total = 0;
  const sorted = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
  for (const [rate, rateMiles] of sorted) {
    const subtotal = rateMiles * rate;
    miles += rateMiles;
    total += subtotal;
    parts.push(
      `${rateMiles.toFixed(1)} mi × $${rate.toFixed(3)} = $${subtotal.toFixed(2)}`,
    );
  }

  return {
    miles,
    total,
    breakdown: parts.join(' + ') + ` → $${total.toFixed(2)} total`,
  };
}
