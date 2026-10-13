/**
 * Datos demo para la primera experiencia con la app.
 *
 * seedIfNeeded() inserta una semana de datos de ejemplo (marcados
 * isDemo=1) la primera vez que se ejecuta; wipeDemoData() los elimina.
 *
 * Convención de recordatorios (compartida con otros agentes):
 *  - documentos:    id de notificación `doc_<id>`
 *  - mantenimiento: id de notificación `maint_<id>`
 * Se programan 7 días antes del vencimiento.
 */

import { getDb, setSetting, getSetting, type MaintenanceItem, type DocRecord } from './db/database';
import { uid, isoDate } from './utils/format';
import { scheduleReminder, cancelReminder } from './services/notifications';
import { getStrings } from './i18n';

const SEED_KEY = 'seeded_v1';
const DEMO = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 7 días antes (medianoche local) de una fecha 'YYYY-MM-DD'. */
function reminderDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, (m ?? 1) - 1, d ?? 1, 9, 0, 0);
  return new Date(target.getTime() - 7 * DAY_MS);
}

/** Siembra los datos demo una sola vez. */
export async function seedIfNeeded(): Promise<void> {
  try {
    const seeded = await getSetting(SEED_KEY);
    if (seeded === '1') return;

    const db = getDb();
    const t = getStrings().seed;
    const today = new Date();

    /* ---- Earnings: 7 días (2026-10-05 a 2026-10-11), zona Orlando ---- */
    const platforms: Array<[string, number, number, number, number, number]> = [
      // [platform, earnings, tips, miles, hours, gas]
      ['doordash', 132.4, 41.2, 118.5, 7.5, 18.0],
      ['instacart', 96.8, 28.5, 74.2, 6.0, 12.5],
      ['spark', 145.2, 52.8, 136.0, 8.0, 20.0],
      ['doordash', 118.0, 36.0, 102.3, 7.0, 16.0],
      ['instacart', 87.5, 24.0, 68.9, 5.5, 11.0],
      ['spark', 158.6, 61.4, 142.7, 8.5, 21.5],
      ['doordash', 104.3, 30.7, 89.4, 6.2, 14.0],
    ];
    const earningsRows = platforms.map(([platform, earnings, tips, miles, hours, gas], i) => {
      const date = new Date(2026, 9, 5 + i); // octubre 2026
      return {
        id: uid(),
        date: isoDate(date),
        platform,
        zone: 'Orlando',
        earnings,
        tips,
        miles,
        hours,
        waitMinutes: 15 + (i % 3) * 10,
        gas,
        tolls: i % 2 === 0 ? 3.5 : 0,
        parking: 0,
        isDemo: DEMO,
      };
    });

    /* ---- Trips de trabajo ---- */
    const tripRows = [
      { daysAgo: 6, platform: 'doordash', miles: 118.5, hours: 7.5 },
      { daysAgo: 5, platform: 'instacart', miles: 74.2, hours: 6.0 },
      { daysAgo: 4, platform: 'spark', miles: 136.0, hours: 8.0 },
      { daysAgo: 2, platform: 'instacart', miles: 68.9, hours: 5.5 },
      { daysAgo: 1, platform: 'doordash', miles: 89.4, hours: 6.2 },
    ].map((t) => {
      const start = new Date(today);
      start.setDate(start.getDate() - t.daysAgo);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + t.hours * 60 * 60 * 1000);
      return {
        id: uid(),
        startTime: start.getTime(),
        endTime: end.getTime(),
        distanceMiles: t.miles,
        purpose: 'work',
        platform: t.platform,
        notes: null as string | null,
        isDemo: DEMO,
      };
    });

    /* ---- Fuelups ---- */
    const fuelRows = [5, 2].map((daysAgo) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(8, 30, 0, 0);
      return {
        id: uid(),
        date: d.getTime(),
        amount: 42.5,
        gallons: 12.8,
        odometerMiles: 45210 + (5 - daysAgo) * 320,
        isDemo: DEMO,
      };
    });

    /* ---- Maintenance ---- */
    const maintenanceRows: Array<
      Omit<MaintenanceItem, 'done' | 'isDemo'> & { done: number; isDemo: number }
    > = [
      { id: uid(), type: t.maintOil, dueDate: '2026-11-01', done: 0, isDemo: DEMO },
      { id: uid(), type: t.maintReg, dueDate: '2026-12-15', done: 0, isDemo: DEMO },
    ];

    /* ---- Zipcodes demo ---- */
    const zipRows = [
      { code: '32801', app: 'instacart', notes: t.zipNote1 },
      { code: '32803', app: 'doordash', notes: t.zipNote2 },
      { code: '32805', app: 'spark', notes: t.zipNote3 },
    ].map((z) => ({ id: uid(), code: z.code, app: z.app, notes: z.notes }));

    /* ---- Documento demo ---- */
    const docId = uid();
    const docRow: DocRecord = {
      id: docId,
      name: t.docName,
      type: 'seguro',
      uri: '',
      expiryDate: '2026-11-04',
      isDemo: DEMO,
    };

    /* ---- Inserciones ---- */
    for (const e of earningsRows) {
      db.runSync(
        `INSERT INTO earnings (id, date, platform, zone, earnings, tips, miles, hours, waitMinutes, gas, tolls, parking, isDemo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.date, e.platform, e.zone, e.earnings, e.tips, e.miles, e.hours, e.waitMinutes, e.gas, e.tolls, e.parking, e.isDemo],
      );
    }
    for (const t of tripRows) {
      db.runSync(
        `INSERT INTO trips (id, startTime, endTime, distanceMiles, purpose, platform, notes, isDemo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.startTime, t.endTime, t.distanceMiles, t.purpose, t.platform, t.notes, t.isDemo],
      );
    }
    for (const f of fuelRows) {
      db.runSync(
        `INSERT INTO fuelups (id, date, amount, gallons, odometerMiles, isDemo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.id, f.date, f.amount, f.gallons, f.odometerMiles, f.isDemo],
      );
    }
    for (const m of maintenanceRows) {
      db.runSync(
        `INSERT INTO maintenance (id, type, dueDate, done, isDemo) VALUES (?, ?, ?, ?, ?)`,
        [m.id, m.type, m.dueDate, m.done, m.isDemo],
      );
    }
    for (const z of zipRows) {
      db.runSync(`INSERT INTO zipcodes (id, code, app, notes) VALUES (?, ?, ?, ?)`, [
        z.id,
        z.code,
        z.app,
        z.notes,
      ]);
    }
    // Guarda los ids de los ZIP demo para poder borrarlos con precisión
    await setSetting('seed_demo_zip_ids', zipRows.map((z) => z.id).join(','));
    db.runSync(
      `INSERT INTO documents (id, name, type, uri, expiryDate, isDemo) VALUES (?, ?, ?, ?, ?, ?)`,
      [docRow.id, docRow.name, docRow.type, docRow.uri, docRow.expiryDate, docRow.isDemo],
    );

    /* ---- Recordatorios demo: 7 días antes del vencimiento ---- */
    await scheduleReminder(
      `doc_${docId}`,
      t.notifDocTitle,
      t.notifDueMsg(t.docName),
      reminderDate('2026-11-04'),
    );
    for (const m of maintenanceRows) {
      await scheduleReminder(
        `maint_${m.id}`,
        t.notifMaintTitle,
        t.notifDueMsg(m.type),
        reminderDate(m.dueDate),
      );
    }

    await setSetting(SEED_KEY, '1');
  } catch (err) {
    console.warn('[seed] seedIfNeeded falló:', err);
  }
}

/** Elimina todos los datos demo y sus recordatorios. */
export async function wipeDemoData(): Promise<void> {
  try {
    const db = getDb();

    // Cancela recordatorios demo antes de borrar las filas
    const docs = db.getAllSync<{ id: string }>(
      'SELECT id FROM documents WHERE isDemo = 1',
    );
    for (const d of docs) await cancelReminder(`doc_${d.id}`);
    const maints = db.getAllSync<{ id: string }>(
      'SELECT id FROM maintenance WHERE isDemo = 1',
    );
    for (const m of maints) await cancelReminder(`maint_${m.id}`);

    for (const table of ['trips', 'earnings', 'fuelups', 'documents', 'maintenance'] as const) {
      db.runSync(`DELETE FROM ${table} WHERE isDemo = 1`);
    }
    // Los zipcodes demo no llevan isDemo en el esquema: el seed guarda sus ids
    // en settings para borrar exactamente esas filas.
    const demoZipIds = await getSetting('seed_demo_zip_ids');
    if (demoZipIds) {
      for (const id of demoZipIds.split(',')) {
        db.runSync(`DELETE FROM zipcodes WHERE id = ?`, [id]);
      }
      await setSetting('seed_demo_zip_ids', '');
    }

    await setSetting(SEED_KEY, '0');
  } catch (err) {
    console.warn('[seed] wipeDemoData falló:', err);
  }
}
