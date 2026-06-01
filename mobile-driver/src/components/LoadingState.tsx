import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#2563EB" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#4B5563',
  },
});
