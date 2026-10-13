import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../src/components/Screen';
import { wipeDemoData } from '../src/seed';
import { restorePurchases, hasToolkitAccess } from '../src/services/monetization';
import {
  useStrings,
  setLanguage,
  getLanguage,
  LANGUAGES,
  type Language,
} from '../src/i18n';
import { theme } from '../src/theme';

const APP_VERSION = '2.0.0';

export default function SettingsScreen() {
  const t = useStrings();
  const [toolkitAccess, setToolkitAccess] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [lang, setLang] = useState<Language>(getLanguage());

  useEffect(() => {
    hasToolkitAccess()
      .then(setToolkitAccess)
      .catch(() => setToolkitAccess(false));
  }, []);

  const handleWipeDemo = () => {
    Alert.alert(t.settings.wipeTitle, t.settings.wipeMsg, [
      { text: t.common.cancelar, style: 'cancel' },
      {
        text: t.settings.wipeConfirm,
        style: 'destructive',
        onPress: async () => {
          setWiping(true);
          try {
            await wipeDemoData();
            Alert.alert(t.common.listo, t.settings.wipedOk);
          } catch (e) {
            Alert.alert(t.common.error, t.settings.wipedError);
          } finally {
            setWiping(false);
          }
        },
      },
    ]);
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      const access = await hasToolkitAccess();
      setToolkitAccess(access);
      Alert.alert(
        t.settings.restored,
        access ? t.settings.restoredActive : t.settings.restoredNone,
      );
    } catch (e) {
      Alert.alert(t.common.error, t.common.restoreFailed);
    } finally {
      setRestoring(false);
    }
  };

  const handleLanguage = async (code: Language) => {
    setLang(code);
    await setLanguage(code);
  };

  return (
    <Screen>
      <Text style={styles.heading}>{t.settings.title}</Text>

      <Text style={styles.sectionTitle}>{t.settings.language}</Text>
      <View style={styles.card}>
        {LANGUAGES.map((l) => {
          const selected = l.code === lang;
          return (
            <Pressable
              key={l.code}
              style={({ pressed }) => [
                styles.langRow,
                pressed && styles.pressed,
              ]}
              onPress={() => handleLanguage(l.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={l.label}
            >
              <Text style={styles.langLabel}>{l.label}</Text>
              <Text style={[styles.langCheck, selected && styles.langCheckOn]}>
                {selected ? '●' : '○'}
              </Text>
            </Pressable>
          );
        })}
        <Text style={styles.muted}>{t.settings.languageNote}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t.settings.privacy}</Text>
      <View style={styles.card}>
        <Text style={styles.body}>{t.settings.privacyP1}</Text>
        <Text style={[styles.body, styles.spaced]}>{t.settings.privacyP2}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t.settings.demoData}</Text>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
          onPress={handleWipeDemo}
          disabled={wiping}
        >
          <Text style={styles.dangerButtonText}>
            {wiping ? t.settings.wiping : t.settings.wipeDemo}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t.settings.subscription}</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          {t.settings.toolkit}:{' '}
          {toolkitAccess === null
            ? t.settings.checking
            : toolkitAccess
              ? t.settings.active
              : t.settings.inactive}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={handleRestore}
          disabled={restoring}
        >
          <Text style={styles.secondaryButtonText}>
            {restoring ? t.settings.restoring : t.common.restaurarCompras}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t.settings.about}</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Gig ZipFinder 2.0</Text>
        <Text style={styles.muted}>{t.settings.version(APP_VERSION)}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radiusCard,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  body: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 20,
  },
  muted: {
    fontSize: 14,
    color: theme.textMuted,
    marginTop: 4,
  },
  spaced: {
    marginTop: 8,
  },
  dangerButton: {
    backgroundColor: theme.danger,
    borderRadius: theme.radiusPill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: theme.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: theme.card,
    borderRadius: theme.radiusPill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  secondaryButtonText: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  langLabel: {
    fontSize: 16,
    color: theme.text,
    fontWeight: '600',
  },
  langCheck: {
    fontSize: 18,
    color: theme.textMuted,
  },
  langCheckOn: {
    color: theme.primary,
  },
});
