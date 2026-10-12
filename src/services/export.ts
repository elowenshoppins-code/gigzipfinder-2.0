/**
 * Exportación de reportes mensuales (CSV y PDF) para el Tax Center.
 *
 * - buildTaxReportCSV(month): genera el contenido CSV del mes ('YYYY-MM').
 * - exportCSV(month): escribe gig-tax-<month>.csv y lo comparte.
 * - exportTaxPDF(month): genera un PDF con el resumen y lo comparte.
 *
 * Todo en español. Las exportaciones nunca lanzan: envuelven el trabajo
 * en try/catch y muestran un Alert en español si algo falla.
 */

import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { getDb } from '../db/database';
import type { EarningEntry, Trip } from '../db/database';
import { fmtMoney, fmtMiles } from '../utils/format';
import { deductionForPeriod, DEDUCTION_DISCLAIMER } from '../utils/irs';

/* ------------------------------------------------------------------ */
/* Utilidades de mes                                                   */
/* ------------------------------------------------------------------ */

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** 'octubre 2026' para un mes 'YYYY-MM'. */
export function monthLabelES(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MONTHS_ES[m - 1]} ${y}`;
}

/** Rango de fechas [start, end) en 'YYYY-MM-DD' para la tabla earnings. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Mes inválido: ${month}`);
  }
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end =
    m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end };
}

/** Rango [startMs, endMs) en epoch ms (hora local) para la tabla trips. */
export function monthEpochRange(month: string): {
  startMs: number;
  endMs: number;
} {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Mes inválido: ${month}`);
  }
  const startMs = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
  const endMs =
    m === 12
      ? new Date(y + 1, 0, 1, 0, 0, 0, 0).getTime()
      : new Date(y, m, 1, 0, 0, 0, 0).getTime();
  return { startMs, endMs };
}

/** Mueve un mes 'YYYY-MM' n meses adelante (o atrás si es negativo). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

/* ------------------------------------------------------------------ */
/* Datos del reporte                                                   */
/* ------------------------------------------------------------------ */

export interface PlatformSummary {
  platform: string;
  earnings: number;
  tips: number;
  miles: number;
  hours: number;
  gas: number;
  tolls: number;
  parking: number;
}

export interface MonthReportData {
  month: string;
  entries: EarningEntry[];
  gross: number; // ganancias + propinas
  tips: number;
  miles: number; // millas registradas en earnings
  hours: number;
  gas: number;
  tolls: number;
  parking: number;
  businessMiles: number; // millas de trabajo (trips purpose=work)
  deduction: number; // deducción estimada por millaje (tarifa IRS)
  deductionBreakdown: string;
  byPlatform: PlatformSummary[];
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** Lee de SQLite todo lo necesario para el reporte del mes. */
export async function loadReportData(month: string): Promise<MonthReportData> {
  const db = getDb();
  const { start, end } = monthRange(month);

  const entries = await db.getAllAsync<EarningEntry>(
    `SELECT id, date, platform, zone, earnings, tips, miles, hours,
            waitMinutes, gas, tolls, parking
     FROM earnings
     WHERE date >= ? AND date < ?
     ORDER BY date ASC, platform ASC`,
    [start, end],
  );

  const { startMs, endMs } = monthEpochRange(month);
  const trips = await db.getAllAsync<Trip>(
    `SELECT id, startTime, endTime, distanceMiles, purpose, platform, notes, isDemo
     FROM trips
     WHERE startTime >= ? AND startTime < ?`,
    [startMs, endMs],
  );

  const ded = deductionForPeriod(trips);

  const byPlatform = new Map<string, PlatformSummary>();
  for (const e of entries) {
    const key = e.platform || 'Otro';
    const cur =
      byPlatform.get(key) ??
      ({ platform: key, earnings: 0, tips: 0, miles: 0, hours: 0, gas: 0, tolls: 0, parking: 0 } as PlatformSummary);
    cur.earnings += num(e.earnings);
    cur.tips += num(e.tips);
    cur.miles += num(e.miles);
    cur.hours += num(e.hours);
    cur.gas += num(e.gas);
    cur.tolls += num(e.tolls);
    cur.parking += num(e.parking);
    byPlatform.set(key, cur);
  }

  const earnings = entries.reduce((a, e) => a + num(e.earnings), 0);
  const tips = entries.reduce((a, e) => a + num(e.tips), 0);

  return {
    month,
    entries,
    gross: earnings + tips,
    tips,
    miles: entries.reduce((a, e) => a + num(e.miles), 0),
    hours: entries.reduce((a, e) => a + num(e.hours), 0),
    gas: entries.reduce((a, e) => a + num(e.gas), 0),
    tolls: entries.reduce((a, e) => a + num(e.tolls), 0),
    parking: entries.reduce((a, e) => a + num(e.parking), 0),
    businessMiles: ded.miles,
    deduction: ded.total,
    deductionBreakdown: ded.breakdown,
    byPlatform: [...byPlatform.values()].sort(
      (a, b) => b.earnings + b.tips - (a.earnings + a.tips),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Escapa un valor para CSV (comillas si contiene coma, comilla o salto). */
function csvEsc(v: string | number | null): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const moneyCsv = (n: number): string => num(n).toFixed(2);
const milesCsv = (n: number): string => num(n).toFixed(1);

/**
 * Genera el contenido CSV del reporte mensual.
 * Columnas: fecha,plataforma,ganancias,propinas,millas,horas,gasolina,peajes,estacionamiento
 * seguidas de una sección de resumen.
 */
export async function buildTaxReportCSV(month: string): Promise<string> {
  const d = await loadReportData(month);
  const lines: string[] = [];

  lines.push(
    'fecha,plataforma,ganancias,propinas,millas,horas,gasolina,peajes,estacionamiento',
  );
  for (const e of d.entries) {
    lines.push(
      [
        csvEsc(e.date),
        csvEsc(e.platform),
        moneyCsv(e.earnings),
        moneyCsv(e.tips),
        milesCsv(e.miles),
        milesCsv(e.hours),
        moneyCsv(e.gas),
        moneyCsv(e.tolls),
        moneyCsv(e.parking),
      ].join(','),
    );
  }

  lines.push('');
  lines.push(csvEsc(`RESUMEN DEL MES — ${monthLabelES(d.month)}`));
  lines.push(['Ingresos totales (ganancias + propinas)', moneyCsv(d.gross)].join(','));
  lines.push(['Propinas totales', moneyCsv(d.tips)].join(','));
  lines.push(['Millas registradas en turnos', milesCsv(d.miles)].join(','));
  lines.push(['Horas trabajadas', milesCsv(d.hours)].join(','));
  lines.push(['Millas comerciales (viajes de trabajo)', milesCsv(d.businessMiles)].join(','));
  lines.push(['Deducción estimada por millaje (tarifa IRS)', moneyCsv(d.deduction)].join(','));
  lines.push(['Detalle de la deducción', csvEsc(d.deductionBreakdown)].join(','));
  lines.push(['Gasolina total', moneyCsv(d.gas)].join(','));
  lines.push(['Peajes totales', moneyCsv(d.tolls)].join(','));
  lines.push(['Estacionamiento total', moneyCsv(d.parking)].join(','));
  lines.push(['Nota', csvEsc('Guarda este reporte para tus registros. Estimación, no asesoría fiscal.')].join(','));

  return lines.join('\n') + '\n';
}

/**
 * Escribe el CSV del mes en gig-tax-<month>.csv y lo comparte.
 * Muestra un Alert en español si falla.
 */
export async function exportCSV(month: string): Promise<void> {
  try {
    const csv = await buildTaxReportCSV(month);
    const base = FileSystem.documentDirectory;
    if (!base) {
      throw new Error('Sin directorio de documentos');
    }
    const uri = `${base}gig-tax-${month}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        'Archivo guardado',
        'El CSV se guardó, pero este dispositivo no puede compartirlo.',
      );
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Compartir reporte CSV',
    });
  } catch {
    Alert.alert(
      'No se pudo exportar',
      'Ocurrió un error al generar el archivo CSV. Inténtalo de nuevo.',
    );
  }
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

function htmlEsc(s: string | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildTaxReportHTML(d: MonthReportData): string {
  const label = monthLabelES(d.month);
  const generated = new Date().toLocaleString('es-US');

  const platformRows = d.byPlatform
    .map(
      (p) => `
      <tr>
        <td>${htmlEsc(p.platform)}</td>
        <td class="num">${fmtMoney(p.earnings + p.tips)}</td>
        <td class="num">${fmtMiles(p.miles)}</td>
        <td class="num">${p.hours.toFixed(1)} h</td>
        <td class="num">${fmtMoney(p.gas)}</td>
        <td class="num">${fmtMoney(p.tolls + p.parking)}</td>
      </tr>`,
    )
    .join('');

  const detailRows = d.entries
    .map(
      (e) => `
      <tr>
        <td>${htmlEsc(e.date)}</td>
        <td>${htmlEsc(e.platform)}${e.zone ? ` · ${htmlEsc(e.zone)}` : ''}</td>
        <td class="num">${fmtMoney(num(e.earnings) + num(e.tips))}</td>
        <td class="num">${fmtMiles(num(e.miles))}</td>
        <td class="num">${num(e.hours).toFixed(1)} h</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { color: #555; margin-bottom: 20px; }
  .cards { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
  .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px 16px; min-width: 150px; flex: 1; }
  .card .label { font-size: 12px; color: #666; margin-bottom: 4px; }
  .card .value { font-size: 20px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f3f4f3; }
  .num { text-align: right; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  .disclaimer { border: 2px solid #b45309; background: #fef3c7; border-radius: 10px; padding: 12px 16px; margin: 20px 0; font-size: 13px; }
  .footer { color: #666; font-size: 12px; margin-top: 24px; }
</style>
</head>
<body>
  <h1>Reporte mensual — Gig ZipFinder</h1>
  <div class="subtitle">${htmlEsc(label)} · Generado el ${htmlEsc(generated)}</div>

  <div class="cards">
    <div class="card"><div class="label">Ingresos totales</div><div class="value">${fmtMoney(d.gross)}</div></div>
    <div class="card"><div class="label">Millas comerciales</div><div class="value">${fmtMiles(d.businessMiles)}</div></div>
    <div class="card"><div class="label">Millaje estimado (IRS)</div><div class="value">${fmtMoney(d.deduction)}</div></div>
    <div class="card"><div class="label">Peajes</div><div class="value">${fmtMoney(d.tolls)}</div></div>
    <div class="card"><div class="label">Estacionamiento</div><div class="value">${fmtMoney(d.parking)}</div></div>
  </div>

  <h2>Detalle de la deducción por millaje</h2>
  <p>${htmlEsc(d.deductionBreakdown)}</p>

  <div class="disclaimer">
    <strong>⚠️ ${htmlEsc(DEDUCTION_DISCLAIMER)}</strong><br />
    Este reporte es una estimación generada automáticamente con tus registros.
    Guarda este reporte para tus registros. Estimación, no asesoría fiscal:
    consulta a un profesional de impuestos antes de declarar.
  </div>

  <h2>Resumen por plataforma</h2>
  <table>
    <tr><th>Plataforma</th><th class="num">Ganado</th><th class="num">Millas</th><th class="num">Horas</th><th class="num">Gasolina</th><th class="num">Peajes + Estac.</th></tr>
    ${platformRows || '<tr><td colspan="6">Sin registros este mes.</td></tr>'}
  </table>

  <h2>Registros del mes</h2>
  <table>
    <tr><th>Fecha</th><th>Plataforma</th><th class="num">Ganado</th><th class="num">Millas</th><th class="num">Horas</th></tr>
    ${detailRows || '<tr><td colspan="5">Sin registros este mes.</td></tr>'}
  </table>

  <div class="footer">Gig ZipFinder · Reporte generado en el dispositivo · ${htmlEsc(DEDUCTION_DISCLAIMER)}</div>
</body>
</html>`;
}

/**
 * Genera el PDF del resumen mensual y lo comparte.
 * Incluye el disclaimer "Estimación, no asesoría fiscal." en el documento.
 * Muestra un Alert en español si falla.
 */
export async function exportTaxPDF(month: string): Promise<void> {
  try {
    const data = await loadReportData(month);
    const html = buildTaxReportHTML(data);
    const { uri } = await Print.printToFileAsync({ html });
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        'PDF generado',
        'El PDF se generó, pero este dispositivo no puede compartirlo.',
      );
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Compartir reporte PDF',
    });
  } catch {
    Alert.alert(
      'No se pudo exportar',
      'Ocurrió un error al generar el PDF. Inténtalo de nuevo.',
    );
  }
}
