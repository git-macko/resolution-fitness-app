// Resolution Fitness App — HeroStatRow
// Renders a horizontal row of stat cells that pair well inside a hero card.
// Cells are separated by thin dividers colored against a dark gradient.
//
// Each cell supports an optional `tone` so callers can tint label/value
// to match the screen's theme while keeping contrast on the gradient:
//
//   tone: 'default' (white)
//   tone: 'primary' (amber — for accent stats like streak / level)
//   tone: 'info'    (sky blue — for hydration / protein)
//   tone: 'warning' (warm amber — for carbs / capacity)
//   tone: 'error'   (soft red — for fat / over-target)
//
// `tone` is optional and falls back to white.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Spacing } from '../theme/spacing';
import Typography from '../theme/typography';
import { useTheme } from '../contexts/ThemeContext';

// Map tone name -> StyleSheet key suffix.
const toneKey = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Default');

export default function HeroStatRow({ stats }) {
  const { colors } = useTheme();

  // Map tone → theme color keys
  const toneColors = {
    default: { value: colors.heroText, label: colors.heroTextMuted },
    primary: { value: colors.heroStatPrimary, label: colors.heroStatPrimaryLabel },
    info:    { value: colors.heroStatInfo, label: colors.heroStatInfoLabel },
    warning: { value: colors.heroStatWarning, label: colors.heroStatWarningLabel },
    error:   { value: colors.heroStatError, label: colors.heroStatErrorLabel },
  };

  // stats: [{ value: '12', label: 'Workouts', tone?: 'primary' | ... }, ...]
  return (
    <View style={[styles.row, { backgroundColor: colors.heroStatBg }]}>
      {stats.map((s, i) => {
        const tc = toneColors[s.tone] || toneColors.default;
        return (
          <React.Fragment key={`${s.label}-${i}`}>
            <View style={styles.cell}>
              <Text style={[styles.value, { color: tc.value }]}>{s.value}</Text>
              <Text style={[styles.label, { color: tc.label }]}>{s.label}</Text>
            </View>
            {i < stats.length - 1 ? <View style={[styles.divider, { backgroundColor: colors.heroStatDivider }]} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    ...Typography.statSmall,
    fontWeight: '800',
  },
  label: {
    ...Typography.caption,
    marginTop: 2,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: 28,
  },
});
