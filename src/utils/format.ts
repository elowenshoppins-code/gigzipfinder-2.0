/**
 * Utilidades de formato y cálculo genérico.
 *
 * Contrato: uid, fmtMoney, fmtMiles, todayISO, isoDate, monthKey,
 * haversineMiles.
 */

/** Id único: timestamp base36 + aleatorio base36. */
export function uid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

/** "$1,234.56" (locale es-US: signo $, separador de miles coma, 2 decimales). */
export function fmtMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return (
    '$' +
    safe.toLocaleString('es-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** "1,234.5 mi". */
export function fmtMiles(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return (
    safe.toLocaleString('es-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' mi'
  );
}

/** 'YYYY-MM-DD' en hora local. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'YYYY-MM-DD' de hoy. */
export function todayISO(): string {
  return isoDate(new Date());
}

/** 'YYYY-MM' — clave para agrupar por mes. */
export function monthKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Distancia en millas entre dos coordenadas (fórmula haversine). */
export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // radio de la Tierra en millas
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
