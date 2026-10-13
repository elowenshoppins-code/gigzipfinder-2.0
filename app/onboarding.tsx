/**
 * Onboarding — bienvenida de primera apertura.
 *
 * 4 slides: bienvenida, módulos, precios, privacidad.
 * Al terminar (o al omitir) guarda `onboarding_done=1` y entra a la app.
 */

import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { theme } from '../src/theme';
import { useStrings } from '../src/i18n';
import { setSetting } from '../src/db/database';

const { width } = Dimensions.get('window');

const SLIDES = [
  { titleKey: 'slide1Title', bodyKey: 'slide1Body', emoji: '🚗', logo: true },
  { titleKey: 'slide2Title', bodyKey: 'slide2Body', emoji: '🧰', logo: false },
  { titleKey: 'slide3Title', bodyKey: 'slide3Body', emoji: '💲', logo: false },
  { titleKey: 'slide4Title', bodyKey: 'slide4Body', emoji: '🔒', logo: false },
] as const;

export default function OnboardingScreen() {
  const t = useStrings();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const finish = async () => {
    try {
      await setSetting('onboarding_done', '1');
    } catch {
      // Si no se pudo guardar, igual se entra a la app.
    }
    router.replace('/(tabs)');
  };

  const slide = SLIDES[index];
  const ob = t.onboarding;

  return (
    <View style={styles.container}>
      <Pressable onPress={finish} style={styles.skip}>
        <Text style={styles.skipText}>{ob.skip}</Text>
      </Pressable>

      <View style={styles.slide}>
        {slide.logo ? (
          <Image
            source={require('../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.emoji}>{slide.emoji}</Text>
        )}
        <Text style={styles.title}>{ob[slide.titleKey]}</Text>
        <Text style={styles.body}>{ob[slide.bodyKey]}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        onPress={last ? finish : () => setIndex(index + 1)}
      >
        <Text style={styles.buttonText}>
          {last ? ob.start : ob.next}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  skip: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 28,
    marginBottom: 32,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: theme.textBody,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: width - 80,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.border,
  },
  dotActive: {
    backgroundColor: theme.primary,
    width: 24,
  },
  button: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: theme.onPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.85,
  },
});
