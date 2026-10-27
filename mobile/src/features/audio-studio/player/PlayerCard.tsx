import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AudioTools } from '../../../services/native';
import { usePlayer } from './playerStore';
import { useTheme } from '../../../theme/ThemeProvider';
import { AppText, Card, ChoiceChips, IconButton } from '../../../components/ui/primitives';
import { formatClock } from '../../../utils/format';
import { spacing } from '../../../theme/tokens';
import { localizeDigits } from '../../../i18n';

const BARS = 72;
const RATES = [0.75, 1, 1.25, 1.5];

function Waveform({
  path,
  progress,
  onSeek,
  label,
}: {
  path: string;
  progress: number;
  onSeek: (fraction: number) => void;
  label: string;
}) {
  const { colors } = useTheme();
  const [peaks, setPeaks] = useState<number[]>([]);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let alive = true;
    AudioTools.computeWaveform(path, BARS)
      .then(values => alive && setPeaks(values))
      .catch(() => alive && setPeaks([]));
    return () => {
      alive = false;
    };
  }, [path]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const played = Math.round(progress * BARS);

  return (
    <Pressable
      onLayout={onLayout}
      onPress={e => width > 0 && onSeek(e.nativeEvent.locationX / width)}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => onSeek(Math.max(0, Math.min(1, progress + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
      style={styles.wave}>
      {(peaks.length ? peaks : new Array(BARS).fill(0.08)).map((peak, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: `${Math.max(6, peak * 100)}%`,
              backgroundColor: i < played ? colors.waveformPlayed : colors.waveform,
            },
          ]}
        />
      ))}
    </Pressable>
  );
}

export function PlayerCard({ path, title }: { path: string; title?: string }) {
  const { t } = useTranslation();
  const player = usePlayer();
  const isCurrent = player.path === path;

  useEffect(() => {
    player.load(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const progress = isCurrent && player.durationMs > 0 ? player.positionMs / player.durationMs : 0;
  const seekFraction = (f: number) => player.seek(f * player.durationMs);

  return (
    <Card>
      {title ? (
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
      ) : null}
      <Waveform path={path} progress={progress} onSeek={seekFraction} label={t('player.seek')} />
      <View style={styles.times}>
        <AppText variant="caption" tone="muted">
          {formatClock(isCurrent ? player.positionMs : 0)}
        </AppText>
        <AppText variant="caption" tone="muted">
          {formatClock(isCurrent ? player.durationMs : 0)}
        </AppText>
      </View>
      <View style={styles.controls}>
        <IconButton icon="restart" label={t('player.restart')} onPress={player.restart} disabled={!isCurrent} />
        <IconButton icon="back" label={t('player.back10')} onPress={() => player.skip(-10000)} disabled={!isCurrent} />
        <IconButton
          icon={player.playing && isCurrent ? 'pause' : 'play'}
          label={player.playing && isCurrent ? t('player.pause') : t('player.play')}
          onPress={player.toggle}
          disabled={!isCurrent}
          filled
          size={28}
        />
        <IconButton icon="forward" label={t('player.forward10')} onPress={() => player.skip(10000)} disabled={!isCurrent} />
      </View>
      <ChoiceChips
        label={t('player.previewSpeed')}
        value={player.rate}
        onChange={player.setRate}
        options={RATES.map(r => ({ value: r, label: localizeDigits(`${r}×`) }))}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  wave: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
});
