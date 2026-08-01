// Resolution Fitness App — Create Weekly Plan Screen
// Multi-step wizard for building a custom weekly workout plan.
// Theme-aware.
//
// Flow:
//   1. Approach:  Pick a pre-tailored template OR build custom
//   2. Days:      Select which days of the week to work out
//   3. Day Config: For each selected day, choose muscles → exercises → sets/lbs
//   4. Review:    Name the plan, see summary, confirm & save
//
// Each step provides a library of options plus the ability to input custom values.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';
import { getThisWeekMonday, getWeekMonday, getWeeksAhead, formatWeekLabel } from '../utils/dates';

// ── Constants ────────────────────────────────────────────────────────
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MUSCLE_GROUPS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio'];
const MUSCLE_LABELS = {
  chest: 'Chest', back: 'Back', legs: 'Legs',
  shoulders: 'Shoulders', arms: 'Arms', core: 'Core', cardio: 'Cardio',
};

const STEPS = ['Approach', 'Days', 'Configure', 'Review'];

// ── Main Component ───────────────────────────────────────────────────
export default function CreatePlanScreen({ navigation, route }) {
  const editPlanId = route.params?.planId || null;
  const isEditing = !!editPlanId;

  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // ── State ──────────────────────────────────────────────────────────
  const [step, setStep] = useState('approach');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [existingPlans, setExistingPlans] = useState({ consistent: 0, oneTime: 0 });
  const MAX_CONSISTENT = 2;
  const MAX_ONE_TIME = 3;

  const [approach, setApproach] = useState('custom');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [daySubStep, setDaySubStep] = useState('muscles');
  const [currentMuscleIndex, setCurrentMuscleIndex] = useState(0);
  const [planName, setPlanName] = useState('');
  const [planMode, setPlanMode] = useState('');
  const [customMode, setCustomMode] = useState('');
  const [modeGoal, setModeGoal] = useState('');
  const [routineType, setRoutineType] = useState('consistent');
  const [overrideWeekIndex, setOverrideWeekIndex] = useState(0);

  const [dayConfigs, setDayConfigs] = useState({});

  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customReps, setCustomReps] = useState('');
  const [customSets, setCustomSets] = useState('');
  const [customWeight, setCustomWeight] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // ── Fetch Data on Mount ────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isEditing) {
      loadExistingPlan();
    } else if (route.params?.template && exerciseLibrary.length > 0) {
      selectTemplate(route.params.template);
    }
  }, [editPlanId, exerciseLibrary]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exData, tData, plansData] = await Promise.all([
        api.getExercises(),
        api.getWorkoutTemplates(),
        api.getPlans(),
      ]);
      setExerciseLibrary(exData.data || exData.exercises || exData || []);
      setTemplates(tData.data || tData.templates || tData || []);
      const fetchedPlans = (plansData.data || plansData.plans || plansData);
      const plansArr = Array.isArray(fetchedPlans) ? fetchedPlans : [];
      setExistingPlans({
        consistent: plansArr.filter(p => p.routineType !== 'one_time').length,
        oneTime: plansArr.filter(p => p.routineType === 'one_time').length,
      });
    } catch (err) {
      console.warn('Failed to fetch plan data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingPlan = async () => {
    try {
      const plan = await api.getPlan(editPlanId);
      const p = plan.data || plan;
      setPlanName(p.name || '');
      if (p.mode) {
        const lower = p.mode.toLowerCase();
        if (lower === 'bulking' || lower === 'leaning') {
          setPlanMode(lower);
          setCustomMode('');
        } else {
          setPlanMode('custom');
          setCustomMode(p.mode);
        }
      } else {
        setPlanMode('');
        setCustomMode('');
      }
      setModeGoal(p.modeGoal || '');
      setRoutineType(p.routineType === 'one_time' ? 'one_time' : 'consistent');
      if (p.routineType === 'one_time' && p.weekStartDate) {
        setOverrideWeekIndex(getWeeksAhead(p.weekStartDate));
      } else {
        setOverrideWeekIndex(0);
      }
      if (p.days && p.days.length > 0) {
        const days = p.days.map(d => d.dayOfWeek).sort((a, b) => a - b);
        setSelectedDays(days);
        const configs = {};
        p.days.forEach(d => {
          const muscles = [...new Set(d.exercises.map(e => e.muscleGroup))];
          configs[d.dayOfWeek] = {
            muscles,
            exercises: d.exercises.map(e => ({
              exerciseId: e.exerciseId,
              name: e.exerciseName,
              muscleGroup: e.muscleGroup,
              targetSets: e.targetSets,
              targetReps: e.targetReps,
              targetWeight: e.targetWeight || 0,
              isCustom: !e.exerciseId || !!e.customExerciseName,
            })),
          };
        });
        setDayConfigs(configs);
        setStep('days');
      } else {
        setStep('days');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load plan. Please try again.');
      navigation.goBack();
    }
  };

  // ── Step Navigation ────────────────────────────────────────────────
  const goToStep = (s) => setStep(s);

  const getStepIndex = () => STEPS.indexOf(step === 'day-config' ? 'Configure' : step.charAt(0).toUpperCase() + step.slice(1));

  // ── Day Configuration Helpers ──────────────────────────────────────
  const currentDay = selectedDays[currentDayIndex];
  const currentConfig = dayConfigs[currentDay] || { muscles: [], exercises: [] };
  const currentMuscle = currentConfig.muscles[currentMuscleIndex];

  const getDayExercises = (dayOfWeek, muscleGroup) => {
    const config = dayConfigs[dayOfWeek];
    if (!config) return [];
    return config.exercises.filter(e => e.muscleGroup === muscleGroup);
  };

  const exercisesForCurrentMuscle = currentMuscle
    ? getDayExercises(currentDay, currentMuscle)
    : [];

  const isDayConfigured = (dayOfWeek) => {
    const config = dayConfigs[dayOfWeek];
    if (!config || !config.muscles || config.muscles.length === 0) return false;
    return config.muscles.every(m => getDayExercises(dayOfWeek, m).length >= 2);
  };

  const allDaysConfigured = selectedDays.every(d => isDayConfigured(d));

  // ── Handlers ───────────────────────────────────────────────────────

  const toggleDay = (dayIndex) => {
    setSelectedDays(prev => {
      if (prev.includes(dayIndex)) {
        const newDays = prev.filter(d => d !== dayIndex);
        const newConfigs = { ...dayConfigs };
        delete newConfigs[dayIndex];
        setDayConfigs(newConfigs);
        return newDays;
      } else {
        const newDays = [...prev, dayIndex].sort((a, b) => a - b);
        setDayConfigs(prevC => ({
          ...prevC,
          [dayIndex]: { muscles: [], exercises: [] },
        }));
        return newDays;
      }
    });
  };

  const toggleMuscle = (muscle) => {
    const config = dayConfigs[currentDay] || { muscles: [], exercises: [] };
    const muscles = config.muscles.includes(muscle)
      ? config.muscles.filter(m => m !== muscle)
      : [...config.muscles, muscle];
    const exercises = config.exercises.filter(e => e.muscleGroup !== muscle || muscles.includes(e.muscleGroup));
    if (currentMuscleIndex >= muscles.length && muscles.length > 0) {
      setCurrentMuscleIndex(muscles.length - 1);
    }
    setDayConfigs(prev => ({
      ...prev,
      [currentDay]: { muscles, exercises },
    }));
  };

  const addExercise = (ex, isCustom = false) => {
    const config = dayConfigs[currentDay] || { muscles: [], exercises: [] };
    const newExercise = isCustom
      ? {
          exerciseId: `custom-${Date.now()}`,
          name: customExerciseName.trim(),
          muscleGroup: currentMuscle,
          targetSets: parseInt(customSets) || 3,
          targetReps: customReps || '10-12',
          targetWeight: parseFloat(customWeight) || 0,
          isCustom: true,
        }
      : {
          exerciseId: ex.id,
          name: ex.name,
          muscleGroup: currentMuscle,
          targetSets: 3,
          targetReps: '10-12',
          targetWeight: 0,
          isCustom: false,
        };
    setDayConfigs(prev => ({
      ...prev,
      [currentDay]: {
        ...config,
        exercises: [...config.exercises, newExercise],
      },
    }));
    setCustomExerciseName('');
    setCustomReps('');
    setCustomSets('');
    setCustomWeight('');
    setShowCustomInput(false);
  };

  const removeExercise = (exerciseId) => {
    const config = dayConfigs[currentDay] || { muscles: [], exercises: [] };
    setDayConfigs(prev => ({
      ...prev,
      [currentDay]: {
        ...config,
        exercises: config.exercises.filter(e => e.exerciseId !== exerciseId),
      },
    }));
  };

  const updateExerciseConfig = (exerciseId, field, value) => {
    const config = dayConfigs[currentDay] || { muscles: [], exercises: [] };
    setDayConfigs(prev => ({
      ...prev,
      [currentDay]: {
        ...config,
        exercises: config.exercises.map(e =>
          e.exerciseId === exerciseId ? { ...e, [field]: value } : e
        ),
      },
    }));
  };

  const advanceDayConfig = () => {
    if (daySubStep === 'muscles') {
      if (currentConfig.muscles.length === 0) {
        Alert.alert('Select Muscles', 'Please select at least one muscle group for this day.');
        return;
      }
      setCurrentMuscleIndex(0);
      setDaySubStep('exercises');
    } else if (daySubStep === 'exercises') {
      const exForMuscle = getDayExercises(currentDay, currentConfig.muscles[currentMuscleIndex]);
      if (exForMuscle.length < 2) {
        Alert.alert('Need More Exercises', `Please add at least 2 exercises for ${MUSCLE_LABELS[currentMuscle] || currentMuscle}.`);
        return;
      }
      if (currentMuscleIndex < currentConfig.muscles.length - 1) {
        setCurrentMuscleIndex(currentMuscleIndex + 1);
      } else {
        setDaySubStep('config');
      }
    } else if (daySubStep === 'config') {
      if (currentDayIndex < selectedDays.length - 1) {
        setCurrentDayIndex(currentDayIndex + 1);
        setDaySubStep('muscles');
        setCurrentMuscleIndex(0);
      } else {
        goToStep('review');
      }
    }
  };

  const backDayConfig = () => {
    if (daySubStep === 'exercises') {
      if (currentMuscleIndex > 0) {
        setCurrentMuscleIndex(currentMuscleIndex - 1);
      } else {
        setDaySubStep('muscles');
      }
    } else if (daySubStep === 'config') {
      setCurrentMuscleIndex(currentConfig.muscles.length - 1);
      setDaySubStep('exercises');
    } else if (daySubStep === 'muscles') {
      if (currentDayIndex > 0) {
        setCurrentDayIndex(currentDayIndex - 1);
        setDaySubStep('muscles');
        setCurrentMuscleIndex(0);
      } else {
        goToStep('days');
      }
    }
  };

  const configureDay = (index) => {
    setCurrentDayIndex(index);
    setDaySubStep('muscles');
    setCurrentMuscleIndex(0);
    goToStep('day-config');
  };

  // ── Template Selection ─────────────────────────────────────────────
  const selectTemplate = (template) => {
    setSelectedTemplate(template);
    setApproach('template');
    const days = template.days.map(d => d.dayOfWeek).sort((a, b) => a - b);
    setSelectedDays(days);
    const configs = {};
    template.days.forEach(d => {
      const muscles = [...new Set(d.exercises.map(e => e.muscleGroup))];
      configs[d.dayOfWeek] = {
        muscles,
        exercises: d.exercises.map((e, i) => {
          const matched = exerciseLibrary.find(
            lib => lib.name.toLowerCase() === e.name.toLowerCase() && lib.muscleGroup === e.muscleGroup
          );
          return {
            exerciseId: matched ? matched.id : '',
            name: e.name,
            muscleGroup: e.muscleGroup,
            targetSets: e.targetSets || 3,
            targetReps: e.targetReps || '10-12',
            targetWeight: 0,
            isCustom: !matched,
          };
        }),
      };
    });
    setDayConfigs(configs);
    setPlanName(template.name || 'My Plan');
    setPlanMode('');
    setModeGoal('');
    setCustomMode('');
    setStep('days');
  };

  // ── Save Plan ──────────────────────────────────────────────────────
  const getOverrideWeekDate = () => getWeekMonday(overrideWeekIndex);

  const savePlan = async () => {
    if (!planName.trim()) {
      Alert.alert('Name Required', 'Please give your plan a name.');
      return;
    }

    setSaving(true);
    try {
      const days = selectedDays.map(dayOfWeek => {
        const config = dayConfigs[dayOfWeek];
        return {
          dayOfWeek,
          workoutName: `${DAY_LABELS_FULL[dayOfWeek]} — ${config.muscles.map(m => MUSCLE_LABELS[m] || m).join('/')}`,
          isRestDay: false,
          estimatedDuration: config.exercises.length * 5 + 10,
          exercises: config.exercises.map(e => ({
            exerciseId: e.isCustom ? '' : e.exerciseId,
            customExerciseName: e.isCustom ? e.name : '',
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetWeight: e.targetWeight || 0,
          })),
        };
      });

      const payload = {
        name: planName.trim(),
        mode: planMode === 'custom' ? customMode.trim() : planMode,
        modeGoal: modeGoal.trim(),
        routineType,
        days,
        weekStartDate: routineType === 'one_time' ? getOverrideWeekDate() : '',
      };

      if (isEditing) {
        await api.updatePlan(editPlanId, payload);
        navigation.goBack();
      } else {
        await api.createPlan(payload);
        navigation.goBack();
      }
    } catch (err) {
      const msg = err.message || 'Failed to save plan.';
      if (msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('timeout')) {
        Alert.alert(
          'Routine Likely Saved',
          'The connection timed out, but your routine may have been created. Please check your Fitness tab to verify.',
          [{ text: 'Go Back', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Plan ────────────────────────────────────────────────────
  const deletePlan = () => {
    Alert.alert(
      'Delete Plan',
      'Are you sure you want to delete this weekly plan? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePlan(editPlanId);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete plan.');
            }
          },
        },
      ]
    );
  };

  // ── Filtered Exercise Library ──────────────────────────────────────
  const exercisesForMuscle = exerciseLibrary.filter(
    ex => ex.muscleGroup === currentMuscle
  );

  // ── Loading State ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading exercise library...</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => {
          if (step === 'day-config') {
            Alert.alert('Leave?', 'You will lose unsaved changes to this day.', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', onPress: () => navigation.goBack() },
            ]);
          } else {
            navigation.goBack();
          }
        }}>
          <Text style={[styles.headerBack, { color: colors.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textHeading }]}>
          {isEditing ? 'Edit Routine' : 'Create Weekly Routine'}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      {/* ── Step Indicator ─────────────────────────────────────────── */}
      {step !== 'approach' && (
        <View style={[styles.stepIndicator, { backgroundColor: colors.surface }]}>
          {STEPS.slice(1).map((label, i) => {
            const stepKey = ['days', 'day-config', 'review'][i];
            const isActive = step === stepKey || (step === 'day-config' && stepKey === 'day-config');
            const isPast = ['days', 'day-config'].includes(stepKey) &&
              (step === 'review' || (step === 'day-config' && stepKey === 'days'));
            return (
              <React.Fragment key={label}>
                {i > 0 && <View style={[styles.stepLine, { backgroundColor: isPast ? colors.accent : colors.border }]} />}
                <View style={styles.stepDotWrap}>
                  <View style={[
                    styles.stepDot,
                    { backgroundColor: isActive ? colors.accent : isPast ? colors.accentSoft : colors.border },
                  ]}>
                    <Text style={[
                      styles.stepDotText,
                      { color: (isActive || isPast) ? colors.textInverse : colors.textSecondary },
                    ]}>
                      {isPast ? '✓' : i + 1}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, { color: isActive ? colors.accent : colors.textMuted, fontWeight: isActive ? '600' : '400' }]}>
                    {label}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* ── Step Content ───────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════════
            STEP: APPROACH — Choose template or custom
            ═══════════════════════════════════════════════════════════ */}
        {step === 'approach' && !isEditing && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Choose Your Approach</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Pick a pre-built template for quick setup, or build your own custom plan.
            </Text>

            <TouchableOpacity
              style={[styles.approachCard, { backgroundColor: colors.accentBg, borderColor: colors.accent }, Shadows.md]}
              onPress={() => { setApproach('custom'); goToStep('days'); }}
            >
              <Text style={styles.approachIcon}>⚡</Text>
              <View style={styles.approachInfo}>
                <Text style={[styles.approachTitle, { color: colors.textHeading }]}>Build Custom Routine</Text>
                <Text style={[styles.approachDesc, { color: colors.textSecondary }]}>
                  Design your own weekly routine from scratch — days, muscles, exercises, and goals.
                </Text>
              </View>
              <Text style={[styles.approachArrow, { color: colors.accent }]}>→</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
              Pre-Tailored Templates
            </Text>
            {templates.map((tmpl, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.templateCard, { backgroundColor: colors.surface }, Shadows.sm]}
                onPress={() => selectTemplate(tmpl)}
              >
                <View style={styles.templateHeader}>
                  <Text style={[styles.templateName, { color: colors.textHeading }]}>{tmpl.name}</Text>
                  <Text style={[styles.templateDays, { color: colors.accent, backgroundColor: colors.accentBg }]}>{tmpl.days?.length || 0} days/wk</Text>
                </View>
                <Text style={[styles.templateDesc, { color: colors.textSecondary }]}>{tmpl.description}</Text>
                <View style={styles.templateMuscles}>
                  {[...new Set(
                    (tmpl.days || []).flatMap(d =>
                      (d.exercises || []).map(e => e.muscleGroup)
                    )
                  )].slice(0, 6).map(m => (
                    <View key={m} style={[styles.miniMuscleChip, { backgroundColor: colors.divider }]}>
                      <Text style={[styles.miniMuscleText, { color: colors.textSecondary }]}>{MUSCLE_LABELS[m] || m}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.templateAction, { color: colors.accent }]}>Use This Template →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP: DAYS — Select workout days
            ═══════════════════════════════════════════════════════════ */}
        {step === 'days' && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Select Your Workout Days</Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Tap the days you commit to working out. You'll configure each day next.
            </Text>

            <View style={styles.dayChipGrid}>
              {DAY_LABELS.map((label, idx) => {
                const isSelected = selectedDays.includes(idx);
                const isConfigured = isDayConfigured(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.dayChip,
                      { backgroundColor: isConfigured ? colors.accentBg : isSelected ? colors.accentBg : colors.surface, borderColor: isConfigured ? colors.success : isSelected ? colors.accentSoft : colors.border },
                    ]}
                    onPress={() => toggleDay(idx)}
                  >
                    <Text style={[
                      styles.dayChipText,
                      { color: isSelected ? colors.accent : colors.textSecondary, fontWeight: isSelected ? '700' : '400' },
                    ]}>
                      {label}
                    </Text>
                    {isConfigured && (
                      <Text style={[styles.dayChipCheck, { color: colors.success }]}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedDays.length > 0 && (
              <View style={styles.selectedDaysSection}>
                <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
                  Tap a day to configure it. Days with ✓ are fully set up.
                </Text>
                {selectedDays.map((dayIdx, i) => {
                  const configured = isDayConfigured(dayIdx);
                  return (
                    <TouchableOpacity
                      key={dayIdx}
                      style={[styles.selectedDayRow, { backgroundColor: colors.surface, borderLeftColor: configured ? colors.success : 'transparent' }, configured && { borderLeftWidth: 3 }]}
                      onPress={() => configureDay(i)}
                    >
                      <View style={styles.selectedDayLeft}>
                        <View style={[styles.dayDot, { backgroundColor: configured ? colors.success : colors.border }]}>
                          <Text style={[styles.dayDotText, { color: colors.textSecondary }]}>
                            {configured ? '✓' : i + 1}
                          </Text>
                        </View>
                        <Text style={[styles.selectedDayLabel, { color: colors.textHeading }]}>
                          {DAY_LABELS_FULL[dayIdx]}
                        </Text>
                      </View>
                      <View style={styles.selectedDayRight}>
                        {configured && dayConfigs[dayIdx] && (
                          <Text style={[styles.selectedDaySummary, { color: colors.textSecondary }]}>
                            {dayConfigs[dayIdx].muscles.map(m => MUSCLE_LABELS[m] || m).join(', ')}
                          </Text>
                        )}
                        <Text style={[styles.selectedDayAction, { color: colors.accent }]}>
                          {configured ? 'Edit →' : 'Configure →'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {selectedDays.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.accent },
                  !allDaysConfigured && styles.primaryBtnDim,
                ]}
                onPress={() => {
                  if (allDaysConfigured) {
                    goToStep('review');
                  } else {
                    const firstUnconfigured = selectedDays.findIndex(d => !isDayConfigured(d));
                    configureDay(firstUnconfigured >= 0 ? firstUnconfigured : 0);
                  }
                }}
              >
                <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>
                  {allDaysConfigured ? 'Review Plan →' : 'Configure Days →'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP: DAY CONFIG — Muscles → Exercises → Sets/Lbs
            ═══════════════════════════════════════════════════════════ */}
        {step === 'day-config' && (
          <View>
            <View style={styles.dayProgressBar}>
              {selectedDays.map((d, i) => (
                <View
                  key={d}
                  style={[
                    styles.dayProgressDot,
                    { backgroundColor: i === currentDayIndex ? colors.accent : (isDayConfigured(d) || i < currentDayIndex) ? colors.success : colors.border },
                    i === currentDayIndex && styles.dayProgressDotActive,
                  ]}
                />
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>
              {DAY_LABELS_FULL[currentDay]}
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              {daySubStep === 'muscles' && 'Which muscle groups are you targeting?'}
              {daySubStep === 'exercises' && `Exercises for ${MUSCLE_LABELS[currentMuscle] || currentMuscle} (min 2)`}
              {daySubStep === 'config' && 'Configure sets, reps, and weight for each exercise'}
            </Text>

            {/* ── Sub-step: Muscles ───────────────────────────────── */}
            {daySubStep === 'muscles' && (
              <View>
                <View style={styles.muscleGrid}>
                  {MUSCLE_GROUPS.map(muscle => {
                    const isSelected = currentConfig.muscles?.includes(muscle);
                    return (
                      <TouchableOpacity
                        key={muscle}
                        style={[styles.muscleChip, { backgroundColor: isSelected ? colors.accentBg : colors.surface, borderColor: isSelected ? colors.accent : colors.border }]}
                        onPress={() => toggleMuscle(muscle)}
                      >
                        <Text style={[
                          styles.muscleChipText,
                          { color: isSelected ? colors.accent : colors.textSecondary, fontWeight: isSelected ? '700' : '400' },
                        ]}>
                          {MUSCLE_LABELS[muscle]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Sub-step: Exercises ─────────────────────────────── */}
            {daySubStep === 'exercises' && (
              <View>
                {exercisesForCurrentMuscle.map((ex, i) => (
                  <View key={ex.exerciseId || i} style={[styles.exerciseItem, { backgroundColor: colors.surface }, Shadows.sm]}>
                    <View style={styles.exerciseItemLeft}>
                      <Text style={[styles.exerciseItemName, { color: colors.textHeading }]}>{ex.name}</Text>
                      {ex.isCustom && (
                        <View style={[styles.customBadge, { backgroundColor: colors.accentBg }]}>
                          <Text style={[styles.customBadgeText, { color: colors.accent }]}>Custom</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => removeExercise(ex.exerciseId)}
                      style={[styles.removeBtn, { backgroundColor: colors.divider }]}
                    >
                      <Text style={[styles.removeBtnText, { color: colors.error }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={[styles.subsectionTitle, { color: colors.textSecondary }]}>
                  Exercise Library — {MUSCLE_LABELS[currentMuscle] || currentMuscle}
                </Text>
                {exercisesForMuscle.slice(0, 15).map(ex => {
                  const alreadyAdded = exercisesForCurrentMuscle.some(
                    e => e.exerciseId === ex.id
                  );
                  return (
                    <TouchableOpacity
                      key={ex.id}
                      style={[
                        styles.exerciseItem,
                        styles.exerciseItemAdd,
                        { backgroundColor: alreadyAdded ? colors.divider : colors.surface, borderColor: colors.border },
                        alreadyAdded && styles.exerciseItemAdded,
                        Shadows.sm,
                      ]}
                      onPress={() => !alreadyAdded && addExercise(ex)}
                      disabled={alreadyAdded}
                    >
                      <Text style={[
                        styles.exerciseItemName,
                        { color: alreadyAdded ? colors.textMuted : colors.textHeading },
                      ]}>
                        {ex.name}
                      </Text>
                      <Text style={[styles.exerciseItemMeta, { color: colors.textMuted }]}>
                        {ex.equipment}
                        {alreadyAdded ? ' • Added' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {!showCustomInput ? (
                  <TouchableOpacity
                    style={[styles.customAddBtn, { borderColor: colors.accent }]}
                    onPress={() => setShowCustomInput(true)}
                  >
                    <Text style={[styles.customAddBtnText, { color: colors.accent }]}>+ Add Custom Exercise</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.customInputCard, { backgroundColor: colors.surface }, Shadows.sm]}>
                    <Text style={[styles.subsectionTitle, { color: colors.textSecondary }]}>Custom Exercise</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                      placeholder="Exercise name (e.g., Cable Crossover)"
                      placeholderTextColor={colors.textMuted}
                      value={customExerciseName}
                      onChangeText={setCustomExerciseName}
                    />
                    <View style={styles.customInputRow}>
                      <View style={styles.customInputHalf}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Sets</Text>
                        <TextInput
                          style={[styles.textInputSmall, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                          placeholder="3"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="numeric"
                          value={customSets}
                          onChangeText={setCustomSets}
                        />
                      </View>
                      <View style={styles.customInputHalf}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Reps</Text>
                        <TextInput
                          style={[styles.textInputSmall, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                          placeholder="10-12"
                          placeholderTextColor={colors.textMuted}
                          value={customReps}
                          onChangeText={setCustomReps}
                        />
                      </View>
                      <View style={styles.customInputHalf}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Weight (lbs)</Text>
                        <TextInput
                          style={[styles.textInputSmall, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          value={customWeight}
                          onChangeText={setCustomWeight}
                        />
                      </View>
                    </View>
                    <View style={styles.customInputActions}>
                      <TouchableOpacity
                        style={[styles.cancelBtn, { backgroundColor: colors.divider }]}
                        onPress={() => setShowCustomInput(false)}
                      >
                        <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.addBtn,
                          { backgroundColor: colors.accent },
                          !customExerciseName.trim() && styles.addBtnDisabled,
                        ]}
                        onPress={() => addExercise(null, true)}
                        disabled={!customExerciseName.trim()}
                      >
                        <Text style={[styles.addBtnText, { color: colors.textInverse }]}>Add Exercise</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {currentConfig.muscles.length > 1 && (
                  <View style={[styles.muscleSubProgress, { borderTopColor: colors.border }]}>
                    {currentConfig.muscles.map((m, i) => {
                      const exCount = getDayExercises(currentDay, m).length;
                      return (
                        <View key={m} style={styles.muscleSubDotWrap}>
                          <View style={[
                            styles.muscleSubDot,
                            { backgroundColor: i === currentMuscleIndex ? colors.accent : i < currentMuscleIndex ? colors.success : colors.border },
                          ]} />
                          <Text style={[
                            styles.muscleSubLabel,
                            { color: i === currentMuscleIndex ? colors.accent : colors.textMuted, fontWeight: i === currentMuscleIndex ? '600' : '400' },
                          ]}>
                            {MUSCLE_LABELS[m]} ({exCount})
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ── Sub-step: Config (Sets/Reps/Weight) ─────────────── */}
            {daySubStep === 'config' && (
              <View>
                {currentConfig.exercises.map((ex, i) => (
                  <View key={ex.exerciseId || i} style={[styles.configCard, { backgroundColor: colors.surface }, Shadows.sm]}>
                    <Text style={[styles.configExName, { color: colors.textHeading }]}>
                      {ex.name}
                      <Text style={{ color: colors.textMuted }}> — {MUSCLE_LABELS[ex.muscleGroup] || ex.muscleGroup}</Text>
                    </Text>

                    <View style={styles.configRow}>
                      <View style={styles.configField}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Sets</Text>
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: colors.divider }]}
                            onPress={() => updateExerciseConfig(ex.exerciseId, 'targetSets', Math.max(1, ex.targetSets - 1))}
                          >
                            <Text style={[styles.stepperBtnText, { color: colors.textHeading }]}>−</Text>
                          </TouchableOpacity>
                          <Text style={[styles.stepperValue, { color: colors.textHeading }]}>{ex.targetSets}</Text>
                          <TouchableOpacity
                            style={[styles.stepperBtn, { backgroundColor: colors.divider }]}
                            onPress={() => updateExerciseConfig(ex.exerciseId, 'targetSets', Math.min(10, ex.targetSets + 1))}
                          >
                            <Text style={[styles.stepperBtnText, { color: colors.textHeading }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.configField}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Reps</Text>
                        <TextInput
                          style={[styles.textInputSmall, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                          value={ex.targetReps}
                          onChangeText={(v) => updateExerciseConfig(ex.exerciseId, 'targetReps', v)}
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>

                      <View style={styles.configField}>
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Weight (lbs)</Text>
                        <TextInput
                          style={[styles.textInputSmall, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                          value={ex.targetWeight ? String(ex.targetWeight) : ''}
                          onChangeText={(v) => updateExerciseConfig(ex.exerciseId, 'targetWeight', parseFloat(v) || 0)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                        />
                      </View>
                    </View>
                  </View>
                ))}

                {currentConfig.exercises.length === 0 && (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    No exercises configured. Go back and add some!
                  </Text>
                )}
              </View>
            )}

            <View style={styles.dayConfigNav}>
              <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: colors.divider }]} onPress={backDayConfig}>
                <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={advanceDayConfig}>
                <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>
                  {daySubStep === 'config'
                    ? (currentDayIndex < selectedDays.length - 1
                      ? `Next: ${DAY_LABELS[selectedDays[currentDayIndex + 1]]} →`
                      : 'Review Plan →')
                    : 'Continue →'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP: REVIEW — Name, summary, save
            ═══════════════════════════════════════════════════════════ */}
        {step === 'review' && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Review Your Routine</Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Routine Name</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
              placeholder="e.g., My PPL Split, Summer Shred, etc."
              placeholderTextColor={colors.textMuted}
              value={planName}
              onChangeText={setPlanName}
            />

            <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
              Training Mode
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              What's your goal for this routine?
            </Text>

            <View style={styles.modeGrid}>
              {['bulking', 'leaning'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.modeCard,
                    { backgroundColor: planMode === mode ? colors.accentBg : colors.surface, borderColor: planMode === mode ? colors.accent : colors.border },
                    Shadows.sm,
                  ]}
                  onPress={() => {
                    setPlanMode(mode);
                    setCustomMode('');
                  }}
                >
                  <Text style={styles.modeIcon}>
                    {mode === 'bulking' ? '🏋️' : '🔥'}
                  </Text>
                  <Text style={[
                    styles.modeTitle,
                    { color: planMode === mode ? colors.accent : colors.textPrimary },
                  ]}>
                    {mode === 'bulking' ? 'Bulking' : 'Leaning'}
                  </Text>
                  <Text style={[styles.modeDesc, { color: colors.textMuted }]}>
                    {mode === 'bulking' ? 'Build muscle & gain strength' : 'Cut fat & maintain muscle'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.modeCard,
                  { backgroundColor: planMode === 'custom' ? colors.accentBg : colors.surface, borderColor: planMode === 'custom' ? colors.accent : colors.border },
                  Shadows.sm,
                ]}
                onPress={() => {
                  setPlanMode('custom');
                  setCustomMode('');
                }}
              >
                <Text style={styles.modeIcon}>🎯</Text>
                <Text style={[
                  styles.modeTitle,
                  { color: planMode === 'custom' ? colors.accent : colors.textPrimary },
                ]}>
                  Custom
                </Text>
                <Text style={[styles.modeDesc, { color: colors.textMuted }]}>Your own unique goal</Text>
              </TouchableOpacity>
            </View>

            {planMode === 'custom' && (
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading, marginTop: Spacing.md }]}
                placeholder="Name your mode (e.g., Body Recomp, Powerbuilding)"
                placeholderTextColor={colors.textMuted}
                value={customMode}
                onChangeText={setCustomMode}
              />
            )}

            {planMode !== '' && (
              <>
                <Text style={[styles.inputLabel, { marginTop: Spacing.lg, color: colors.textSecondary }]}>
                  Goal Description
                </Text>
                <TextInput
                  style={[styles.textInput, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textHeading }]}
                  placeholder={
                    planMode === 'bulking'
                      ? 'e.g., Gain 10 lbs of lean muscle over 12 weeks. Focus on progressive overload and calorie surplus.'
                      : planMode === 'leaning'
                      ? 'e.g., Drop to 12% body fat while keeping muscle. Maintain 500kcal deficit with high protein.'
                      : 'Describe what this custom mode means for you and what you want to achieve.'
                  }
                  placeholderTextColor={colors.textMuted}
                  value={modeGoal}
                  onChangeText={setModeGoal}
                  multiline
                  numberOfLines={3}
                />
              </>
            )}

            <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
              Routine Schedule
            </Text>
            <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>
              Should this routine repeat every week, or override a specific week?
            </Text>
            <View style={[styles.limitInfoRow, { backgroundColor: colors.divider }]}>
              <Text style={[styles.limitInfoText, { color: colors.textSecondary }]}>
                Routines: {existingPlans.consistent}/{MAX_CONSISTENT} • Overrides: {existingPlans.oneTime}/{MAX_ONE_TIME}
              </Text>
            </View>

            <View style={styles.routineTypeRow}>
              <TouchableOpacity
                style={[
                  styles.routineTypeCard,
                  { backgroundColor: routineType === 'consistent' ? colors.accentBg : colors.surface, borderColor: routineType === 'consistent' ? colors.accent : colors.border },
                  existingPlans.consistent >= MAX_CONSISTENT && styles.routineTypeCardDisabled,
                ]}
                onPress={() => {
                  if (existingPlans.consistent >= MAX_CONSISTENT) {
                    Alert.alert('Limit Reached', `You can only have up to ${MAX_CONSISTENT} routines. Delete an existing one to create a new one.`);
                    return;
                  }
                  setRoutineType('consistent');
                }}
              >
                <Text style={styles.routineTypeIcon}>🔄</Text>
                <Text style={[
                  styles.routineTypeTitle,
                  { color: routineType === 'consistent' ? colors.accent : colors.textPrimary },
                ]}>
                  Consistent
                </Text>
                <Text style={[styles.routineTypeDesc, { color: colors.textMuted }]}>
                  Repeats every week automatically
                </Text>
                {existingPlans.consistent >= MAX_CONSISTENT && (
                  <Text style={[styles.routineTypeLimit, { color: colors.error }]}>Limit reached</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.routineTypeCard,
                  { backgroundColor: routineType === 'one_time' ? colors.accentBg : colors.surface, borderColor: routineType === 'one_time' ? colors.accent : colors.border },
                  existingPlans.oneTime >= MAX_ONE_TIME && styles.routineTypeCardDisabled,
                ]}
                onPress={() => {
                  if (existingPlans.oneTime >= MAX_ONE_TIME) {
                    Alert.alert('Limit Reached', `You can only have up to ${MAX_ONE_TIME} one-time overrides. Delete or wait for one to expire.`);
                    return;
                  }
                  setRoutineType('one_time');
                }}
              >
                <Text style={styles.routineTypeIcon}>📅</Text>
                <Text style={[
                  styles.routineTypeTitle,
                  { color: routineType === 'one_time' ? colors.accent : colors.textPrimary },
                ]}>
                  One-Time
                </Text>
                <Text style={[styles.routineTypeDesc, { color: colors.textMuted }]}>
                  Overrides a single week only
                </Text>
                {existingPlans.oneTime >= MAX_ONE_TIME && (
                  <Text style={[styles.routineTypeLimit, { color: colors.error }]}>Limit reached</Text>
                )}
              </TouchableOpacity>
            </View>

            {routineType === 'one_time' && (
              <View style={styles.weekPickerSection}>
                <Text style={[styles.inputLabel, { marginTop: Spacing.md, color: colors.textSecondary }]}>
                  Select which week to override
                </Text>
                <View style={styles.weekPickerRow}>
                  {[0, 1, 2, 3].map((i) => {
                    const monday = getWeekMonday(i);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[
                          styles.weekChip,
                          { backgroundColor: overrideWeekIndex === i ? colors.accentBg : colors.surface, borderColor: overrideWeekIndex === i ? colors.accent : colors.border },
                        ]}
                        onPress={() => setOverrideWeekIndex(i)}
                      >
                        <Text style={[
                          styles.weekChipLabel,
                          { color: overrideWeekIndex === i ? colors.accent : colors.textPrimary },
                        ]}>
                          {i === 0 ? 'This Week' : i === 1 ? 'Next Week' : `+${i} Weeks`}
                        </Text>
                        <Text style={[
                          styles.weekChipDate,
                          { color: overrideWeekIndex === i ? colors.accent : colors.textMuted },
                        ]}>
                          {formatWeekLabel(monday)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
              Weekly Schedule
            </Text>
            {selectedDays.map((dayIdx, i) => {
              const config = dayConfigs[dayIdx];
              if (!config) return null;
              return (
                <TouchableOpacity
                  key={dayIdx}
                  style={[styles.reviewDayCard, { backgroundColor: colors.surface }, Shadows.sm]}
                  onPress={() => configureDay(i)}
                >
                  <View style={styles.reviewDayHeader}>
                    <Text style={[styles.reviewDayLabel, { color: colors.textHeading }]}>
                      {DAY_LABELS_FULL[dayIdx]}
                    </Text>
                    <Text style={[styles.reviewDayEdit, { color: colors.accent }]}>Edit</Text>
                  </View>
                  <Text style={[styles.reviewDayMuscles, { color: colors.accent }]}>
                    {config.muscles.map(m => MUSCLE_LABELS[m] || m).join(' · ')}
                  </Text>
                  {config.exercises.map((ex, j) => (
                    <View key={j} style={styles.reviewExerciseRow}>
                      <Text style={[styles.reviewExName, { color: colors.textHeading }]}>• {ex.name}</Text>
                      <Text style={[styles.reviewExConfig, { color: colors.textSecondary }]}>
                        {ex.targetSets}×{ex.targetReps}
                        {ex.targetWeight > 0 ? ` @ ${ex.targetWeight}lbs` : ''}
                      </Text>
                    </View>
                  ))}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.primaryBtn, styles.saveBtn, { backgroundColor: colors.accent }]}
              onPress={savePlan}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>
                  {isEditing ? 'Update Routine' : 'Create Routine'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.divider }]}
              onPress={() => goToStep('days')}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>← Back to Days</Text>
            </TouchableOpacity>

            {isEditing && (
              <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: colors.surface, borderColor: colors.error }]} onPress={deletePlan}>
                <Text style={[styles.deleteBtnText, { color: colors.error }]}>Delete Routine</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: Spacing['5xl'] }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { ...Typography.bodySmall, marginTop: Spacing.md },

    // ── Header ─────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.xl,
      paddingTop: Layout.screenTopPadding,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
    },
    headerBack: { ...Typography.bodyMedium, fontWeight: '600' },
    headerTitle: { ...Typography.h3 },

    // ── Step Indicator ─────────────────────────────────────────────────
    stepIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.xl,
      gap: Spacing.xs,
    },
    stepLine: { height: 2, flex: 1, maxWidth: 40 },
    stepDotWrap: { alignItems: 'center' },
    stepDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepDotText: { ...Typography.caption, fontWeight: '700' },
    stepLabel: { ...Typography.caption, marginTop: 4 },

    // ── Scroll ─────────────────────────────────────────────────────────
    scrollContent: { padding: Spacing.xl },

    // ── Section Titles ─────────────────────────────────────────────────
    sectionTitle: { ...Typography.h3, marginBottom: Spacing.sm },
    sectionSub: { ...Typography.bodySmall, marginBottom: Spacing.lg, lineHeight: 20 },
    subsectionTitle: { ...Typography.captionMedium, marginTop: Spacing.lg, marginBottom: Spacing.sm },

    // ── Approach Step ──────────────────────────────────────────────────
    approachCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.md,
      borderWidth: 2,
    },
    approachIcon: { fontSize: 28, marginRight: Spacing.lg },
    approachInfo: { flex: 1 },
    approachTitle: { ...Typography.h4, marginBottom: 4 },
    approachDesc: { ...Typography.bodySmall, lineHeight: 18 },
    approachArrow: { fontSize: 24, fontWeight: '700' },

    templateCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.md,
    },
    templateHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    templateName: { ...Typography.h4 },
    templateDays: {
      ...Typography.captionMedium,
      paddingHorizontal: Spacing.md,
      paddingVertical: 4,
      borderRadius: BorderRadius.full,
    },
    templateDesc: { ...Typography.bodySmall, marginBottom: Spacing.md, lineHeight: 18 },
    templateMuscles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
    miniMuscleChip: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: BorderRadius.sm,
    },
    miniMuscleText: { ...Typography.caption },
    templateAction: { ...Typography.captionMedium, fontWeight: '700' },

    // ── Days Step ──────────────────────────────────────────────────────
    dayChipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginBottom: Spacing['2xl'],
    },
    dayChip: {
      width: '13%',
      aspectRatio: 1,
      borderRadius: BorderRadius.md,
      borderWidth: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayChipText: { ...Typography.captionMedium },
    dayChipCheck: { ...Typography.caption, marginTop: 2, fontWeight: '700' },

    selectedDaysSection: { marginBottom: Spacing.xl },
    selectedDayRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.lg,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
    },
    selectedDayLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    dayDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayDotText: { ...Typography.caption, fontWeight: '700' },
    selectedDayLabel: { ...Typography.bodyMedium, fontWeight: '600' },
    selectedDayRight: { alignItems: 'flex-end' },
    selectedDaySummary: { ...Typography.caption, marginBottom: 2 },
    selectedDayAction: { ...Typography.captionMedium, fontWeight: '600' },

    // ── Day Config ─────────────────────────────────────────────────────
    dayProgressBar: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.sm,
      marginBottom: Spacing.xl,
    },
    dayProgressDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    dayProgressDotActive: { width: 24, borderRadius: 5 },

    muscleGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    muscleChip: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
    },
    muscleChipText: { ...Typography.captionMedium },

    exerciseItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.lg,
      borderRadius: BorderRadius.md,
      marginBottom: Spacing.sm,
    },
    exerciseItemAdd: {
      borderWidth: 1,
      borderStyle: 'dashed',
    },
    exerciseItemAdded: { opacity: 0.5 },
    exerciseItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
    exerciseItemName: { ...Typography.captionMedium, flex: 1 },
    exerciseItemMeta: { ...Typography.caption },
    customBadge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    customBadgeText: { ...Typography.caption, fontWeight: '600' },
    removeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: Spacing.sm,
    },
    removeBtnText: { fontSize: 12, fontWeight: '700' },

    customAddBtn: {
      padding: Spacing.lg,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      marginTop: Spacing.md,
    },
    customAddBtnText: { ...Typography.captionMedium, fontWeight: '600' },

    customInputCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginTop: Spacing.md,
    },
    customInputRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    customInputHalf: { flex: 1 },
    customInputActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },

    // ── Config Step ───────────────────────────────────────────────────
    configCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.md,
    },
    configExName: { ...Typography.captionMedium, marginBottom: Spacing.md },
    configRow: { flexDirection: 'row', gap: Spacing.sm },
    configField: { flex: 1, alignItems: 'center' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
    stepperBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepperBtnText: { fontSize: 18, fontWeight: '600' },
    stepperValue: { ...Typography.bodyMedium, fontWeight: '700', minWidth: 24, textAlign: 'center' },

    // ── Muscle sub-progress ───────────────────────────────────────────
    muscleSubProgress: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.md,
      marginTop: Spacing.xl,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
    },
    muscleSubDotWrap: { alignItems: 'center', gap: 4 },
    muscleSubDot: { width: 8, height: 8, borderRadius: 4 },
    muscleSubLabel: { ...Typography.caption },

    // ── Review Step ───────────────────────────────────────────────────
    reviewDayCard: {
      borderRadius: BorderRadius.lg,
      padding: Spacing.xl,
      marginBottom: Spacing.md,
    },
    reviewDayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    reviewDayLabel: { ...Typography.h4 },
    reviewDayEdit: { ...Typography.captionMedium },
    reviewDayMuscles: { ...Typography.captionMedium, marginBottom: Spacing.md },
    reviewExerciseRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xs,
      paddingLeft: Spacing.sm,
    },
    reviewExName: { ...Typography.bodySmall, flex: 1 },
    reviewExConfig: { ...Typography.caption },

    // ── Day Config Nav ────────────────────────────────────────────────
    dayConfigNav: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginTop: Spacing['2xl'],
    },

    // ── Buttons ───────────────────────────────────────────────────────
    primaryBtn: {
      flex: 1,
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    primaryBtnDim: { opacity: 0.6 },
    primaryBtnText: { ...Typography.bodyMedium, fontWeight: '700' },
    secondaryBtn: {
      flex: 1,
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    secondaryBtnText: { ...Typography.bodyMedium, fontWeight: '600' },
    saveBtn: { marginTop: Spacing['2xl'] },
    deleteBtn: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
      marginTop: Spacing.lg,
      borderWidth: 1.5,
    },
    deleteBtnText: { ...Typography.bodyMedium, fontWeight: '700' },

    addBtn: {
      flex: 1,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      alignItems: 'center',
    },
    addBtnDisabled: { opacity: 0.5 },
    addBtnText: { ...Typography.captionMedium, fontWeight: '700' },
    cancelBtn: {
      flex: 1,
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      alignItems: 'center',
    },
    cancelBtnText: { ...Typography.captionMedium },

    // ── Inputs ────────────────────────────────────────────────────────
    textInput: {
      ...Typography.bodyMedium,
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      marginTop: Spacing.xs,
    },
    textInputSmall: {
      ...Typography.captionMedium,
      borderWidth: 1,
      borderRadius: BorderRadius.sm,
      padding: Spacing.sm,
      textAlign: 'center',
      marginTop: Spacing.xs,
    },
    inputLabel: { ...Typography.caption, fontWeight: '600' },
    emptyText: { ...Typography.bodySmall, textAlign: 'center', marginTop: Spacing.xl },

    // ── Mode Selection ──────────────────────────────────────────
    modeGrid: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    modeCard: {
      flex: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      alignItems: 'center',
      borderWidth: 2,
    },
    modeIcon: { fontSize: 32, marginBottom: Spacing.sm },
    modeTitle: { ...Typography.captionMedium, fontWeight: '700', marginBottom: 4 },
    modeDesc: { ...Typography.caption, textAlign: 'center' },
    textArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },

    // ── Routine Type Selection ────────────────────────────────────
    routineTypeRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    routineTypeCard: {
      flex: 1,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      alignItems: 'center',
      borderWidth: 2,
    },
    routineTypeCardDisabled: { opacity: 0.5 },
    routineTypeIcon: { fontSize: 28, marginBottom: Spacing.xs },
    routineTypeTitle: { ...Typography.captionMedium, fontWeight: '700', marginBottom: 4 },
    routineTypeDesc: { ...Typography.caption, textAlign: 'center' },
    routineTypeLimit: { ...Typography.caption, fontWeight: '600', marginTop: 4 },

    // ── Limit Info ──────────────────────────────────────────────────
    limitInfoRow: {
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
      alignItems: 'center',
    },
    limitInfoText: { ...Typography.caption, fontWeight: '600' },

    // ── Week Picker ───────────────────────────────────────────────
    weekPickerSection: { marginTop: Spacing.md },
    weekPickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    weekChip: {
      flex: 1,
      minWidth: '45%',
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      borderWidth: 1.5,
      alignItems: 'center',
    },
    weekChipLabel: { ...Typography.captionMedium, fontWeight: '600', marginBottom: 2 },
    weekChipDate: { ...Typography.caption, fontSize: 11 },
  });
}
