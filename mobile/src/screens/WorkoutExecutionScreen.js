// Resolution Fitness App — Workout Execution Screen
// Full-screen workout mode for performing a workout session.
// Uses the app-wide light/dark theme for a consistent, unified look.
// The accent (orange) and semantic colors (error, success) come from
// the active theme so progress highlights and action buttons stay on-brand.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
  Modal, TextInput, Animated, Dimensions, Pressable, KeyboardAvoidingView, Platform,
  PanResponder,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import api from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── SwipeableSetRow ─────────────────────────────────────────────
// Wraps a completed set row with a left-swipe gesture that reveals
// an undo button. Defined outside the parent so it survives re-renders
// from the 1s session timer without resetting its PanResponder / Animated state.
const SwipeableSetRow = React.memo(function SwipeableSetRow({ children, onUndo, rowStyle }) {
  const panX = useRef(new Animated.Value(0)).current;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;
  const SWIPE_THRESHOLD = -80;
  const MAX_DRAG = -120;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 15 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        // Only allow left swipe (negative dx), clamp at MAX_DRAG
        const next = Math.max(MAX_DRAG, Math.min(0, g.dx));
        panX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < SWIPE_THRESHOLD) {
          // Swiped past threshold — snap to reveal, then undo
          Animated.spring(panX, {
            toValue: -100,
            useNativeDriver: true,
            tension: 60,
            friction: 8,
          }).start(() => {
            onUndoRef.current?.();
            // Reset position after undo
            Animated.timing(panX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start();
          });
        } else {
          // Snap back
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(panX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  return (
    <View style={styles.swipeContainer}>
      {/* Undo action revealed behind the row */}
      <View style={styles.swipeUndoBg}>
        <Text style={styles.swipeUndoText}>↩ Undo</Text>
      </View>
      {/* The actual row, animated */}
      <Animated.View
        style={[rowStyle, { transform: [{ translateX: panX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
});

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

  // ── Set Logging State ────────────────────────────────────────────
  // Track the active (next-to-do) set index per exercise.
  // Keyed by exercise index so switching exercises preserves progress.
  const [activeSetByExercise, setActiveSetByExercise] = useState({});
  // Per-set logged data: { [`${exIdx}-${setNum}`]: { weight, reps, duration } }
  const [setLogs, setSetLogs] = useState({});
  // When the current set's timer started (Date.now() ms) — stored as ref
  // to avoid stale closures in the interval callback.
  const setStartTimeRef = useRef(null);
  // Modal visibility & animated value
  const [modalVisible, setModalVisible] = useState(false);
  const modalScale = useRef(new Animated.Value(0.3)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  // Modal input fields
  const [modalWeight, setModalWeight] = useState('');
  const [modalReps, setModalReps] = useState('');
  const [modalSetElapsed, setModalSetElapsed] = useState(0);
  // Live elapsed seconds ticker for the open modal
  const modalTimerRef = useRef(null);
  // Track which exercise+set the modal is confirming
  const [modalTarget, setModalTarget] = useState(null);
  // Pending rest duration — set in confirmSet, consumed after modal close animates out
  const pendingRestRef = useRef(0);
  // Exercise tips/instructions fetched from the exercise library
  const [exerciseTips, setExerciseTips] = useState({}); // { [exerciseId]: { instructions, tips } }
  const [tipsExpanded, setTipsExpanded] = useState(false);

  useEffect(() => {
    startSession();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(sessionTimerRef.current);
      clearInterval(modalTimerRef.current);
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
      setSession(sessionData); // Show UI immediately

      // Fetch exercise tips/instructions in the background (non-blocking)
      const exs = sessionData?.exercises || sessionData?.sessionExercises || [];
      const tipsMap = {};
      Promise.all(
        exs.map(async (ex) => {
          const exId = ex.exerciseId || ex.id;
          if (!exId) return;
          try {
            const detail = await api.getExercise(exId);
            const exData = detail.data || detail;
            if (exData.instructions?.length || exData.tips?.length) {
              tipsMap[exId] = {
                instructions: exData.instructions || [],
                tips: exData.tips || [],
              };
            }
          } catch {
            // Non-blocking — tips are optional
          }
        }),
      ).then(() => {
        if (Object.keys(tipsMap).length > 0) {
          setExerciseTips(tipsMap);
        }
      });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to start workout');
      navigation.goBack();
    }
  };

  const exercises = session?.exercises || session?.sessionExercises || [];
  const currentExercise = exercises[currentExerciseIdx];
  const currentSets = currentExercise?.sets || [];
  const totalSets = currentSets.length || (currentExercise?.targetSets || 3);
  const activeSetIdx = activeSetByExercise[currentExerciseIdx] ?? 0;

  // ── Set Logging Helpers ──────────────────────────────────────────

  const getSetLog = useCallback((exIdx, setNum) => {
    return setLogs[`${exIdx}-${setNum}`];
  }, [setLogs]);

  const isSetCompleted = useCallback((exIdx, setNum) => {
    return !!setLogs[`${exIdx}-${setNum}`];
  }, [setLogs]);

  const isSetActive = useCallback((exIdx, setNum) => {
    return exIdx === currentExerciseIdx && setNum === activeSetIdx && !isSetCompleted(exIdx, setNum);
  }, [currentExerciseIdx, activeSetIdx, isSetCompleted]);

  // ── Undo a completed set ────────────────────────────────────────
  const undoSet = useCallback((exIdx, setNum) => {
    // Remove the log entry
    setSetLogs((prev) => {
      const next = { ...prev };
      delete next[`${exIdx}-${setNum}`];
      return next;
    });
    // Revert active set pointer back to this set
    setActiveSetByExercise((prev) => ({
      ...prev,
      [exIdx]: setNum,
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);


  // ── Modal Open / Close with bounce ───────────────────────────────

  const openSetModal = (setNum) => {
    if (!isSetActive(currentExerciseIdx, setNum)) return;

    const setData = currentSets[setNum];
    const targetWeight = setData?.weightKg || currentExercise?.targetWeight || 0;
    const targetReps = setData?.reps || currentExercise?.targetReps || '';

    // Capture start time in a local variable for the interval closure
    const startMs = Date.now();
    setStartTimeRef.current = startMs;

    setModalTarget({ exerciseIdx: currentExerciseIdx, setNum });
    setModalWeight(String(targetWeight || ''));
    setModalReps(String(targetReps || ''));
    setModalSetElapsed(0);
    setModalVisible(true);

    // Bounce-in animation
    modalScale.setValue(0.3);
    modalOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(modalScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Live timer — 1s interval is sufficient for a seconds display
    modalTimerRef.current = setInterval(() => {
      setModalSetElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
  };

  const closeSetModal = () => {
    clearInterval(modalTimerRef.current);
    Animated.parallel([
      Animated.timing(modalScale, {
        toValue: 0.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(modalOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalVisible(false);
      setModalTarget(null);
    });
  };

  const handleCancelSet = () => {
    Alert.alert(
      'Discard Set Progress?',
      'Your set timer will reset and you will have to restart this set.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setStartTimeRef.current = null;
            closeSetModal();
          },
        },
      ],
    );
  };

  const confirmSet = async () => {
    if (!modalTarget) return;
    const { exerciseIdx, setNum } = modalTarget;
    const weight = parseFloat(modalWeight) || 0;
    const reps = parseInt(modalReps, 10) || 0;
    const elapsed = setStartTimeRef.current
      ? Math.floor((Date.now() - setStartTimeRef.current) / 1000)
      : 0;

    // Save locally
    setSetLogs((prev) => ({
      ...prev,
      [`${exerciseIdx}-${setNum}`]: { weight, reps, duration: elapsed },
    }));

    // Auto-advance to next set
    setActiveSetByExercise((prev) => ({
      ...prev,
      [exerciseIdx]: setNum + 1,
    }));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Determine rest duration from the set's restSeconds (plan-configurable),
    // falling back to 60s. Only auto-start if there's a next set.
    // Compute from the exercise directly to avoid stale closure over totalSets.
    const nextSetNum = setNum + 1;
    const exSets = exercises[exerciseIdx]?.sets || [];
    const exTotalSets = exSets.length || exercises[exerciseIdx]?.targetSets || 3;
    const confirmedSet = exSets[setNum];
    if (nextSetNum < exTotalSets) {
      pendingRestRef.current = confirmedSet?.restSeconds || 60;
    } else {
      pendingRestRef.current = 0;
    }

    closeSetModal();

    // Persist to backend (fire-and-forget)
    const ex = exercises[exerciseIdx];
    if (session?.id && ex) {
      api.updateWorkoutSession(session.id, {
        exercises: [{
          exerciseId: ex.exerciseId || ex.id,
          sets: [{
            setNumber: setNum + 1,
            weightKg: weight,
            reps,
            completed: true,
          }],
        }],
      }).catch(() => {});
    }
  };

  // Auto-start rest timer after the modal close animation finishes.
  // This avoids the rest overlay appearing while the modal is still fading out.
  useEffect(() => {
    if (!modalVisible && pendingRestRef.current > 0) {
      const duration = pendingRestRef.current;
      pendingRestRef.current = 0;
      const timeout = setTimeout(() => startRestTimer(duration), 200);
      return () => clearTimeout(timeout);
    }
  }, [modalVisible, startRestTimer]);

  const formatSetTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ── Exercise navigation ──────────────────────────────────────────

  const nextExercise = () => {
    if (currentExerciseIdx < exercises.length - 1) {
      setCurrentExerciseIdx((prev) => prev + 1);
      setTipsExpanded(false);
      startRestTimer(60);
    }
  };

  const prevExercise = () => {
    if (currentExerciseIdx > 0) {
      setCurrentExerciseIdx((prev) => prev - 1);
      setTipsExpanded(false);
      setResting(false);
      setRestTimer(0);
    }
  };

  const startRestTimer = useCallback((seconds = 60) => {
    setRestTimer(seconds);
    setResting(true);
  }, []);

  const skipRest = () => {
    setRestTimer(0);
    setResting(false);
    clearInterval(timerRef.current);
  };

  const handleComplete = async () => {
    if (!session?.id && !session?.sessionId) return;
    try {
      await api.completeWorkout(session.id || session.sessionId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  // Count completed sets for this exercise
  const completedCount = currentSets.filter((_, i) =>
    isSetCompleted(currentExerciseIdx, i),
  ).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <View style={[styles.topBar, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={[styles.cancelText, { color: colors.error }]}>✕ Cancel</Text>
        </TouchableOpacity>
        <View style={[styles.timerBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.timerText, { color: colors.textPrimary }]}>{formatTime(sessionTimer)}</Text>
        </View>
      </View>

      {/* ── Set Confirmation Modal ───────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={handleCancelSet}>
        <Pressable style={styles.modalBackdrop} onPress={handleCancelSet}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboardWrap}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Animated.View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    transform: [{ scale: modalScale }],
                    opacity: modalOpacity,
                  },
                ]}
              >
                {/* Set number badge */}
                <View style={[styles.modalBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.modalBadgeText, { color: colors.textInverse }]}>
                    SET {(modalTarget?.setNum ?? 0) + 1}
                  </Text>
                </View>

                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  Log Your Set
                </Text>

                {/* Elapsed time */}
                <View style={[styles.modalTimerBox, { backgroundColor: colors.background }]}>
                  <Text style={[styles.modalTimerLabel, { color: colors.textMuted }]}>Time Elapsed</Text>
                  <Text style={[styles.modalTimerValue, { color: colors.accent }]}>
                    {formatSetTime(modalSetElapsed)}
                  </Text>
                </View>

                {/* Weight & Reps inputs */}
                <View style={styles.modalInputRow}>
                  <View style={styles.modalInputCol}>
                    <Text style={[styles.modalInputLabel, { color: colors.textMuted }]}>Weight (kg)</Text>
                    <TextInput
                      style={[
                        styles.modalInput,
                        {
                          backgroundColor: colors.background,
                          color: colors.textPrimary,
                          borderColor: colors.border,
                        },
                      ]}
                      value={modalWeight}
                      onChangeText={setModalWeight}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      selectTextOnFocus
                    />
                  </View>
                  <View style={styles.modalInputCol}>
                    <Text style={[styles.modalInputLabel, { color: colors.textMuted }]}>Reps</Text>
                    <TextInput
                      style={[
                        styles.modalInput,
                        {
                          backgroundColor: colors.background,
                          color: colors.textPrimary,
                          borderColor: colors.border,
                        },
                      ]}
                      value={modalReps}
                      onChangeText={setModalReps}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      selectTextOnFocus
                    />
                  </View>
                </View>

                {/* Action buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                    onPress={handleCancelSet}
                  >
                    <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: colors.success }]}
                    onPress={confirmSet}
                  >
                    <Text style={[styles.modalConfirmText, { color: colors.textInverse }]}>✓ Done</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ── Exercise Content ─────────────────────────────────── */}
      {currentExercise && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.progress, { color: colors.accent }]}>
            Exercise {currentExerciseIdx + 1} of {exercises.length}
          </Text>

          <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>
            {currentExercise.exerciseName || currentExercise.name}
          </Text>
          <Text style={[styles.muscleGroup, { color: colors.textMuted }]}>
            {currentExercise.muscleGroup}
          </Text>

          {/* ── Exercise Tips / Instructions ──────────────────────── */}
          {(() => {
            const exId = currentExercise.exerciseId || currentExercise.id;
            const tips = exerciseTips[exId];
            if (!tips) return null;
            const hasInstructions = tips.instructions.length > 0;
            const hasTips = tips.tips.length > 0;
            if (!hasInstructions && !hasTips) return null;
            return (
              <TouchableOpacity
                style={[styles.tipsCard, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                onPress={() => setTipsExpanded((p) => !p)}
                activeOpacity={0.7}
              >
                <View style={styles.tipsHeader}>
                  <Text style={[styles.tipsTitle, { color: colors.textPrimary }]}>
                    💡 Exercise Tips
                  </Text>
                  <Text style={[styles.tipsChevron, { color: colors.textMuted }]}>
                    {tipsExpanded ? '▲' : '▼'}
                  </Text>
                </View>
                {tipsExpanded && (
                  <View style={styles.tipsContent}>
                    {hasInstructions && (
                      <View>
                        <Text style={[styles.tipsSectionLabel, { color: colors.accent }]}>Instructions</Text>
                        {tips.instructions.map((step, idx) => (
                          <View key={idx} style={styles.tipsStepRow}>
                            <Text style={[styles.tipsStepNum, { color: colors.accent }]}>{idx + 1}.</Text>
                            <Text style={[styles.tipsStepText, { color: colors.textSecondary }]}>{step}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {hasTips && (
                      <View style={{ marginTop: hasInstructions ? Spacing.md : 0 }}>
                        <Text style={[styles.tipsSectionLabel, { color: colors.accent }]}>Pro Tips</Text>
                        {tips.tips.map((tip, idx) => (
                          <View key={idx} style={styles.tipsStepRow}>
                            <Text style={[styles.tipsStepNum, { color: colors.accent }]}>•</Text>
                            <Text style={[styles.tipsStepText, { color: colors.textSecondary }]}>{tip}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })()}

          <View style={[styles.targetCard, { backgroundColor: colors.surface }]}>
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: colors.textPrimary }]}>
                {totalSets}
              </Text>
              <Text style={[styles.targetLabel, { color: colors.textMuted }]}>Sets</Text>
            </View>
            <View style={[styles.targetDivider, { backgroundColor: colors.border }]} />
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: colors.textPrimary }]}>
                {currentExercise.targetReps || '8-12'}
              </Text>
              <Text style={[styles.targetLabel, { color: colors.textMuted }]}>Reps</Text>
            </View>
            <View style={[styles.targetDivider, { backgroundColor: colors.border }]} />
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: colors.textPrimary }]}>
                {currentExercise.targetWeight || 0}kg
              </Text>
              <Text style={[styles.targetLabel, { color: colors.textMuted }]}>Weight</Text>
            </View>
          </View>

          {/* ── Set progress bar ────────────────────────────────── */}
          <View style={styles.setProgressRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Log Sets
            </Text>
            <Text style={[styles.setProgressText, { color: colors.textMuted }]}>
              {completedCount}/{totalSets}
            </Text>
          </View>
          <View style={[styles.progressBarBg, { backgroundColor: colors.divider }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: colors.accent,
                  width: `${totalSets > 0 ? (completedCount / totalSets) * 100 : 0}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.hintText, { color: colors.textMuted }]}>
            Tap to begin your set and log your progress.
          </Text>

          {/* ── Set Rows ────────────────────────────────────────── */}
          {Array.from({ length: totalSets }, (_, setNum) => {
            const completed = isSetCompleted(currentExerciseIdx, setNum);
            const active = isSetActive(currentExerciseIdx, setNum);
            const log = getSetLog(currentExerciseIdx, setNum);
            const setData = currentSets[setNum];
            const defaultWeight = setData?.weightKg || currentExercise?.targetWeight || 0;
            const defaultReps = setData?.reps || currentExercise?.targetReps || '—';
            const locked = !active && !completed;

            // Insert inline rest countdown between the last completed set
            // and the next active set
            const showInlineRest = resting && completed && setNum === activeSetIdx - 1;

            const rowContent = (
              <>
                {/* Set number with state indicator */}
                <View style={styles.setNumberCol}>
                  <View
                    style={[
                      styles.setIndicator,
                      {
                        backgroundColor: completed
                          ? colors.success
                          : active
                            ? colors.accent
                            : colors.divider,
                        borderColor: completed
                          ? colors.success
                          : active
                            ? colors.accent
                            : colors.border,
                      },
                    ]}
                  >
                    {completed ? (
                      <Text style={[styles.setIndicatorCheck, { color: colors.textInverse }]}>✓</Text>
                    ) : (
                      <Text
                        style={[
                          styles.setIndicatorNum,
                          { color: active ? colors.textInverse : colors.textMuted },
                        ]}
                      >
                        {setNum + 1}
                      </Text>
                    )}
                  </View>
                  {active && (
                    <Text style={[styles.tapHint, { color: colors.accent }]}>TAP</Text>
                  )}
                </View>

                {/* Set data */}
                <View style={styles.setInputs}>
                  <View style={styles.setField}>
                    <Text style={[styles.setFieldLabel, { color: colors.textMuted }]}>Reps</Text>
                    <Text style={[styles.setFieldValue, { color: completed ? colors.textPrimary : colors.textSecondary }]}>
                      {completed ? log?.reps : defaultReps}
                    </Text>
                  </View>
                  <View style={styles.setField}>
                    <Text style={[styles.setFieldLabel, { color: colors.textMuted }]}>Weight</Text>
                    <Text style={[styles.setFieldValue, { color: completed ? colors.textPrimary : colors.textSecondary }]}>
                      {completed ? `${log?.weight}kg` : `${defaultWeight}kg`}
                    </Text>
                  </View>
                  {completed && log?.duration != null && (
                    <View style={styles.setField}>
                      <Text style={[styles.setFieldLabel, { color: colors.textMuted }]}>Time</Text>
                      <Text style={[styles.setFieldValue, { color: colors.accent }]}>
                        {formatSetTime(log.duration)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Status icon */}
                <View style={styles.checkBtn}>
                  {completed ? (
                    <Text style={[styles.checkBtnIcon, { color: colors.success }]}>●</Text>
                  ) : active ? (
                    <Text style={[styles.checkBtnIcon, { color: colors.accent }]}>▶</Text>
                  ) : (
                    <Text style={[styles.checkBtnIcon, { color: colors.textMuted }]}>○</Text>
                  )}
                </View>
              </>
            );

            // Completed sets are swipeable to undo
            if (completed) {
              return (
                <SwipeableSetRow
                  key={setNum}
                  onUndo={() => undoSet(currentExerciseIdx, setNum)}
                  rowStyle={[
                    styles.setRow,
                    { backgroundColor: colors.accentBg, borderWidth: 0, marginBottom: 0 },
                  ]}
                >
                  {rowContent}
                </SwipeableSetRow>
              );
            }

            // Active / locked sets are plain TouchableOpacity
            // with optional inline rest countdown above active set
            const activeRow = (
              <TouchableOpacity
                key={setNum}
                activeOpacity={active ? 0.7 : 1}
                onPress={() => active && openSetModal(setNum)}
                disabled={!active}
                style={[
                  styles.setRow,
                  {
                    backgroundColor: colors.surface,
                    borderWidth: active ? 2 : 0,
                    borderColor: active ? colors.accent : 'transparent',
                    opacity: locked ? 0.45 : 1,
                  },
                  active && styles.setRowActive,
                ]}
              >
                {rowContent}
              </TouchableOpacity>
            );

            if (showInlineRest) {
              return (
                <React.Fragment key={setNum}>
                  {/* Inline rest countdown card */}
                  <View style={[styles.inlineRestCard, { backgroundColor: colors.accentBg, borderColor: colors.accent }]}>
                    <View style={styles.inlineRestTop}>
                      <Text style={[styles.inlineRestLabel, { color: colors.accent }]}>REST</Text>
                      <Text style={[styles.inlineRestTimer, { color: colors.textPrimary }]}>{formatTime(restTimer)}</Text>
                    </View>
                    <View style={styles.inlineRestBottom}>
                      <Text style={[styles.inlineRestNext, { color: colors.textMuted }]}>
                        Next: Set {activeSetIdx + 1}
                      </Text>
                      <TouchableOpacity
                        style={[styles.inlineSkipBtn, { borderColor: colors.accent }]}
                        onPress={skipRest}
                      >
                        <Text style={[styles.inlineSkipText, { color: colors.accent }]}>Skip</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {activeRow}
                </React.Fragment>
              );
            }

            return activeRow;
          })}

          {/* ── All sets complete banner ─────────────────────────── */}
          {completedCount === totalSets && totalSets > 0 && (
            <View style={[styles.allDoneBanner, { backgroundColor: colors.accentBg }]}>
              <Text style={[styles.allDoneText, { color: colors.accent }]}>
                ✓ All sets complete!
              </Text>
            </View>
          )}

          <View style={styles.navRow}>
            <TouchableOpacity
              style={[
                styles.navBtn,
                { backgroundColor: colors.surface },
                currentExerciseIdx === 0 && styles.navBtnDisabled,
              ]}
              onPress={prevExercise}
              disabled={currentExerciseIdx === 0}
            >
              <Text style={[styles.navBtnText, { color: colors.textPrimary }]}>← Previous</Text>
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
            style={[styles.restBtn, { borderColor: colors.divider }]}
            onPress={() => {
              const setData = currentSets[activeSetIdx];
              startRestTimer(setData?.restSeconds || 60);
            }}
          >
            <Text style={[styles.restBtnText, { color: colors.textMuted }]}>
              Start Rest Timer ({currentSets[activeSetIdx]?.restSeconds || 60}s)
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {!session ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ color: colors.textMuted, marginTop: 16 }}>Loading workout...</Text>
        </View>
      ) : exercises.length === 0 && !resting ? (
        <View style={styles.emptyContainer}>
          <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>No exercises found</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 }}>
            This workout doesn't have any exercises yet. Add exercises to your plan day first.
          </Text>
          <TouchableOpacity
            style={[styles.skipBtn, { borderColor: colors.divider, marginTop: 24 }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.skipBtnText, { color: colors.textPrimary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
  // ── Inline Rest Card ─────────────────────────────────────────
  inlineRestCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  inlineRestTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  inlineRestLabel: {
    ...Typography.label,
    letterSpacing: 4,
  },
  inlineRestTimer: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  inlineRestBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineRestNext: {
    ...Typography.caption,
  },
  inlineSkipBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  inlineSkipText: {
    ...Typography.captionMedium,
  },
  // ── Legacy skip button (used in empty state) ─────────────────
  skipBtn: {
    marginTop: Spacing['3xl'],
    paddingHorizontal: Spacing['3xl'],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  skipBtnText: { ...Typography.bodyMedium },
  // ── Modal ──────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalKeyboardWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalCard: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxWidth: 380,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['2xl'],
    alignItems: 'center',
    ...Shadows.lg,
  },
  modalBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  modalBadgeText: {
    ...Typography.label,
    letterSpacing: 2,
  },
  modalTitle: {
    ...Typography.h3,
    marginBottom: Spacing.lg,
  },
  modalTimerBox: {
    width: '100%',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTimerLabel: {
    ...Typography.caption,
    marginBottom: 2,
  },
  modalTimerValue: {
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  modalInputRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginBottom: Spacing.xl,
  },
  modalInputCol: {
    flex: 1,
  },
  modalInputLabel: {
    ...Typography.caption,
    marginBottom: Spacing.xs,
  },
  modalInput: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: {
    ...Typography.bodyMedium,
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalConfirmText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
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
  // ── Set Progress ───────────────────────────────────────────
  setProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  setProgressText: {
    ...Typography.captionMedium,
    fontVariant: ['tabular-nums'],
  },
  progressBarBg: {
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  hintText: {
    ...Typography.caption,
    fontStyle: 'italic',
    marginBottom: Spacing.lg,
  },
  // ── Exercise Tips ────────────────────────────────────────────
  tipsCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  tipsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tipsTitle: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  tipsChevron: {
    fontSize: 14,
  },
  tipsContent: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: Spacing.md,
  },
  tipsSectionLabel: {
    ...Typography.captionMedium,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  tipsStepRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  tipsStepNum: {
    ...Typography.caption,
    fontWeight: '700',
    width: 24,
  },
  tipsStepText: {
    ...Typography.caption,
    flex: 1,
    lineHeight: 18,
  },
  // ── Swipe Undo ──────────────────────────────────────────────
  swipeContainer: {
    marginBottom: Spacing.sm,
  },
  swipeUndoBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.md,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: Spacing.xl,
  },
  swipeUndoText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ── Sets ───────────────────────────────────────────────────
  sectionTitle: { ...Typography.bodyMedium },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  setRowActive: {
    ...Shadows.md,
  },
  setNumberCol: {
    width: 56,
    alignItems: 'center',
  },
  setIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  setIndicatorCheck: {
    fontSize: 16,
    fontWeight: '800',
  },
  setIndicatorNum: {
    fontSize: 14,
    fontWeight: '700',
  },
  tapHint: {
    ...Typography.label,
    fontSize: 9,
    marginTop: 2,
    letterSpacing: 1,
  },
  setInputs: { flex: 1, flexDirection: 'row', gap: Spacing.md },
  setField: { flex: 1 },
  setFieldLabel: { ...Typography.caption },
  setFieldValue: { ...Typography.bodySmall, fontVariant: ['tabular-nums'] },
  checkBtn: { padding: Spacing.sm },
  checkBtnIcon: { fontSize: 18 },
  // ── All Done Banner ────────────────────────────────────────
  allDoneBanner: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  allDoneText: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
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
