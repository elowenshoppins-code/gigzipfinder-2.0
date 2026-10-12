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

const PLATFORMS = [
  'Instacart',
  'DoorDash',
  'Uber Eats',
  'Spark',
  'Lyft',
  'Roadie',
  'Otro',
];

type RangeMode = 'day' | 'week' | 'month';

const MODES: { key: RangeMode; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

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
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

export default function EarningsScreen() {
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <EarningsContent />
      ) : (
        <Paywall
          title="Ganancias"
          priceText="$10/mes"
          features={[
            'Registra tus ganancias diarias por plataforma',
            'Calcula tu bruto y neto por hora y por milla',
            'Compara tus días, semanas y meses',
            'Historial completo con opción de eliminar registros',
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

function EarningsContent() {
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
      Alert.alert(
        'Fecha inválida',
        'Escribe la fecha en formato AAAA-MM-DD (por ejemplo, 2026-10-12).',
      );
      return;
    }
    const fields: [string, string][] = [
      ['Ganancias', earnings],
      ['Propinas', tips],
      ['Millas', miles],
      ['Horas', hours],
      ['Minutos de espera', waitMinutes],
      ['Gasolina', gas],
      ['Peajes', tolls],
      ['Estacionamiento', parking],
    ];
    const parsed: Record<string, number> = {};
    for (const [label, raw] of fields) {
      const v = parseNum(raw);
      if (v === null || v < 0) {
        Alert.alert(
          'Revisa los números',
          `"${label}" debe ser un número mayor o igual a 0.`,
        );
        return;
      }
      parsed[label] = v;
    }
    if (parsed['Horas'] <= 0) {
      Alert.alert(
        'Horas requeridas',
        'Las horas deben ser mayores que 0 para calcular tus promedios.',
      );
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
          parsed['Ganancias'],
          parsed['Propinas'],
          parsed['Millas'],
          parsed['Horas'],
          parsed['Minutos de espera'],
          parsed['Gasolina'],
          parsed['Peajes'],
          parsed['Estacionamiento'],
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
      Alert.alert('Guardado', 'Tu registro de ganancias se guardó correctamente.');
    } catch {
      Alert.alert(
        'No se pudo guardar',
        'Ocurrió un error al guardar el registro. Inténtalo de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = (id: string) => {
    Alert.alert(
      'Eliminar registro',
      '¿Seguro que quieres eliminar este registro? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await getDb().runAsync('DELETE FROM earnings WHERE id = ?', [id]);
              await load();
            } catch {
              Alert.alert(
                'No se pudo eliminar',
                'Ocurrió un error al eliminar el registro.',
              );
            }
          },
        },
      ],
    );
  };

  // ---- Agregados del rango ----
  const t = entries.reduce(
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

  const gross = t.earnings + t.tips;
  const perHour = t.hours > 0 ? gross / t.hours : 0;
  const perMile = t.miles > 0 ? gross / t.miles : 0;
  const gasPerMile = t.miles > 0 ? t.gas / t.miles : 0;
  const net = gross - t.gas - t.tolls - t.parking;
  const netPerHour = t.hours > 0 ? net / t.hours : 0;

  const modeLabel = mode === 'day' ? 'del día' : mode === 'week' ? 'de la semana' : 'del mes';

  return (
    <View>
      <Text style={styles.title}>💰 Ganancias</Text>

      {/* ---------- Formulario ---------- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Registrar turno</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Fecha (AAAA-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
            placeholder="2026-10-12"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <Text style={styles.fieldLabel}>Plataforma</Text>
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
          <Text style={styles.fieldLabel}>Zona (opcional, ej. Orlando)</Text>
          <TextInput
            style={styles.input}
            value={zone}
            onChangeText={setZone}
            placeholder="Orlando"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.grid}>
          <Field label="Ganancias $" value={earnings} onChange={setEarnings} />
          <Field label="Propinas $" value={tips} onChange={setTips} />
          <Field label="Millas" value={miles} onChange={setMiles} />
          <Field label="Horas" value={hours} onChange={setHours} />
          <Field label="Espera (min)" value={waitMinutes} onChange={setWaitMinutes} />
          <Field label="Gasolina $" value={gas} onChange={setGas} />
          <Field label="Peajes $" value={tolls} onChange={setTolls} />
          <Field label="Estacionamiento $" value={parking} onChange={setParking} />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Guardando…' : 'Guardar turno'}
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
      <Text style={styles.sectionTitle}>Resumen {modeLabel}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            🚗 Aún no tienes registros en este período.{'\n'}Agrega tu primer turno arriba.
          </Text>
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <StatCard label="Bruto / hora" value={fmtMoney(perHour)} sub={`${entries.length} registro(s)`} />
          <StatCard label="Neto estimado" value={fmtMoney(net)} sub="Bruto − gasolina − peajes − estac." />
          <StatCard label="Neto / hora" value={fmtMoney(netPerHour)} />
          <StatCard label="Bruto / milla" value={fmtMoney(perMile)} />
          <StatCard label="Gasolina / milla" value={fmtMoney(gasPerMile)} sub={fmtMiles(t.miles)} />
          <StatCard label="Bruto total" value={fmtMoney(gross)} sub={`${t.hours.toFixed(1)} h trabajadas`} />
        </View>
      )}

      {/* ---------- Lista ---------- */}
      <Text style={styles.sectionTitle}>Registros</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay registros para mostrar.</Text>
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
                {num(e.hours).toFixed(1)} h
                {num(e.waitMinutes) > 0 ? ` · ${num(e.waitMinutes).toFixed(0)} min espera` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => removeEntry(e.id)}
            >
              <Text style={styles.deleteText}>Eliminar</Text>
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
    color: '#0A0A0A',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#F6F7F6',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
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
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0A0A0A',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    backgroundColor: '#00A651',
    borderColor: '#00A651',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  saveButton: {
    backgroundColor: '#00A651',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0A0A',
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
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F6F7F6',
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
    color: '#0A0A0A',
    marginBottom: 4,
  },
  rowSub: {
    fontSize: 13,
    color: '#6B7280',
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
  },
});
