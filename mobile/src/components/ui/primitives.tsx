import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH, radius, spacing, typography } from '../../theme/tokens';
import { Icon, type IconName } from './Icon';

// ------------------------------------------------------------------ text

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'warning';

export function AppText({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const { colors } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
  }[tone];
  return <Text {...rest} style={[typography[variant], { color }, style]} />;
}

// ------------------------------------------------------------------ buttons

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function Button({ label, icon, kind = 'primary', loading, disabled, style, compact, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.accent, fg: colors.accentText, border: colors.accent },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[kind];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : icon ? (
        <Icon name={icon} size={20} color={palette.fg} />
      ) : null}
      <Text style={[typography.bodyStrong, { color: palette.fg }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  size = 24,
  tone = 'default',
  filled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  tone?: 'default' | 'accent' | 'danger';
  filled?: boolean;
}) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        filled && { backgroundColor: colors.accent },
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}>
      <Icon name={icon} size={size} color={filled ? colors.accentText : color} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ containers

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader} accessibilityRole="header">
      <AppText variant="small" tone="muted" style={styles.sectionTitle}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size={28} color={colors.accent} />
      </View>
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      {body ? (
        <AppText tone="muted" style={styles.center}>
          {body}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function Banner({
  tone,
  text,
  action,
}: {
  tone: 'info' | 'error' | 'success' | 'warning';
  text: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.accentSoft, fg: colors.text, icon: 'info' as const, iconColor: colors.accent },
    error: { bg: colors.dangerSoft, fg: colors.text, icon: 'alert' as const, iconColor: colors.danger },
    success: { bg: colors.successSoft, fg: colors.text, icon: 'check' as const, iconColor: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.text, icon: 'alert' as const, iconColor: colors.warning },
  }[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: map.bg }]}
      accessibilityRole={tone === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite">
      <Icon name={map.icon} size={20} color={map.iconColor} />
      <AppText variant="small" style={[styles.flex, { color: map.fg }]}>
        {text}
      </AppText>
      {action}
    </View>
  );
}

// ------------------------------------------------------------------ choices

export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!option.disabled }}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected ? colors.accentSoft : colors.surface,
                borderColor: selected ? colors.accent : colors.border,
                opacity: option.disabled ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}>
            {selected ? <Icon name="check" size={16} color={colors.accent} /> : null}
            <Text style={[typography.small, { color: selected ? colors.accent : colors.text, fontWeight: selected ? '600' : '400' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ rows

export function ListRow({
  title,
  subtitle,
  icon,
  onPress,
  right,
  destructive,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {icon ? <Icon name={icon} size={22} color={destructive ? colors.danger : colors.textMuted} /> : null}
      <View style={styles.flex}>
        <AppText tone={destructive ? 'danger' : 'default'}>{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={20} color={colors.textFaint} /> : null)}
    </>
  );
  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {content}
    </Pressable>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      onPress={() => onChange(!value)}
      style={styles.row}>
      <View style={styles.flex}>
        <AppText>{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor={colors.surface}
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg }} />;
}

// ------------------------------------------------------------------ inputs

export function TextField({
  label,
  hint,
  style,
  ...rest
}: TextInputProps & { label: string; hint?: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        {...rest}
        style={[
          typography.body,
          styles.input,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
          style,
        ]}
      />
      {hint ? (
        <AppText variant="caption" tone="faint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: spacing.md },
  iconButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  field: { gap: spacing.xs },
  input: { minHeight: MIN_TOUCH, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
