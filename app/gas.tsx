/**
 * Pantalla "Gasolina": registro de cargas, rendimiento (MPG y $/milla)
 * y recordatorios de mantenimiento del vehículo.
 * Requiere la suscripción del toolkit ($10/mes).
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
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { StatCard } from '../src/components/StatCard';
import { Paywall } from '../src/components/Paywall';
import { getDb } from '../src/db/database';
import type { FuelUp, MaintenanceItem } from '../src/db/database';
import { uid, fmtMoney, fmtMiles, todayISO, isoDate } from '../src/utils/format';
import {
  useToolkitAccess,
  subscribeToolkit,
  restorePurchases,
} from '../src/services/monetization';
import { scheduleReminder, cancelReminder } from '../src/services/notifications';
import { useStrings } from '../src/i18n';
import { theme } from '../src/theme';

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** epoch ms de una fecha 'YYYY-MM-DD' al mediodía local (evita desfases). */
function isoToEpochMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/** Date a las 9:00 am local de una fecha 'YYYY-MM-DD' (para recordatorios). */
function dueDateAt9am(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}

function addMonths(d: Date, months: number): Date {
  const dt = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return dt;
}

/** Devuelve el número o null si no es válido. Vacío = 0. */
function parseNum(raw: string): number | null {
  if (raw.trim() === '') return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

const reminderId = (id: string): string => `maint_${id}`;

export default function GasScreen() {
  const t = useStrings();
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <GasContent />
      ) : (
        <Paywall
          title={t.gas.title}
          priceText={t.common.perMonth}
          features={t.gas.paywallFeatures}
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

function GasContent() {
  const t = useStrings();
  // Formulario de carga
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [gallons, setGallons] = useState('');
  const [odometer, setOdometer] = useState('');
  const [saving, setSaving] = useState(false);

  // Datos
  const [fuelups, setFuelups] = useState<FuelUp[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Nuevo recordatorio personalizado
  const [newType, setNewType] = useState('');
  const [newDue, setNewDue] = useState(todayISO());

  const loadFuelups = useCallback(async (): Promise<FuelUp[]> => {
    const rows = await getDb().getAllAsync<FuelUp>(
      `SELECT id, date, amount, gallons, odometerMiles
       FROM fuelups
       ORDER BY odometerMiles ASC, date ASC`,
    );
    return rows;
  }, []);

  const seedMaintenanceIfEmpty = useCallback(async () => {
    const db = getDb();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM maintenance',
    );
    if (num(row?.n) > 0) return;
    const today = new Date();
    // Mismo orden que t.gas.maintTypes en el diccionario.
    const defaults: { type: string; months: number }[] = [
      { type: t.gas.maintTypes[0], months: 3 },
      { type: t.gas.maintTypes[1], months: 6 },
      { type: t.gas.maintTypes[2], months: 12 },
      { type: t.gas.maintTypes[3], months: 12 },
    ];
    for (const def of defaults) {
      const id = uid();
      const due = isoDate(addMonths(today, def.months));
      await db.runAsync(
        'INSERT INTO maintenance (id, type, dueDate, done) VALUES (?, ?, ?, 0)',
        [id, def.type, due],
      );
      const when = dueDateAt9am(due);
      if (when.getTime() > Date.now()) {
        await scheduleReminder(
          reminderId(id),
          t.gas.maintTitle,
          t.gas.maintDueMsg(def.type, due),
          when,
        );
      }
    }
  }, [t]);

  const loadMaintenance = useCallback(async (): Promise<MaintenanceItem[]> => {
    const rows = await getDb().getAllAsync<MaintenanceItem>(
      `SELECT id, type, dueDate, done
       FROM maintenance
       ORDER BY done ASC, dueDate ASC`,
    );
    return rows;
  }, []);

  const load = useCallback(async () => {
    try {
      const [f, m] = await Promise.all([
        loadFuelups().catch(() => [] as FuelUp[]),
        (async () => {
          try {
            await seedMaintenanceIfEmpty();
            return await loadMaintenance();
          } catch {
            return [] as MaintenanceItem[];
          }
        })(),
      ]);
      setFuelups(f);
      setMaintenance(m);
    } finally {
      setLoading(false);
    }
  }, [loadFuelups, loadMaintenance, seedMaintenanceIfEmpty]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  // ---- Guardar carga ----
  const saveFuelup = async () => {
    if (!isValidISODate(date)) {
      Alert.alert(t.common.invalidDate, t.common.invalidDateMsg);
      return;
    }
    const a = parseNum(amount);
    const g = parseNum(gallons);
    const o = parseNum(odometer);
    if (a === null || a < 0 || g === null || o === null || o < 0) {
      Alert.alert(t.gas.checkNumbers, t.gas.checkNumbersMsg);
      return;
    }
    if (g <= 0) {
      Alert.alert(t.gas.gallonsRequired, t.gas.gallonsMsg);
      return;
    }

    setSaving(true);
    try {
      await getDb().runAsync(
        'INSERT INTO fuelups (id, date, amount, gallons, odometerMiles) VALUES (?, ?, ?, ?, ?)',
        [uid(), isoToEpochMs(date), a, g, o],
      );
      setAmount('');
      setGallons('');
      setOdometer('');
      await load();
      Alert.alert(t.gas.saved, t.gas.savedMsg);
    } catch {
      Alert.alert(t.gas.saveError, t.gas.saveErrorMsg);
    } finally {
      setSaving(false);
    }
  };

  const removeFuelup = (id: string) => {
    Alert.alert(t.gas.delTitle, t.gas.delMsg, [
      { text: t.common.cancelar, style: 'cancel' },
      {
        text: t.common.eliminar,
        style: 'destructive',
        onPress: async () => {
          try {
            await getDb().runAsync('DELETE FROM fuelups WHERE id = ?', [id]);
            await load();
          } catch {
            Alert.alert(t.gas.delError, t.common.tryAgain);
          }
        },
      },
    ]);
  };

  // ---- Cálculos de rendimiento ----
  // MPG entre cargas consecutivas: millas recorridas / galones de la carga posterior.
  const pairs: { miles: number; mpg: number; amount: number }[] = [];
  for (let i = 1; i < fuelups.length; i++) {
    const miles = num(fuelups[i].odometerMiles) - num(fuelups[i - 1].odometerMiles);
    const gal = num(fuelups[i].gallons);
    if (miles > 0 && gal > 0) {
      pairs.push({ miles, mpg: miles / gal, amount: num(fuelups[i].amount) });
    }
  }
  const lastMPG = pairs.length > 0 ? pairs[pairs.length - 1].mpg : null;
  const pairMiles = pairs.reduce((s, p) => s + p.miles, 0);
  const pairAmount = pairs.reduce((s, p) => s + p.amount, 0);
  const costPerMile = pairMiles > 0 ? pairAmount / pairMiles : null;

  // ---- Mantenimiento ----
  const pending = maintenance.filter((m) => num(m.done) === 0);
  const doneItems = maintenance.filter((m) => num(m.done) !== 0);

  const refreshMaintenance = async () => {
    try {
      setMaintenance(await loadMaintenance());
    } catch {
      /* se mantiene la lista actual */
    }
  };

  const addCustomReminder = async () => {
    const type = newType.trim();
    if (!type) {
      Alert.alert(t.gas.maintNameMissing, t.gas.maintNameMsg);
      return;
    }
    if (!isValidISODate(newDue)) {
      Alert.alert(t.common.invalidDate, t.gas.maintDateMsg);
      return;
    }
    try {
      const id = uid();
      await getDb().runAsync(
        'INSERT INTO maintenance (id, type, dueDate, done) VALUES (?, ?, ?, 0)',
        [id, type, newDue],
      );
      const when = dueDateAt9am(newDue);
      if (when.getTime() > Date.now()) {
        await scheduleReminder(
          reminderId(id),
          t.gas.maintTitle,
          t.gas.maintDueMsg(type, newDue),
          when,
        );
      }
      setNewType('');
      setNewDue(todayISO());
      await refreshMaintenance();
      Alert.alert(t.gas.addedTitle, t.gas.maintSaved);
    } catch {
      Alert.alert(t.gas.saveError, t.common.tryAgain);
    }
  };

  return (
    <View>
      <Text style={styles.title}>{t.gas.title}</Text>

      {/* ---------- Nueva carga ---------- */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.gas.newFillup}</Text>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t.gas.fieldDateFillup}</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
            placeholder="2026-10-12"
            placeholderTextColor={theme.textMuted}
          />
        </View>
        <View style={styles.row3}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t.gas.fieldAmount}</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="45.00"
              placeholderTextColor={theme.textMuted}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t.gas.fieldGallons}</Text>
            <TextInput
              style={styles.input}
              value={gallons}
              onChangeText={setGallons}
              keyboardType="decimal-pad"
              placeholder="12.5"
              placeholderTextColor={theme.textMuted}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t.gas.odometer}</Text>
            <TextInput
              style={styles.input}
              value={odometer}
              onChangeText={setOdometer}
              keyboardType="decimal-pad"
              placeholder="87250"
              placeholderTextColor={theme.textMuted}
            />
          </View>
        </View>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={saveFuelup}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? t.gas.savingFillup : t.gas.saveFillup}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ---------- Rendimiento ---------- */}
      <Text style={styles.sectionTitle}>{t.gas.performance}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : pairs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {t.gas.needTwoFillups}
          </Text>
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <StatCard
            label={t.gas.lastMpg}
            value={lastMPG !== null ? lastMPG.toFixed(1) : '—'}
            sub={t.gas.mpgSub}
          />
          <StatCard
            label={t.gas.costPerMile}
            value={costPerMile !== null ? fmtMoney(costPerMile) : '—'}
            sub={fmtMiles(pairMiles)}
          />
        </View>
      )}

      {/* Historial de cargas */}
      {!loading && fuelups.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.gas.fillupHistory}</Text>
          {[...fuelups].reverse().map((f) => (
            <View key={f.id} style={styles.fuelRow}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle}>
                  {isoDate(new Date(num(f.date)))} · {fmtMoney(num(f.amount))}
                </Text>
                <Text style={styles.rowSub}>
                  {num(f.gallons).toFixed(2)} {t.gas.gallonsUnit} · {fmtMiles(num(f.odometerMiles))} {t.gas.odometerWord}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => removeFuelup(f.id)}
              >
                <Text style={styles.deleteText}>{t.common.eliminar}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* ---------- Mantenimiento ---------- */}
      <Text style={styles.sectionTitle}>{t.gas.maintShort}</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <>
          {pending.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {t.gas.allGood}
              </Text>
            </View>
          )}
          {pending.map((item) => (
            <MaintenanceRow
              key={item.id}
              item={item}
              onChanged={refreshMaintenance}
            />
          ))}

          {doneItems.length > 0 && (
            <>
              <Text style={styles.subSectionTitle}>{t.gas.completed}</Text>
              {doneItems.map((item) => (
                <View key={item.id} style={[styles.maintRow, styles.maintDone]}>
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowTitle, styles.strike]}>✓ {item.type}</Text>
                    <Text style={styles.rowSub}>{t.gas.overdueWas}{item.dueDate}</Text>
                  </View>
                  <DeleteMaintenanceButton
                    id={item.id}
                    onChanged={refreshMaintenance}
                  />
                </View>
              ))}
            </>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t.gas.addCustomReminder}</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t.gas.remindPh}</Text>
              <TextInput
                style={styles.input}
                value={newType}
                onChangeText={setNewType}
                placeholder={t.gas.remindExample}
                placeholderTextColor={theme.textMuted}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t.gas.dueDate}</Text>
              <TextInput
                style={styles.input}
                value={newDue}
                onChangeText={setNewDue}
                keyboardType="numbers-and-punctuation"
                placeholder="2026-12-01"
                placeholderTextColor={theme.textMuted}
              />
            </View>
            <TouchableOpacity style={styles.secondaryButton} onPress={addCustomReminder}>
              <Text style={styles.secondaryButtonText}>{t.gas.addReminder}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function MaintenanceRow({
  item,
  onChanged,
}: {
  item: MaintenanceItem;
  onChanged: () => void;
}) {
  const t = useStrings();
  const [due, setDue] = useState(item.dueDate);
  const [busy, setBusy] = useState(false);

  const isOverdue = due < todayISO();

  const saveDue = async () => {
    if (!isValidISODate(due)) {
      // El mensaje del diccionario usa otro ejemplo de fecha (2026-10-12).
      Alert.alert(t.common.invalidDate, t.common.invalidDateMsg);
      return;
    }
    setBusy(true);
    try {
      await getDb().runAsync('UPDATE maintenance SET dueDate = ? WHERE id = ?', [
        due,
        item.id,
      ]);
      const when = dueDateAt9am(due);
      if (when.getTime() > Date.now()) {
        await scheduleReminder(
          reminderId(item.id),
          t.gas.maintTitle,
          t.gas.maintDueMsg(item.type, due),
          when,
        );
      } else {
        await cancelReminder(reminderId(item.id));
      }
      onChanged();
      Alert.alert(t.gas.saved, t.gas.dueUpdated);
    } catch {
      Alert.alert(t.gas.saveError, t.common.tryAgain);
    } finally {
      setBusy(false);
    }
  };

  const markDone = async () => {
    setBusy(true);
    try {
      await cancelReminder(reminderId(item.id));
      await getDb().runAsync('UPDATE maintenance SET done = 1 WHERE id = ?', [
        item.id,
      ]);
      onChanged();
    } catch {
      Alert.alert(t.gas.updateError, t.common.tryAgain);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.maintRow, isOverdue && styles.maintOverdue]}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{item.type}</Text>
        <Text style={[styles.rowSub, isOverdue && styles.overdueText]}>
          {isOverdue ? t.gas.overduePrefix : t.gas.duePrefix}
          {item.dueDate}
        </Text>
        <View style={styles.dueEdit}>
          <TextInput
            style={[styles.input, styles.dueInput]}
            value={due}
            onChangeText={setDue}
            keyboardType="numbers-and-punctuation"
            placeholder={t.gas.datePh}
            placeholderTextColor={theme.textMuted}
          />
          <TouchableOpacity
            style={[styles.smallButton, busy && styles.disabled]}
            onPress={saveDue}
            disabled={busy}
          >
            <Text style={styles.smallButtonText}>{t.gas.saveDate}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.maintActions}>
        <TouchableOpacity
          style={[styles.doneButton, busy && styles.disabled]}
          onPress={markDone}
          disabled={busy}
        >
          <Text style={styles.doneButtonText}>{t.gas.doneBtn}</Text>
        </TouchableOpacity>
        <DeleteMaintenanceButton id={item.id} onChanged={onChanged} />
      </View>
    </View>
  );
}

function DeleteMaintenanceButton({
  id,
  onChanged,
}: {
  id: string;
  onChanged: () => void;
}) {
  const t = useStrings();
  const remove = () => {
    Alert.alert(t.gas.delReminderTitle, t.gas.delReminderMsg, [
      { text: t.common.cancelar, style: 'cancel' },
      {
        text: t.common.eliminar,
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelReminder(reminderId(id));
            await getDb().runAsync('DELETE FROM maintenance WHERE id = ?', [id]);
            onChanged();
          } catch {
            Alert.alert(t.gas.delError, t.common.tryAgain);
          }
        },
      },
    ]);
  };
  return (
    <TouchableOpacity style={styles.deleteButton} onPress={remove}>
      <Text style={styles.deleteText}>{t.common.eliminar}</Text>
    </TouchableOpacity>
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
  row3: {
    flexDirection: 'row',
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
  secondaryButton: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 10,
    marginTop: 6,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textMuted,
    marginBottom: 8,
    marginTop: 4,
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
  fuelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bg,
    borderRadius: 10,
    padding: 10,
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
  maintRow: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  maintOverdue: {
    borderWidth: 1,
    borderColor: theme.dangerBg,
  },
  maintDone: {
    opacity: 0.75,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  overdueText: {
    color: theme.danger,
    fontWeight: '700',
  },
  dueEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dueInput: {
    flex: 1,
    marginRight: 8,
  },
  smallButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  smallButtonText: {
    color: theme.onPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  maintActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  doneButton: {
    backgroundColor: theme.successBg,
    borderRadius: theme.radiusPill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 4,
  },
  doneButtonText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
