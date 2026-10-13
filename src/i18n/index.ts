/**
 * Infraestructura i18n — Gig ZipFinder 2.0.
 *
 * - `useStrings(): Strings` — hook reactivo para pantallas y componentes.
 *   Lee el idioma actual y re-renderiza automáticamente cuando cambia
 *   (vía `setLanguage` o `initLanguage`).
 * - `getStrings(): Strings` — para código no-React (servicios): devuelve el
 *   diccionario del idioma actual EN EL MOMENTO DE LA LLAMADA. Llámalo dentro
 *   de la función, no a nivel de módulo.
 * - `getLanguage()` — idioma actual ('es' hasta que `initLanguage` corra).
 * - `initLanguage()` — lee `app_language` de settings; si no hay valor
 *   guardado, defaultea a 'es' (expo-localization no está instalado, así que
 *   no hay detección de locale del dispositivo).
 * - `setLanguage(lang)` — persiste en settings y notifica a los suscriptores.
 * - `t` — COMPATIBILIDAD: diccionario español para código no-React legacy
 *   que aún no migró. El código nuevo debe usar `useStrings()` (React) o
 *   `getStrings()` (servicios). Las pantallas NO deben usar `t`.
 */
import { useEffect, useReducer } from 'react';
import { es, type Strings } from './es';
import { en } from './en';
import { pt } from './pt';
import { getSetting, setSetting } from '../db/database';

export type Language = 'es' | 'en' | 'pt';
export type { Strings };

const DICTS: Record<Language, Strings> = { es, en, pt };
const LANG_KEY = 'app_language';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
];

let current: Language = 'es';
let initialized = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* un listener roto no debe tumbar a los demás */
    }
  });
}

function isLanguage(v: string | null): v is Language {
  return v === 'es' || v === 'en' || v === 'pt';
}

/** Idioma actual en memoria ('es' hasta que `initLanguage()` termine). */
export function getLanguage(): Language {
  return current;
}

/** Diccionario del idioma actual. Para servicios: llamar dentro de la función. */
export function getStrings(): Strings {
  return DICTS[current];
}

/** Compat: diccionario ES para código no-React legacy. Ver nota arriba. */
export const t = es;

/**
 * Inicializa el idioma desde settings (`app_language`). Sin valor guardado
 * defaultea a 'es' — expo-localization no está instalado, así que no se
 * intenta detectar el locale del dispositivo. Llamar una vez al arranque,
 * antes de seedIfNeeded() para que los datos demo usen el idioma correcto.
 */
export async function initLanguage(): Promise<Language> {
  if (initialized) return current;
  initialized = true;
  try {
    const saved = await getSetting(LANG_KEY);
    current = isLanguage(saved) ? saved : 'es';
  } catch {
    current = 'es';
  }
  notify();
  return current;
}

/** Cambia el idioma, lo persiste y re-renderiza todo lo suscrito. */
export async function setLanguage(lang: Language): Promise<void> {
  current = lang;
  try {
    await setSetting(LANG_KEY, lang);
  } catch {
    /* el idioma en memoria ya cambió; la persistencia reintentará sola */
  }
  notify();
}

/** Hook reactivo: devuelve el diccionario y re-renderiza al cambiar idioma. */
export function useStrings(): Strings {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);
  return DICTS[current];
}
