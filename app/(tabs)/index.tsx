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

type NavCard = {
  emoji: string;
  title: string;
  desc: string;
  route: string;
  /** true = parte del toolkit ($10/mes); muestra 🔒 sin suscripción. */
  toolkit: boolean;
};

const CARDS: NavCard[] = [
  { emoji: '📍', title: 'ZIP Finder', desc: 'Códigos ZIP con alta disponibilidad por IA', route: '/zip', toolkit: false },
  { emoji: '🚗', title: 'Millas', desc: 'Registra y sigue tus millas de trabajo', route: '/(tabs)/miles', toolkit: true },
  { emoji: '💵', title: 'Ganancias', desc: 'Tus ingresos por app y por día', route: '/(tabs)/earnings', toolkit: true },
  { emoji: '📱', title: 'Multi-App', desc: 'Compara tus apps de gig', route: '/multiapp', toolkit: true },
  { emoji: '⛽', title: 'Gasolina', desc: 'Controla tu gasto de combustible', route: '/gas', toolkit: true },
  { emoji: '🧾', title: 'Tax Center', desc: 'Deducciones e impuestos estimados', route: '/taxes', toolkit: true },
  { emoji: '🛡️', title: 'Apelación', desc: 'Appeal AI contra desactivaciones', route: '/(tabs)/appeal', toolkit: true },
  { emoji: '⭐', title: 'Driver Score', desc: 'Tu puntaje como conductor', route: '/score', toolkit: true },
  { emoji: '🔥', title: 'Hot Zones', desc: 'Zonas calientes cerca de ti', route: '/hotzones', toolkit: true },
  { emoji: '🗂️', title: 'Document Vault', desc: 'Tus documentos importantes', route: '/vault', toolkit: true },
  { emoji: '🤖', title: 'Gig AI', desc: 'Asistente con tus datos locales', route: '/(tabs)/gigai', toolkit: true },
  { emoji: '⚙️', title: 'Ajustes', desc: 'Configuración de la app', route: '/settings', toolkit: false },
];

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
  const [toolkitAccess] = useToolkitAccess();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wiping, setWiping] = useState(false);

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
      <Text style={styles.subtitle}>Tu resumen de hoy</Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#00A651" />
      ) : (
        <View>
          <View style={styles.statsRow}>
            <StatCard label="Ganado hoy" value={fmtMoney(summary?.earned ?? 0)} />
            <StatCard label="Horas" value={fmtHours(summary?.hours ?? 0)} />
          </View>
          <View style={styles.statsRow}>
            <StatCard label="Millas" value={fmtMiles(summary?.miles ?? 0)} />
            <StatCard label="$/hora" value={`${fmtMoney(perHour)}/h`} />
          </View>
        </View>
      )}

      {isDemo ? (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>Estás viendo datos de ejemplo</Text>
          <Pressable
            style={({ pressed }) => [styles.demoButton, pressed && styles.pressed]}
            onPress={handleWipe}
            disabled={wiping}
          >
            {wiping ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.demoButtonText}>Borrar datos demo</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Módulos</Text>
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
    color: '#0A0A0A',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
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
    backgroundColor: '#FFF7E6',
    borderColor: '#F5B301',
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
    color: '#0A0A0A',
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  demoButton: {
    backgroundColor: '#B42318',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  demoButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A0A0A',
    marginTop: 14,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 14,
    width: '48%',
    flexGrow: 1,
  },
  cardEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: '#6B7280',
  },
});
