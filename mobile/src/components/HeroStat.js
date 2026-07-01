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

// Map tone name -> StyleSheet key suffix.
const toneKey = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Default');

export default function HeroStatRow({ stats }) {
  // stats: [{ value: '12', label: 'Workouts', tone?: 'primary' | ... }, ...]
  return (
    <View style={styles.row}>
      {stats.map((s, i) => {
        const valueStyle = styles[`value${toneKey(s.tone)}`] || styles.valueDefault;
        const labelStyle = styles[`label${toneKey(s.tone)}`] || styles.labelDefault;
        return (
          <React.Fragment key={`${s.label}-${i}`}>
            <View style={styles.cell}>
              <Text style={valueStyle}>{s.value}</Text>
              <Text style={labelStyle}>{s.label}</Text>
            </View>
            {i < stats.length - 1 ? <View style={styles.divider} /> : null}
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
  },
  // ── Default tone: white on translucent background ────────
  valueDefault: {
    ...Typography.statSmall,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  labelDefault: {
    ...Typography.caption,
    color: 'rgba(255, 255, 255, 0.78)',
    marginTop: 2,
    textAlign: 'center',
  },
  // ── Primary tone: amber (streak / level / focal stat) ────
  valuePrimary: {
    ...Typography.statSmall,
    color: '#FCD34D',
    fontWeight: '800',
  },
  labelPrimary: {
    ...Typography.caption,
    color: 'rgba(252, 211, 77, 0.92)',
    marginTop: 2,
    textAlign: 'center',
  },
  // ── Info tone: sky blue (water / protein / positive stat) ─
  valueInfo: {
    ...Typography.statSmall,
    color: '#7DD3FC',
    fontWeight: '800',
  },
  labelInfo: {
    ...Typography.caption,
    color: 'rgba(125, 211, 252, 0.92)',
    marginTop: 2,
    textAlign: 'center',
  },
  // ── Warning tone: warm amber (carbs / capacity warning) ───
  valueWarning: {
    ...Typography.statSmall,
    color: '#FBBF24',
    fontWeight: '800',
  },
  labelWarning: {
    ...Typography.caption,
    color: 'rgba(251, 191, 36, 0.92)',
    marginTop: 2,
    textAlign: 'center',
  },
  // ── Error tone: soft red (over-target / danger stat) ─────
  valueError: {
    ...Typography.statSmall,
    color: '#FCA5A5',
    fontWeight: '800',
  },
  labelError: {
    ...Typography.caption,
    color: 'rgba(252, 165, 165, 0.92)',
    marginTop: 2,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
});
