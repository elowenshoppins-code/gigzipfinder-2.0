/**
 * ZIP Finder — producto actual ($20 pago único por app, sin suscripción).
 *
 * Este módulo NO requiere la suscripción del toolkit: tiene su propio
 * paywall por app (Instacart / DoorDash / Spark Driver).
 *
 * TODO: Aquí se conecta la API de sugerencias IA:
 *       GET /api/sugerencias?app=<instacart|doordash|spark>
 *       La respuesta debería devolver [{ code, score, nota }] para
 *       mostrar "ZIPs sugeridos por IA" encima de "Mis ZIPs".
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { getDb, type ZipCode } from '../src/db/database';
import {
  useZipAccess,
  purchaseZip,
  restorePurchases,
  ZIP_PRICE,
} from '../src/services/monetization';
import { uid } from '../src/utils/format';
import { useStrings } from '../src/i18n';
import { theme } from '../src/theme';

const APPS = [
  { key: 'instacart', label: 'Instacart' },
  { key: 'doordash', label: 'DoorDash' },
  { key: 'spark', label: 'Spark Driver' },
];

const SITE_URL = 'https://www.gigzipfinder.com';

export default function ZipFinderScreen() {
  const t = useStrings();
  const [app, setApp] = useState<string>(APPS[0].key);
  const [zipAccess, refreshZip] = useZipAccess(app);
  const [zips, setZips] = useState<ZipCode[]>([]);
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [buying, setBuying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [status, setStatus] = useState('');

  const appLabel = APPS.find((a) => a.key === app)?.label ?? app;

  const loadZips = useCallback(() => {
    try {
      const rows = getDb().getAllSync<ZipCode>(
        'SELECT id, code, app, notes FROM zipcodes WHERE app = ? ORDER BY code',
        [app],
      );
      setZips(rows);
    } catch (err) {
      console.warn('[zip] loadZips falló:', err);
      setZips([]);
    }
  }, [app]);

  useFocusEffect(loadZips);

  const handleBuy = useCallback(async () => {
    setBuying(true);
    setStatus('');
    try {
      await purchaseZip(app); // MOCK — Integración real: TODO RevenueCat
      refreshZip();
      setStatus(t.zip.unlocked);
    } catch (err) {
      console.warn('[zip] purchaseZip falló:', err);
      setStatus(t.zip.purchaseError);
    } finally {
      setBuying(false);
    }
  }, [app, refreshZip, t]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setStatus('');
    try {
      await restorePurchases();
      refreshZip();
      setStatus(t.zip.restored);
    } catch (err) {
      console.warn('[zip] restorePurchases falló:', err);
      setStatus(t.zip.restoreError);
    } finally {
      setRestoring(false);
    }
  }, [refreshZip, t]);

  const handleAdd = useCallback(() => {
    const clean = code.trim();
    if (!clean) {
      setStatus(t.zip.emptyZip);
      return;
    }
    try {
      getDb().runSync(
        'INSERT INTO zipcodes (id, code, app, notes) VALUES (?, ?, ?, ?)',
        [uid(), clean, app, notes.trim() ? notes.trim() : null],
      );
      setCode('');
      setNotes('');
      setStatus('');
      loadZips();
    } catch (err) {
      console.warn('[zip] agregar falló:', err);
      setStatus(t.zip.saveZipError);
    }
  }, [code, notes, app, loadZips, t]);

  const handleDelete = useCallback(
    (id: string) => {
      try {
        getDb().runSync('DELETE FROM zipcodes WHERE id = ?', [id]);
        loadZips();
      } catch (err) {
        console.warn('[zip] eliminar falló:', err);
      }
    },
    [loadZips],
  );

  const openSite = useCallback(() => {
    Linking.openURL(SITE_URL).catch((err) =>
      console.warn('[zip] openURL falló:', err),
    );
  }, []);

  const header = (
    <View>
      <Text style={styles.title}>ZIP Finder</Text>
      <Text style={styles.explainer}>{t.zip.explainer(`$${ZIP_PRICE}`)}</Text>

      <Text style={styles.sectionLabel}>{t.zip.appLabel}</Text>
      <View style={styles.appRow}>
        {APPS.map((a) => (
          <Pressable
            key={a.key}
            style={[
              styles.appChip,
              a.key === app && styles.appChipActive,
            ]}
            onPress={() => {
              setApp(a.key);
              setStatus('');
            }}
          >
            <Text
              style={[
                styles.appChipText,
                a.key === app && styles.appChipTextActive,
              ]}
            >
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!zipAccess ? (
        <View style={styles.paywallBox}>
          <Text style={styles.price}>{t.zip.oneTime(`$${ZIP_PRICE}`)}</Text>
          <Text style={styles.paywallNote}>{t.zip.unlockNote(appLabel)}</Text>
          <Pressable
            style={({ pressed }) => [styles.buyButton, pressed && styles.pressed]}
            onPress={handleBuy}
            disabled={buying}
          >
            {buying ? (
              <ActivityIndicator color={theme.onPrimary} />
            ) : (
              <Text style={styles.buyButtonText}>{t.zip.unlock}</Text>
            )}
          </Pressable>
          <Text style={styles.todoNote}>{t.zip.todoNote}</Text>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      ) : (
        <View>
          <Text style={styles.sectionTitle}>{t.zip.myZipsFor(appLabel)}</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder={t.zip.zipPh}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={5}
            />
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder={t.zip.notePh}
              value={notes}
              onChangeText={setNotes}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            onPress={handleAdd}
          >
            <Text style={styles.addButtonText}>{t.zip.addZip}</Text>
          </Pressable>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.siteButton, pressed && styles.pressed]}
        onPress={openSite}
      >
        <Text style={styles.siteButtonText}>Abrir gigzipfinder.com</Text>
      </Pressable>

      <Pressable
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={restoring}
      >
        {restoring ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          <Text style={styles.restoreText}>{t.paywall.restore}</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <Screen scroll={false}>
      <FlatList
        data={zipAccess ? zips : []}
        keyExtractor={(z) => z.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.zipRow}>
            <View style={styles.zipInfo}>
              <Text style={styles.zipCode}>{item.code}</Text>
              {item.notes ? (
                <Text style={styles.zipNotes}>{item.notes}</Text>
              ) : null}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && styles.pressed,
              ]}
              onPress={() => handleDelete(item.id)}
            >
              <Text style={styles.deleteText}>{t.common.eliminar}</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          zipAccess ? (
            <Text style={styles.empty}>
              {t.zip.emptyZips(appLabel)}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 8,
  },
  explainer: {
    fontSize: 14,
    color: theme.textBody,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  appRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  appChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  appChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  appChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textBody,
  },
  appChipTextActive: {
    color: theme.text,
  },
  paywallBox: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.primary,
    marginBottom: 4,
  },
  paywallNote: {
    fontSize: 14,
    color: theme.textBody,
    textAlign: 'center',
    marginBottom: 12,
  },
  buyButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buyButtonText: {
    color: theme.onPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  todoNote: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 8,
  },
  status: {
    fontSize: 13,
    color: theme.success,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 10,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: theme.card,
  },
  codeInput: {
    flex: 1,
  },
  noteInput: {
    flex: 2,
  },
  addButton: {
    backgroundColor: theme.text,
    borderRadius: theme.radiusPill,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  addButtonText: {
    color: theme.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  zipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  zipInfo: {
    flexShrink: 1,
    marginRight: 8,
  },
  zipCode: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
  },
  zipNotes: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  deleteText: {
    color: theme.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  empty: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
  siteButton: {
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  siteButtonText: {
    color: theme.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreText: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
