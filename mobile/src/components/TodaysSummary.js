// Resolution Fitness App — TodaysSummary
//
// Reusable Card row that surfaces a small set of summary metrics.
// The "Cal Burned + Water" usage on the Dashboard is one example;
// FitnessScreen, AccountScreen, or any tab that needs a paired-
// metric row can drop this in with any 2+ metrics.
//
// ONE place to edit any paired-metric row layout app-wide:
//
//   ▸ Layout pattern (row vs column, gap, margin)
//   ▸ Inner padding + alignment
//   ▸ Numbers typography
//   ▸ Label / sub label typography
//
// ────────────────────────────────────────────────────────────────────
//  ── WHERE TO EDIT  ──
//   ▸ Layout pattern       → styles.row
//   ▸ Inner padding        → styles.cardInner
//   ▸ Numbers typography   → styles.value
//   ▸ Label/sub typography → styles.label / styles.sub
// ────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from './Card';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing } from '../theme/spacing';

/**
 * @typedef {Object} Metric
 * @property {string|number} value  The big metric value (e.g. 320, '1500ml').
 * @property {string}        label  The metric label (e.g. 'Cal Burned').
 * @property {string}        [sub]  Optional trailing subtitle
 *                                  (e.g. 'kcal today', 'of 2000ml').
 */

/**
 * TodaysSummary — a row of <Card> surfaces, each centered internally
 * and taking an even slice of the row width.
 *
 * The position pattern is locked: horizontal row, `gap: Spacing.md`,
 * each card `flex:1`, inner content `alignItems:'center'`. Caller
 * decides the data shape via `metrics` — only the layout is fixed.
 *
 * Reusable across tabs. The Dashboard uses it for Cal + Water; if
 * you add mileage + steps to the Dashboard, just push another
 * `{ value, label, sub }` entry into `metrics`.
 *
 * Props:
 *  - metrics?   Metric[] — list of cards to render. Defaults to [].
 *               ▸ 0 metrics → renders nothing (no row, no margin gap).
 *               ▸ 1 metric → single card stretches to full row.
 *               ▸ 2+ metrics → each card is `flex:1`, evenly split.
 *
 * When `metrics` is empty, the row is skipped entirely so the
 * surrounding layout does NOT inherit a stray `marginBottom` gap.
 */
export default function TodaysSummary({ metrics = [] }) {
  if (metrics.length === 0) return null;
  return (
    <View style={styles.row}>
      {metrics.map((m) => (
        <Card key={m.label} style={styles.card} contentStyle={styles.cardInner}>
          <Text style={styles.value}>{m.value}</Text>
          <Text style={styles.label}>{m.label}</Text>
          {m.sub ? <Text style={styles.sub}>{m.sub}</Text> : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Layout pattern (position lives here) ──
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  // Each card takes an even slice of the row.
  card: {
    flex: 1,
  },
  // Inner content is centered within each card surface.
  cardInner: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  // ── Typography ──
  // Big metric value.
  value: {
    ...Typography.statSmall,
    color: Colors.black,
  },
  // Metric label (e.g. "Cal Burned", "Water").
  label: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  // Trailing subtitle (e.g. "kcal today", "of 2000ml") — optional.
  sub: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});
