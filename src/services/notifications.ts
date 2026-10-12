/**
 * Recordatorios locales (expo-notifications).
 *
 * Nota: en Expo Go las notificaciones PUSH remotas no funcionan;
 * las notificaciones LOCALES programadas sí.
 */

import * as Notifications from 'expo-notifications';

/** Pide permiso si hace falta. Devuelve true si las notificaciones están permitidas. */
export async function ensureNotificationPermissions(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (err) {
    console.warn('[notifications] permiso falló:', err);
    return false;
  }
}

/**
 * Programa (o reprograma) un recordatorio local.
 * Cancela primero cualquier notificación con el mismo id para evitar duplicados.
 */
export async function scheduleReminder(
  id: string,
  title: string,
  body: string,
  date: Date,
): Promise<void> {
  try {
    const ok = await ensureNotificationPermissions();
    if (!ok) {
      console.warn('[notifications] sin permiso, no se programó:', id);
      return;
    }
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {
      // puede no existir aún; no es error
    });
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: { type: 'date', date } as Notifications.NotificationTriggerInput,
    });
  } catch (err) {
    console.warn('[notifications] scheduleReminder falló:', err);
  }
}

/** Cancela un recordatorio programado por id. */
export async function cancelReminder(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (err) {
    console.warn('[notifications] cancelReminder falló:', err);
  }
}
