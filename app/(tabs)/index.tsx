/**
 * Inicio (tab) — resumen del día y acceso a todos los módulos.
 *
 * Muestra: ganado hoy, horas, millas y $/hora (desde earnings + trips),
 * banner de datos demo con opción de borrarlos, y tarjetas de navegación
 * a cada módulo. Las tarjetas del toolkit muestran 🔒 sin suscripción.
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { StatCard } from '../../src/components/StatCard';
import { getDb, getSetting, type EarningEntry } from '../../src/db/database';
import { useToolkitAccess } from '../../src/services/monetization';
import { wipeDemoData } from '../../src/seed';
import { fmtMoney, fmtMiles, todayISO } from '../../src/utils/format';
import { useStrings } from '../../src/i18n';
import { theme } from '../../src/theme';

type NavCard = {
  emoji: string;
  title: string;
  desc: string;
  route: string;
  /** true = parte del toolkit ($10/mes); muestra 🔒 sin suscripción. */
  toolkit: boolean;
};

interface TodaySummary {
  earned: number;
  hours: number;
  miles: number;
}

function fmtHours(h: number): string {
  const r = Math.round(h * 10) / 10;
  return `${r} h`;
}

export default function HomeScreen() {
  const t = useStrings();
  const [toolkitAccess] = useToolkitAccess();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wiping, setWiping] = useState(false);

  const CARDS: NavCard[] = [
    { emoji: '📍', title: 'ZIP Finder', desc: t.home.zipDesc, route: '/zip', toolkit: false },
    { emoji: '🚗', title: t.home.milesTitle, desc: t.home.milesDesc, route: '/(tabs)/miles', toolkit: true },
    { emoji: '💵', title: t.home.earnTitle, desc: t.home.earnDesc, route: '/(tabs)/earnings', toolkit: true },
    { emoji: '📱', title: t.home.multiTitle, desc: t.home.multiDesc, route: '/multiapp', toolkit: true },
    { emoji: '⛽', title: t.home.gasTitle, desc: t.home.gasDesc, route: '/gas', toolkit: true },
    { emoji: '🧾', title: t.home.taxTitle, desc: t.home.taxDesc, route: '/taxes', toolkit: true },
    { emoji: '🛡️', title: t.home.appealTitle, desc: t.home.appealDesc, route: '/(tabs)/appeal', toolkit: true },
    { emoji: '⭐', title: t.home.scoreTitle, desc: t.home.scoreDesc, route: '/score', toolkit: true },
    { emoji: '🔥', title: t.home.hotTitle, desc: t.home.hotDesc, route: '/hotzones', toolkit: true },
    { emoji: '🗂️', title: t.home.vaultTitle, desc: t.home.vaultDesc, route: '/vault', toolkit: true },
    { emoji: '🤖', title: t.home.aiTitle, desc: t.home.aiDesc, route: '/(tabs)/gigai', toolkit: true },
    { emoji: '⚙️', title: t.home.settingsTitle, desc: t.home.settingsDesc, route: '/settings', toolkit: false },
  ];

  const load = useCallback(() => {
    setLoading(true);
    try {
      const db = getDb();
      const today = todayISO();

      // Ganancias de hoy (earnings + tips).
      let earned = 0;
      let hours = 0;
      let earnMiles = 0;
      try {
        const earnRows = db.getAllSync<Pick<EarningEntry, 'earnings' | 'tips' | 'hours' | 'miles'>>(
          'SELECT earnings, tips, hours, miles FROM earnings WHERE date = ?',
          [today],
        );
        for (const r of earnRows) {
          earned += (r.earnings ?? 0) + (r.tips ?? 0);
          hours += r.hours ?? 0;
          earnMiles += r.miles ?? 0;
        }
      } catch {
        /* tabla aún sin datos: se muestra en cero */
      }

      // Millas de trabajo de hoy (trips); respaldo: millas de earnings.
      let tripMiles = 0;
      try {
        const sod = new Date();
        sod.setHours(0, 0, 0, 0);
        const eod = new Date();
        eod.setHours(23, 59, 59, 999);
        const tripRows = db.getAllSync<{ distanceMiles: number }>(
          "SELECT distanceMiles FROM trips WHERE purpose = 'work' AND startTime >= ? AND startTime <= ?",
          [sod.getTime(), eod.getTime()],
        );
        for (const t of tripRows) tripMiles += t.distanceMiles ?? 0;
      } catch {
        /* tabla aún sin datos */
      }

      setSummary({ earned, hours, miles: tripMiles > 0 ? tripMiles : earnMiles });

      getSetting('seeded_v1')
        .then((v) => setIsDemo(v === '1'))
        .catch(() => setIsDemo(false));
    } catch (err) {
      console.warn('[home] load falló:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(load);

  const handleWipe = useCallback(async () => {
    setWiping(true);
    try {
      await wipeDemoData();
    } finally {
      setWiping(false);
      load();
    }
  }, [load]);

  const perHour = summary && summary.hours > 0 ? summary.earned / summary.hours : 0;

  return (
    <Screen>
      <Text style={styles.title}>Gig ZipFinder</Text>
      <Text style={styles.subtitle}>{t.home.subtitle}</Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.primary} />
      ) : (
        <View>
          <View style={styles.statsRow}>
            <StatCard label={t.home.earnedToday} value={fmtMoney(summary?.earned ?? 0)} />
            <StatCard label={t.home.hours} value={fmtHours(summary?.hours ?? 0)} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label={t.home.miles} value={fmtMiles(summary?.miles ?? 0)} />
            <StatCard label={t.home.perHourLabel} value={`${fmtMoney(perHour)}${t.home.perHourSuffix}`} />
          </View>
        </View>
      )}

      {isDemo ? (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>{t.home.demoBanner}</Text>
          <Pressable
            style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}
            onPress={handleWipe}
            disabled={wiping}
          >
            {wiping ? (
              <ActivityIndicator color={theme.onPrimary} size="small" />
            ) : (
              <Text style={styles.demoButtonText}>{t.home.wipeDemo}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>{t.home.modules}</Text>
      <View style={styles.grid}>
        {CARDS.map((card) => {
          const locked = card.toolkit && !toolkitAccess;
          return (
            <Pressable
              key={card.route}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => router.push(card.route as never)}
            >
              <Text style={styles.cardEmoji}>
                {card.emoji}
                {locked ? ' 🔒' : ''}
              </Text>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDesc}>{card.desc}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.text,
  },
  subtitle: {
    fontSize: 15,
    color: theme.textMuted,
    marginBottom: 12,
    marginTop: 2,
  },
  loader: {
    marginVertical: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  demoBanner: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warning,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  demoText: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  demoButton: {
    backgroundColor: theme.danger,
    borderRadius: theme.radiusPill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  demoButtonText: {
    color: theme.onPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginTop: 14,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radiusCard,
    padding: 14,
    width: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: theme.textMuted,
  },
});
