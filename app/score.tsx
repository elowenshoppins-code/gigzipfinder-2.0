/**
 * Driver Score — puntaje del conductor (0-100) para el día seleccionado.
 *
 * FÓRMULA (documentada; cada componente se normaliza a 0-100 y se pondera):
 *
 *  1) $/hora (30 pts):  perHour = ganancias / horas.
 *     → clamp(perHour / 40) * 30        ($40/h o más = 30 pts)
 *  2) $/milla (25 pts): perMile = ganancias / millas.
 *     → clamp(perMile / 3) * 25         ($3/mi o más = 25 pts)
 *  3) Millas vacías (15 pts): heurística simple — se asume que cada $2 de
 *     ganancia "cubren" ~1 milla con ganancia; el resto son millas vacías.
 *     deadMiles = max(0, miles - ganancias/2); deadRatio = deadMiles / miles.
 *     → (1 - deadRatio) * 15
 *  4) Tiempo de espera (10 pts): waitPerHour = minutosEspera / horas.
 *     → max(0, 1 - waitPerHour/20) * 10 (20+ min de espera por hora = 0 pts)
 *  5) Costo de combustible/milla (20 pts): fuelPerMile = gasolina / millas.
 *     Si no hay dato de gasolina se usa 0.18 $/mi como estimado.
 *     → max(0, 1 - fuelPerMile/0.60) * 20  ($0.60/mi o más = 0 pts)
 *
 * Además muestra la mejor plataforma del día (mayor $/h desde earnings),
 * la franja de 3h con más actividad (desde trips), el promedio $/h y el
 * costo $/mi. Todo sale de los datos reales del usuario.
 *
 * Acceso: suscripción toolkit ($10/mes).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Screen } from '../src/components/Screen';
import { StatCard } from '../src/components/StatCard';
import { Paywall } from '../src/components/Paywall';
import { getDb } from '../src/db/database';
import type { EarningEntry, Trip } from '../src/db/database';
import { fmtMiles, fmtMoney, isoDate, todayISO } from '../src/utils/format';
import { PLATFORMS } from '../src/services/appeal';
import {
  restorePurchases,
  subscribeToolkit,
  useToolkitAccess,
} from '../src/services/monetization';

const GREEN = '#00A651';
const YELLOW = '#D97706';
const RED = '#DC2626';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Heurística documentada: $2 de ganancia ≈ 1 milla con ganancia. */
const EARNINGS_PER_LOADED_MILE = 2;

/** Costo de combustible estimado ($/mi) cuando no hay dato de gasolina. */
const DEFAULT_FUEL_PER_MILE = 0.18;

interface ScoreBreakdown {
  perHour: number;
  perMile: number;
  deadMiles: number;
  deadRatio: number;
  waitPerHour: number;
  fuelPerMile: number;
  cHour: number;
  cMile: number;
  cDead: number;
  cWait: number;
  cFuel: number;
  total: number;
}

function scoreColor(score: number): string {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

function scoreIcon(score: number): string {
  if (score >= 75) return '🟢';
  if (score >= 50) return '🟡';
  return '🔴';
}

function slotLabel(hour: number): string {
  const start = Math.floor(hour / 3) * 3;
  return `${start}:00 – ${start + 3}:00`;
}

function shiftDay(dateISO: string, delta: number): string {
  const d = new Date(`${dateISO}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

const fmtDateLong = (dateISO: string) =>
  new Date(`${dateISO}T12:00:00`).toLocaleDateString('es-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export default function ScoreScreen() {
  const [hasAccess, refreshAccess] = useToolkitAccess();

  if (!hasAccess) {
    return (
      <Screen>
        <Paywall
          title="Driver Score"
          priceText="$10/mes"
          features={[
            'Tu puntaje diario de conductor (0-100)',
            'Desglose: $/hora, $/milla, millas vacías, espera y combustible',
            'Tu mejor plataforma y tu mejor franja del día',
          ]}
          onBuy={async () => {
            await subscribeToolkit();
            refreshAccess();
          }}
          onRestore={async () => {
            await restorePurchases();
            refreshAccess();
          }}
        />
      </Screen>
    );
  }

  return <ScoreContent />;
}

function ScoreContent() {
  const [date, setDate] = useState<string>(todayISO());
  const [entries, setEntries] = useState<EarningEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (dateISO: string) => {
      setLoading(true);
      try {
        const db = getDb();
        setEntries(
          db.getAllSync<EarningEntry>(
            'SELECT * FROM earnings WHERE date = ?',
            [dateISO],
          ),
        );
        const dayStart = new Date(`${dateISO}T00:00:00`).getTime();
        const dayEnd = new Date(`${dateISO}T23:59:59`).getTime();
        setTrips(
          db
            .getAllSync<Trip>('SELECT * FROM trips')
            .filter(
              (t) =>
                t.startTime != null &&
                t.startTime >= dayStart &&
                t.startTime <= dayEnd,
            ),
        );
      } catch (err) {
        console.warn('[score] carga falló:', err);
        setEntries([]);
        setTrips([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(date);
  }, [date, load]);

  const totals = useMemo(() => {
    let earnings = 0;
    let miles = 0;
    let hours = 0;
    let waitMin = 0;
    let gas = 0;
    for (const e of entries) {
      earnings += (e.earnings ?? 0) + (e.tips ?? 0);
      miles += e.miles ?? 0;
      hours += e.hours ?? 0;
      waitMin += e.waitMinutes ?? 0;
      gas += e.gas ?? 0;
    }
    return { earnings, miles, hours, waitMin, gas };
  }, [entries]);

  const breakdown: ScoreBreakdown | null = useMemo(() => {
    if (entries.length === 0) return null;
    const { earnings, miles, hours, waitMin, gas } = totals;

    const perHour = hours > 0 ? earnings / hours : 0;
    const perMile = miles > 0 ? earnings / miles : 0;
    // Heurística simple documentada: millas vacías estimadas.
    const deadMiles = Math.max(0, miles - earnings / EARNINGS_PER_LOADED_MILE);
    const deadRatio = miles > 0 ? deadMiles / miles : 0;
    const waitPerHour = hours > 0 ? waitMin / hours : 0;
    const fuelPerMile =
      gas > 0 && miles > 0 ? gas / miles : DEFAULT_FUEL_PER_MILE;

    const cHour = clamp01(perHour / 40) * 30;
    const cMile = clamp01(perMile / 3) * 25;
    const cDead = (1 - deadRatio) * 15;
    const cWait = Math.max(0, 1 - waitPerHour / 20) * 10;
    const cFuel = Math.max(0, 1 - fuelPerMile / 0.6) * 20;

    return {
      perHour,
      perMile,
      deadMiles,
      deadRatio,
      waitPerHour,
      fuelPerMile,
      cHour,
      cMile,
      cDead,
      cWait,
      cFuel,
      total: Math.round(cHour + cMile + cDead + cWait + cFuel),
    };
  }, [entries, totals]);

  /** Mejor plataforma del día: mayor $/hora (desde earnings). */
  const bestPlatform: { name: string; perHour: number } | null = useMemo(() => {
    const byPlatform = new Map<string, { earnings: number; hours: number }>();
    for (const e of entries) {
      const prev = byPlatform.get(e.platform) ?? { earnings: 0, hours: 0 };
      prev.earnings += (e.earnings ?? 0) + (e.tips ?? 0);
      prev.hours += e.hours ?? 0;
      byPlatform.set(e.platform, prev);
    }
    let best: { name: string; perHour: number } | null = null;
    for (const [pid, v] of byPlatform) {
      if (v.hours <= 0) continue;
      const perHour = v.earnings / v.hours;
      if (!best || perHour > best.perHour) {
        best = {
          name: PLATFORMS.find((p) => p.id === pid)?.name ?? pid,
          perHour,
        };
      }
    }
    return best;
  }, [entries]);

  /** Franja de 3h con más actividad del día (desde trips reales). */
  const bestSlot: { slot: string; trips: number } | null = useMemo(() => {
    if (trips.length === 0) return null;
    const bySlot = new Map<string, number>();
    for (const t of trips) {
      if (t.startTime == null) continue;
      const label = slotLabel(new Date(t.startTime).getHours());
      bySlot.set(label, (bySlot.get(label) ?? 0) + 1);
    }
    let best: { slot: string; trips: number } | null = null;
    for (const [slot, count] of bySlot) {
      if (!best || count > best.trips) best = { slot, trips: count };
    }
    return best;
  }, [trips]);

  return (
    <Screen>
      <Text style={styles.heading}>Driver Score</Text>

      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setDate(shiftDay(date, -1))}
        >
          <Text style={styles.dateBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dateMain}>
          <Text style={styles.dateText}>{fmtDateLong(date)}</Text>
          {date !== todayISO() && (
            <TouchableOpacity onPress={() => setDate(todayISO())}>
              <Text style={styles.todayLink}>Volver a hoy</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.dateBtn}
          onPress={() => setDate(shiftDay(date, 1))}
        >
          <Text style={styles.dateBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={GREEN} />
      ) : !breakdown ? (
        <View style={styles.emptyBox}>
          <Text style={styles.body}>
            No hay registros para este día. Cuando registres tus ganancias en
            el módulo de Ganancias, aquí verás tu puntaje.
          </Text>
        </View>
      ) : (
        <View>
          <View
            style={[
              styles.scoreCircle,
              { borderColor: scoreColor(breakdown.total) },
            ]}
          >
            <Text style={styles.scoreIcon}>{scoreIcon(breakdown.total)}</Text>
            <Text
              style={[styles.scoreValue, { color: scoreColor(breakdown.total) }]}
            >
              {breakdown.total}
            </Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>

          <Text style={styles.sectionTitle}>Desglose del puntaje</Text>
          <ScoreRow
            label="$/hora (30 pts)"
            detail={`${fmtMoney(breakdown.perHour)}/h`}
            points={breakdown.cHour}
            max={30}
          />
          <ScoreRow
            label="$/milla (25 pts)"
            detail={`${fmtMoney(breakdown.perMile)}/mi`}
            points={breakdown.cMile}
            max={25}
          />
          <ScoreRow
            label="Millas vacías (15 pts)"
            detail={`${fmtMiles(breakdown.deadMiles)} vacías (est.)`}
            points={breakdown.cDead}
            max={15}
          />
          <ScoreRow
            label="Tiempo de espera (10 pts)"
            detail={`${breakdown.waitPerHour.toFixed(1)} min/h`}
            points={breakdown.cWait}
            max={10}
          />
          <ScoreRow
            label="Combustible (20 pts)"
            detail={`${fmtMoney(breakdown.fuelPerMile)}/mi`}
            points={breakdown.cFuel}
            max={20}
          />

          <Text style={styles.sectionTitle}>Lo mejor de tu día</Text>
          <View style={styles.cardsRow}>
            <StatCard
              label="Ganancia promedio"
              value={`${fmtMoney(breakdown.perHour)}/h`}
              sub={fmtMoney(totals.earnings) + ' en total'}
            />
            <StatCard
              label="Costo combustible"
              value={`${fmtMoney(breakdown.fuelPerMile)}/mi`}
              sub={fmtMiles(totals.miles) + ' recorridas'}
            />
          </View>
          <View style={styles.cardsRow}>
            <StatCard
              label="Mejor plataforma"
              value={bestPlatform ? bestPlatform.name : '—'}
              sub={
                bestPlatform
                  ? `${fmtMoney(bestPlatform.perHour)}/h`
                  : 'Sin datos'
              }
            />
            <StatCard
              label="Franja con más actividad"
              value={bestSlot ? bestSlot.slot : '—'}
              sub={
                bestSlot
                  ? `${bestSlot.trips} viaje${bestSlot.trips === 1 ? '' : 's'}`
                  : 'Sin viajes'
              }
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

function ScoreRow({
  label,
  detail,
  points,
  max,
}: {
  label: string;
  detail: string;
  points: number;
  max: number;
}) {
  const pct = Math.max(0, Math.min(1, points / max));
  const barColor = pct >= 0.75 ? GREEN : pct >= 0.5 ? YELLOW : RED;
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreRowTop}>
        <Text style={styles.scoreRowLabel}>{label}</Text>
        <Text style={styles.scoreRowDetail}>
          {detail} · {points.toFixed(1)}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: barColor }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: GREEN,
  },
  dateMain: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0A',
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  todayLink: {
    fontSize: 13,
    color: GREEN,
    fontWeight: '600',
    marginTop: 2,
  },
  loader: {
    marginVertical: 24,
  },
  emptyBox: {
    paddingVertical: 24,
  },
  body: {
    fontSize: 15,
    color: '#0A0A0A',
    lineHeight: 22,
  },
  scoreCircle: {
    alignSelf: 'center',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  scoreIcon: {
    fontSize: 22,
  },
  scoreValue: {
    fontSize: 44,
    fontWeight: '800',
  },
  scoreMax: {
    fontSize: 14,
    color: '#6B7280',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 10,
    marginTop: 16,
  },
  scoreRow: {
    marginBottom: 12,
  },
  scoreRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  scoreRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  scoreRowDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
});
