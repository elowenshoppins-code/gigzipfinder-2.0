/**
 * Pantalla "Ganancias": captura diaria de turnos y estadísticas.
 * Requiere la suscripción del toolkit ($10/mes); si no hay acceso se
 * muestra el Paywall.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardType,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../../src/components/Screen';
import { StatCard } from '../../src/components/StatCard';
import { Paywall } from '../../src/components/Paywall';
import { getDb } from '../../src/db/database';
import type { EarningEntry } from '../../src/db/database';
import { uid, fmtMoney, fmtMiles, todayISO, isoDate } from '../../src/utils/format';
import {
  useToolkitAccess,
  subscribeToolkit,
  restorePurchases,
} from '../../src/services/monetization';
import { useStrings } from '../../src/i18n';
import { theme } from '../../src/theme';

type RangeMode = 'day' | 'week' | 'month';

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

function rangeFor(mode: RangeMode, date: string): { start: string; end: string } {
  if (mode === 'day') return { start: date, end: addDays(date, 1) };
  if (mode === 'week') return { start: addDays(date, -6), end: addDays(date, 1) };
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end };
}

function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Devuelve el número o null si no es un número válido. Vacío = 0. */
function parseNum(raw: string): number | null {
  if (raw.trim() === '') return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

function Field({
  label,
  value,
  onChange,
  keyboard = 'decimal-pad',
  placeholder = '0',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: KeyboardType;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
      />
    </View>
  );
}

export default function EarningsScreen() {
  const t = useStrings();
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <EarningsContent />
      ) : (
        <Paywall
          title={t.earnings.paywallTitle}
          priceText={t.common.perMonth}
          features={t.earnings.paywallFeatures}
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

function EarningsContent() {
  const t = useStrings();

  const PLATFORMS = [
    'Instacart',
    'DoorDash',
    'Uber Eats',
    'Spark',
    'Lyft',
    'Roadie',
    t.earnings.platformOther,
  ];

  const MODES: { key: RangeMode; label: string }[] = [
    { key: 'day', label: t.earnings.modeDay },
    { key: 'week', label: t.earnings.modeWeek },
    { key: 'month', label: t.earnings.modeMonth },
  ];

  const [date, setDate] = useState(todayISO());
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [zone, setZone] = useState('');
  const [earnings, setEarnings] = useState('');
  const [tips, setTips] = useState('');
  const [miles, setMiles] = useState('');
  const [hours, setHours] = useState('');
  const [waitMinutes, setWaitMinutes] = useState('');
  const [gas, setGas] = useState('');
  const [tolls, setTolls] = useState('');
  const [parking, setParking] = useState('');

  const [mode, setMode] = useState<RangeMode>('day');
  const [entries, setEntries] = useState<EarningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { start, end } = rangeFor(mode, date);
      const rows = await getDb().getAllAsync<EarningEntry>(
        `SELECT id, date, platform, zone, earnings, tips, miles, hours,
                waitMinutes, gas, tolls, parking
         FROM earnings
         WHERE date >= ? AND date < ?
         ORDER BY date DESC, platform ASC`,
        [start, end],
      );
      setEntries(rows);
    } catch {
      // Sin datos o tabla aún no lista: se muestra el estado vacío.
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [date, mode]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const save = async () => {
    if (!isValidISODate(date)) {
      Alert.alert(t.common.invalidDate, t.common.invalidDateMsg);
      return;
    }
    const fields: [key: string, label: string, raw: string][] = [
      ['earnings', t.earnings.fEarnings, earnings],
      ['tips', t.earnings.fTips, tips],
      ['miles', t.earnings.fMiles, miles],
      ['hours', t.earnings.fHours, hours],
      ['wait', t.earnings.fWait, waitMinutes],
      ['gas', t.earnings.fGas, gas],
      ['tolls', t.earnings.fTolls, tolls],
      ['parking', t.earnings.fParking, parking],
    ];
    const parsed: Record<string, number> = {};
    for (const [key, label, raw] of fields) {
      const v = parseNum(raw);
      if (v === null || v < 0) {
        Alert.alert(t.earnings.checkNumbers, t.earnings.checkNumbersMsg(label));
        return;
      }
      parsed[key] = v;
    }
    if (parsed['hours'] <= 0) {
      Alert.alert(t.earnings.hoursRequired, t.earnings.hoursRequiredMsg);
      return;
    }

    setSaving(true);
    try {
      await getDb().runAsync(
        `INSERT INTO earnings
           (id, date, platform, zone, earnings, tips, miles, hours, waitMinutes, gas, tolls, parking)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid(),
          date,
          platform,
          zone.trim() ? zone.trim() : null,
          parsed['earnings'],
          parsed['tips'],
          parsed['miles'],
          parsed['hours'],
          parsed['wait'],
          parsed['gas'],
          parsed['tolls'],
          parsed['parking'],
        ],
      );
      setEarnings('');
      setTips('');
      setMiles('');
      setHours('');
      setWaitMinutes('');
      setGas('');
      setTolls('');
      setParking('');
      await load();
      Alert.alert(t.earnings.saved, t.earnings.savedMsg);
    } catch {
      Alert.alert(t.earnings.saveError, t.earnings.saveErrorMsg);
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = (id: string) => {
    Alert.alert(t.earnings.delTitle, t.earnings.delMsg, [
      { text: t.common.cancelar, style: 'cancel' },
      {
        text: t.common.eliminar,
        style: 'destructive',
        onPress: async () => {
          try {
            await getDb().runAsync('DELETE FROM earnings WHERE id = ?', [id]);
            await load();
          } catch {
            Alert.alert(t.earnings.delError, t.earnings.delErrorMsg);
          }
        },
      },
    ]);
  };

  // ---- Agregados del rango ----
  const agg = entries.reduce(
    (a, e) => ({
      earnings: a.earnings + num(e.earnings),
      tips: a.tips + num(e.tips),
      miles: a.miles + num(e.miles),
      hours: a.hours + num(e.hours),
      waitMinutes: a.waitMinutes + num(e.waitMinutes),
      gas: a.gas + num(e.gas),
      tolls: a.tolls + num(e.tolls),
      parking: a.parking + num(e.parking),
    }),
    { earnings: 0, tips: 0, miles: 0, hours: 0, waitMinutes: 0, gas: 0, tolls: 0, parking: 0 },
  );

  const gross = agg.earnings + agg.tips;
  const perHour = agg.hours > 0 ? gross / agg.hours : 0;
  const perMile = agg.miles > 0 ? gross / agg.miles : 0;
  const gasPerMile = agg.miles > 0 ? agg.gas / agg.miles : 0;
  const net = gross - agg.gas - agg.tolls - agg.parking;
  const netPerHour = agg.hours > 0 ? net / agg.hours : 0;

  const modeLabel =
    mode === 'day'
      ? t.earnings.modeLabelDay
      : mode === 'week'
        ? t.earnings.modeLabelWeek
        : t.earnings.modeLabelMonth;

  return (
    <View>
      <Text style={styles.title}>{t.earnings.title}</Text>

      {/* ---------- Formulario ---------- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.earnings.formTitle}</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.earnings.fieldDate}</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
            placeholder={t.earnings.datePh}
            placeholderTextColor={theme.textMuted}
          />
        </View>

        <Text style={styles.fieldLabel}>{t.earnings.fieldPlatform}</Text>
        <View style={styles.chips}>
          {PLATFORMS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, platform === p && styles.chipActive]}
              onPress={() => setPlatform(p)}
            >
              <Text style={[styles.chipText, platform === p && styles.chipTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.earnings.fieldZone}</Text>
          <TextInput
            style={styles.input}
            value={zone}
            onChangeText={setZone}
            placeholder={t.earnings.zonePh}
            placeholderTextColor={theme.textMuted}
          />
        </View>

        <View style={styles.grid}>
          <Field label={t.earnings.fEarnings} value={earnings} onChange={setEarnings} />
          <Field label={t.earnings.fTips} value={tips} onChange={setTips} />
          <Field label={t.earnings.fMiles} value={miles} onChange={setMiles} />
          <Field label={t.earnings.fHours} value={hours} onChange={setHours} />
          <Field label={t.earnings.fWait} value={waitMinutes} onChange={setWaitMinutes} />
          <Field label={t.earnings.fGas} value={gas} onChange={setGas} />
          <Field label={t.earnings.fTolls} value={tolls} onChange={setTolls} />
          <Field label={t.earnings.fParking} value={parking} onChange={setParking} />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? t.earnings.saving : t.earnings.saveShift}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ---------- Selector de rango ---------- */}
      <View style={styles.segmented}>
        {MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.segment, mode === m.key && styles.segmentActive]}
            onPress={() => {
              setMode(m.key);
              setLoading(true);
            }}
          >
            <Text style={[styles.segmentText, mode === m.key && styles.segmentTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

      {/* ---------- Estadísticas ---------- */}
      <Text style={styles.sectionTitle}>{t.earnings.summaryTitle(modeLabel)}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t.earnings.emptyPeriod}</Text>
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <StatCard label={t.earnings.statGrossHour} value={fmtMoney(perHour)} sub={t.earnings.recordsCount(entries.length)} />
          <StatCard label={t.earnings.statNet} value={fmtMoney(net)} sub={t.earnings.netSub} />
          <StatCard label={t.earnings.statNetHour} value={fmtMoney(netPerHour)} />
          <StatCard label={t.earnings.statGrossMile} value={fmtMoney(perMile)} />
          <StatCard label={t.earnings.statGasMile} value={fmtMoney(gasPerMile)} sub={fmtMiles(agg.miles)} />
          <StatCard label={t.earnings.statGrossTotal} value={fmtMoney(gross)} sub={t.earnings.hoursWorked(agg.hours.toFixed(1))} />
        </View>
      )}

      {/* ---------- Lista ---------- */}
      <Text style={styles.sectionTitle}>{t.earnings.listTitle}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t.earnings.emptyList}</Text>
        </View>
      ) : (
        entries.map((e) => (
          <View key={e.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle}>
                {e.date} · {e.platform}
                {e.zone ? ` · ${e.zone}` : ''}
              </Text>
              <Text style={styles.rowSub}>
                {fmtMoney(num(e.earnings) + num(e.tips))} · {fmtMiles(num(e.miles))} ·{' '}
                {num(e.hours).toFixed(1)} {t.earnings.hoursUnit}
                {num(e.waitMinutes) > 0 ? t.earnings.waitMin(num(e.waitMinutes).toFixed(0)) : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => removeEntry(e.id)}
            >
              <Text style={styles.deleteText}>{t.earnings.deleteBtn}</Text>
            </TouchableOpacity>
          </View>
        ))
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
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radiusCard,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 10,
  },
  field: {
    flex: 1,
    minWidth: '46%',
    marginBottom: 10,
    marginRight: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textBody,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: theme.bg,
  },
  chipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  chipText: {
    fontSize: 14,
    color: theme.textBody,
  },
  chipTextActive: {
    color: theme.text,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  saveButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: theme.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 10,
    marginTop: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  loader: {
    marginVertical: 20,
  },
  empty: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 4,
  },
  rowSub: {
    fontSize: 13,
    color: theme.textMuted,
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteText: {
    color: theme.danger,
    fontSize: 14,
    fontWeight: '600',
  },
});
