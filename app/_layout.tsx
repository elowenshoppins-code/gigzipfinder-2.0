import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { initDb, getSetting } from '../src/db/database';
import { seedIfNeeded } from '../src/seed';
import { useStrings, initLanguage } from '../src/i18n';
// Importación lateral: el módulo define la tarea de background al cargarse.
import '../src/services/mileage';

export default function RootLayout() {
  const t = useStrings();
  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await initLanguage();
        await seedIfNeeded();
        // Primera apertura: mostrar el onboarding de bienvenida.
        const done = await getSetting('onboarding_done');
        if (done !== '1') {
          router.replace('/onboarding');
        }
      } catch (e) {
        // La app puede arrancar sin datos demo; el error se ignora aquí.
        console.warn('Error inicializando la base de datos', e);
      }
    })();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="taxes" options={{ headerShown: true, title: t.nav.taxes }} />
      <Stack.Screen name="zip" options={{ headerShown: true, title: t.nav.zip }} />
      <Stack.Screen name="multiapp" options={{ headerShown: true, title: t.nav.multiapp }} />
      <Stack.Screen name="gas" options={{ headerShown: true, title: t.nav.gas }} />
      <Stack.Screen name="score" options={{ headerShown: true, title: t.nav.score }} />
      <Stack.Screen name="hotzones" options={{ headerShown: true, title: t.nav.hotzones }} />
      <Stack.Screen name="vault" options={{ headerShown: true, title: t.nav.vault }} />
      <Stack.Screen name="settings" options={{ headerShown: true, title: t.nav.settings }} />
    </Stack>
  );
}
