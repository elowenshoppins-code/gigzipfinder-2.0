import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { initDb } from '../src/db/database';
import { seedIfNeeded } from '../src/seed';
// Importación lateral: el módulo define la tarea de background al cargarse.
import '../src/services/mileage';

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await seedIfNeeded();
      } catch (e) {
        // La app puede arrancar sin datos demo; el error se ignora aquí.
        console.warn('Error inicializando la base de datos', e);
      }
    })();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="taxes" options={{ headerShown: true, title: 'Impuestos' }} />
      <Stack.Screen name="zip" options={{ headerShown: true, title: 'Zonas ZIP' }} />
      <Stack.Screen name="multiapp" options={{ headerShown: true, title: 'Multi-app' }} />
      <Stack.Screen name="gas" options={{ headerShown: true, title: 'Combustible' }} />
      <Stack.Screen name="score" options={{ headerShown: true, title: 'Mi puntaje' }} />
      <Stack.Screen name="hotzones" options={{ headerShown: true, title: 'Zonas calientes' }} />
      <Stack.Screen name="vault" options={{ headerShown: true, title: 'Bóveda' }} />
      <Stack.Screen name="settings" options={{ headerShown: true, title: 'Ajustes' }} />
    </Stack>
  );
}
