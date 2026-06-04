// Resolution Fitness App — Workout Execution Screen
// Full-screen "Lock-In" mode for performing a workout session.
// Shows exercises, sets, rest timer, and overall session timer.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, Vibration, ActivityIndicator,
} from 'react-native';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';

export default function WorkoutExecutionScreen({ navigation, route }) {
  const { planDayId, workoutName } = route.params || {};
  const [session, setSession] = useState(null);
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0);
  const [restTimer, setRestTimer] = useState(0);
  const [resting, setResting] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(0);
  const timerRef = useRef(null);
  const sessionTimerRef = useRef(null);

  // ── Start the workout session on mount ─────────────────────
  useEffect(() => {
    startSession();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(sessionTimerRef.current);
    };
  }, []);

  // ── Session timer (elapsed time) ───────────────────────────
  useEffect(() => {
    sessionTimerRef.current = setInterval(() => {
      setSessionTimer((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(sessionTimerRef.current);
  }, []);

  // ── Rest timer logic ───────────────────────────────────────
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
          } catch {} // ignore errors
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
    <View style={styles.container}>
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelText}>✕ Cancel</Text>
        </TouchableOpacity>
        <View style={styles.timerBox}>
          <Text style={styles.timerText}>{formatTime(sessionTimer)}</Text>
        </View>
      </View>

      {/* ── Rest Timer Overlay ───────────────────────────────── */}
      {resting && (
        <View style={styles.restOverlay}>
          <Text style={styles.restLabel}>REST</Text>
          <Text style={styles.restTimer}>{formatTime(restTimer)}</Text>
          <Text style={styles.restNext}>
            Next: {exercises[currentExerciseIdx]?.exerciseName || '—'}
          </Text>
          <TouchableOpacity style={styles.skipBtn} onPress={skipRest}>
            <Text style={styles.skipBtnText}>Skip Rest</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Exercise Content ─────────────────────────────────── */}
      {currentExercise && !resting && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Progress */}
          <Text style={styles.progress}>
            Exercise {currentExerciseIdx + 1} of {exercises.length}
          </Text>

          {/* Exercise Name */}
          <Text style={styles.exerciseName}>
            {currentExercise.exerciseName || currentExercise.name}
          </Text>
          <Text style={styles.muscleGroup}>
            {currentExercise.muscleGroup}
          </Text>

          {/* Target */}
          <View style={styles.targetCard}>
            <View style={styles.targetItem}>
              <Text style={styles.targetValue}>
                {currentExercise.targetSets || 3}
              </Text>
              <Text style={styles.targetLabel}>Sets</Text>
            </View>
            <View style={styles.targetDivider} />
            <View style={styles.targetItem}>
              <Text style={styles.targetValue}>
                {currentExercise.targetReps || '8-12'}
              </Text>
              <Text style={styles.targetLabel}>Reps</Text>
            </View>
            <View style={styles.targetDivider} />
            <View style={styles.targetItem}>
              <Text style={styles.targetValue}>
                {currentExercise.targetWeight || 0}kg
              </Text>
              <Text style={styles.targetLabel}>Weight</Text>
            </View>
          </View>

          {/* Quick Log Sets */}
          <Text style={styles.sectionTitle}>Log Sets</Text>
          {[1, 2, 3, 4, 5].map((setNum) => (
            <TouchableOpacity key={setNum} style={styles.setRow}>
              <Text style={styles.setNumber}>Set {setNum}</Text>
              <View style={styles.setInputs}>
                <View style={styles.setField}>
                  <Text style={styles.setFieldLabel}>Reps</Text>
                  <Text style={styles.setFieldValue}>—</Text>
                </View>
                <View style={styles.setField}>
                  <Text style={styles.setFieldLabel}>Weight</Text>
                  <Text style={styles.setFieldValue}>— kg</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.checkBtn}>
                <Text style={styles.checkBtnIcon}>○</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

          {/* Navigation Buttons */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navBtn, currentExerciseIdx === 0 && styles.navBtnDisabled]}
              onPress={prevExercise}
              disabled={currentExerciseIdx === 0}
            >
              <Text style={styles.navBtnText}>← Previous</Text>
            </TouchableOpacity>
            {currentExerciseIdx < exercises.length - 1 ? (
              <TouchableOpacity style={[styles.navBtn, styles.navBtnPrimary]} onPress={nextExercise}>
                <Text style={[styles.navBtnText, styles.navBtnPrimaryText]}>Next →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.navBtn, styles.completeBtn]} onPress={handleComplete}>
                <Text style={styles.completeBtnText}>✓ Complete</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.restBtn}
            onPress={() => startRestTimer(60)}
          >
            <Text style={styles.restBtnText}>Start Rest Timer (60s)</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {exercises.length === 0 && !resting && (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.textSecondary, marginTop: 16 }}>Loading workout...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  // ── Top Bar ────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.black,
  },
  cancelText: { ...Typography.bodySmall, color: Colors.error },
  timerBox: {
    backgroundColor: Colors.gray800,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  timerText: { ...Typography.bodyMedium, color: Colors.white, fontVariant: ['tabular-nums'] },
  // ── Rest Overlay ───────────────────────────────────────────
  restOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  restLabel: { ...Typography.label, color: Colors.primary, letterSpacing: 8, marginBottom: Spacing.lg },
  restTimer: { fontSize: 80, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  restNext: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.xl },
  skipBtn: {
    marginTop: Spacing['3xl'],
    paddingHorizontal: Spacing['3xl'],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray600,
  },
  skipBtnText: { ...Typography.bodyMedium, color: Colors.white },
  // ── Content ────────────────────────────────────────────────
  scrollContent: { padding: Spacing.xl },
  progress: { ...Typography.caption, color: Colors.primary, marginBottom: Spacing.xs },
  exerciseName: { ...Typography.h1, color: Colors.white, marginBottom: Spacing.xs },
  muscleGroup: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.xl },
  targetCard: {
    flexDirection: 'row',
    backgroundColor: Colors.gray900,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  targetItem: { flex: 1, alignItems: 'center' },
  targetValue: { ...Typography.statSmall, color: Colors.white },
  targetLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  targetDivider: { width: 1, height: 32, backgroundColor: Colors.gray800 },
  // ── Sets ───────────────────────────────────────────────────
  sectionTitle: { ...Typography.bodyMedium, color: Colors.white, marginBottom: Spacing.md },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray900,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  setNumber: { ...Typography.captionMedium, color: Colors.textMuted, width: 50 },
  setInputs: { flex: 1, flexDirection: 'row', gap: Spacing.md },
  setField: { flex: 1 },
  setFieldLabel: { ...Typography.caption, color: Colors.textMuted },
  setFieldValue: { ...Typography.bodySmall, color: Colors.white },
  checkBtn: { padding: Spacing.sm },
  checkBtnIcon: { fontSize: 24, color: Colors.textMuted },
  // ── Navigation ─────────────────────────────────────────────
  navRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing['2xl'] },
  navBtn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.gray900,
  },
  navBtnDisabled: { opacity: 0.4 },
  navBtnPrimary: { backgroundColor: Colors.primary },
  navBtnText: { ...Typography.bodyMedium, color: Colors.white },
  navBtnPrimaryText: { fontWeight: '700' },
  completeBtn: { backgroundColor: Colors.success },
  completeBtnText: { ...Typography.bodyMedium, color: Colors.white, fontWeight: '700' },
  restBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray600,
  },
  restBtnText: { ...Typography.bodyMedium, color: Colors.textMuted },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
