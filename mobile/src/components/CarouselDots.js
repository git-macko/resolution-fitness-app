// Resolution Fitness App — CarouselDots
// Tiny dot indicator used under the dashboard carousel cards
// (Build Inspiration, Nutrition Suggestions).
//
// Props:
//  - count: number of slides
//  - activeIndex: currently visible slide
//  - color: dot color for the active dot (defaults to accent)

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Spacing } from '../theme/spacing';

export default function CarouselDots({ count = 0, activeIndex = 0, color }) {
  const { colors } = useTheme();
  if (count <= 1) return null;

  const activeColor = color || colors.accent;

  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityValue={{ now: activeIndex + 1, min: 1, max: count }}>
      {Array.from({ length: count }).map((_, i) => {
        const active = i === activeIndex;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: active ? activeColor : colors.divider,
                width: active ? 16 : 6,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
