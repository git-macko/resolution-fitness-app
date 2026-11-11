// Resolution Fitness — Server Wake Notice
// The backend sleeps when idle on free hosting, so the first request after a
// pause can wait a minute while the instance boots. This notice explains that
// wait instead of leaving the user staring at an unexplained spinner.
// Mounted once at the app root; renders nothing unless a warm-up is running.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import api from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

export default function ServerWakeNotice() {
  const { colors } = useTheme();
  const [warming, setWarming] = useState(() => api.isWarmingUp());

  useEffect(() => api.subscribeWarmUp(setWarming), []);

  if (!warming) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <ActivityIndicator size="small" color={colors.accent} />
      <View style={styles.textGroup}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Waking up the server
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Free hosting naps when idle — this can take up to a minute.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.xl,
    right: Spacing.xl,
    bottom: Spacing['3xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    zIndex: 100,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  textGroup: {
    flex: 1,
  },
  title: {
    ...Typography.bodySmall,
    fontWeight: '700',
  },
  subtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
});
