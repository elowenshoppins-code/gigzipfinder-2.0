/**
 * Pantalla "Multi-App": compara el rendimiento por plataforma.
 * Tabla del día (o la semana) con Ganado | Millas | $/hora y la tarjeta
 * de "Mejor plataforma". Requiere la suscripción del toolkit ($10/mes).
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { Paywall } from '../src/components/Paywall';
import { getDb } from '../src/db/database';
import { fmtMoney, fmtMiles, todayISO, isoDate } from '../src/utils/format';
import {
  useToolkitAccess,
  subscribeToolkit,
  restorePurchases,
} from '../src/services/monetization';

type Period = 'day' | 'week';

interface PlatformRow {
  platform: string;
  earned: number;
  miles: number;
  hours: number;
  shifts: number;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

export default function MultiAppScreen() {
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <MultiAppContent />
      ) : (
        <Paywall
          title="Multi-App"
          priceText="$10/mes"
          features={[
            'Compara tus plataformas lado a lado',
            'Descubre cuál te paga mejor por hora',
            'Vista por día o por semana',
            'Toma decisiones con datos, no con corazonadas',
          ]}
          onBuy={async () => {
            await subscribeToolkit();
            refreshAccess();
          }}
          onRestore={() => {
            restorePurchases();
            refreshAccess();
          }}
        />
      )}
    </Screen>
  );
}

function MultiAppContent() {
  const [date, setDate] = useState(todayISO());
  const [period, setPeriod] = useState<Period>('day');
  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const start = period === 'day' ? date : addDays(date, -6);
      const end = addDays(date, 1);
      const data = await getDb().getAllAsync<PlatformRow>(
        `SELECT platform,
                COALESCE(SUM(earnings + tips), 0) AS earned,
                COALESCE(SUM(miles), 0) AS miles,
                COALESCE(SUM(hours), 0) AS hours,
                COUNT(*) AS shifts
         FROM earnings
         WHERE date >= ? AND date < ?
         GROUP BY platform
         ORDER BY earned DESC`,
        [start, end],
      );
      setRows(
        data.map((r) => ({
          platform: r.platform || 'Otro',
          earned: num(r.earned),
          miles: num(r.miles),
          hours: num(r.hours),
          shifts: num(r.shifts),
        })),
      );
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [date, period]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const perHour = (r: PlatformRow): number => (r.hours > 0 ? r.earned / r.hours : 0);

  // Mejor plataforma: mayor $/hora con al menos 1 hora registrada.
  const candidates = rows.filter((r) => r.hours >= 1);
  const best =
    candidates.length > 0
      ? candidates.reduce((a, b) => (perHour(b) > perHour(a) ? b : a))
      : null;

  const periodLabel = period === 'day' ? 'hoy' : 'esta semana';

  return (
    <View>
      <Text style={styles.title}>📊 Multi-App</Text>

      {/* Selector día / semana */}
      <View style={styles.segmented}>
        {(
          [
            { key: 'day', label: 'Día' },
            { key: 'week', label: 'Semana' },
          ] as { key: Period; label: string }[]
        ).map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.segment, period === p.key && styles.segmentActive]}
            onPress={() => {
              setPeriod(p.key);
              setLoading(true);
            }}
          >
            <Text
              style={[styles.segmentText, period === p.key && styles.segmentTextActive]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Navegación de fecha */}
      <View style={styles.dateNav}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => {
            setDate(addDays(date, -1));
            setLoading(true);
          }}
        >
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{date}</Text>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => {
            setDate(addDays(date, 1));
            setLoading(true);
          }}
        >
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Mejor plataforma */}
      {!loading && best && (
        <View style={styles.trophy}>
          <Text style={styles.trophyTitle}>🏆 Mejor plataforma {periodLabel}</Text>
          <Text style={styles.trophyName}>{best.platform}</Text>
          <Text style={styles.trophySub}>
            {fmtMoney(perHour(best))}/hora · {best.shifts} turno(s) ·{' '}
            {fmtMiles(best.miles)}
          </Text>
        </View>
      )}
      {!loading && !best && rows.length > 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            Aún no hay suficientes datos para elegir una ganadora (se necesita al
            menos 1 hora registrada por plataforma).
          </Text>
        </View>
      )}

      {/* Tabla */}
      <Text style={styles.sectionTitle}>Por plataforma</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            📝 Sin registros para este período.{'\n'}Agrega tus ganancias en la
            pestaña Ganancias.
          </Text>
        </View>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.cell, styles.cellPlatform, styles.headerText]}>
              Plataforma
            </Text>
            <Text style={[styles.cell, styles.headerText, styles.num]}>Ganado</Text>
            <Text style={[styles.cell, styles.headerText, styles.num]}>Millas</Text>
            <Text style={[styles.cell, styles.headerText, styles.num]}>$/hora</Text>
          </View>
          {rows.map((r) => {
            const isBest = best !== null && r.platform === best.platform;
            return (
              <View
                key={r.platform}
                style={[styles.tableRow, isBest && styles.bestRow]}
              >
                <Text style={[styles.cell, styles.cellPlatform, styles.cellText]}>
                  {isBest ? '🏆 ' : ''}
                  {r.platform}
                </Text>
                <Text style={[styles.cell, styles.cellText, styles.num]}>
                  {fmtMoney(r.earned)}
                </Text>
                <Text style={[styles.cell, styles.cellText, styles.num]}>
                  {fmtMiles(r.miles)}
                </Text>
                <Text style={[styles.cell, styles.cellText, styles.num]}>
                  {r.hours > 0 ? fmtMoney(perHour(r)) : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#0A0A0A',
    fontWeight: '700',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  navButton: {
    backgroundColor: '#F6F7F6',
    borderRadius: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  navButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#00A651',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
    minWidth: 120,
    textAlign: 'center',
  },
  trophy: {
    backgroundColor: '#FEF9E7',
    borderWidth: 1,
    borderColor: '#F5D547',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  trophyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92690E',
    marginBottom: 6,
  },
  trophyName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 4,
  },
  trophySub: {
    fontSize: 14,
    color: '#6B7280',
  },
  hint: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  hintText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 10,
  },
  loader: {
    marginVertical: 20,
  },
  empty: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  table: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableHeader: {
    backgroundColor: '#F6F7F6',
  },
  bestRow: {
    backgroundColor: '#FEFCE8',
  },
  cell: {
    flex: 1,
  },
  cellPlatform: {
    flex: 1.6,
  },
  cellText: {
    fontSize: 14,
    color: '#0A0A0A',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  num: {
    textAlign: 'right',
  },
});
