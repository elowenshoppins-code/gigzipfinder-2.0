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
import { useStrings, type Strings } from '../src/i18n';
import { theme } from '../src/theme';

const GREEN = theme.primary;

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

function expiryState(
  t: Strings,
  expiryDate: string | null,
): {
  state: ExpiryState;
  text: string;
} {
  if (!expiryDate) return { state: 'none', text: t.vault.noExpiry };
  if (!isValidISODate(expiryDate))
    return { state: 'invalid', text: t.common.invalidDate };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${expiryDate}T00:00:00`);
  const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { state: 'expired', text: t.vault.expired };
  if (days <= 30) return { state: 'soon', text: t.vault.expiresIn(days) };
  return { state: 'ok', text: t.vault.validFor(days) };
}

const EXPIRY_ICON: Record<ExpiryState, string> = {
  expired: '🔴',
  soon: '🟡',
  ok: '🟢',
  none: '⚪',
  invalid: '⚪',
};

export default function VaultScreen() {
  const t = useStrings();
  const [hasAccess, refreshAccess] = useToolkitAccess();

  const handleRestore = useCallback(async () => {
    try {
      await restorePurchases();
      refreshAccess();
      Alert.alert(t.vault.restoredTitle, t.vault.restoreMsg);
    } catch {
      Alert.alert(t.common.error, t.common.restoreFailed);
    }
  }, [t, refreshAccess]);

  if (!hasAccess) {
    return (
      <Screen>
        <Paywall
          title="Document Vault"
          priceText={t.common.perMonth}
          features={t.vault.paywallFeatures}
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
  const t = useStrings();
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState(t.vault.docTypes[0]);
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
    setType(t.vault.docTypes[0]);
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
      if (!name) setName(asset.name ?? t.vault.defaultDocName);
    } catch {
      Alert.alert(t.common.error, t.vault.pickError);
    }
  };

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t.vault.permNeeded, t.vault.photoPerm);
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
        const fileName = asset.uri.split('/').pop() ?? t.vault.defaultDocName;
        setName(fileName);
      }
    } catch {
      Alert.alert(t.common.error, t.vault.imageError);
    }
  };

  const handleSave = async () => {
    if (!uri) {
      Alert.alert(t.vault.missingDoc, t.vault.missingDocMsg);
      return;
    }
    const finalName = name.trim();
    if (finalName === '') {
      Alert.alert(t.vault.missingName, t.vault.missingNameMsg);
      return;
    }
    const finalExpiry = expiry.trim();
    if (finalExpiry !== '' && !isValidISODate(finalExpiry)) {
      Alert.alert(t.common.invalidDate, t.vault.invalidDateMsg);
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
            t.vault.docExpiring,
            t.vault.docExpiringMsg(finalName),
            remindAt,
          );
        }
      }
      setAdding(false);
      await loadDocs();
      Alert.alert(t.vault.savedTitle, t.vault.docSavedMsg);
    } catch {
      Alert.alert(t.common.error, t.vault.docSaveError);
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
      Alert.alert(t.common.error, t.vault.openError);
    }
  };

  const handleDelete = (doc: DocRecord) => {
    Alert.alert(t.vault.delTitle, t.vault.delDoc(doc.name), [
      { text: t.common.cancelar, style: 'cancel' },
      {
        text: t.common.eliminar,
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelReminder(`doc_${doc.id}`);
            getDb().runSync('DELETE FROM documents WHERE id = ?', [doc.id]);
            await loadDocs();
          } catch {
            Alert.alert(t.common.error, t.vault.delError);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heading}>Document Vault</Text>
        {!adding && (
          <TouchableOpacity onPress={startAdd}>
            <Text style={styles.linkBtn}>＋ {t.common.agregar}</Text>
          </TouchableOpacity>
        )}
      </View>

      {adding ? (
        <View>
          <Text style={styles.stepTitle}>{t.vault.newDoc}</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.rowBtn]}
              onPress={pickFile}
            >
              <Text style={styles.secondaryBtnText}>{t.vault.uploadFile}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.rowBtn]}
              onPress={pickImage}
            >
              <Text style={styles.secondaryBtnText}>{t.vault.uploadImage}</Text>
            </TouchableOpacity>
          </View>
          {uri && <Text style={styles.body}>{t.vault.docReady}</Text>}

          <Text style={styles.label}>{t.vault.nameLabel}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.vault.nameExample}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>{t.vault.docType}</Text>
          <View style={styles.chips}>
            {t.vault.docTypes.map((dt) => (
              <TouchableOpacity
                key={dt}
                style={[styles.chip, type === dt && styles.chipActive]}
                onPress={() => setType(dt)}
              >
                <Text
                  style={[styles.chipText, type === dt && styles.chipTextActive]}
                >
                  {dt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t.vault.expiryOptional}</Text>
          <TextInput
            style={styles.input}
            placeholder={t.vault.dateExamplePh}
            value={expiry}
            onChangeText={setExpiry}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <Text style={styles.hint}>{t.vault.remindNote}</Text>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.primaryBtnText}>
              {saving ? t.vault.savingDoc : t.vault.saveDoc}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => setAdding(false)}
          >
            <Text style={styles.ghostBtnText}>{t.common.cancelar}</Text>
          </TouchableOpacity>
        </View>
      ) : docs.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.body}>
            {t.vault.emptyVaultMsg}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={startAdd}>
            <Text style={styles.primaryBtnText}>{t.vault.addDoc}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        docs.map((doc) => {
          const exp = expiryState(t, doc.expiryDate);
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
    color: theme.text,
  },
  linkBtn: {
    fontSize: 15,
    color: GREEN,
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: theme.text,
    marginBottom: 12,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 6,
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 12,
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
    color: theme.text,
    backgroundColor: theme.card,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    borderColor: GREEN,
    backgroundColor: theme.successBg,
  },
  chipText: {
    fontSize: 14,
    color: theme.text,
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
    color: theme.text,
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
    color: theme.textMuted,
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
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: theme.bg,
  },
  docMain: {
    flex: 1,
  },
  docName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    marginBottom: 2,
  },
  docType: {
    fontSize: 13,
    color: theme.textMuted,
    marginBottom: 4,
  },
  docExpiry: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 10,
  },
  deleteBtnText: {
    fontSize: 20,
  },
});
