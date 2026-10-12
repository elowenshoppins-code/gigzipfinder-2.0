/**
 * Apelación AI (tab) — asistente para apelar desactivaciones.
 *
 * Pasos: 1) elegir plataforma → 2) (opcional) analizar captura de la
 * notificación → 3) cuestionario guiado (una pregunta por pantalla) →
 * 4) carta generada ES/EN (copiar, abrir enlace oficial, guardar) →
 * historial de apelaciones con detalle.
 *
 * Acceso: suscripción toolkit ($10/mes) vía useToolkitAccess +
 * componente Paywall. Si no hay acceso, se muestra el paywall.
 *
 * NOTA: expo-clipboard debe estar instalado (`npx expo install expo-clipboard`).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../src/components/Screen';
import { Paywall } from '../../src/components/Paywall';
import {
  restorePurchases,
  subscribeToolkit,
  useToolkitAccess,
} from '../../src/services/monetization';
import {
  OFFICIAL_LINKS,
  PLATFORMS,
  analyzeDeactivationImage,
  buildLetterEn,
  buildLetterEs,
  deleteAppeal,
  listAppeals,
  saveAppeal,
  wizardQuestions,
} from '../../src/services/appeal';
import type { AppealAnswers } from '../../src/services/appeal';
import type { AppealRecord } from '../../src/db/database';

type Step = 'platform' | 'photo' | 'wizard' | 'letter' | 'history';

const EMPTY_ANSWERS: AppealAnswers = {
  motivo: '',
  fecha: '',
  contexto: '',
  evidencia: '',
  pedido: '',
};

const GREEN = '#00A651';

export default function AppealScreen() {
  const [hasAccess, refreshAccess] = useToolkitAccess();

  const handleRestore = useCallback(async () => {
    try {
      await restorePurchases();
      refreshAccess();
      Alert.alert(
        'Compras restauradas',
        'Si tenías una suscripción activa, ya puedes usar la Apelación AI.',
      );
    } catch {
      Alert.alert('Error', 'No se pudieron restaurar las compras.');
    }
  }, [refreshAccess]);

  if (!hasAccess) {
    return (
      <Screen>
        <Paywall
          title="Apelación AI"
          priceText="$10/mes"
          features={[
            'Asistente paso a paso para apelar desactivaciones',
            'Cartas formales en español e inglés listas para enviar',
            'Análisis de tu notificación de desactivación',
            'Enlaces oficiales de apelación por plataforma',
            'Historial de tus apelaciones',
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

  return <AppealFlow />;
}

function AppealFlow() {
  const [step, setStep] = useState<Step>('platform');
  const [platformId, setPlatformId] = useState<string>(PLATFORMS[0].id);
  const [answers, setAnswers] = useState<AppealAnswers>(EMPTY_ANSWERS);
  const [qIndex, setQIndex] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [analysisNote, setAnalysisNote] = useState('');
  const [lang, setLang] = useState<'es' | 'en'>('es');
  const [letterEs, setLetterEs] = useState('');
  const [letterEn, setLetterEn] = useState('');
  const [history, setHistory] = useState<AppealRecord[]>([]);
  const [detail, setDetail] = useState<AppealRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const platformName =
    PLATFORMS.find((p) => p.id === platformId)?.name ?? platformId;
  const questions = wizardQuestions(platformName);
  const currentQ = questions[qIndex];

  const loadHistory = useCallback(async () => {
    setHistory(await listAppeals());
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const resetFlow = () => {
    setPlatformId(PLATFORMS[0].id);
    setAnswers(EMPTY_ANSWERS);
    setQIndex(0);
    setPhotoUri(null);
    setReasons([]);
    setSelectedReasons([]);
    setAnalysisNote('');
    setLetterEs('');
    setLetterEn('');
    setLang('es');
    setStep('platform');
  };

  /* ---------- Paso 2: análisis de la captura ---------- */

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permiso necesario',
          'Permite el acceso a tus fotos para analizar la captura de la notificación.',
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const uri = res.assets[0].uri;
      setPhotoUri(uri);
      setAnalyzing(true);
      const result = await analyzeDeactivationImage(uri);
      setReasons(result.likelyReasons);
      setAnalysisNote(result.note);
      setSelectedReasons([]);
    } catch {
      Alert.alert('Error', 'No se pudo procesar la imagen.');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleReason = (reason: string) => {
    const next = selectedReasons.includes(reason)
      ? selectedReasons.filter((r) => r !== reason)
      : [...selectedReasons, reason];
    setSelectedReasons(next);
    // Pre-rellena el campo "motivo" con los motivos seleccionados (editable).
    setAnswers((a) => ({ ...a, motivo: next.join('; ') }));
  };

  /* ---------- Paso 3: cuestionario ---------- */

  const setAnswer = (key: keyof AppealAnswers, value: string) => {
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  const nextQuestion = () => {
    const value = answers[currentQ.key].trim();
    // 'evidencia' es opcional; el resto es obligatorio para generar la carta.
    if (currentQ.key !== 'evidencia' && value === '') {
      Alert.alert(
        'Falta información',
        'Responde la pregunta para continuar (o vuelve atrás).',
      );
      return;
    }
    if (qIndex < questions.length - 1) {
      setQIndex(qIndex + 1);
    } else {
      setLetterEs(buildLetterEs(platformName, answers));
      setLetterEn(buildLetterEn(platformName, answers));
      setStep('letter');
    }
  };

  /* ---------- Paso 4: carta ---------- */

  const letter = lang === 'es' ? letterEs : letterEn;

  const copyLetter = async () => {
    try {
      await Clipboard.setStringAsync(letter);
      Alert.alert('¡Copiado!', 'La carta se copió al portapapeles.');
    } catch {
      Alert.alert('Error', 'No se pudo copiar la carta.');
    }
  };

  const openOfficialLink = async () => {
    const url = OFFICIAL_LINKS[platformId];
    if (!url) {
      Alert.alert('Sin enlace', 'No hay enlace oficial para esta plataforma.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Error', 'No se pudo abrir el enlace.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'No se pudo abrir el enlace.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAppeal(platformId, answers, letterEs, letterEn);
      await loadHistory();
      Alert.alert('Guardada', 'Tu apelación se guardó en el historial.');
      setStep('history');
    } catch {
      Alert.alert('Error', 'No se pudo guardar la apelación.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Eliminar', '¿Eliminar esta apelación del historial?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteAppeal(id);
          setDetail(null);
          await loadHistory();
        },
      },
    ]);
  };

  const fmtDate = (epochMs: number) =>
    new Date(epochMs).toLocaleDateString('es-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const platformOf = (record: AppealRecord) =>
    PLATFORMS.find((p) => p.id === record.platform)?.name ?? record.platform;

  const detailAnswers: AppealAnswers | null = (() => {
    if (!detail) return null;
    try {
      return JSON.parse(detail.answersJson) as AppealAnswers;
    } catch {
      return null;
    }
  })();

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heading}>Apelación AI</Text>
        <View style={styles.headerBtns}>
          {step !== 'history' ? (
            <TouchableOpacity onPress={() => setStep('history')}>
              <Text style={styles.linkBtn}>📋 Historial</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={resetFlow}>
              <Text style={styles.linkBtn}>＋ Nueva</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ===== Paso 1: plataforma ===== */}
      {step === 'platform' && (
        <View>
          <Text style={styles.stepTitle}>Paso 1 de 4 · ¿Qué plataforma te desactivó?</Text>
          <View style={styles.grid}>
            {PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.platformBtn,
                  platformId === p.id && styles.platformBtnActive,
                ]}
                onPress={() => setPlatformId(p.id)}
              >
                <Text
                  style={[
                    styles.platformText,
                    platformId === p.id && styles.platformTextActive,
                  ]}
                >
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('photo')}
          >
            <Text style={styles.primaryBtnText}>Continuar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== Paso 2: análisis de captura (opcional) ===== */}
      {step === 'photo' && (
        <View>
          <Text style={styles.stepTitle}>Paso 2 de 4 · Analiza tu desactivación (opcional)</Text>
          <Text style={styles.body}>
            Sube una captura de la notificación que recibiste y te sugeriremos
            los motivos más probables para pre-rellenar tu apelación.
          </Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={pickPhoto}>
            <Text style={styles.secondaryBtnText}>📸 Analizar mi desactivación</Text>
          </TouchableOpacity>
          {analyzing && (
            <ActivityIndicator style={styles.loader} color={GREEN} />
          )}
          {photoUri && !analyzing && (
            <Text style={styles.body}>✅ Captura cargada. Elige los motivos que apliquen:</Text>
          )}
          {reasons.length > 0 && !analyzing && (
            <View style={styles.chips}>
              {reasons.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.chip,
                    selectedReasons.includes(r) && styles.chipActive,
                  ]}
                  onPress={() => toggleReason(r)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selectedReasons.includes(r) && styles.chipTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {analysisNote !== '' && !analyzing && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>⚠️ {analysisNote}</Text>
            </View>
          )}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.rowBtn]}
              onPress={() => setStep('platform')}
            >
              <Text style={styles.secondaryBtnText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.rowBtn]}
              onPress={() => {
                setQIndex(0);
                setStep('wizard');
              }}
            >
              <Text style={styles.primaryBtnText}>
                {photoUri ? 'Continuar' : 'Omitir este paso'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ===== Paso 3: cuestionario ===== */}
      {step === 'wizard' && currentQ && (
        <View>
          <Text style={styles.stepTitle}>
            Paso 3 de 4 · Pregunta {qIndex + 1} de {questions.length}
          </Text>
          <Text style={styles.question}>{currentQ.question}</Text>
          <TextInput
            style={styles.input}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            placeholder={currentQ.placeholder}
            value={answers[currentQ.key]}
            onChangeText={(v) => setAnswer(currentQ.key, v)}
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.rowBtn]}
              onPress={() => {
                if (qIndex > 0) setQIndex(qIndex - 1);
                else setStep('photo');
              }}
            >
              <Text style={styles.secondaryBtnText}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.rowBtn]}
              onPress={nextQuestion}
            >
              <Text style={styles.primaryBtnText}>
                {qIndex === questions.length - 1 ? 'Generar carta' : 'Continuar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ===== Paso 4: carta generada ===== */}
      {step === 'letter' && (
        <View>
          <Text style={styles.stepTitle}>Paso 4 de 4 · Tu carta de apelación</Text>
          <Text style={styles.body}>
            Reemplaza <Text style={styles.bold}>[Tu nombre]</Text> con tus datos
            antes de enviarla.
          </Text>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, lang === 'es' && styles.tabActive]}
              onPress={() => setLang('es')}
            >
              <Text style={[styles.tabText, lang === 'es' && styles.tabTextActive]}>
                Español
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, lang === 'en' && styles.tabActive]}
              onPress={() => setLang('en')}
            >
              <Text style={[styles.tabText, lang === 'en' && styles.tabTextActive]}>
                English
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.letterBox}>
            <Text style={styles.letterText}>{letter}</Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={copyLetter}>
            <Text style={styles.primaryBtnText}>📋 Copiar carta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={openOfficialLink}>
            <Text style={styles.secondaryBtnText}>
              🔗 Abrir enlace oficial de {platformName}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={GREEN} />
            ) : (
              <Text style={styles.secondaryBtnText}>💾 Guardar apelación</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep('wizard')}>
            <Text style={styles.ghostBtnText}>Editar respuestas</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== Historial ===== */}
      {step === 'history' && (
        <View>
          <Text style={styles.stepTitle}>Historial de apelaciones</Text>
          {history.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.body}>
                Aún no tienes apelaciones guardadas. Cuando generes tu primera
                carta, aparecerá aquí.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={resetFlow}>
                <Text style={styles.primaryBtnText}>Crear mi primera apelación</Text>
              </TouchableOpacity>
            </View>
          ) : (
            history.map((record) => (
              <TouchableOpacity
                key={record.id}
                style={styles.historyItem}
                onPress={() => setDetail(record)}
              >
                <View style={styles.historyRow}>
                  <Text style={styles.historyPlatform}>{platformOf(record)}</Text>
                  <Text style={styles.historyDate}>{fmtDate(record.createdAt)}</Text>
                </View>
                <Text style={styles.historyProblem} numberOfLines={2}>
                  {record.problem || 'Sin motivo registrado'}
                </Text>
                <Text style={styles.historyCta}>Ver detalle ›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* ===== Detalle de apelación ===== */}
      <Modal
        visible={detail !== null}
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <Screen>
          {detail && (
            <View>
              <Text style={styles.heading}>
                {platformOf(detail)} · {fmtDate(detail.createdAt)}
              </Text>
              {detailAnswers && (
                <View style={styles.detailBox}>
                  <DetailRow label="Motivo" value={detailAnswers.motivo} />
                  <DetailRow label="Fecha" value={detailAnswers.fecha} />
                  <DetailRow label="Notificación" value={detailAnswers.contexto} />
                  <DetailRow label="Evidencia" value={detailAnswers.evidencia} />
                  <DetailRow label="Pedido" value={detailAnswers.pedido} />
                </View>
              )}
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, lang === 'es' && styles.tabActive]}
                  onPress={() => setLang('es')}
                >
                  <Text style={[styles.tabText, lang === 'es' && styles.tabTextActive]}>
                    Español
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, lang === 'en' && styles.tabActive]}
                  onPress={() => setLang('en')}
                >
                  <Text style={[styles.tabText, lang === 'en' && styles.tabTextActive]}>
                    English
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.letterBox}>
                <Text style={styles.letterText}>
                  {lang === 'es' ? detail.letterEs : detail.letterEn}
                </Text>
              </ScrollView>
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => handleDelete(detail.id)}
              >
                <Text style={styles.dangerBtnText}>Eliminar apelación</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setDetail(null)}
              >
                <Text style={styles.secondaryBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          )}
        </Screen>
      </Modal>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value || value.trim() === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.body}>{value}</Text>
    </View>
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
  headerBtns: {
    flexDirection: 'row',
  },
  linkBtn: {
    fontSize: 15,
    color: GREEN,
    fontWeight: '600',
    marginLeft: 12,
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
  bold: {
    fontWeight: '700',
  },
  question: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 12,
    lineHeight: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 8,
  },
  platformBtn: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    margin: 6,
    minWidth: '44%',
    flexGrow: 1,
    alignItems: 'center',
  },
  platformBtnActive: {
    borderColor: GREEN,
    backgroundColor: '#EAF7EF',
  },
  platformText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  platformTextActive: {
    color: GREEN,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 130,
    marginBottom: 16,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
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
  dangerBtn: {
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  dangerBtnText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  rowBtn: {
    flex: 1,
    marginHorizontal: 6,
  },
  loader: {
    marginVertical: 16,
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
  noticeBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  tabActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0A',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  letterBox: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    maxHeight: 320,
    backgroundColor: '#FAFAFA',
  },
  letterText: {
    fontSize: 14,
    color: '#0A0A0A',
    lineHeight: 22,
  },
  emptyBox: {
    paddingVertical: 24,
  },
  historyItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  historyPlatform: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  historyDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  historyProblem: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
  },
  historyCta: {
    fontSize: 14,
    color: GREEN,
    fontWeight: '600',
  },
  detailBox: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  detailRow: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
});
