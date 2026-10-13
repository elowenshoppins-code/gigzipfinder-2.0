/**
 * Pantalla "Millas" — Gig Miles (contador fiscal de millas).
 *
 * Gated por la suscripción del toolkit ($10/mes): sin acceso muestra el
 * Paywall; con acceso muestra controles de viaje/jornada, resumen de
 * millas + estimación de deducción, e historial editable de viajes.
 *
 * Contratos que consume (firmas reales leídas del repo):
 * - components: Screen({children, scroll}), StatCard({label, value, sub}),
 *   Paywall({title, priceText, features, onBuy, onRestore?})
 * - services/monetization: useToolkitAccess() → [boolean, refresh],
 *   subscribeToolkit(), restorePurchases()
 * - db/database: getSetting(), setSetting(), Trip
 * - utils/format: fmtMiles(n), fmtMoney(n), isoDate(Date), todayISO()
 * - utils/irs: estimateDeduction(miles) → {miles, rate, total},
 *   deductionForPeriod(trips) → {miles, total, breakdown}
 * - services/mileage: todo el rastreo y persistencia de viajes
 *
 * NOTA DE RUTAS: desde app/(tabs)/ se importa con '../../src/...',
 * igual que hace app/(tabs)/_layout.tsx con '../../src/i18n'.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';

import { Screen } from '../../src/components/Screen';
import { StatCard } from '../../src/components/StatCard';
import { Paywall } from '../../src/components/Paywall';
import {
  restorePurchases,
  subscribeToolkit,
  useToolkitAccess,
} from '../../src/services/monetization';
import { getSetting, setSetting, type Trip } from '../../src/db/database';
import { fmtMiles, fmtMoney, isoDate, todayISO } from '../../src/utils/format';
import { deductionForPeriod, estimateDeduction } from '../../src/utils/irs';
import {
  addManualTrip,
  deleteTrip,
  endTrip,
  endWorkday,
  ensureLocationPermissions,
  getActiveTrip,
  getWorkdayStart,
  getWorkMilesSummary,
  isTripPaused,
  listTrips,
  pauseTrip,
  resumeTrip,
  startBackgroundTracking,
  startTrip,
  startWorkday,
  updateTrip,
  type MilesSummary,
} from '../../src/services/mileage';
import { useStrings } from '../../src/i18n';
import { theme } from '../../src/theme';

const GREEN = theme.primary;
const INK = theme.text;
const GRAY = theme.textMuted;
const LIGHT = theme.card;
const RED = theme.danger;

type PlatformOption = { key: string; label: string };
const PLATFORMS: PlatformOption[] = [
  { key: 'instacart', label: 'Instacart' },
  { key: 'doordash', label: 'DoorDash' },
  { key: 'uber', label: 'Uber' },
  { key: 'spark', label: 'Spark' },
  { key: 'lyft', label: 'Lyft' },
  { key: 'roadie', label: 'Roadie' },
];

/* ---------- ayudas de fecha/hora (hora local del teléfono) ---------- */

function startOfDayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeekMondayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
function startOfMonthMs(): number {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
}
function startOfYearMs(): number {
  const n = new Date();
  return new Date(n.getFullYear(), 0, 1).getTime();
}
function fmtClock(ms: number): string {
  const d = new Date(ms);
  return (
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
}
/* ================================================================== */

export default function MilesScreen() {
  const t = useStrings();
  const [toolkitAccess, refreshToolkit] = useToolkitAccess();

  const platformLabel = (key: string | null): string =>
    PLATFORMS.find((p) => p.key === key)?.label ?? t.miles.noPlatform;

  const fmtDuration = (ms: number): string => {
    const mins = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(mins / 60);
    return t.miles.durationFmt(h, mins % 60);
  };

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [paused, setPaused] = useState(false);
  const [summary, setSummary] = useState<MilesSummary>({
    today: 0,
    week: 0,
    month: 0,
    year: 0,
  });
  const [autoDetect, setAutoDetect] = useState(false);
  const [workdayStart, setWorkdayStart] = useState<number | null>(null);
  const [platform, setPlatform] = useState<string | null>('instacart');
  const [permDenied, setPermDenied] = useState(false);

  // Modal de edición
  const [editing, setEditing] = useState<Trip | null>(null);
  const [editMiles, setEditMiles] = useState('');
  const [editPurpose, setEditPurpose] = useState<'work' | 'personal'>('work');
  const [editPlatform, setEditPlatform] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  // Modal de viaje manual
  const [addingManual, setAddingManual] = useState(false);
  const [manualDate, setManualDate] = useState(todayISO());
  const [manualMiles, setManualMiles] = useState('');
  const [manualPurpose, setManualPurpose] = useState<'work' | 'personal'>('work');
  const [manualPlatform, setManualPlatform] = useState<string | null>(null);
  const [manualNotes, setManualNotes] = useState('');

  const reload = useCallback(async () => {
    try {
      const [trip, sums, list, isPaused, wdStart, auto] = await Promise.all([
        getActiveTrip(),
        getWorkMilesSummary(),
        listTrips(100),
        isTripPaused(),
        getWorkdayStart(),
        getSetting('miles_autodetect'),
      ]);
      setActiveTrip(trip);
      setSummary(sums);
      setTrips(list);
      setPaused(isPaused);
      setWorkdayStart(wdStart);
      setAutoDetect(auto === '1');
    } catch (e) {
      // La pantalla nunca debe crashear por un fallo de lectura.
      console.warn('[Millas] error recargando:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recarga al enfocar la pantalla y cada 20 s para que el contador del
  // viaje en curso se mueva en vivo.
  useFocusEffect(
    useCallback(() => {
      void reload();
      const id = setInterval(() => {
        void reload();
      }, 20000);
      return () => clearInterval(id);
    }, [reload]),
  );

  useEffect(() => {
    if (toolkitAccess) {
      void reload();
    }
  }, [toolkitAccess, reload]);

  // Aviso si los permisos de ubicación están denegados.
  useEffect(() => {
    (async () => {
      try {
        const fg = await Location.getForegroundPermissionsAsync();
        const bg = await Location.getBackgroundPermissionsAsync();
        setPermDenied(!fg.granted || !bg.granted);
      } catch {
        setPermDenied(true);
      }
    })();
  }, []);

  /* ------------------------- acciones ------------------------- */

  const handleSubscribe = async () => {
    await subscribeToolkit();
    refreshToolkit();
  };

  const handleStartTrip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await ensureLocationPermissions();
      if (!ok) {
        setPermDenied(true);
        Alert.alert(t.miles.permTitle, t.miles.permMsgTrip);
        return;
      }
      setPermDenied(false);
      await startBackgroundTracking();
      if (platform) {
        await setSetting('default_platform', platform);
      }
      await startTrip(platform);
      await reload();
    } catch {
      Alert.alert(t.common.error, t.miles.errStartTrip);
    } finally {
      setBusy(false);
    }
  };

  const handleEndTrip = () => {
    Alert.alert(
      t.miles.endTripTitle,
      t.miles.endTripMsg(fmtMiles(activeTrip?.distanceMiles ?? 0)),
      [
        { text: t.common.cancelar, style: 'cancel' },
        {
          text: t.miles.endTripConfirm,
          style: 'destructive',
          onPress: async () => {
            await endTrip();
            await reload();
          },
        },
      ],
    );
  };

  const handlePause = async () => {
    await pauseTrip();
    await reload();
  };

  const handleResume = async () => {
    await resumeTrip();
    await reload();
  };

  const handleStartWorkday = async () => {
    try {
      const ok = await ensureLocationPermissions();
      if (!ok) {
        setPermDenied(true);
        Alert.alert(t.miles.permTitle, t.miles.permMsgWorkday);
        return;
      }
      setPermDenied(false);
      await startWorkday();
      await reload();
    } catch {
      Alert.alert(t.common.error, t.miles.errStartWorkday);
    }
  };

  const handleEndWorkday = async () => {
    try {
      const { miles, trips: count } = await endWorkday();
      const ded = estimateDeduction(miles);
      Alert.alert(
        t.miles.workdayDoneTitle,
        t.miles.workdayDoneMsg(fmtMiles(miles), count, fmtMoney(ded.total)),
      );
      await reload();
    } catch {
      Alert.alert(t.common.error, t.miles.errEndWorkday);
    }
  };

  const toggleAutoDetect = async (value: boolean) => {
    if (value) {
      const ok = await ensureLocationPermissions();
      if (!ok) {
        setPermDenied(true);
        Alert.alert(t.miles.permTitle, t.miles.permMsgAuto);
        return;
      }
      setPermDenied(false);
      try {
        await startBackgroundTracking();
      } catch (e) {
        console.warn('[Millas] no se pudo iniciar el rastreo:', e);
      }
    }
    await setSetting('miles_autodetect', value ? '1' : '0');
    setAutoDetect(value);
  };

  const togglePurpose = async (trip: Trip) => {
    const next = trip.purpose === 'work' ? 'personal' : 'work';
    await updateTrip(trip.id, { purpose: next });
    await reload();
  };

  const confirmDelete = (id: string) => {
    Alert.alert(t.miles.delTitle, t.miles.delMsg, [
      { text: t.common.cancelar, style: 'cancel' },
      {
        text: t.common.eliminar,
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(id);
          await reload();
        },
      },
    ]);
  };

  const openEdit = (trip: Trip) => {
    setEditing(trip);
    setEditMiles(String(trip.distanceMiles));
    setEditPurpose(trip.purpose);
    setEditPlatform(trip.platform);
    setEditNotes(trip.notes ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    const miles = parseFloat(editMiles.replace(',', '.'));
    if (!Number.isFinite(miles) || miles < 0) {
      Alert.alert(t.miles.checkMilesTitle, t.miles.checkMilesMsg);
      return;
    }
    await updateTrip(editing.id, {
      distanceMiles: miles,
      purpose: editPurpose,
      platform: editPlatform,
      notes: editNotes.trim() ? editNotes.trim() : null,
    });
    setEditing(null);
    await reload();
  };

  const openManual = () => {
    setManualDate(todayISO());
    setManualMiles('');
    setManualPurpose('work');
    setManualPlatform(platform);
    setManualNotes('');
    setAddingManual(true);
  };

  const saveManual = async () => {
    const miles = parseFloat(manualMiles.replace(',', '.'));
    if (!Number.isFinite(miles) || miles <= 0) {
      Alert.alert(t.miles.checkMilesTitle, t.miles.checkMilesPositive);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDate)) {
      Alert.alert(t.miles.checkDateTitle, t.miles.checkDateMsg);
      return;
    }
    try {
      await addManualTrip({
        date: manualDate,
        miles,
        purpose: manualPurpose,
        platform: manualPlatform,
        notes: manualNotes,
      });
      setAddingManual(false);
      await reload();
    } catch (e) {
      Alert.alert(
        t.common.error,
        e instanceof Error ? e.message : t.miles.errSaveTrip,
      );
    }
  };

  /* ------------------------- derivados ------------------------- */

  const dayStart = startOfDayMs();
  const dedDay = deductionForPeriod(trips.filter((t) => t.startTime >= dayStart));
  const dedWeek = deductionForPeriod(
    trips.filter((t) => t.startTime >= startOfWeekMondayMs()),
  );
  const dedMonth = deductionForPeriod(
    trips.filter((t) => t.startTime >= startOfMonthMs()),
  );
  const dedYear = deductionForPeriod(
    trips.filter((t) => t.startTime >= startOfYearMs()),
  );
  const liveDeduction = activeTrip
    ? estimateDeduction(activeTrip.distanceMiles)
    : null;

  /* ------------------------- piezas UI ------------------------- */

  const platformChips = (
    selected: string | null,
    onSelect: (key: string | null) => void,
  ) => (
    <View style={styles.chips}>
      {PLATFORMS.map((p) => {
        const isSel = selected === p.key;
        return (
          <Pressable
            key={p.key}
            onPress={() => onSelect(p.key)}
            style={[styles.chip, isSel && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSel && styles.chipTextSelected]}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => onSelect(null)}
        style={[styles.chip, selected === null && styles.chipSelected]}
      >
        <Text
          style={[styles.chipText, selected === null && styles.chipTextSelected]}
        >
          {t.miles.noPlatform}
        </Text>
      </Pressable>
    </View>
  );

  const purposeToggle = (
    value: 'work' | 'personal',
    onChange: (v: 'work' | 'personal') => void,
  ) => (
    <View style={styles.segment}>
      <Pressable
        onPress={() => onChange('work')}
        style={[styles.segmentBtn, value === 'work' && styles.segmentBtnOn]}
      >
        <Text
          style={[
            styles.segmentText,
            value === 'work' && styles.segmentTextOn,
          ]}
        >
          {t.miles.purposeWork}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('personal')}
        style={[styles.segmentBtn, value === 'personal' && styles.segmentBtnOn]}
      >
        <Text
          style={[
            styles.segmentText,
            value === 'personal' && styles.segmentTextOn,
          ]}
        >
          {t.miles.purposePersonal}
        </Text>
      </Pressable>
    </View>
  );

  const header = (
    <View>
      <Text style={styles.title}>{t.miles.title}</Text>
      <Text style={styles.subtitle}>{t.miles.subtitle}</Text>

      {permDenied ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnText}>{t.miles.permDeniedWarn}</Text>
        </View>
      ) : null}

      {/* Viaje activo o controles para iniciar */}
      {activeTrip ? (
        <View style={styles.tripCard}>
          <View style={styles.tripCardHeader}>
            <Text style={styles.tripCardTitle}>{t.miles.tripInProgress}</Text>
            {paused ? (
              <Text style={styles.pausedBadge}>{t.miles.paused}</Text>
            ) : (
              <Text style={styles.liveBadge}>{t.miles.live}</Text>
            )}
          </View>
          <Text style={styles.tripMiles}>
            {fmtMiles(activeTrip.distanceMiles)}
          </Text>
          <Text style={styles.tripMeta}>
            {platformLabel(activeTrip.platform)} ·{' '}
            {fmtDuration(Date.now() - activeTrip.startTime)}
            {liveDeduction
              ? t.miles.deductibleApprox(fmtMoney(liveDeduction.total))
              : ''}
          </Text>
          <View style={styles.row}>
            {paused ? (
              <Pressable
                style={[styles.primaryBtn, styles.flex]}
                onPress={handleResume}
              >
                <Text style={styles.primaryBtnText}>{t.miles.resumeTrip}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.secondaryBtn, styles.flex]}
                onPress={handlePause}
              >
                <Text style={styles.secondaryBtnText}>{t.miles.pause}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.dangerBtn, styles.flex]}
              onPress={handleEndTrip}
            >
              <Text style={styles.dangerBtnText}>{t.miles.end}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.tripCard}>
          <Text style={styles.tripCardTitle}>{t.miles.tripPlatform}</Text>
          {platformChips(platform, setPlatform)}
          <Pressable
            style={styles.primaryBtn}
            onPress={handleStartTrip}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={theme.onPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>{t.miles.startTrip}</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Jornada */}
      <View style={styles.workdayRow}>
        <View style={styles.flex}>
          <Text style={styles.sectionLabel}>{t.miles.workday}</Text>
          <Text style={styles.muted}>
            {workdayStart
              ? t.miles.workdayActiveSince(fmtClock(workdayStart))
              : t.miles.noWorkday}
          </Text>
        </View>
        {workdayStart ? (
          <Pressable style={styles.secondaryBtn} onPress={handleEndWorkday}>
            <Text style={styles.secondaryBtnText}>{t.miles.endWorkday}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondaryBtn} onPress={handleStartWorkday}>
            <Text style={styles.secondaryBtnText}>{t.miles.startWorkday}</Text>
          </Pressable>
        )}
      </View>

      {/* Auto-detección */}
      <View style={styles.autoRow}>
        <View style={styles.flex}>
          <Text style={styles.sectionLabel}>{t.miles.autoDetect}</Text>
          <Text style={styles.muted}>{t.miles.autoDetectDesc}</Text>
        </View>
        <Switch
          value={autoDetect}
          onValueChange={(v) => {
            void toggleAutoDetect(v);
          }}
          trackColor={{ false: theme.border, true: GREEN }}
        />
      </View>

      {/* Resumen */}
      <Text style={styles.sectionTitle}>{t.miles.summaryTitle}</Text>
      <View style={styles.grid}>
        <StatCard
          label={t.miles.today}
          value={fmtMiles(summary.today)}
          sub={t.miles.approxSub(fmtMoney(dedDay.total))}
        />
        <StatCard
          label={t.miles.thisWeek}
          value={fmtMiles(summary.week)}
          sub={t.miles.approxSub(fmtMoney(dedWeek.total))}
        />
      </View>
      <View style={[styles.grid, { marginTop: 10 }]}>
        <StatCard
          label={t.miles.thisMonth}
          value={fmtMiles(summary.month)}
          sub={t.miles.approxSub(fmtMoney(dedMonth.total))}
        />
        <StatCard
          label={t.miles.thisYear}
          value={fmtMiles(summary.year)}
          sub={t.miles.approxSub(fmtMoney(dedYear.total))}
        />
      </View>
      <Text style={styles.disclaimer}>
        {t.miles.deductionNote} {t.irs.disclaimer}
      </Text>

      {/* Historial */}
      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>{t.miles.historyTitle}</Text>
        <Pressable style={styles.linkBtn} onPress={openManual}>
          <Text style={styles.linkText}>{t.miles.addManual}</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderTrip = ({ item }: { item: Trip }) => (
    <View style={styles.tripRow}>
      <View style={styles.flex}>
        <Text style={styles.tripRowTitle}>
          {isoDate(new Date(item.startTime))} · {fmtMiles(item.distanceMiles)}
        </Text>
        <Text style={styles.tripRowSub}>
          {platformLabel(item.platform)}
          {item.endTime
            ? ` · ${fmtDuration(item.endTime - item.startTime)}`
            : t.miles.ongoingSuffix}
          {item.notes ? ` · ${item.notes}` : ''}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          void togglePurpose(item);
        }}
        style={[
          styles.pill,
          item.purpose === 'work' ? styles.pillWork : styles.pillPersonal,
        ]}
      >
        <Text style={styles.pillText}>
          {item.purpose === 'work' ? t.miles.purposeWork : t.miles.purposePersonal}
        </Text>
      </Pressable>
      <Pressable onPress={() => openEdit(item)} style={styles.iconBtn}>
        <Text style={styles.iconText}>✏️</Text>
      </Pressable>
      <Pressable
        onPress={() => confirmDelete(item.id)}
        style={styles.iconBtn}
      >
        <Text style={styles.iconText}>🗑️</Text>
      </Pressable>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t.miles.emptyTitle}</Text>
      <Text style={styles.emptyText}>{t.miles.emptyMsg}</Text>
    </View>
  );

  /* ------------------------- render ------------------------- */

  if (!toolkitAccess) {
    return (
      <Screen>
        <Paywall
          title={t.miles.paywallTitle}
          priceText={t.common.perMonth}
          features={t.miles.paywallFeatures}
          onBuy={handleSubscribe}
          onRestore={restorePurchases}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GREEN} />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderTrip}
          ListHeaderComponent={header}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          style={styles.list}
        />
      )}

      {/* Modal: editar viaje */}
      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t.miles.editTrip}</Text>
            <Text style={styles.fieldLabel}>{t.miles.fieldMiles}</Text>
            <TextInput
              style={styles.input}
              value={editMiles}
              onChangeText={setEditMiles}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
            <Text style={styles.fieldLabel}>{t.miles.fieldPurpose}</Text>
            {purposeToggle(editPurpose, setEditPurpose)}
            <Text style={styles.fieldLabel}>{t.miles.fieldPlatform}</Text>
            {platformChips(editPlatform, setEditPlatform)}
            <Text style={styles.fieldLabel}>{t.miles.fieldNotes}</Text>
            <TextInput
              style={styles.input}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder={t.miles.notesPh}
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryBtn, styles.flex]}
                onPress={() => setEditing(null)}
              >
                <Text style={styles.secondaryBtnText}>{t.common.cancelar}</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, styles.flex]}
                onPress={() => {
                  void saveEdit();
                }}
              >
                <Text style={styles.primaryBtnText}>{t.common.guardar}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: viaje manual */}
      <Modal
        visible={addingManual}
        transparent
        animationType="slide"
        onRequestClose={() => setAddingManual(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t.miles.addManualTitle}</Text>
            <Text style={styles.fieldLabel}>{t.miles.fieldDate}</Text>
            <TextInput
              style={styles.input}
              value={manualDate}
              onChangeText={setManualDate}
              placeholder={t.miles.datePh}
            />
            <Text style={styles.fieldLabel}>{t.miles.fieldMiles}</Text>
            <TextInput
              style={styles.input}
              value={manualMiles}
              onChangeText={setManualMiles}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
            <Text style={styles.fieldLabel}>{t.miles.fieldPurpose}</Text>
            {purposeToggle(manualPurpose, setManualPurpose)}
            <Text style={styles.fieldLabel}>{t.miles.fieldPlatform}</Text>
            {platformChips(manualPlatform, setManualPlatform)}
            <Text style={styles.fieldLabel}>{t.miles.fieldNotes}</Text>
            <TextInput
              style={styles.input}
              value={manualNotes}
              onChangeText={setManualNotes}
              placeholder={t.miles.notesPh}
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.secondaryBtn, styles.flex]}
                onPress={() => setAddingManual(false)}
              >
                <Text style={styles.secondaryBtnText}>{t.common.cancelar}</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, styles.flex]}
                onPress={() => {
                  void saveManual();
                }}
              >
                <Text style={styles.primaryBtnText}>{t.common.guardar}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/* ------------------------- estilos ------------------------- */

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: INK },
  subtitle: { fontSize: 14, color: GRAY, marginTop: 4, marginBottom: 12 },
  warnBox: {
    backgroundColor: theme.warningBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  warnText: { fontSize: 13, color: theme.warning },
  tripCard: {
    backgroundColor: LIGHT,
    borderRadius: theme.radiusCard,
    padding: 16,
    marginBottom: 12,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripCardTitle: { fontSize: 15, fontWeight: '700', color: INK },
  liveBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
    backgroundColor: theme.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pausedBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.warning,
    backgroundColor: theme.warningBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tripMiles: { fontSize: 34, fontWeight: '800', color: INK },
  tripMeta: { fontSize: 13, color: GRAY, marginTop: 4, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: theme.onPrimary, fontSize: 17, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: theme.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: INK, fontSize: 15, fontWeight: '600' },
  dangerBtn: {
    backgroundColor: theme.dangerBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerBtnText: { color: RED, fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontSize: 13, color: INK },
  chipTextSelected: { color: theme.onPrimary, fontWeight: '700' },
  workdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIGHT,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: INK },
  muted: { fontSize: 13, color: GRAY, marginTop: 2 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: INK,
    marginBottom: 10,
    marginTop: 4,
  },
  grid: { flexDirection: 'row', gap: 10 },
  disclaimer: {
    fontSize: 12,
    color: GRAY,
    fontStyle: 'italic',
    marginTop: 10,
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  linkText: { color: GREEN, fontSize: 15, fontWeight: '700' },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  tripRowTitle: { fontSize: 15, fontWeight: '700', color: INK },
  tripRowSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  pill: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 10 },
  pillWork: { backgroundColor: theme.successBg },
  pillPersonal: { backgroundColor: theme.card },
  pillText: { fontSize: 12, fontWeight: '700', color: INK },
  iconBtn: { padding: 6 },
  iconText: { fontSize: 18 },
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: INK, marginBottom: 6 },
  emptyText: { fontSize: 14, color: GRAY, textAlign: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: INK, marginBottom: 12 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: GRAY,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: INK,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: LIGHT,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnOn: { backgroundColor: theme.card, elevation: 1 },
  segmentText: { fontSize: 14, color: GRAY, fontWeight: '600' },
  segmentTextOn: { color: INK, fontWeight: '700' },
});
