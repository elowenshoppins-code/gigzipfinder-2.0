import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { t } from '../i18n';

type PaywallProps = {
  title: string;
  priceText: string;
  features: string[];
  onBuy: () => Promise<void> | void;
  onRestore?: () => void;
};

export function Paywall({ title, priceText, features, onBuy, onRestore }: PaywallProps) {
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    setLoading(true);
    try {
      await onBuy();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.price}>{priceText}</Text>

      <View style={styles.features}>
        {features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.buyButton, pressed && styles.pressed]}
        onPress={handleBuy}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buyButtonText}>{t.common.continuar}</Text>
        )}
      </Pressable>

      {onRestore ? (
        <Pressable onPress={onRestore} style={styles.restoreButton}>
          <Text style={styles.restoreText}>Restaurar compras</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0A0A0A',
    textAlign: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 40,
    fontWeight: '800',
    color: '#00A651',
    marginBottom: 24,
  },
  features: {
    alignSelf: 'stretch',
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  check: {
    fontSize: 18,
    color: '#00A651',
    fontWeight: '700',
    marginRight: 10,
  },
  featureText: {
    fontSize: 15,
    color: '#0A0A0A',
    flexShrink: 1,
  },
  buyButton: {
    backgroundColor: '#00A651',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  restoreButton: {
    paddingVertical: 8,
  },
  restoreText: {
    color: '#00A651',
    fontSize: 15,
    fontWeight: '600',
  },
});
