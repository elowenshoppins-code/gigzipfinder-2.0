/**
 * Gig Miles — servicio de rastreo de millas para deducción fiscal.
 *
 * Usa expo-location + expo-task-manager para registrar la ubicación en
 * segundo plano y acumular millas en la tabla `trips` (SQLite).
 *
 * Contratos que consume (archivos de otros agentes):
 * - src/db/database.ts: getDb(), getSetting(), setSetting(), interfaz Trip
 * - src/utils/format.ts: uid(), haversineMiles(lat1, lon1, lat2, lon2)
 *
 * Ajustes (settings) que utiliza:
 * - 'active_trip_id'    → id del viaje en curso ('' = ninguno)
 * - 'trip_paused'       → '1' si el viaje en curso está pausado por inactividad
 * - 'miles_autodetect'  → '1' activa la auto-detección de viajes
 * - 'default_platform'  → plataforma por defecto para viajes auto-detectados
 * - 'last_fix'          → último fix GPS en JSON (sobrevive reinicios)
 * - 'workday_start'     → epoch ms del inicio de la jornada ('' = sin jornada)
 *
 * BATERÍA Y PRIVACIDAD (decisiones de diseño, comentadas donde aplican):
 * - Accuracy.Balanced (~100 m): suficiente para contar millas, sin el costo
 *   del GPS de alta precisión.
 * - Intervalos amplios: como máximo un fix cada 30 s o cada 80 m.
 * - pausesLocationUpdatesAutomatically: iOS detiene los fixes cuando el
 *   equipo lleva un rato quieto; el SO los reanuda al detectar movimiento.
 * - En Android el rastreo corre como foreground service con notificación
 *   visible ("Gig Miles — Registrando tus millas de trabajo") para que el
 *   usuario siempre sepa que se está registrando su ubicación.
 * - Solo se guarda lat/lon del último fix y la distancia acumulada por
 *   viaje; no se guarda un historial de coordenadas.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getDb, getSetting, setSetting, type Trip } from '../db/database';
import { uid, haversineMiles } from '../utils/format';

/** Nombre de la tarea de ubicación en segundo plano. */
export const MILES_TASK = 'gig-miles-background';

/* ------------------------------------------------------------------ */
/* Heurística de auto-detección (documentada como heurística)          */
/*                                                                     */
/* Ninguna heurística es perfecta: puede iniciar un viaje si vas como  */
/* pasajero en carro ajeno, o pausar en tráfico muy pesado. Por eso    */
/* el viaje auto-detectado queda editable/borrable en la pantalla de   */
/* Millas y la auto-detección se puede apagar en cualquier momento.    */
/* ------------------------------------------------------------------ */
const SPEED_DRIVING_MS = 4; // > 4 m/s (~14 km/h) se considera conduciendo
const SPEED_STOPPED_MS = 1; // < 1 m/s se considera detenido
const DRIVING_FIXES_TO_START = 3; // fixes seguidos conduciendo para auto-iniciar
const STOPPED_MS_TO_PAUSE = 20 * 60 * 1000; // 20 min detenido → pausar (NO cerrar)
const MAX_SEGMENT_MILES = 1; // filtro anti-saltos GPS: ignora segmentos > 1 milla

interface Fix {
  lat: number;
  lon: number;
  speed: number | null; // m/s; null = el GPS no reportó velocidad
  time: number; // epoch ms
}

// Estado en memoria del módulo. `last_fix` además se persiste en settings
// para que la distancia siga siendo correcta tras reiniciar la app.
let lastFix: { lat: number; lon: number; time: number } | null = null;
let drivingStreak = 0; // fixes seguidos con velocidad de conducción
let slowSince: number | null = null; // cuándo empezó el periodo detenido actual

/** Carga el último fix persistido si la memoria se perdió (reinicio). */
async function ensureLastFixLoaded(): Promise<void> {
  if (lastFix) return;
  const raw = await getSetting('last_fix');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as {
      lat?: unknown;
      lon?: unknown;
      time?: unknown;
    };
    if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
      lastFix = {
        lat: parsed.lat,
        lon: parsed.lon,
        time: typeof parsed.time === 'number' ? parsed.time : 0,
      };
    }
  } catch {
    // JSON corrupto: se ignora y se empieza desde el próximo fix.
  }
}

/**
 * Procesa un fix GPS: acumula distancia en el viaje activo y aplica la
 * heurística de auto-detección (auto-inicio / auto-pausa).
 */
async function processFix(fix: Fix): Promise<void> {
  await ensureLastFixLoaded();
  const activeId = await getSetting('active_trip_id');

  // 1) Acumular distancia del segmento en el viaje activo.
  if (activeId && lastFix) {
    const segment = haversineMiles(lastFix.lat, lastFix.lon, fix.lat, fix.lon);
    // Un segmento > 1 milla en ~30 s es físicamente imposible en carro:
    // es un salto del GPS y se descarta para no inflar las millas.
    if (segment > 0 && segment <= MAX_SEGMENT_MILES) {
      await getDb().runAsync(
        'UPDATE trips SET distanceMiles = distanceMiles + ? WHERE id = ?',
        [segment, activeId],
      );
    }
  }

  // 2) Heurística de auto-detección.
  const speed = fix.speed;
  if (speed != null) {
    if (speed > SPEED_DRIVING_MS) {
      drivingStreak += 1;
      slowSince = null;
      // Volvió el movimiento: quitar la pausa automática.
      if ((await getSetting('trip_paused')) === '1') {
        await setSetting('trip_paused', '0');
      }
      if (
        !activeId &&
        (await getSetting('miles_autodetect')) === '1' &&
        drivingStreak >= DRIVING_FIXES_TO_START
      ) {
        const platform = await getSetting('default_platform');
        await startTrip(platform && platform.length > 0 ? platform : null);
        drivingStreak = 0;
      }
    } else if (speed < SPEED_STOPPED_MS) {
      drivingStreak = 0;
      if (activeId) {
        if (slowSince == null) {
          slowSince = fix.time;
        } else if (fix.time - slowSince >= STOPPED_MS_TO_PAUSE) {
          // Pausa: se marca el estado pero el viaje SIGUE abierto para
          // reanudarlo cuando el conductor vuelva a moverse.
          await setSetting('trip_paused', '1');
          slowSince = null;
        }
      }
    } else {
      // Entre 1 y 4 m/s: tráfico lento. No cuenta como conducción ni
      // como detención (evita pausas falsas en embotellamientos).
      drivingStreak = 0;
      slowSince = null;
    }
  }
  // Si speed es null el GPS no reportó velocidad: solo se actualiza el
  // último fix, sin cambiar el estado de detección.

  // 3) Guardar el último fix (memoria + persistente).
  lastFix = { lat: fix.lat, lon: fix.lon, time: fix.time };
  await setSetting('last_fix', JSON.stringify(lastFix));
}

/**
 * Tarea de ubicación en segundo plano. Se define al importarse el módulo
 * para que el SO pueda despertarla aunque la app esté cerrada.
 */
TaskManager.defineTask(MILES_TASK, async ({ data, error }) => {
  if (error) {
    // Un fallo de GPS no debe tumbar la tarea: se registra y se sigue.
    console.warn('[GigMiles] error en la tarea de ubicación:', error.message);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)
    ?.locations;
  if (!locations || locations.length === 0) return;
  try {
    for (const loc of locations) {
      await processFix({
        lat: loc.coords.latitude,
        lon: loc.coords.longitude,
        speed: loc.coords.speed ?? null,
        time: loc.timestamp,
      });
    }
  } catch (e) {
    console.warn('[GigMiles] fallo procesando fixes:', e);
  }
});

/* ------------------------------------------------------------------ */
/* Permisos y rastreo en segundo plano                                 */
/* ------------------------------------------------------------------ */

/** Pide permiso de ubicación en primer y segundo plano. */
export async function ensureLocationPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted;
}

/** Inicia el rastreo en segundo plano (idempotente). */
export async function startBackgroundTracking(): Promise<void> {
  const granted = await ensureLocationPermissions();
  if (!granted) {
    throw new Error('Permiso de ubicación denegado');
  }
  const started = await Location.hasStartedLocationUpdatesAsync(MILES_TASK);
  if (started) return;

  const options: Location.LocationTaskOptions = {
    // Balanced (~100 m): precisión suficiente para millas con bajo consumo.
    accuracy: Location.Accuracy.Balanced,
    // Intervalos amplios: el fix más frecuente posible es cada 30 s...
    timeInterval: 30_000,
    // ...o cada 80 m recorridos, lo que ocurra primero.
    distanceInterval: 80,
    activityType: Location.ActivityType.AutomotiveNavigation,
    // iOS puede pausar los fixes solo cuando el equipo está quieto y los
    // reanuda al detectar movimiento: ahorra batería sin perder viajes.
    pausesUpdatesAutomatically: true,
    // El foregroundService solo existe en Android: notificación persistente
    // para transparencia con el usuario. En iOS esta clave no aplica.
    ...(Platform.OS === 'android'
      ? {
          foregroundService: {
            notificationTitle: 'Gig Miles',
            notificationBody: 'Registrando tus millas de trabajo',
          },
        }
      : {}),
  };
  await Location.startLocationUpdatesAsync(MILES_TASK, options);
}

/** Detiene el rastreo en segundo plano. No toca el viaje activo. */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(MILES_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(MILES_TASK);
    }
  } catch (e) {
    console.warn('[GigMiles] no se pudo detener el rastreo:', e);
  }
}

/* ------------------------------------------------------------------ */
/* Viajes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Inicia un viaje de trabajo. Si ya hay uno activo, lo devuelve sin crear
 * duplicados. Asegura que el rastreo en segundo plano esté corriendo.
 */
export async function startTrip(platform: string | null): Promise<string> {
  const existing = await getActiveTrip();
  if (existing) return existing.id;
  const id = uid();
  await getDb().runAsync(
    'INSERT INTO trips (id, startTime, endTime, distanceMiles, purpose, platform, notes, isDemo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, Date.now(), null, 0, 'work', platform, null, 0],
  );
  await setSetting('active_trip_id', id);
  await setSetting('trip_paused', '0');
  // El rastreo ya debería estar activo; esto lo garantiza si el viaje se
  // inicia manualmente sin haberlo encendido antes.
  await startBackgroundTracking();
  return id;
}

/** Termina el viaje activo (marca endTime y libera el id activo). */
export async function endTrip(): Promise<void> {
  const active = await getActiveTrip();
  if (!active) return;
  await getDb().runAsync('UPDATE trips SET endTime = ? WHERE id = ?', [
    Date.now(),
    active.id,
  ]);
  await setSetting('active_trip_id', '');
  await setSetting('trip_paused', '0');
}

/** Pausa manual del viaje activo (no lo cierra). */
export async function pauseTrip(): Promise<void> {
  const active = await getActiveTrip();
  if (!active) return;
  await setSetting('trip_paused', '1');
}

/** Reanuda un viaje pausado manualmente. */
export async function resumeTrip(): Promise<void> {
  const active = await getActiveTrip();
  if (!active) return;
  await setSetting('trip_paused', '0');
}

/** ¿El viaje activo está pausado? */
export async function isTripPaused(): Promise<boolean> {
  return (await getSetting('trip_paused')) === '1';
}

/** Viaje en curso, o null si no hay ninguno. */
export async function getActiveTrip(): Promise<Trip | null> {
  const id = await getSetting('active_trip_id');
  if (!id) return null;
  const row = await getDb().getFirstAsync<Trip>(
    'SELECT * FROM trips WHERE id = ?',
    [id],
  );
  return row ?? null;
}

/** Últimos viajes, del más reciente al más antiguo. */
export async function listTrips(limit = 100): Promise<Trip[]> {
  return getDb().getAllAsync<Trip>(
    'SELECT * FROM trips ORDER BY startTime DESC LIMIT ?',
    [limit],
  );
}

const EDITABLE_FIELDS: (keyof Trip)[] = [
  'purpose',
  'platform',
  'distanceMiles',
  'notes',
];

/**
 * Corrección manual de un viaje (propósito, plataforma, millas, notas).
 * Solo permite los campos de la lista para no romper la integridad.
 */
export async function updateTrip(
  id: string,
  patch: Partial<Trip>,
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const key of EDITABLE_FIELDS) {
    const value = patch[key];
    if (value !== undefined) {
      sets.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }
  if (sets.length === 0) return;
  values.push(id);
  await getDb().runAsync(
    `UPDATE trips SET ${sets.join(', ')} WHERE id = ?`,
    values,
  );
}

/** Elimina un viaje. Si era el viaje activo, también lo desactiva. */
export async function deleteTrip(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM trips WHERE id = ?', [id]);
  const activeId = await getSetting('active_trip_id');
  if (activeId === id) {
    await setSetting('active_trip_id', '');
    await setSetting('trip_paused', '0');
  }
}

/**
 * Agrega un viaje manual (p. ej. olvidaste iniciar el rastreo).
 * El viaje queda registrado al mediodía de la fecha indicada con 1 h
 * de duración, para que caiga dentro del día correcto en los reportes.
 */
export async function addManualTrip(input: {
  date: string; // 'YYYY-MM-DD'
  miles: number;
  purpose: 'work' | 'personal';
  platform: string | null;
  notes?: string;
}): Promise<void> {
  if (!Number.isFinite(input.miles) || input.miles <= 0) {
    throw new Error('Millas inválidas');
  }
  const [y, m, d] = input.date.split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error('Fecha inválida (usa el formato AAAA-MM-DD)');
  }
  const startTime = new Date(y, m - 1, d, 12, 0, 0).getTime();
  await getDb().runAsync(
    'INSERT INTO trips (id, startTime, endTime, distanceMiles, purpose, platform, notes, isDemo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      uid(),
      startTime,
      startTime + 3_600_000,
      input.miles,
      input.purpose,
      input.platform,
      input.notes?.trim() ? input.notes.trim() : null,
      0,
    ],
  );
}

/* ------------------------------------------------------------------ */
/* Jornada de trabajo                                                  */
/* ------------------------------------------------------------------ */

/** Inicia la jornada: guarda la hora de inicio y asegura el rastreo. */
export async function startWorkday(): Promise<void> {
  await setSetting('workday_start', String(Date.now()));
  await startBackgroundTracking();
}

/** ¿Hay una jornada en curso? Devuelve su inicio en epoch ms o null. */
export async function getWorkdayStart(): Promise<number | null> {
  const raw = await getSetting('workday_start');
  if (!raw) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Termina la jornada: cierra el viaje activo si lo hay, calcula las
 * millas de trabajo del día y la cantidad de viajes, y limpia el estado.
 */
export async function endWorkday(): Promise<{ miles: number; trips: number }> {
  const active = await getActiveTrip();
  if (active) {
    await endTrip();
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const row = await getDb().getFirstAsync<{ m: number; c: number }>(
    `SELECT COALESCE(SUM(distanceMiles), 0) AS m, COUNT(*) AS c
     FROM trips WHERE purpose = 'work' AND startTime >= ?`,
    [dayStart.getTime()],
  );
  await setSetting('workday_start', '');
  return { miles: row?.m ?? 0, trips: row?.c ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Resumen                                                             */
/* ------------------------------------------------------------------ */

/** Millas de trabajo acumuladas por periodo. */
export interface MilesSummary {
  today: number;
  week: number; // desde el lunes
  month: number;
  year: number;
}

function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMondayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes = inicio
  return d.getTime();
}

function startOfMonthMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function startOfYearMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

/** Suma las millas de trabajo (purpose = 'work') por periodo. */
export async function getWorkMilesSummary(): Promise<MilesSummary> {
  const db = getDb();
  const since = [
    startOfDayMs(),
    startOfWeekMondayMs(),
    startOfMonthMs(),
    startOfYearMs(),
  ];
  const sums = await Promise.all(
    since.map(async (ms) => {
      const row = await db.getFirstAsync<{ m: number }>(
        `SELECT COALESCE(SUM(distanceMiles), 0) AS m
         FROM trips WHERE purpose = 'work' AND startTime >= ?`,
        [ms],
      );
      return row?.m ?? 0;
    }),
  );
  return { today: sums[0], week: sums[1], month: sums[2], year: sums[3] };
}
