/**
 * Document Vault — bóveda de documentos del conductor.
 *
 * Permite guardar archivos o fotos (licencia, seguro, registro…) con fecha
 * de vencimiento opcional. Al guardar con vencimiento se programa un
 * recordatorio local 7 días antes (`doc_<id>`). Los documentos se abren con
 * Sharing (o Linking como respaldo) y se eliminan con confirmación.
 *
 * Acceso: suscripción toolkit ($10/mes).
 * Contratos: documents (src/db/database.ts), notifications, monetization.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Screen } from '../src/components/Screen';
import { Paywall } from '../src/components/Paywall';
import { getDb } from '../src/db/database';
import type { DocRecord } from '../src/db/database';
import { uid } from '../src/utils/format';
import {
  cancelReminder,
  scheduleReminder,
} from '../src/services/notifications';
import {
  restorePurchases,
  subscribeToolkit,
  useToolkitAccess,
} from '../src/services/monetization';

const GREEN = '#00A651';

const DOC_TYPES = [
  'Licencia',
  'Registro',
  'Seguro',
  'Vehículo',
  'Impuestos',
  'Desactivación',
  'Otro',
];

/** 'AAAA-MM-DD' válido (formato y fecha real). */
function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return (
    !isNaN(d.getTime()) &&
    d.getFullYear() === Number(s.slice(0, 4)) &&
    d.getMonth() + 1 === Number(s.slice(5, 7)) &&
    d.getDate() === Number(s.slice(8, 10))
  );
}

type ExpiryState = 'expired' | 'soon' | 'ok' | 'none' | 'invalid';

function expiryState(expiryDate: string | null): {
  state: ExpiryState;
  text: string;
} {
  if (!expiryDate) return { state: 'none', text: 'Sin vencimiento' };
  if (!isValidISODate(expiryDate)) return { state: 'invalid', text: 'Fecha inválida' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${expiryDate}T00:00:00`);
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { state: 'expired', text: 'Vencido' };
  if (days <= 30)
    return { state: 'soon', text: `Vence en ${days} día${days === 1 ? '' : 's'}` };
  return { state: 'ok', text: `Vigente · ${days} días` };
}

const EXPIRY_ICON: Record<ExpiryState, string> = {
  expired: '🔴',
  soon: '🟡',
  ok: '🟢',
  none: '⚪',
  invalid: '⚪',
};

export default function VaultScreen() {
  const [hasAccess, refreshAccess] = useToolkitAccess();

  const handleRestore = useCallback(async () => {
    try {
      await restorePurchases();
      refreshAccess();
      Alert.alert(
        'Compras restauradas',
        'Si tenías una suscripción activa, ya puedes usar la Bóveda.',
      );
    } catch {
      Alert.alert('Error', 'No se pudieron restaurar las compras.');
    }
  }, [refreshAccess]);

  if (!hasAccess) {
    return (
      <Screen>
        <Paywall
          title="Document Vault"
          priceText="$10/mes"
          features={[
            'Guarda licencia, seguro, registro y más en un solo lugar',
            'Alertas automáticas antes de que venzan tus documentos',
            'Abre tus documentos cuando los necesites',
          ]}
          onBuy={async () => {
            await subscribeToolkit();
            refreshAccess();
          }}
          onRestore={handleRestore}
        />
      </Screen>
    );
  }

  return <VaultContent />;
}

function VaultContent() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState(DOC_TYPES[0]);
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDocs = useCallback(async () => {
    try {
      const rows = getDb().getAllSync<DocRecord>(
        'SELECT * FROM documents ORDER BY name ASC',
      );
      setDocs(rows);
    } catch (err) {
      console.warn('[vault] loadDocs falló:', err);
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const startAdd = () => {
    setUri(null);
    setName('');
    setType(DOC_TYPES[0]);
    setExpiry('');
    setAdding(true);
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: '*/*',
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      setUri(asset.uri);
      if (!name) setName(asset.name ?? 'Documento');
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar el archivo.');
    }
  };

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permiso necesario',
          'Permite el acceso a tus fotos para guardar el documento.',
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      setUri(asset.uri);
      if (!name) {
        const fileName = asset.uri.split('/').pop() ?? 'Documento';
        setName(fileName);
      }
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const handleSave = async () => {
    if (!uri) {
      Alert.alert('Falta el documento', 'Sube un archivo o una imagen primero.');
      return;
    }
    const finalName = name.trim();
    if (finalName === '') {
      Alert.alert('Falta el nombre', 'Ponle un nombre a tu documento.');
      return;
    }
    const finalExpiry = expiry.trim();
    if (finalExpiry !== '' && !isValidISODate(finalExpiry)) {
      Alert.alert(
        'Fecha inválida',
        'Usa el formato AAAA-MM-DD (ej.: 2026-12-31) o déjalo vacío.',
      );
      return;
    }
    setSaving(true);
    try {
      const id = uid();
      const expiryDate = finalExpiry === '' ? null : finalExpiry;
      getDb().runSync(
        'INSERT INTO documents (id, name, type, uri, expiryDate, isDemo) VALUES (?, ?, ?, ?, ?, 0)',
        [id, finalName, type, uri, expiryDate],
      );
      // Recordatorio 7 días antes del vencimiento (solo si aún falta).
      if (expiryDate) {
        const remindAt = new Date(`${expiryDate}T09:00:00`);
        remindAt.setDate(remindAt.getDate() - 7);
        if (remindAt.getTime() > Date.now()) {
          await scheduleReminder(
            `doc_${id}`,
            'Documento por vencer',
            `Tu ${finalName} vence en 7 días`,
            remindAt,
          );
        }
      }
      setAdding(false);
      await loadDocs();
      Alert.alert('Guardado', 'Tu documento se guardó en la bóveda.');
    } catch {
      Alert.alert('Error', 'No se pudo guardar el documento.');
    } finally {
      setSaving(false);
    }
  };

  const openDoc = async (doc: DocRecord) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(doc.uri);
      } else {
        await Linking.openURL(doc.uri);
      }
    } catch {
      Alert.alert('Error', 'No se pudo abrir el documento.');
    }
  };

  const handleDelete = (doc: DocRecord) => {
    Alert.alert(
      'Eliminar documento',
      `¿Eliminar "${doc.name}" de la bóveda?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelReminder(`doc_${doc.id}`);
              getDb().runSync('DELETE FROM documents WHERE id = ?', [doc.id]);
              await loadDocs();
            } catch {
              Alert.alert('Error', 'No se pudo eliminar el documento.');
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heading}>Document Vault</Text>
        {!adding && (
          <TouchableOpacity onPress={startAdd}>
            <Text style={styles.linkBtn}>＋ Agregar</Text>
          </TouchableOpacity>
        )}
      </View>

      {adding ? (
        <View>
          <Text style={styles.stepTitle}>Nuevo documento</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.rowBtn]}
              onPress={pickFile}
            >
              <Text style={styles.secondaryBtnText}>📄 Subir archivo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.rowBtn]}
              onPress={pickImage}
            >
              <Text style={styles.secondaryBtnText}>🖼️ Subir imagen</Text>
            </TouchableOpacity>
          </View>
          {uri && <Text style={styles.body}>✅ Documento listo para guardar.</Text>}

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej.: Licencia de conducir"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Tipo</Text>
          <View style={styles.chips}>
            {DOC_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, type === t && styles.chipActive]}
                onPress={() => setType(t)}
              >
                <Text
                  style={[styles.chipText, type === t && styles.chipTextActive]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Fecha de vencimiento (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="AAAA-MM-DD · Ej.: 2026-12-31"
            value={expiry}
            onChangeText={setExpiry}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <Text style={styles.hint}>
            Te avisaremos 7 días antes de que venza.
          </Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.primaryBtnText}>
              {saving ? 'Guardando…' : 'Guardar documento'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => setAdding(false)}
          >
            <Text style={styles.ghostBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      ) : docs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.body}>
            Aún no tienes documentos guardados. Agrega tu licencia, seguro,
            registro y más para tenerlos siempre a la mano.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={startAdd}>
            <Text style={styles.primaryBtnText}>Agregar documento</Text>
          </TouchableOpacity>
        </View>
      ) : (
        docs.map((doc) => {
          const exp = expiryState(doc.expiryDate);
          return (
            <View key={doc.id} style={styles.docItem}>
              <TouchableOpacity
                style={styles.docMain}
                onPress={() => openDoc(doc)}
              >
                <Text style={styles.docName}>{doc.name}</Text>
                <Text style={styles.docType}>{doc.type}</Text>
                <Text style={styles.docExpiry}>
                  {EXPIRY_ICON[exp.state]} {exp.text}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(doc)}
              >
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A0A0A',
  },
  linkBtn: {
    fontSize: 15,
    color: GREEN,
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#0A0A0A',
    marginBottom: 12,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 6,
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    borderColor: GREEN,
    backgroundColor: '#EAF7EF',
  },
  chipText: {
    fontSize: 14,
    color: '#0A0A0A',
  },
  chipTextActive: {
    color: GREEN,
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: {
    color: GREEN,
    fontSize: 16,
    fontWeight: '700',
  },
  ghostBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  ghostBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  rowBtn: {
    flex: 1,
    marginHorizontal: 6,
  },
  emptyBox: {
    paddingVertical: 24,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  docMain: {
    flex: 1,
  },
  docName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
    marginBottom: 2,
  },
  docType: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  docExpiry: {
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 10,
  },
  deleteBtnText: {
    fontSize: 20,
  },
});
