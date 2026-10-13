import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useStrings } from '../i18n';
import { theme } from '../theme';

type PaywallProps = {
  title: string;
  priceText: string;
  features: string[];
  onBuy: () => Promise<void> | void;
  onRestore?: () => void;
};

export function Paywall({ title, priceText, features, onBuy, onRestore }: PaywallProps) {
  const t = useStrings();
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
          <ActivityIndicator color={theme.onPrimary} />
        ) : (
          <Text style={styles.buyButtonText}>{t.common.continuar}</Text>
        )}
      </Pressable>

      {onRestore ? (
        <Pressable onPress={onRestore} style={styles.restoreButton}>
          <Text style={styles.restoreText}>{t.paywall.restore}</Text>
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
    color: theme.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 40,
    fontWeight: '800',
    color: theme.primary,
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
    color: theme.success,
    fontWeight: '700',
    marginRight: 10,
  },
  featureText: {
    fontSize: 15,
    color: theme.text,
    flexShrink: 1,
  },
  buyButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radiusPill,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 12,
  },
  buyButtonText: {
    color: theme.onPrimary,
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
    color: theme.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});
