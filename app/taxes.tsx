/**
 * Pantalla "Tax Center": resumen mensual para impuestos con exportación
 * a PDF y CSV. Requiere la suscripción del toolkit ($10/mes).
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
import { StatCard } from '../src/components/StatCard';
import { Paywall } from '../src/components/Paywall';
import { getDb } from '../src/db/database';
import type { Trip } from '../src/db/database';
import { fmtMoney, fmtMiles, monthKey } from '../src/utils/format';
import { deductionForPeriod } from '../src/utils/irs';
import {
  useToolkitAccess,
  subscribeToolkit,
  restorePurchases,
} from '../src/services/monetization';
import { useStrings } from '../src/i18n';
import {
  exportCSV,
  exportTaxPDF,
  loadReportData,
  monthEpochRange,
  monthLabelES,
  shiftMonth,
} from '../src/services/export';
import { theme } from '../src/theme';

interface MonthSummary {
  gross: number;
  tips: number;
  tolls: number;
  parking: number;
  businessMiles: number;
  deduction: number;
  deductionBreakdown: string;
  entryCount: number;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export default function TaxesScreen() {
  const t = useStrings();
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <TaxesContent />
      ) : (
        <Paywall
          title="Tax Center"
          priceText={t.common.perMonth}
          features={t.taxes.paywallFeatures}
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

function TaxesContent() {
  const t = useStrings();
  const [month, setMonth] = useState(monthKey());
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      // Reutiliza la misma fuente de datos que los reportes exportados.
      const data = await loadReportData(month);
      const { startMs, endMs } = monthEpochRange(month);
      const trips = await getDb().getAllAsync<Trip>(
        `SELECT startTime, distanceMiles, purpose
         FROM trips
         WHERE startTime >= ? AND startTime < ?`,
        [startMs, endMs],
      );
      const ded = deductionForPeriod(trips);
      setSummary({
        gross: num(data.gross),
        tips: num(data.tips),
        tolls: num(data.tolls),
        parking: num(data.parking),
        businessMiles: num(ded.miles),
        deduction: num(ded.total),
        deductionBreakdown: ded.breakdown,
        entryCount: data.entries.length,
      });
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const changeMonth = (delta: number) => {
    setMonth(shiftMonth(month, delta));
    setLoading(true);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportTaxPDF(month);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await exportCSV(month);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>{t.taxes.title}</Text>

      {/* Selector de mes */}
      <View style={styles.dateNav}>
        <TouchableOpacity style={styles.navButton} onPress={() => changeMonth(-1)}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.dateText}>{monthLabelES(month)}</Text>
        <TouchableOpacity style={styles.navButton} onPress={() => changeMonth(1)}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : !summary || summary.entryCount === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {t.taxes.emptyMonth(monthLabelES(month))}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard
              label={t.taxes.statGross}
              value={fmtMoney(summary.gross)}
              sub={t.taxes.recordsCount(summary.entryCount)}
            />
            <StatCard
              label={t.taxes.commercialMiles}
              value={fmtMiles(summary.businessMiles)}
              sub={t.taxes.workTrips}
            />
            <StatCard
              label={t.taxes.statDeduction}
              value={fmtMoney(summary.deduction)}
              sub={summary.deductionBreakdown}
            />
            <StatCard label={t.taxes.statTolls} value={fmtMoney(summary.tolls)} />
            <StatCard label={t.taxes.statParking} value={fmtMoney(summary.parking)} />
            <StatCard label={t.taxes.statTips} value={fmtMoney(summary.tips)} />
          </View>

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>⚠️ {t.irs.disclaimer}</Text>
            <Text style={styles.disclaimerText}>
              {t.taxes.disclaimerP2}
            </Text>
          </View>
        </>
      )}

      {/* Exportar */}
      <Text style={styles.sectionTitle}>{t.taxes.exportReport}</Text>
      <TouchableOpacity
        style={[styles.exportButton, exporting && styles.disabled]}
        onPress={handleExportPDF}
        disabled={exporting}
      >
        <Text style={styles.exportButtonText}>
          {exporting ? t.taxes.generating : `📄 ${t.taxes.exportPdf}`}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.exportButton,
          styles.exportButtonSecondary,
          exporting && styles.disabled,
        ]}
        onPress={handleExportCSV}
        disabled={exporting}
      >
        <Text style={[styles.exportButtonText, styles.exportButtonTextSecondary]}>
          {exporting ? t.taxes.generating : `📊 ${t.taxes.exportCsv}`}
        </Text>
      </TouchableOpacity>

      <View style={styles.note}>
        <Text style={styles.noteText}>{t.taxes.reportNote}</Text>
      </View>
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
    minWidth: 140,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 10,
    marginTop: 10,
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
  disclaimer: {
    backgroundColor: theme.warningBg,
    borderWidth: 1,
    borderColor: theme.warning,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 13,
    color: theme.warning,
    lineHeight: 18,
    marginBottom: 4,
  },
  exportButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  exportButtonSecondary: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  exportButtonText: {
    color: theme.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  exportButtonTextSecondary: {
    color: theme.primary,
  },
  disabled: {
    opacity: 0.6,
  },
  note: {
    marginTop: 12,
    padding: 14,
    backgroundColor: theme.card,
    borderRadius: 12,
  },
  noteText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
