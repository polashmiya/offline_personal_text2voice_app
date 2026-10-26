import React from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/tokens';
import { AppText } from '../ui/primitives';

type Props = {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Tab screens have no native header, so they pad the status bar themselves. */
  topInset?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
};

export function Screen({ title, right, children, scroll = true, topInset = true, keyboardShouldPersistTaps }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header" style={styles.flex}>
        {title}
      </AppText>
      {right}
    </View>
  ) : null;
  const containerStyle = [
    styles.container,
    { backgroundColor: colors.background, paddingTop: topInset ? insets.top : 0 },
  ];
  if (!scroll) {
    return (
      <View style={containerStyle}>
        {header}
        {children}
      </View>
    );
  }
  return (
    <View style={containerStyle}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? 'handled'}>
        {header}
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.lg, gap: spacing.sm },
});
