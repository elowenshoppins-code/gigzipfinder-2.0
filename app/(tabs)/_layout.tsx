import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { t } from '../../src/i18n';

const ACTIVE_COLOR = '#00A651';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.inicio,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: t.tabs.ganancias,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="miles"
        options={{
          title: t.tabs.millas,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="appeal"
        options={{
          title: t.tabs.apelacion,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="gigai"
        options={{
          title: t.tabs.gigai,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
