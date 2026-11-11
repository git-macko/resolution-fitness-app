// Resolution Fitness App — Daily AI usage notice.
// Shown on every screen that spends the user's AI allowance (Mimi chat and
// the food scanner), so the limit and today's remaining requests are
// visible before it runs out.
//
// The numbers come from GET /api/ai/usage via the API client, which also
// republishes them after every AI request.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

export default function AIUsageNotice({ style }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [usage, setUsage] = useState(() => api.getAIUsageSnapshot());

  useEffect(() => {
    const unsubscribe = api.subscribeAIUsage(setUsage);
    // Refresh on mount so the notice is current even after a restart.
    api.refreshAIUsage();
    return unsubscribe;
  }, []);

  // Nothing known yet (first load or offline) — skip rather than show zeros.
  if (!usage || !usage.limit) return null;

  const used = usage.used ?? 0;
  const remaining = usage.remaining ?? Math.max(0, usage.limit - used);
  const exhausted = remaining <= 0;
  const low = !exhausted && remaining <= Math.max(1, Math.ceil(usage.limit * 0.2));
  const tone = exhausted ? colors.error : low ? colors.warning : colors.accent;
  const percent = `${Math.min(100, Math.round((used / usage.limit) * 100))}%`;
  const summary = exhausted
    ? 'Daily limit reached · resets at midnight'
    : `${remaining} left today · resets at midnight`;

  return (
    <View
      accessible
      accessibilityLabel={`AI requests: ${used} of ${usage.limit} used today. ${exhausted ? 'Daily limit reached.' : `${remaining} left today.`}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: exhausted ? colors.error : colors.border,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>AI requests</Text>
        <Text style={[styles.value, { color: tone }]}>
          {used} of {usage.limit} used today
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.fill, { width: percent, backgroundColor: tone }]} />
      </View>

      <Text style={[styles.footnote, { color: exhausted ? colors.error : colors.textMuted }]}>
        {summary}
      </Text>
    </View>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.sm,
    },
    title: {
      ...Typography.caption,
      fontWeight: '700',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    value: {
      ...Typography.caption,
      fontWeight: '600',
    },
    track: {
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 2,
    },
    footnote: {
      ...Typography.caption,
    },
  });
