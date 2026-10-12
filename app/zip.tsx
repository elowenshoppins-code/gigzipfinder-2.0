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

const APPS = [
  { key: 'instacart', label: 'Instacart' },
  { key: 'doordash', label: 'DoorDash' },
  { key: 'spark', label: 'Spark Driver' },
];

const SITE_URL = 'https://www.gigzipfinder.com';

export default function ZipFinderScreen() {
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
      setStatus('¡Desbloqueado! (compra simulada)');
    } catch (err) {
      console.warn('[zip] purchaseZip falló:', err);
      setStatus('No se pudo completar la compra. Inténtalo de nuevo.');
    } finally {
      setBuying(false);
    }
  }, [app, refreshZip]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setStatus('');
    try {
      await restorePurchases();
      refreshZip();
      setStatus('Compras restauradas.');
    } catch (err) {
      console.warn('[zip] restorePurchases falló:', err);
      setStatus('No se pudo restaurar. Inténtalo de nuevo.');
    } finally {
      setRestoring(false);
    }
  }, [refreshZip]);

  const handleAdd = useCallback(() => {
    const clean = code.trim();
    if (!clean) {
      setStatus('Escribe un código ZIP para agregarlo.');
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
      setStatus('No se pudo guardar el ZIP.');
    }
  }, [code, notes, app, loadZips]);

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
      <Text style={styles.explainer}>
        Códigos ZIP con alta disponibilidad sugeridos por IA para Instacart,
        DoorDash y Spark Driver. Escaneo cada 48h. {'$'}{ZIP_PRICE} pago único
        por app, sin suscripción.
      </Text>

      <Text style={styles.sectionLabel}>App de gig</Text>
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
          <Text style={styles.price}>{'$'}{ZIP_PRICE} pago único</Text>
          <Text style={styles.paywallNote}>
            Desbloquea los ZIPs de {appLabel} para siempre. Sin suscripción.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.buyButton, pressed && styles.pressed]}
            onPress={handleBuy}
            disabled={buying}
          >
            {buying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buyButtonText}>Desbloquear</Text>
            )}
          </Pressable>
          <Text style={styles.todoNote}>Integración real: TODO RevenueCat</Text>
          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      ) : (
        <View>
          <Text style={styles.sectionTitle}>Mis ZIPs — {appLabel}</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="ZIP (ej. 32801)"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={5}
            />
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="Nota (opcional)"
              value={notes}
              onChangeText={setNotes}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            onPress={handleAdd}
          >
            <Text style={styles.addButtonText}>Agregar ZIP</Text>
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
          <ActivityIndicator color="#00A651" size="small" />
        ) : (
          <Text style={styles.restoreText}>Restaurar compras</Text>
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
              <Text style={styles.deleteText}>Eliminar</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          zipAccess ? (
            <Text style={styles.empty}>
              Aún no guardas ZIPs para {appLabel}. Agrega el primero arriba.
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
    color: '#0A0A0A',
    marginBottom: 8,
  },
  explainer: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
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
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  appChipActive: {
    backgroundColor: '#00A651',
    borderColor: '#00A651',
  },
  appChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  appChipTextActive: {
    color: '#FFFFFF',
  },
  paywallBox: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: '800',
    color: '#00A651',
    marginBottom: 4,
  },
  paywallNote: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 12,
  },
  buyButton: {
    backgroundColor: '#00A651',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  todoNote: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 8,
  },
  status: {
    fontSize: 13,
    color: '#00A651',
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
    color: '#0A0A0A',
    marginBottom: 10,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
  },
  codeInput: {
    flex: 1,
  },
  noteInput: {
    flex: 2,
  },
  addButton: {
    backgroundColor: '#0A0A0A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  zipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F6F7F6',
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
    color: '#0A0A0A',
  },
  zipNotes: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  deleteText: {
    color: '#B42318',
    fontWeight: '600',
    fontSize: 14,
  },
  empty: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 16,
  },
  siteButton: {
    borderWidth: 1,
    borderColor: '#00A651',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  siteButtonText: {
    color: '#00A651',
    fontWeight: '700',
    fontSize: 15,
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreText: {
    color: '#00A651',
    fontSize: 15,
    fontWeight: '600',
  },
});
