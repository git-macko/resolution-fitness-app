// Resolution Fitness App — Exercise Detail Screen
// Shows full exercise information: instructions, tips, common mistakes,
// target muscle group, equipment needed.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';

export default function ExerciseDetailScreen({ route }) {
  const { exerciseId, exerciseName } = route.params || {};
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExercise();
  }, []);

  const fetchExercise = async () => {
    try {
      const data = await api.getExercise(exerciseId);
      setExercise(data.data || data || {});
    } catch (err) {
      console.warn('Exercise fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!exercise) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Exercise not found</Text>
      </View>
    );
  }

  const instructions = exercise.instructions || [];
  const tips = exercise.tips || [];
  const mistakes = exercise.commonMistakes || exercise.common_mistakes || [];
  const alternatives = exercise.alternatives || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── Header ───────────────────────────────────────────── */}
      <Text style={styles.exerciseName}>{exercise.name || exerciseName}</Text>
      <View style={styles.metaRow}>
        <View style={styles.metaBadge}>
          <Text style={styles.metaBadgeText}>{exercise.muscleGroup}</Text>
        </View>
        <View style={[styles.metaBadge, styles.metaBadgeSecondary]}>
          <Text style={styles.metaBadgeSecondaryText}>{exercise.equipment}</Text>
        </View>
      </View>

      {/* ── Description ──────────────────────────────────────── */}
      {exercise.description && (
        <View style={[styles.section, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{exercise.description}</Text>
        </View>
      )}

      {/* ── Instructions ─────────────────────────────────────── */}
      {instructions.length > 0 && (
        <View style={[styles.section, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Step by Step</Text>
          {instructions.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{idx + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Tips ────────────────────────────────────────────── */}
      {tips.length > 0 && (
        <View style={[styles.section, styles.tipsSection, Shadows.sm]}>
          <Text style={styles.sectionTitle}>💡 Pro Tips</Text>
          {tips.map((tip, idx) => (
            <Text key={idx} style={styles.tipText}>
              • {tip}
            </Text>
          ))}
        </View>
      )}

      {/* ── Common Mistakes ──────────────────────────────────── */}
      {mistakes.length > 0 && (
        <View style={[styles.section, styles.mistakesSection, Shadows.sm]}>
          <Text style={styles.sectionTitle}>⚠️ Common Mistakes</Text>
          {mistakes.map((mistake, idx) => (
            <Text key={idx} style={styles.mistakeText}>
              ✕ {mistake}
            </Text>
          ))}
        </View>
      )}

      <View style={{ height: Spacing['4xl'] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
    backgroundColor: Colors.offWhite,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
  },
  errorText: { ...Typography.body, color: Colors.textSecondary },
  // ── Header ─────────────────────────────────────────────────
  exerciseName: { ...Typography.h2, color: Colors.black, marginBottom: Spacing.md },
  metaRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing['2xl'] },
  metaBadge: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  metaBadgeText: { ...Typography.captionMedium, color: Colors.primary },
  metaBadgeSecondary: { backgroundColor: Colors.gray100 },
  metaBadgeSecondaryText: { ...Typography.captionMedium, color: Colors.textSecondary },
  // ── Sections ──────────────────────────────────────────────
  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md },
  description: { ...Typography.bodySmall, color: Colors.textPrimary, lineHeight: 22 },
  // ── Steps ─────────────────────────────────────────────────
  stepRow: { flexDirection: 'row', marginBottom: Spacing.md },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
    marginTop: 1,
  },
  stepNumberText: { ...Typography.captionMedium, color: Colors.white },
  stepText: { ...Typography.bodySmall, color: Colors.textPrimary, flex: 1 },
  // ── Tips ──────────────────────────────────────────────────
  tipsSection: { backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: Colors.success },
  tipText: { ...Typography.bodySmall, color: Colors.textPrimary, marginBottom: Spacing.sm },
  // ── Mistakes ──────────────────────────────────────────────
  mistakesSection: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: Colors.error },
  mistakeText: { ...Typography.bodySmall, color: Colors.textPrimary, marginBottom: Spacing.sm },
});
