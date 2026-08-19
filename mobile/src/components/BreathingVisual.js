// Resolution Fitness — Breathing Visual
// Animated circle that expands and contracts to guide the user through
// a calming breathing exercise during workout rest periods.
// Supports multiple patterns with haptic feedback on phase transitions.

import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { Spacing, BorderRadius } from '../theme/spacing';

// ── Breathing Pattern Definitions ────────────────────────────────
// Each pattern defines phases with label, duration (ms), and scale targets.
export const BREATHING_PATTERNS = {
  box: {
    id: 'box',
    label: 'Box Breathing',
    description: '4-4-4-4 — Navy SEAL technique for focus',
    phases: [
      { label: 'Breathe In', duration: 4000, from: 0.55, to: 1.0 },
      { label: 'Hold', duration: 4000, from: 1.0, to: 1.0 },
      { label: 'Breathe Out', duration: 4000, from: 1.0, to: 0.55 },
      { label: 'Hold', duration: 4000, from: 0.55, to: 0.55 },
    ],
  },
  relaxing478: {
    id: 'relaxing478',
    label: '4-7-8 Relaxing',
    description: 'Calming pattern for recovery',
    phases: [
      { label: 'Breathe In', duration: 4000, from: 0.5, to: 1.0 },
      { label: 'Hold', duration: 7000, from: 1.0, to: 1.0 },
      { label: 'Breathe Out', duration: 8000, from: 1.0, to: 0.5 },
    ],
  },
  simple: {
    id: 'simple',
    label: 'Simple',
    description: 'Basic in-out rhythm',
    phases: [
      { label: 'Breathe In', duration: 4000, from: 0.55, to: 1.0 },
      { label: 'Breathe Out', duration: 6000, from: 1.0, to: 0.55 },
    ],
  },
  energize: {
    id: 'energize',
    label: 'Energize',
    description: 'Quick inhale, long exhale for alertness',
    phases: [
      { label: 'Breathe In', duration: 2000, from: 0.5, to: 1.0 },
      { label: 'Breathe Out', duration: 6000, from: 1.0, to: 0.5 },
    ],
  },
};

const MIN_SCALE = 0.55;
const MAX_SCALE = 1.0;

/**
 * @param {string} patternId - Key from BREATHING_PATTERNS (default: 'box')
 * @param {number} circleSize - Diameter of the breathing circle (default: 120)
 * @param {string} accentColor - Override accent color (uses theme default if omitted)
 */
export default function BreathingVisual({ patternId = 'box', circleSize = 120, accentColor }) {
  const { colors } = useTheme();
  const accent = accentColor || colors.accent;
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;
  const [phaseIdx, setPhaseIdx] = useState(0);
  const animRef = useRef(null);

  const pattern = BREATHING_PATTERNS[patternId] || BREATHING_PATTERNS.box;
  const phases = pattern.phases;

  useEffect(() => {
    let cancelled = false;
    let idx = 0;

    const runPhase = () => {
      if (cancelled) return;
      const phase = phases[idx % phases.length];
      setPhaseIdx(idx % phases.length);

      // Haptic feedback on phase change
      if (phase.label === 'Hold') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      animRef.current = Animated.parallel([
        Animated.timing(scale, {
          toValue: phase.to,
          duration: phase.duration,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: phase.label === 'Hold' ? 0.5 : 0.85,
          duration: phase.duration,
          useNativeDriver: true,
        }),
      ]);

      animRef.current.start(() => {
        idx++;
        runPhase();
      });
    };

    runPhase();

    return () => {
      cancelled = true;
      if (animRef.current) animRef.current.stop();
    };
  }, [patternId]);

  const currentLabel = phases[phaseIdx]?.label || 'Breathe In';
  const outerSize = circleSize + 20;

  return (
    <View style={styles.container}>
      <View style={[styles.wrapper, { width: outerSize, height: outerSize }]}>
        {/* Outer glow ring */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              width: outerSize,
              height: outerSize,
              borderRadius: outerSize / 2,
              borderColor: accent,
              opacity: opacity.interpolate({
                inputRange: [0.5, 0.85],
                outputRange: [0.15, 0.3],
              }),
              transform: [{ scale: scale.interpolate({
                inputRange: [MIN_SCALE, MAX_SCALE],
                outputRange: [MIN_SCALE - 0.05, MAX_SCALE + 0.05],
              }) }],
            },
          ]}
        />

        {/* Main breathing circle */}
        <Animated.View
          style={[
            styles.circle,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              backgroundColor: accent,
              opacity,
              transform: [{ scale }],
            },
          ]}
        />

        {/* Label text */}
        <View style={styles.labelContainer}>
          <Text style={[styles.label, { color: colors.textInverse }]}>
            {currentLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  circle: {
    position: 'absolute',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
