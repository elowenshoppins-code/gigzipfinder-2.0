/**
 * Appeal AI — servicio de apelaciones por desactivación.
 *
 * Flujo: el usuario elige plataforma → (opcional) analiza una captura de la
 * notificación recibida → responde el cuestionario guiado → se genera una
 * carta formal en español e inglés → puede copiarla, abrir el enlace oficial
 * de la plataforma y guardarla en el historial local.
 *
 * Contratos usados: getDb + AppealRecord (src/db/database.ts),
 * uid + todayISO (src/utils/format.ts). La tabla `appeals` la crea initDb().
 */

import { getDb } from '../db/database';
import type { AppealRecord } from '../db/database';
import { todayISO, uid } from '../utils/format';
import { getStrings } from '../i18n';

/** Catálogo de plataformas soportadas por la apelación. */
export const PLATFORMS = [
  { id: 'instacart', name: 'Instacart' },
  { id: 'doordash', name: 'DoorDash' },
  { id: 'uber', name: 'Uber' },
  { id: 'spark', name: 'Spark Driver' },
  { id: 'lyft', name: 'Lyft' },
  { id: 'roade', name: 'Roadie' },
];

/**
 * Enlaces oficiales de ayuda/apelación por plataforma.
 */
// VERIFICAR: confirmar URL vigente antes del lanzamiento
export const OFFICIAL_LINKS: Record<string, string> = {
  instacart: 'https://www.instacart.com/help',
  doordash: 'https://help.doordash.com/dashers',
  uber: 'https://help.uber.com/driving-and-delivering',
  spark: 'https://www.walmart.com/help',
  lyft: 'https://help.lyft.com',
  roade: 'https://support.roadie.com',
};

/** Respuestas del cuestionario de apelación. */
export interface AppealAnswers {
  motivo: string; // qué pasó / por qué cree que lo desactivaron
  fecha: string; // cuándo ocurrió (aprox.)
  contexto: string; // qué dice la notificación recibida
  evidencia: string; // evidencia a su favor
  pedido: string; // qué pide en la apelación
}

export type AppealQuestion = {
  key: keyof AppealAnswers;
  question: string;
  placeholder: string;
};

/**
 * Las 5 preguntas del asistente, contextualizadas con el nombre
 * de la plataforma. La pregunta de evidencia es opcional.
 */
export function wizardQuestions(platformName: string): AppealQuestion[] {
  // Textos desde el diccionario i18n (idioma actual al momento de la llamada).
  const qs = getStrings().appeal.questions;
  return qs.map((dq) => ({
    key: dq.key as keyof AppealAnswers,
    question: dq.q(platformName),
    placeholder: dq.ph,
  }));
}

/** Carta formal de apelación en español. */
export function buildLetterEs(platformName: string, a: AppealAnswers): string {
  const fecha = todayISO();
  return [
    '[Tu nombre]',
    fecha,
    '',
    `Asunto: Solicitud de revisión de desactivación de cuenta — ${platformName}`,
    '',
    `Estimado equipo de ${platformName}:`,
    '',
    'Me dirijo a ustedes de manera respetuosa para solicitar la revisión de la desactivación de mi cuenta de conductor/repartidor. A continuación detallo mi caso:',
    '',
    `1. Qué ocurrió: ${a.motivo || '[describe lo sucedido]'}`,
    `2. Fecha aproximada: ${a.fecha || '[fecha]'}`,
    `3. Lo que indica la notificación recibida: ${a.contexto || '[texto de la notificación]'}`,
    `4. Evidencia a mi favor: ${a.evidencia || '[evidencia disponible]'}`,
    `5. Lo que solicito: ${a.pedido || '[tu solicitud]'}`,
    '',
    'Valoro mucho la oportunidad de trabajar con su plataforma y estoy dispuesto(a) a aportar cualquier información adicional que necesiten, así como a seguir las recomendaciones que me indiquen para evitar que esto vuelva a ocurrir.',
    '',
    'Agradezco de antemano su tiempo y su consideración.',
    '',
    'Atentamente,',
    '[Tu nombre]',
    '[Teléfono y correo asociados a tu cuenta]',
  ].join('\n');
}

/** Carta formal de apelación en inglés. */
export function buildLetterEn(platformName: string, a: AppealAnswers): string {
  const fecha = todayISO();
  return [
    '[Your name]',
    fecha,
    '',
    `Subject: Request for review of account deactivation — ${platformName}`,
    '',
    `Dear ${platformName} team,`,
    '',
    'I am writing to respectfully request a review of the deactivation of my driver/dasher account. Here are the details of my case:',
    '',
    `1. What happened: ${a.motivo || '[describe what happened]'}`,
    `2. Approximate date: ${a.fecha || '[date]'}`,
    `3. What the notification stated: ${a.contexto || '[notification text]'}`,
    `4. Evidence in my favor: ${a.evidencia || '[available evidence]'}`,
    `5. What I am requesting: ${a.pedido || '[your request]'}`,
    '',
    'I greatly value the opportunity to work with your platform and I am willing to provide any additional information you may need, as well as to follow your guidance to prevent this from happening again.',
    '',
    'Thank you in advance for your time and consideration.',
    '',
    'Sincerely,',
    '[Your name]',
    '[Phone and email associated with your account]',
  ].join('\n');
}

/** Guarda una apelación en la tabla `appeals`. */
export async function saveAppeal(
  platform: string,
  answers: AppealAnswers,
  letterEs: string,
  letterEn: string,
): Promise<AppealRecord> {
  const record: AppealRecord = {
    id: uid(),
    platform,
    problem: answers.motivo,
    answersJson: JSON.stringify(answers),
    letterEs,
    letterEn,
    createdAt: Date.now(),
  };
  try {
    getDb().runSync(
      'INSERT INTO appeals (id, platform, problem, answersJson, letterEs, letterEn, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [record.id, record.platform, record.problem, record.answersJson, record.letterEs, record.letterEn, record.createdAt],
    );
  } catch (err) {
    console.warn('[appeal] saveAppeal falló:', err);
    throw err;
  }
  return record;
}

/** Historial de apelaciones, de la más reciente a la más antigua. */
export async function listAppeals(): Promise<AppealRecord[]> {
  try {
    return getDb().getAllSync<AppealRecord>(
      'SELECT * FROM appeals ORDER BY createdAt DESC',
    );
  } catch (err) {
    console.warn('[appeal] listAppeals falló:', err);
    return [];
  }
}

/** Elimina una apelación del historial. */
export async function deleteAppeal(id: string): Promise<void> {
  try {
    getDb().runSync('DELETE FROM appeals WHERE id = ?', [id]);
  } catch (err) {
    console.warn('[appeal] deleteAppeal falló:', err);
  }
}

/**
 * PLACEHOLDER HONESTO — análisis de la captura de desactivación.
 *
 * TODO: conectar una API de visión (p. ej. GPT-4o Vision) que reciba la imagen
 * real y devuelva los motivos detectados en la notificación. Por ahora se
 * devuelven los motivos más comunes y el usuario confirma cuál aplica a su
 * caso. La pantalla muestra este aviso de forma visible.
 */
export async function analyzeDeactivationImage(
  _uri: string,
): Promise<{ likelyReasons: string[]; note: string }> {
  const t = getStrings().appeal;
  return {
    likelyReasons: [...t.reasons],
    note: t.visionNote,
  };
}
