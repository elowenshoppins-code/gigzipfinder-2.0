import { View, Text, StyleSheet } from 'react-native';

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
    backgroundColor: '#F6F7F6',
    borderRadius: 12,
    padding: 14,
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0A0A0A',
  },
  sub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});
