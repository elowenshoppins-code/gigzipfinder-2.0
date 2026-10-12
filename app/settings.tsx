import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../src/components/Screen';
import { wipeDemoData } from '../src/seed';
import { restorePurchases, hasToolkitAccess } from '../src/services/monetization';

const APP_VERSION = '2.0.0';

export default function SettingsScreen() {
  const [toolkitAccess, setToolkitAccess] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    hasToolkitAccess()
      .then(setToolkitAccess)
      .catch(() => setToolkitAccess(false));
  }, []);

  const handleWipeDemo = () => {
    Alert.alert(
      'Borrar datos demo',
      'Se eliminarán todos los datos de ejemplo de la app. ¿Deseas continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setWiping(true);
            try {
              await wipeDemoData();
              Alert.alert('Listo', 'Los datos demo se borraron correctamente.');
            } catch (e) {
              Alert.alert('Error', 'No se pudieron borrar los datos demo.');
            } finally {
              setWiping(false);
            }
          },
        },
      ],
    );
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restorePurchases();
      const access = await hasToolkitAccess();
      setToolkitAccess(access);
      Alert.alert(
        'Compras restauradas',
        access ? 'Tu suscripción al toolkit está activa.' : 'No se encontraron compras previas.',
      );
    } catch (e) {
      Alert.alert('Error', 'No se pudieron restaurar las compras.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.heading}>Ajustes</Text>

      <Text style={styles.sectionTitle}>Privacidad</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Tus datos se quedan en tu dispositivo: no los enviamos a nuestros servidores.
        </Text>
        <Text style={[styles.body, styles.spaced]}>
          La app usa tu ubicación para registrar tus millas de trabajo, incluso en segundo
          plano mientras conduces. También puede usar la cámara y tu biblioteca de fotos para
          adjuntar recibos a tus registros.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Datos demo</Text>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
          onPress={handleWipeDemo}
          disabled={wiping}
        >
          <Text style={styles.dangerButtonText}>
            {wiping ? 'Borrando…' : 'Borrar datos demo'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Suscripción</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Toolkit: {toolkitAccess === null ? 'Comprobando…' : toolkitAccess ? 'Activo' : 'Inactivo'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          onPress={handleRestore}
          disabled={restoring}
        >
          <Text style={styles.secondaryButtonText}>
            {restoring ? 'Restaurando…' : 'Restaurar compras'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Acerca de</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Gig ZipFinder 2.0</Text>
        <Text style={styles.muted}>Versión {APP_VERSION}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0A0A0A',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0A',
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 14,
  },
  body: {
    fontSize: 14,
    color: '#0A0A0A',
    lineHeight: 20,
  },
  muted: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  spaced: {
    marginTop: 8,
  },
  dangerButton: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#00A651',
  },
  secondaryButtonText: {
    color: '#00A651',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
