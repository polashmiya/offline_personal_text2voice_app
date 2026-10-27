import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button } from '../../../components/ui/primitives';
import { useTheme } from '../../../theme/ThemeProvider';
import { radius, spacing } from '../../../theme/tokens';
import { activeSpan, type TimedSpan } from '../../../domain/timeline/timeline';
import { usePlayer } from './playerStore';

type Props = {
  /** Audio file the timeline belongs to; highlighting follows the player only while it plays this file. */
  path: string;
  text: string;
  timeline: TimedSpan[];
};

const Sentence = memo(function SentenceRow({
  text,
  active,
  onPress,
  onLayout,
  label,
}: {
  text: string;
  active: boolean;
  onPress: () => void;
  onLayout: (y: number) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLayout={e => onLayout(e.nativeEvent.layout.y)}
      style={[styles.sentence, active && { backgroundColor: colors.accentSoft }]}>
      <AppText tone={active ? 'accent' : 'default'} style={active ? styles.activeText : undefined}>
        {text}
      </AppText>
    </Pressable>
  );
});

/**
 * Read-along: the generated text, one sentence per row, with the sentence
 * being heard highlighted and kept in view. Tap a sentence to jump there.
 */
export function ReadAlong({ path, text, timeline }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const positions = useRef<number[]>([]);
  // Re-renders only when the active sentence changes, not on every position tick.
  const active = usePlayer(s => (s.path === path ? activeSpan(timeline, s.positionMs) : -1));

  const sentences = useMemo(
    () => timeline.map(span => text.slice(span.sourceStart, span.sourceEnd).replace(/\s+/g, ' ').trim()),
    [text, timeline],
  );

  useEffect(() => {
    if (open && active >= 0 && positions.current[active] !== undefined) {
      scroll.current?.scrollTo({ y: Math.max(0, positions.current[active] - 48), animated: true });
    }
  }, [active, open]);

  if (timeline.length === 0) {
    return null;
  }

  const seekTo = async (index: number) => {
    const player = usePlayer.getState();
    if (player.path !== path && !(await player.load(path))) {
      return;
    }
    await usePlayer.getState().seek(timeline[index].startMs);
    if (!usePlayer.getState().playing) {
      await usePlayer.getState().toggle();
    }
  };

  return (
    <View style={styles.wrap}>
      <Button
        compact
        kind="ghost"
        icon="fileText"
        label={open ? t('player.hideText') : t('player.readAlong')}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <ScrollView
          ref={scroll}
          nestedScrollEnabled
          style={[styles.box, { borderColor: colors.border, backgroundColor: colors.surface }]}
          contentContainerStyle={styles.content}>
          {sentences.map((sentence, i) =>
            sentence ? (
              <Sentence
                key={i}
                text={sentence}
                active={i === active}
                label={t('player.jumpTo', { text: sentence })}
                onPress={() => seekTo(i)}
                onLayout={y => {
                  positions.current[i] = y;
                }}
              />
            ) : null,
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  box: { maxHeight: 320, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md },
  content: { padding: spacing.sm, gap: 2 },
  sentence: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm },
  activeText: { fontWeight: '600' },
});
