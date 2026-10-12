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
import { deductionForPeriod, DEDUCTION_DISCLAIMER } from '../src/utils/irs';
import {
  useToolkitAccess,
  subscribeToolkit,
  restorePurchases,
} from '../src/services/monetization';
import {
  exportCSV,
  exportTaxPDF,
  loadReportData,
  monthEpochRange,
  monthLabelES,
  shiftMonth,
} from '../src/services/export';

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
  const [hasAccess, refreshAccess] = useToolkitAccess();

  return (
    <Screen>
      {hasAccess ? (
        <TaxesContent />
      ) : (
        <Paywall
          title="Tax Center"
          priceText="$10/mes"
          features={[
            'Resumen mensual de ingresos y gastos',
            'Millas comerciales y millaje estimado (tarifa IRS)',
            'Exporta tu reporte en PDF y CSV',
            'Lleva tus registros listos para la temporada de impuestos',
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

function TaxesContent() {
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
      <Text style={styles.title}>🧾 Tax Center</Text>

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
            📋 Sin registros en {monthLabelES(month)}.{'\n'}Registra tus ganancias y
            tus viajes de trabajo para generar tu reporte.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statsGrid}>
            <StatCard
              label="Ingresos totales"
              value={fmtMoney(summary.gross)}
              sub={`${summary.entryCount} registro(s)`}
            />
            <StatCard
              label="Millas comerciales"
              value={fmtMiles(summary.businessMiles)}
              sub="Viajes de trabajo"
            />
            <StatCard
              label="Millaje estimado"
              value={fmtMoney(summary.deduction)}
              sub={summary.deductionBreakdown}
            />
            <StatCard label="Peajes" value={fmtMoney(summary.tolls)} />
            <StatCard label="Estacionamiento" value={fmtMoney(summary.parking)} />
            <StatCard label="Propinas" value={fmtMoney(summary.tips)} />
          </View>

          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>⚠️ {DEDUCTION_DISCLAIMER}</Text>
            <Text style={styles.disclaimerText}>
              El millaje estimado se calcula con la tarifa estándar del IRS sobre
              tus millas comerciales registradas.
            </Text>
          </View>
        </>
      )}

      {/* Exportar */}
      <Text style={styles.sectionTitle}>Exportar reporte</Text>
      <TouchableOpacity
        style={[styles.exportButton, exporting && styles.disabled]}
        onPress={handleExportPDF}
        disabled={exporting}
      >
        <Text style={styles.exportButtonText}>
          {exporting ? 'Generando…' : '📄 Exportar PDF'}
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
          {exporting ? 'Generando…' : '📊 Exportar CSV'}
        </Text>
      </TouchableOpacity>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Guarda este reporte para tus registros. Estimación, no asesoría
          fiscal.
        </Text>
      </View>
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
    minWidth: 140,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0A0A0A',
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
  disclaimer: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F5D547',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  disclaimerText: {
    fontSize: 13,
    color: '#92690E',
    lineHeight: 18,
    marginBottom: 4,
  },
  exportButton: {
    backgroundColor: '#00A651',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  exportButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#00A651',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  exportButtonTextSecondary: {
    color: '#00A651',
  },
  disabled: {
    opacity: 0.6,
  },
  note: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
  },
  noteText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});
