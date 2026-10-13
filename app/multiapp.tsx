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
import { useStrings } from '../src/i18n';
import { theme } from '../src/theme';

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
  const t = useStrings();
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <MultiAppContent />
      ) : (
        <Paywall
          title="Multi-App"
          priceText={t.common.perMonth}
          features={t.multiapp.paywallFeatures}
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
  const t = useStrings();
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
          platform: r.platform || t.multiapp.platformOther,
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
  }, [date, period, t]);

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

  const periodLabel = period === 'day' ? t.multiapp.periodToday : t.multiapp.periodWeek;

  return (
    <View>
      <Text style={styles.title}>{t.multiapp.title}</Text>

      {/* Selector día / semana */}
      <View style={styles.segmented}>
        {(
          [
            { key: 'day', label: t.common.dia },
            { key: 'week', label: t.common.semana },
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
          <Text style={styles.trophyTitle}>{t.multiapp.bestPlatform(periodLabel)}</Text>
          <Text style={styles.trophyName}>{best.platform}</Text>
          <Text style={styles.trophySub}>
            {fmtMoney(perHour(best))}{t.multiapp.perHourSuffix} · {t.multiapp.shiftsCount(best.shifts)} ·{' '}
            {fmtMiles(best.miles)}
          </Text>
        </View>
      )}
      {!loading && !best && rows.length > 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {t.multiapp.hintEmpty}
          </Text>
        </View>
      )}

      {/* Tabla */}
      <Text style={styles.sectionTitle}>{t.multiapp.byPlatform}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t.multiapp.emptyMsg}</Text>
        </View>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.cell, styles.cellPlatform, styles.headerText]}>
              {t.multiapp.colPlatform}
            </Text>
            <Text style={[styles.cell, styles.headerText, styles.num]}>{t.multiapp.colEarned}</Text>
            <Text style={[styles.cell, styles.headerText, styles.num]}>
              {t.multiapp.milesLabel}
            </Text>
            <Text style={[styles.cell, styles.headerText, styles.num]}>{t.multiapp.colPerHour}</Text>
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
    color: theme.text,
    marginBottom: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.card,
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
    backgroundColor: theme.card,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    color: theme.textMuted,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: theme.text,
    fontWeight: '700',
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  navButton: {
    backgroundColor: theme.card,
    borderRadius: theme.radiusPill,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  navButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.primary,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    minWidth: 120,
    textAlign: 'center',
  },
  trophy: {
    backgroundColor: theme.warningBg,
    borderWidth: 1,
    borderColor: theme.warning,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  trophyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.warning,
    marginBottom: 6,
  },
  trophyName: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 4,
  },
  trophySub: {
    fontSize: 14,
    color: theme.textMuted,
  },
  hint: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  hintText: {
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 10,
  },
  loader: {
    marginVertical: 20,
  },
  empty: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  table: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.bg,
    borderBottomWidth: 1,
    borderBottomColor: theme.card,
  },
  tableHeader: {
    backgroundColor: theme.card,
  },
  bestRow: {
    backgroundColor: theme.warningBg,
  },
  cell: {
    flex: 1,
  },
  cellPlatform: {
    flex: 1.6,
  },
  cellText: {
    fontSize: 14,
    color: theme.text,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
  },
  num: {
    textAlign: 'right',
  },
});
