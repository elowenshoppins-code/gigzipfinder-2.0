/**
 * Gig AI — motor de respuestas del asistente.
 *
 * Hoy funciona con reglas (intents) sobre los datos locales de SQLite:
 * detecta la intención de la pregunta y responde con cifras reales de la
 * app (ganancias, millas, gasolina, documentos, impuestos).
 *
 * El hook para un LLM externo existe (askLLM) pero lanza un error
 * intencional hasta que se conecte una API key: la UI lo presenta como
 * "próximamente".
 *
 * Todas las consultas a la base de datos están protegidas: si una tabla
 * no existe o no hay datos, el asistente responde amablemente en vez de
 * fallar.
 */

import { getDb, type EarningEntry, type DocRecord } from '../db/database';
import { uid, fmtMoney, fmtMiles, todayISO, isoDate } from '../utils/format';

/** Mensaje del chat. `action` muestra un botón que navega a una ruta. */
export interface ChatMsg {
  id: string;
  from: 'user' | 'bot';
  text: string;
  action?: { label: string; route: string };
}

/**
 * HOOK para LLM externo.
 *
 * TODO: conecta tu API de LLM con tu API key (p. ej. OpenAI):
 *   const res = await fetch('https://api.openai.com/v1/chat/completions', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       Authorization: `Bearer ${TU_API_KEY}`,
 *     },
 *     body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] }),
 *   });
 *   ...
 */
export async function askLLM(prompt: string): Promise<string> {
  void prompt;
  throw new Error('TODO: conecta tu API de LLM con tu API key (p. ej. OpenAI).');
}

/* ------------------------------------------------------------------ */
/* Utilidades internas                                                 */
/* ------------------------------------------------------------------ */

/** Minúsculas sin tildes para comparar intents. */
function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** SELECT protegido: devuelve [] si la consulta falla. */
function query<T>(sql: string, params: Array<string | number>): T[] {
  try {
    return getDb().getAllSync<T>(sql, params);
  } catch {
    return [];
  }
}

function bot(text: string, action?: ChatMsg['action']): ChatMsg {
  const msg: ChatMsg = { id: uid(), from: 'bot', text };
  if (action) msg.action = action;
  return msg;
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

function monthStartISO(): string {
  const now = new Date();
  return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function monthStartMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function fmtH(h: number): string {
  const r = Math.round(h * 10) / 10;
  return `${r} h`;
}

const PLATFORM_LABELS: Record<string, string> = {
  doordash: 'DoorDash',
  instacart: 'Instacart',
  spark: 'Spark Driver',
  uber: 'Uber',
  lyft: 'Lyft',
};

function platformLabel(p: string): string {
  const key = (p ?? '').toLowerCase();
  return PLATFORM_LABELS[key] ?? p;
}

/* ------------------------------------------------------------------ */
/* Intents                                                             */
/* ------------------------------------------------------------------ */

/** ¿Cuánto hice/gané esta semana? → suma earnings de los últimos 7 días. */
function weeklyEarnings(): ChatMsg {
  const rows = query<Pick<EarningEntry, 'date' | 'earnings' | 'tips' | 'hours'>>(
    'SELECT date, earnings, tips, hours FROM earnings WHERE date >= ?',
    [daysAgoISO(6)],
  );
  if (rows.length === 0) {
    return bot(
      'Aún no tienes ganancias registradas esta semana. Cuando agregues tus ingresos del día, podré resumirlos aquí.',
    );
  }
  let total = 0;
  let hours = 0;
  const days = new Set<string>();
  for (const r of rows) {
    total += num(r.earnings) + num(r.tips);
    hours += num(r.hours);
    if (r.date) days.add(r.date);
  }
  const n = days.size;
  return bot(
    `Esta semana: ${fmtMoney(total)} en ${fmtH(hours)} (${n} ${n === 1 ? 'día activo' : 'días activos'}).`,
  );
}

/** ¿Cuál es mi mejor app/plataforma? → mayor $/hora en 30 días. */
function bestPlatform(): ChatMsg {
  const rows = query<Pick<EarningEntry, 'platform' | 'earnings' | 'tips' | 'hours'>>(
    'SELECT platform, earnings, tips, hours FROM earnings WHERE date >= ?',
    [daysAgoISO(29)],
  );
  const byApp = new Map<string, { total: number; hours: number }>();
  for (const r of rows) {
    const p = (r.platform ?? '').trim() || 'Otra';
    const cur = byApp.get(p) ?? { total: 0, hours: 0 };
    cur.total += num(r.earnings) + num(r.tips);
    cur.hours += num(r.hours);
    byApp.set(p, cur);
  }
  let best: string | null = null;
  let bestRate = 0;
  for (const [p, v] of byApp) {
    if (v.hours > 0) {
      const rate = v.total / v.hours;
      if (rate > bestRate) {
        bestRate = rate;
        best = p;
      }
    }
  }
  if (!best) {
    return bot(
      'Aún no tienes suficientes datos para calcular tu mejor plataforma. Registra tus ganancias con horas por app.',
    );
  }
  return bot(
    `Tu mejor plataforma (últimos 30 días) es ${platformLabel(best)} con ${fmtMoney(bestRate)}/hora.`,
  );
}

/** ¿Cuántas millas este mes? → suma distanceMiles de trabajo del mes. */
function monthlyMiles(): ChatMsg {
  const rows = query<{ distanceMiles: number }>(
    "SELECT distanceMiles FROM trips WHERE purpose = 'work' AND startTime >= ?",
    [monthStartMs()],
  );
  let total = 0;
  for (const r of rows) total += num(r.distanceMiles);
  if (total <= 0) {
    return bot('Aún no registras millas de trabajo este mes.');
  }
  return bot(`Este mes llevas ${fmtMiles(total)} de trabajo.`);
}

/** Gasolina → gasto últimos 30 días + $/milla. */
function gasSummary(): ChatMsg {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const fuelRows = query<{ amount: number }>(
    'SELECT amount FROM fuelups WHERE date >= ?',
    [cutoff],
  );
  let gas = 0;
  for (const r of fuelRows) gas += num(r.amount);
  if (gas <= 0) {
    return bot('Aún no registras gasto de gasolina en los últimos 30 días.');
  }
  const tripRows = query<{ distanceMiles: number }>(
    "SELECT distanceMiles FROM trips WHERE purpose = 'work' AND startTime >= ?",
    [cutoff],
  );
  let miles = 0;
  for (const r of tripRows) miles += num(r.distanceMiles);
  const perMile =
    miles > 0 ? ` (${fmtMoney(gas / miles)} por milla en ${fmtMiles(miles)})` : '';
  return bot(`En los últimos 30 días gastaste ${fmtMoney(gas)} en gasolina${perMile}.`);
}

/** Desactivación → pasos + acción a Appeal AI. */
function deactivationHelp(): ChatMsg {
  return bot(
    'Si te desactivaron una cuenta:\n' +
      '1) Guarda el correo o aviso de la plataforma y toma capturas.\n' +
      '2) Reúne pruebas: viajes, calificaciones y mensajes.\n' +
      '3) Genera tu carta de apelación con Appeal AI.',
    { label: 'Ir a Appeal AI', route: '/(tabs)/appeal' },
  );
}

/** Documentos / seguro / vencimientos → próximos a vencer. */
function upcomingDocs(): ChatMsg {
  const rows = query<Pick<DocRecord, 'name' | 'expiryDate'>>(
    'SELECT name, expiryDate FROM documents WHERE expiryDate IS NOT NULL AND expiryDate != "" ORDER BY expiryDate LIMIT 10',
    [],
  );
  if (rows.length === 0) {
    return bot('No tienes documentos con fecha de vencimiento registrada.');
  }
  const today = todayISO();
  const upcoming = rows.filter((r) => (r.expiryDate ?? '') >= today).slice(0, 5);
  if (upcoming.length === 0) {
    return bot('No tienes vencimientos próximos. Todo al día.');
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const todayNoon = new Date(`${today}T12:00:00`).getTime();
  const lines = upcoming.map((r) => {
    const exp = r.expiryDate as string;
    const diff = Math.round(
      (new Date(`${exp}T12:00:00`).getTime() - todayNoon) / dayMs,
    );
    const when =
      diff <= 0 ? 'vence hoy' : diff === 1 ? 'vence mañana' : `vence en ${diff} días`;
    return `• ${r.name}: ${when} (${exp})`;
  });
  return bot(`Documentos próximos a vencer:\n${lines.join('\n')}`);
}

/** Impuestos → resumen del mes + acción al Tax Center. */
function taxSummary(): ChatMsg {
  const rows = query<Pick<EarningEntry, 'earnings' | 'tips'>>(
    'SELECT earnings, tips FROM earnings WHERE date >= ?',
    [monthStartISO()],
  );
  let total = 0;
  for (const r of rows) total += num(r.earnings) + num(r.tips);
  const tripRows = query<{ distanceMiles: number }>(
    "SELECT distanceMiles FROM trips WHERE purpose = 'work' AND startTime >= ?",
    [monthStartMs()],
  );
  let miles = 0;
  for (const r of tripRows) miles += num(r.distanceMiles);
  return bot(
    `Este mes: ${fmtMoney(total)} en ganancias y ${fmtMiles(miles)} de trabajo. Abre el Tax Center para ver tus deducciones estimadas.`,
    { label: 'Abrir Tax Center', route: '/taxes' },
  );
}

/** Hola / ayuda / qué puedes hacer → capacidades. */
function capabilities(): ChatMsg {
  return bot(
    'Puedo ayudarte con:\n' +
      '• Tus ganancias (semana y mes)\n' +
      '• Tu mejor plataforma\n' +
      '• Millas de trabajo y gasto de gasolina\n' +
      '• Documentos próximos a vencer\n' +
      '• Impuestos y apelaciones\n\n' +
      'Prueba: «¿cuánto hice esta semana?»',
  );
}

/* ------------------------------------------------------------------ */
/* Punto de entrada                                                    */
/* ------------------------------------------------------------------ */

/** Responde una pregunta del usuario usando reglas + datos locales. */
export async function answerQuery(q: string): Promise<ChatMsg> {
  const text = norm(q);

  if (/cuanto (hice|gane)/.test(text) && text.includes('semana')) {
    return weeklyEarnings();
  }
  if (/mejor (app|aplicacion|plataforma)/.test(text)) {
    return bestPlatform();
  }
  if (text.includes('millas') && text.includes('mes')) {
    return monthlyMiles();
  }
  if (text.includes('gasolina')) {
    return gasSummary();
  }
  if (text.includes('desactiv')) {
    return deactivationHelp();
  }
  if (
    text.includes('documento') ||
    text.includes('seguro') ||
    text.includes('vence') ||
    text.includes('vencimiento')
  ) {
    return upcomingDocs();
  }
  if (text.includes('impuesto') || text.includes('tax')) {
    return taxSummary();
  }
  if (text.includes('hola') || text.includes('ayuda') || /que puedes/.test(text)) {
    return capabilities();
  }

  return bot(
    "Puedo ayudarte con tus ganancias, millas, mejor plataforma, documentos y apelaciones. Prueba: '¿cuánto hice esta semana?'",
  );
}
