// Resolution Fitness App — Exercise Detail Screen
// Shows full exercise information: instructions, tips, common mistakes.
// Theme-aware.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Image, TouchableOpacity,
} from 'react-native';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';

export default function ExerciseDetailScreen({ route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const { exerciseId, exerciseName } = route.params || {};
  const [exercise, setExercise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageTab, setImageTab] = useState('photo');
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageTab('photo');
    setImageError(false);
    fetchExercise();
  }, [exerciseId]);

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
        <ActivityIndicator size="large" color={colors.accent} />
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
        <View style={[styles.metaBadge, { backgroundColor: colors.accentBg }]}>
          <Text style={[styles.metaBadgeText, { color: colors.accent }]}>{exercise.muscleGroup}</Text>
        </View>
        <View style={[styles.metaBadge, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.metaBadgeSecondaryText, { color: colors.textSecondary }]}>{exercise.equipment}</Text>
        </View>
      </View>

      {/* ── Images ───────────────────────────────────────────── */}
      {(exercise.imageUrl || exercise.gifUrl) && (
        <View style={styles.imageSection}>
          {exercise.imageUrl && exercise.gifUrl && exercise.imageUrl !== exercise.gifUrl && (
            <View style={styles.imageTabRow}>
              <TouchableOpacity
                onPress={() => { setImageTab('photo'); setImageError(false); }}
                style={[
                  styles.imageTab,
                  imageTab === 'photo' && { backgroundColor: colors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.imageTabText,
                    imageTab === 'photo'
                      ? { color: colors.textInverse }
                      : { color: colors.textSecondary },
                  ]}
                >
                  Photo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setImageTab('secondary'); setImageError(false); }}
                style={[
                  styles.imageTab,
                  imageTab === 'secondary' && { backgroundColor: colors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.imageTabText,
                    imageTab === 'secondary'
                      ? { color: colors.textInverse }
                      : { color: colors.textSecondary },
                  ]}
                >
                  Secondary
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {imageError ? (
            <View style={[styles.exerciseImage, { backgroundColor: colors.surfaceMuted, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ color: colors.textSecondary }}>Image unavailable</Text>
            </View>
          ) : (
            <Image
              source={{
                uri: imageTab === 'photo'
                  ? exercise.imageUrl
                  : (exercise.gifUrl || exercise.imageUrl),
              }}
              style={styles.exerciseImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}
        </View>
      )}

      {/* ── Description ──────────────────────────────────────── */}
      {exercise.description && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Description</Text>
          <Text style={[styles.description, { color: colors.textPrimary }]}>{exercise.description}</Text>
        </View>
      )}

      {/* ── Instructions ─────────────────────────────────────── */}
      {instructions.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }, Shadows.sm]}>
          <Text style={[styles.sectionTitle, { color: colors.title }]}>Step by Step</Text>
          {instructions.map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={[styles.stepNumber, { backgroundColor: colors.accent }]}>
                <Text style={[styles.stepNumberText, { color: colors.textInverse }]}>{idx + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.textPrimary }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Tips ────────────────────────────────────────────── */}
      {tips.length > 0 && (
        <View
          style={[
            styles.section,
            styles.tipsSection,
            {
              backgroundColor: colors.accentWash,
              borderLeftColor: colors.success,
            },
            Shadows.sm,
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.title }]}>💡 Pro Tips</Text>
          {tips.map((tip, idx) => (
            <Text key={idx} style={[styles.tipText, { color: colors.textPrimary }]}>
              • {tip}
            </Text>
          ))}
        </View>
      )}

      {/* ── Common Mistakes ──────────────────────────────────── */}
      {mistakes.length > 0 && (
        <View
          style={[
            styles.section,
            styles.mistakesSection,
            {
              backgroundColor: colors.accentWash,
              borderLeftColor: colors.error,
            },
            Shadows.sm,
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.title }]}>⚠️ Common Mistakes</Text>
          {mistakes.map((mistake, idx) => (
            <Text key={idx} style={[styles.mistakeText, { color: colors.textPrimary }]}>
              ✕ {mistake}
            </Text>
          ))}
        </View>
      )}

      <View style={{ height: Spacing['4xl'] }} />
    </ScrollView>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      padding: Spacing.xl,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    errorText: { ...Typography.body, color: colors.textSecondary },
    // ── Header ─────────────────────────────────────────────
    exerciseName: { ...Typography.h2, color: colors.title, marginBottom: Spacing.md },
    metaRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing['2xl'] },
    metaBadge: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
    },
    metaBadgeText: { ...Typography.captionMedium },
    metaBadgeSecondaryText: { ...Typography.captionMedium },
    // ── Images ─────────────────────────────────────────────
    imageSection: {
      marginBottom: Spacing.lg,
    },
    imageTabRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    imageTab: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
    },
    imageTabText: { ...Typography.captionMedium },
    exerciseImage: {
      width: '100%',
      height: 220,
      borderRadius: BorderRadius.md,
    },
    // ── Sections ───────────────────────────────────────────
    section: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      borderWidth: 1,
    },
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
    description: { ...Typography.bodySmall, lineHeight: 22 },
    // ── Steps ──────────────────────────────────────────────
    stepRow: { flexDirection: 'row', marginBottom: Spacing.md },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: Spacing.md,
      marginTop: 1,
    },
    stepNumberText: { ...Typography.captionMedium },
    stepText: { ...Typography.bodySmall, flex: 1 },
    // ── Tips ───────────────────────────────────────────────
    tipsSection: { borderLeftWidth: 3 },
    tipText: { ...Typography.bodySmall, marginBottom: Spacing.sm },
    // ── Mistakes ───────────────────────────────────────────
    mistakesSection: { borderLeftWidth: 3 },
    mistakeText: { ...Typography.bodySmall, marginBottom: Spacing.sm },
  });
}
