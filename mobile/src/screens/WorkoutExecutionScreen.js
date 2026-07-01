// Resolution Fitness App — Workout Execution Screen
// Full-screen "Lock-In" mode for performing a workout session.
// Intentionally dark chrome regardless of system theme — like Apple Fitness+,
// this screen suppresses distractions by going dark even when the OS theme
// is light. The accent (orange → gray) still respects the active theme so
// progress highlights and the rest-timer label stay on-brand.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Vibration, ActivityIndicator,
} from 'react-native';
import api from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';

// Hard-coded dark-mode-ish palette (lock-in chrome stays dark in both schemes).
// We pull a couple of theme-driven overrides (cancel button color / rest
// label accent) so the brand accent and error treatment still respect theme.
const LOCKED = {
  bg: '#000000',
  cardBg: '#171717',
  elevatedBg: '#0A0A0A',
  border: '#262626',
  divider: '#404040',
  textPrimary: '#FFFFFF',
  textSecondary: '#D4D4D4',
  textMuted: '#A3A3A3',
};

export default function WorkoutExecutionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { planDayId, workoutName } = route.params || {};
  const [session, setSession] = useState(null);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [restTimer, setRestTimer] = useState(0);
  const [resting, setResting] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(0);
  const timerRef = useRef(null);
  const sessionTimerRef = useRef(null);

  useEffect(() => {
    startSession();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(sessionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    sessionTimerRef.current = setInterval(() => {
      setSessionTimer((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(sessionTimerRef.current);
  }, []);

  useEffect(() => {
    if (resting && restTimer > 0) {
      timerRef.current = setInterval(() => {
        setRestTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setResting(false);
            Vibration.vibrate(200);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [resting, restTimer]);

  const startSession = async () => {
    try {
      const data = await api.startWorkout({
        planDayId: planDayId || null,
        workoutName: workoutName || 'Workout',
      });
      const sessionData = data.data || data.session || data;
      setSession(sessionData);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to start workout');
      navigation.goBack();
    }
  };

  const exercises = session?.exercises || session?.sessionExercises || [];
  const currentExercise = exercises[currentExerciseIdx];

  const startRestTimer = (seconds = 60) => {
    setRestTimer(seconds);
    setResting(true);
  };

  const skipRest = () => {
    setRestTimer(0);
    setResting(false);
    clearInterval(timerRef.current);
  };

  const nextExercise = () => {
    if (currentExerciseIdx < exercises.length - 1) {
      setCurrentExerciseIdx((prev) => prev + 1);
      startRestTimer(60);
    }
  };

  const prevExercise = () => {
    if (currentExerciseIdx > 0) {
      setCurrentExerciseIdx((prev) => prev - 1);
      setResting(false);
      setRestTimer(0);
    }
  };

  const handleComplete = async () => {
    if (!session?.id && !session?.sessionId) return;
    try {
      await api.completeWorkout(session.id || session.sessionId);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to complete workout');
    }
  };

  const handleCancel = async () => {
    Alert.alert('Cancel Workout', 'Are you sure? Progress will be lost.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            if (session?.id || session?.sessionId) {
              await api.cancelWorkout(session.id || session.sessionId);
            }
          } catch {} // ignore
          navigation.goBack();
        },
      },
    ]);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: LOCKED.bg }]}>
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <View style={[styles.topBar, { backgroundColor: LOCKED.bg }]}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={[styles.cancelText, { color: colors.error }]}>✕ Cancel</Text>
        </TouchableOpacity>
        <View style={[styles.timerBox, { backgroundColor: LOCKED.cardBg }]}>
          <Text style={[styles.timerText, { color: LOCKED.textPrimary }]}>{formatTime(sessionTimer)}</Text>
        </View>
      </View>

      {/* ── Rest Timer Overlay ───────────────────────────────── */}
      {resting && (
        <View style={[styles.restOverlay, { backgroundColor: LOCKED.bg }]}>
          <Text style={[styles.restLabel, { color: colors.accent }]}>REST</Text>
          <Text style={[styles.restTimer, { color: LOCKED.textPrimary }]}>{formatTime(restTimer)}</Text>
          <Text style={[styles.restNext, { color: LOCKED.textMuted }]}>
            Next: {exercises[currentExerciseIdx]?.exerciseName || '—'}
          </Text>
          <TouchableOpacity
            style={[styles.skipBtn, { borderColor: LOCKED.divider }]}
            onPress={skipRest}
          >
            <Text style={[styles.skipBtnText, { color: LOCKED.textPrimary }]}>Skip Rest</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Exercise Content ─────────────────────────────────── */}
      {currentExercise && !resting && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.progress, { color: colors.accent }]}>
            Exercise {currentExerciseIdx + 1} of {exercises.length}
          </Text>

          <Text style={[styles.exerciseName, { color: LOCKED.textPrimary }]}>
            {currentExercise.exerciseName || currentExercise.name}
          </Text>
          <Text style={[styles.muscleGroup, { color: LOCKED.textMuted }]}>
            {currentExercise.muscleGroup}
          </Text>

          <View style={[styles.targetCard, { backgroundColor: LOCKED.cardBg }]}>
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: LOCKED.textPrimary }]}>
                {currentExercise.targetSets || 3}
              </Text>
              <Text style={[styles.targetLabel, { color: LOCKED.textMuted }]}>Sets</Text>
            </View>
            <View style={[styles.targetDivider, { backgroundColor: LOCKED.border }]} />
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: LOCKED.textPrimary }]}>
                {currentExercise.targetReps || '8-12'}
              </Text>
              <Text style={[styles.targetLabel, { color: LOCKED.textMuted }]}>Reps</Text>
            </View>
            <View style={[styles.targetDivider, { backgroundColor: LOCKED.border }]} />
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: LOCKED.textPrimary }]}>
                {currentExercise.targetWeight || 0}kg
              </Text>
              <Text style={[styles.targetLabel, { color: LOCKED.textMuted }]}>Weight</Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: LOCKED.textPrimary }]}>Log Sets</Text>
          {[1, 2, 3, 4, 5].map((setNum) => (
            <TouchableOpacity
              key={setNum}
              style={[styles.setRow, { backgroundColor: LOCKED.cardBg }]}
            >
              <Text style={[styles.setNumber, { color: LOCKED.textMuted }]}>Set {setNum}</Text>
              <View style={styles.setInputs}>
                <View style={styles.setField}>
                  <Text style={[styles.setFieldLabel, { color: LOCKED.textMuted }]}>Reps</Text>
                  <Text style={[styles.setFieldValue, { color: LOCKED.textPrimary }]}>—</Text>
                </View>
                <View style={styles.setField}>
                  <Text style={[styles.setFieldLabel, { color: LOCKED.textMuted }]}>Weight</Text>
                  <Text style={[styles.setFieldValue, { color: LOCKED.textPrimary }]}>— kg</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.checkBtn}>
                <Text style={[styles.checkBtnIcon, { color: LOCKED.textMuted }]}>○</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          <View style={styles.navRow}>
            <TouchableOpacity
              style={[
                styles.navBtn,
                { backgroundColor: LOCKED.cardBg },
                currentExerciseIdx === 0 && styles.navBtnDisabled,
              ]}
              onPress={prevExercise}
              disabled={currentExerciseIdx === 0}
            >
              <Text style={[styles.navBtnText, { color: LOCKED.textPrimary }]}>← Previous</Text>
            </TouchableOpacity>
            {currentExerciseIdx < exercises.length - 1 ? (
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: colors.accent }]}
                onPress={nextExercise}
              >
                <Text style={[styles.navBtnText, styles.navBtnPrimaryText, { color: colors.textInverse }]}>Next →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navBtn, { backgroundColor: colors.success }]}
                onPress={handleComplete}
              >
                <Text style={[styles.completeBtnText, { color: colors.textInverse }]}>✓ Complete</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.restBtn, { borderColor: LOCKED.divider }]}
            onPress={() => startRestTimer(60)}
          >
            <Text style={[styles.restBtnText, { color: LOCKED.textMuted }]}>Start Rest Timer (60s)</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {exercises.length === 0 && !resting && (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: LOCKED.textMuted, marginTop: 16 }}>Loading workout...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // ── Top Bar ────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.md,
  },
  cancelText: { ...Typography.bodySmall, fontWeight: '600' },
  timerBox: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  timerText: { ...Typography.bodyMedium, fontVariant: ['tabular-nums'] },
  // ── Rest Overlay ───────────────────────────────────────────
  restOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  restLabel: { ...Typography.label, letterSpacing: 8, marginBottom: Spacing.lg },
  restTimer: { fontSize: 80, fontWeight: '800', fontVariant: ['tabular-nums'] },
  restNext: { ...Typography.body, marginTop: Spacing.xl },
  skipBtn: {
    marginTop: Spacing['3xl'],
    paddingHorizontal: Spacing['3xl'],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  skipBtnText: { ...Typography.bodyMedium },
  // ── Content ────────────────────────────────────────────────
  scrollContent: { padding: Spacing.xl },
  progress: { ...Typography.caption, marginBottom: Spacing.xs },
  exerciseName: { ...Typography.h1, marginBottom: Spacing.xs },
  muscleGroup: { ...Typography.caption, marginBottom: Spacing.xl },
  targetCard: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  targetItem: { flex: 1, alignItems: 'center' },
  targetValue: { ...Typography.statSmall },
  targetLabel: { ...Typography.caption, marginTop: 2 },
  targetDivider: { width: 1, height: 32 },
  // ── Sets ───────────────────────────────────────────────────
  sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  setNumber: { ...Typography.captionMedium, width: 50 },
  setInputs: { flex: 1, flexDirection: 'row', gap: Spacing.md },
  setField: { flex: 1 },
  setFieldLabel: { ...Typography.caption },
  setFieldValue: { ...Typography.bodySmall },
  checkBtn: { padding: Spacing.sm },
  checkBtnIcon: { fontSize: 24 },
  // ── Navigation ─────────────────────────────────────────────
  navRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing['2xl'] },
  navBtn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { ...Typography.bodyMedium },
  navBtnPrimaryText: { fontWeight: '700' },
  completeBtnText: { ...Typography.bodyMedium, fontWeight: '700' },
  restBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  restBtnText: { ...Typography.bodyMedium },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
