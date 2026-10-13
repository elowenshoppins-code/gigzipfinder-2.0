import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

type StatCardProps = {
  label: string;
  value: string;
  sub?: string;
};

export function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radiusCard,
    padding: 14,
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
  },
  label: {
    fontSize: 12,
    color: theme.textMuted,
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
  },
  sub: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 4,
  },
});
