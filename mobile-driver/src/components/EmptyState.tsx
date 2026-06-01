import { StyleSheet, Text, View } from 'react-native';

type EmptyStateProps = {
  title: string;
  message?: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  title: {
    color: '#111827',
    fontWeight: '600',
  },
  message: {
    color: '#4B5563',
  },
});
