/**
 * Hot Zones — "¿Dónde me conviene trabajar ahora?"
 *
 * Ranking de zonas desde el HISTORIAL del usuario: agrupa los registros de
 * `earnings` por zona y calcula el $/hora promedio de cada una.
 *
 * NOTA DE DISEÑO (honestidad de datos): la tabla `earnings` no guarda la hora
 * de inicio del turno, por lo que el $/hora por franja de 3h no es calculable
 * desde esos registros sin inventar datos. En su lugar:
 *  - el ranking principal es por ZONA (desde earnings: $/hora + nº registros);
 *  - la sección "Tus franjas con más actividad" usa la tabla `trips`
 *    (startTime real) para mostrar en qué franjas de 3h has trabajado más.
 * La copia obligatoria en pantalla deja claro que no predecimos órdenes.
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
import { fmtMoney } from '../src/utils/format';
import { PLATFORMS } from '../src/services/appeal';
import {
  restorePurchases,
  subscribeToolkit,
  useToolkitAccess,
} from '../src/services/monetization';

const GREEN = '#00A651';

interface ZoneStat {
  zone: string;
  totalEarnings: number;
  totalHours: number;
  count: number;
  perHour: number;
}

interface SlotStat {
  slot: string;
  trips: number;
}

/** Etiqueta de franja de 3h para una hora del día (0-23). */
function slotLabel(hour: number): string {
  const start = Math.floor(hour / 3) * 3;
  return `${start}:00 – ${start + 3}:00`;
}

const ALL = 'all';

export default function HotZonesScreen() {
  const [hasAccess, refreshAccess] = useToolkitAccess();

  if (!hasAccess) {
    return (
      <Screen>
        <Paywall
          title="Hot Zones"
          priceText="$10/mes"
          features={[
            'Descubre en qué zonas te ha ido mejor',
            'Ranking por $/hora basado en tu historial',
            'Tus franjas horarias con más actividad',
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

  return <HotZonesContent />;
}

function HotZonesContent() {
  const [platform, setPlatform] = useState<string>(ALL);
  const [entries, setEntries] = useState<EarningEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = getDb();
      setEntries(
        db.getAllSync<EarningEntry>('SELECT * FROM earnings ORDER BY date DESC'),
      );
      setTrips(db.getAllSync<Trip>('SELECT * FROM trips ORDER BY startTime DESC'));
    } catch (err) {
      console.warn('[hotzones] carga falló:', err);
      setEntries([]);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      platform === ALL
        ? entries
        : entries.filter((e) => e.platform === platform),
    [entries, platform],
  );

  /** Ranking por zona: $/hora promedio + nº de registros. Top 5. */
  const zoneRanking: ZoneStat[] = useMemo(() => {
    const byZone = new Map<string, ZoneStat>();
    for (const e of filtered) {
      const zone = e.zone && e.zone.trim() !== '' ? e.zone : 'Sin zona';
      const prev = byZone.get(zone) ?? {
        zone,
        totalEarnings: 0,
        totalHours: 0,
        count: 0,
        perHour: 0,
      };
      prev.totalEarnings += (e.earnings ?? 0) + (e.tips ?? 0);
      prev.totalHours += e.hours ?? 0;
      prev.count += 1;
      byZone.set(zone, prev);
    }
    return [...byZone.values()]
      .map((z) => ({
        ...z,
        perHour: z.totalHours > 0 ? z.totalEarnings / z.totalHours : 0,
      }))
      .sort((a, b) => b.perHour - a.perHour)
      .slice(0, 5);
  }, [filtered]);

  /** Franjas de 3h con más actividad (desde trips reales). */
  const topSlots: SlotStat[] = useMemo(() => {
    const bySlot = new Map<string, number>();
    for (const t of trips) {
      if (t.startTime == null) continue;
      const hour = new Date(t.startTime).getHours();
      const label = slotLabel(hour);
      bySlot.set(label, (bySlot.get(label) ?? 0) + 1);
    }
    return [...bySlot.entries()]
      .map(([slot, count]) => ({ slot, trips: count }))
      .sort((a, b) => b.trips - a.trips)
      .slice(0, 3);
  }, [trips]);

  const platformName =
    platform === ALL
      ? 'Todas las plataformas'
      : PLATFORMS.find((p) => p.id === platform)?.name ?? platform;

  return (
    <Screen>
      <Text style={styles.heading}>Hot Zones</Text>
      <Text style={styles.question}>¿Dónde me conviene trabajar ahora?</Text>

      <Text style={styles.label}>Plataforma</Text>
      <View style={styles.chips}>
        <TouchableOpacity
          style={[styles.chip, platform === ALL && styles.chipActive]}
          onPress={() => setPlatform(ALL)}
        >
          <Text style={[styles.chipText, platform === ALL && styles.chipTextActive]}>
            Todas
          </Text>
        </TouchableOpacity>
        {PLATFORMS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, platform === p.id && styles.chipActive]}
            onPress={() => setPlatform(p.id)}
          >
            <Text
              style={[styles.chipText, platform === p.id && styles.chipTextActive]}
            >
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={GREEN} />
      ) : zoneRanking.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.body}>
            Aún no tienes registros de ganancias
            {platform === ALL ? '' : ` en ${platformName}`}. Cuando registres
            tus turnos en Ganancias, aquí verás en qué zonas te va mejor.
          </Text>
        </View>
      ) : (
        <View>
          <Text style={styles.sectionTitle}>
            Tus mejores zonas · {platformName}
          </Text>
          {zoneRanking.map((z, i) => (
            <View key={z.zone} style={styles.zoneRow}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={styles.zoneMain}>
                <Text style={styles.zoneName}>{z.zone}</Text>
                <Text style={styles.zoneSub}>
                  {z.count} registro{z.count === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.zonePerHour}>{fmtMoney(z.perHour)}/h</Text>
            </View>
          ))}

          {topSlots.length > 0 && (
            <View>
              <Text style={styles.sectionTitle}>
                Tus franjas con más actividad
              </Text>
              <View style={styles.cardsRow}>
                {topSlots.map((s) => (
                  <StatCard
                    key={s.slot}
                    label={s.slot}
                    value={`${s.trips}`}
                    sub={s.trips === 1 ? 'viaje' : 'viajes'}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Copia honesta obligatoria */}
      <View style={styles.honestBox}>
        <Text style={styles.honestText}>
          Basado en tu historial. No predecimos dónde aparecerán órdenes; son
          zonas donde a TI te ha ido mejor.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 4,
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    borderColor: GREEN,
    backgroundColor: '#EAF7EF',
  },
  chipText: {
    fontSize: 14,
    color: '#0A0A0A',
  },
  chipTextActive: {
    color: GREEN,
    fontWeight: '700',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 12,
    marginTop: 4,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  rank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAF7EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 16,
    fontWeight: '800',
    color: GREEN,
  },
  zoneMain: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  zoneSub: {
    fontSize: 13,
    color: '#6B7280',
  },
  zonePerHour: {
    fontSize: 18,
    fontWeight: '800',
    color: GREEN,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  honestBox: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  honestText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
    fontStyle: 'italic',
  },
});
