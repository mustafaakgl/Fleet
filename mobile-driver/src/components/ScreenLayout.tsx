import { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme';

type ScreenLayoutProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  scroll?: boolean;
}>;

export function ScreenLayout({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  footer,
  scroll = true,
}: ScreenLayoutProps) {
  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        ) : undefined
      }
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.contentStatic]}>
      {header}
      <View style={styles.flex}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      {body}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  contentStatic: {
    flex: 1,
  },
  flex: { flex: 1 },
  header: { gap: spacing.xs },
  title: { ...typography.h1, fontSize: 22 },
  subtitle: { ...typography.caption, textTransform: 'none', fontSize: 14 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.lg,
  },
});
