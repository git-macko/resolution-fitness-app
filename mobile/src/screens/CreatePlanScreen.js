// Resolution Fitness App — Create Weekly Plan Screen
// Multi-step wizard for building a custom weekly workout plan.
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
import Colors from '../theme/colors';
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
  // Editing mode: if planId is passed, we're editing an existing plan
  const editPlanId = route.params?.planId || null;
  const isEditing = !!editPlanId;

  // ── State ──────────────────────────────────────────────────────────
  const [step, setStep] = useState('approach'); // approach | days | day-config | review
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exerciseLibrary, setExerciseLibrary] = useState([]);
  const [templates, setTemplates] = useState([]);

  // Plan count limits
  const [existingPlans, setExistingPlans] = useState({ consistent: 0, oneTime: 0 });
  const MAX_CONSISTENT = 2;
  const MAX_ONE_TIME = 3;

  // Wizard data
  const [approach, setApproach] = useState('custom'); // 'custom' | 'template'
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);       // [0, 2, 4] = Mon, Wed, Fri
  const [currentDayIndex, setCurrentDayIndex] = useState(0);   // which selected day we're configuring
  const [daySubStep, setDaySubStep] = useState('muscles');     // muscles | exercises | config
  const [currentMuscleIndex, setCurrentMuscleIndex] = useState(0);
  const [planName, setPlanName] = useState('');
  const [planMode, setPlanMode] = useState(''); // 'bulking' | 'leaning' | 'custom'
  const [customMode, setCustomMode] = useState(''); // user-typed custom mode name
  const [modeGoal, setModeGoal] = useState(''); // description of what this mode's goal is
  const [routineType, setRoutineType] = useState('consistent'); // 'consistent' | 'one_time'
  const [overrideWeekIndex, setOverrideWeekIndex] = useState(0); // which upcoming week (0=this week, 1=next, ...)

  // Day configs: { [dayOfWeek]: { muscles: string[], exercises: [] } }
  const [dayConfigs, setDayConfigs] = useState({});

  // Custom input state
  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customReps, setCustomReps] = useState('');
  const [customSets, setCustomSets] = useState('');
  const [customWeight, setCustomWeight] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // ── Fetch Data on Mount ────────────────────────────────────────────
  useEffect(() => {
    fetchData();
  }, []);

  // If editing, load existing plan; if a template was passed via navigation, select it
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
      // Count existing plans by type
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
      // Calculate which week index this plan's weekStartDate corresponds to
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

  // Check if a day is fully configured (has muscles + at least 2 exercises per muscle)
  const isDayConfigured = (dayOfWeek) => {
    const config = dayConfigs[dayOfWeek];
    if (!config || !config.muscles || config.muscles.length === 0) return false;
    // Each muscle must have at least 2 exercises
    return config.muscles.every(m => getDayExercises(dayOfWeek, m).length >= 2);
  };

  const allDaysConfigured = selectedDays.every(d => isDayConfigured(d));

  // ── Handlers ───────────────────────────────────────────────────────

  // Toggle a day selection
  const toggleDay = (dayIndex) => {
    setSelectedDays(prev => {
      if (prev.includes(dayIndex)) {
        // Remove day and its config
        const newDays = prev.filter(d => d !== dayIndex);
        const newConfigs = { ...dayConfigs };
        delete newConfigs[dayIndex];
        setDayConfigs(newConfigs);
        return newDays;
      } else {
        // Add day (keep sorted)
        const newDays = [...prev, dayIndex].sort((a, b) => a - b);
        setDayConfigs(prevC => ({
          ...prevC,
          [dayIndex]: { muscles: [], exercises: [] },
        }));
        return newDays;
      }
    });
  };

  // Toggle a muscle group for the current day
  const toggleMuscle = (muscle) => {
    const config = dayConfigs[currentDay] || { muscles: [], exercises: [] };
    const muscles = config.muscles.includes(muscle)
      ? config.muscles.filter(m => m !== muscle)
      : [...config.muscles, muscle];
    // Remove exercises for removed muscle
    const exercises = config.exercises.filter(e => e.muscleGroup !== muscle || muscles.includes(e.muscleGroup));
    // Clamp currentMuscleIndex to prevent out-of-bounds
    if (currentMuscleIndex >= muscles.length && muscles.length > 0) {
      setCurrentMuscleIndex(muscles.length - 1);
    }
    setDayConfigs(prev => ({
      ...prev,
      [currentDay]: { muscles, exercises },
    }));
  };

  // Add an exercise to the current day's current muscle
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
          targetSets: 3, // default, user configures later
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

  // Remove an exercise from the current day
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

  // Update exercise config (sets, reps, weight)
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

  // Move to next muscle or sub-step
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
      // Move to next muscle, or to config step
      if (currentMuscleIndex < currentConfig.muscles.length - 1) {
        setCurrentMuscleIndex(currentMuscleIndex + 1);
      } else {
        setDaySubStep('config');
      }
    } else if (daySubStep === 'config') {
      // Day is fully configured, move to next day or back to days
      if (currentDayIndex < selectedDays.length - 1) {
        setCurrentDayIndex(currentDayIndex + 1);
        setDaySubStep('muscles');
        setCurrentMuscleIndex(0);
      } else {
        // All days done, go to review
        goToStep('review');
      }
    }
  };

  // Go back in day config
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

  // Skip to a specific day in the day list
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
          // Match template exercise name against the loaded exercise library
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
            isCustom: !matched, // treat unmatched as custom so name is preserved
          };
        }),
      };
    });
    setDayConfigs(configs);      setPlanName(template.name || 'My Plan');
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
          estimatedDuration: config.exercises.length * 5 + 10, // rough: 5 min per exercise + warmup
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
      // Timed out — plan was likely created on the server, navigate back
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading exercise library...</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
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
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Routine' : 'Create Weekly Routine'}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      {/* ── Step Indicator ─────────────────────────────────────────── */}
      {step !== 'approach' && (
        <View style={styles.stepIndicator}>
          {STEPS.slice(1).map((label, i) => {
            const stepKey = ['days', 'day-config', 'review'][i];
            const isActive = step === stepKey || (step === 'day-config' && stepKey === 'day-config');
            const isPast = ['days', 'day-config'].includes(stepKey) &&
              (step === 'review' || (step === 'day-config' && stepKey === 'days'));
            return (
              <React.Fragment key={label}>
                {i > 0 && <View style={[styles.stepLine, isPast && styles.stepLineActive]} />}
                <View style={styles.stepDotWrap}>
                  <View style={[
                    styles.stepDot,
                    isActive && styles.stepDotActive,
                    isPast && styles.stepDotDone,
                  ]}>
                    <Text style={[
                      styles.stepDotText,
                      (isActive || isPast) && styles.stepDotTextActive,
                    ]}>
                      {isPast ? '✓' : i + 1}
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
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
            <Text style={styles.sectionTitle}>Choose Your Approach</Text>
            <Text style={styles.sectionSub}>
              Pick a pre-built template for quick setup, or build your own custom plan.
            </Text>

            {/* Custom Plan Button */}
            <TouchableOpacity
              style={[styles.approachCard, Shadows.md]}
              onPress={() => { setApproach('custom'); goToStep('days'); }}
            >
              <Text style={styles.approachIcon}>⚡</Text>
              <View style={styles.approachInfo}>
                <Text style={styles.approachTitle}>Build Custom Routine</Text>
                <Text style={styles.approachDesc}>
                  Design your own weekly routine from scratch — days, muscles, exercises, and goals.
                </Text>
              </View>
              <Text style={styles.approachArrow}>→</Text>
            </TouchableOpacity>

            {/* Templates */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
              Pre-Tailored Templates
            </Text>
            {templates.map((tmpl, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.templateCard, Shadows.sm]}
                onPress={() => selectTemplate(tmpl)}
              >
                <View style={styles.templateHeader}>
                  <Text style={styles.templateName}>{tmpl.name}</Text>
                  <Text style={styles.templateDays}>{tmpl.days?.length || 0} days/wk</Text>
                </View>
                <Text style={styles.templateDesc}>{tmpl.description}</Text>
                <View style={styles.templateMuscles}>
                  {[...new Set(
                    (tmpl.days || []).flatMap(d =>
                      (d.exercises || []).map(e => e.muscleGroup)
                    )
                  )].slice(0, 6).map(m => (
                    <View key={m} style={styles.miniMuscleChip}>
                      <Text style={styles.miniMuscleText}>{MUSCLE_LABELS[m] || m}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.templateAction}>Use This Template →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════
            STEP: DAYS — Select workout days
            ═══════════════════════════════════════════════════════════ */}
        {step === 'days' && (
          <View>
            <Text style={styles.sectionTitle}>Select Your Workout Days</Text>
            <Text style={styles.sectionSub}>
              Tap the days you commit to working out. You'll configure each day next.
            </Text>

            {/* Day Chips */}
            <View style={styles.dayChipGrid}>
              {DAY_LABELS.map((label, idx) => {
                const isSelected = selectedDays.includes(idx);
                const isConfigured = isDayConfigured(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.dayChip,
                      isSelected && styles.dayChipSelected,
                      isConfigured && styles.dayChipConfigured,
                    ]}
                    onPress={() => toggleDay(idx)}
                  >
                    <Text style={[
                      styles.dayChipText,
                      isSelected && styles.dayChipTextSelected,
                    ]}>
                      {label}
                    </Text>
                    {isConfigured && (
                      <Text style={styles.dayChipCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selected days list */}
            {selectedDays.length > 0 && (
              <View style={styles.selectedDaysSection}>
                <Text style={styles.sectionSub}>
                  Tap a day to configure it. Days with ✓ are fully set up.
                </Text>
                {selectedDays.map((dayIdx, i) => {
                  const configured = isDayConfigured(dayIdx);
                  return (
                    <TouchableOpacity
                      key={dayIdx}
                      style={[styles.selectedDayRow, configured && styles.selectedDayRowDone]}
                      onPress={() => configureDay(i)}
                    >
                      <View style={styles.selectedDayLeft}>
                        <View style={[styles.dayDot, configured && styles.dayDotDone]}>
                          <Text style={styles.dayDotText}>
                            {configured ? '✓' : i + 1}
                          </Text>
                        </View>
                        <Text style={styles.selectedDayLabel}>
                          {DAY_LABELS_FULL[dayIdx]}
                        </Text>
                      </View>
                      <View style={styles.selectedDayRight}>
                        {configured && dayConfigs[dayIdx] && (
                          <Text style={styles.selectedDaySummary}>
                            {dayConfigs[dayIdx].muscles.map(m => MUSCLE_LABELS[m] || m).join(', ')}
                          </Text>
                        )}
                        <Text style={styles.selectedDayAction}>
                          {configured ? 'Edit →' : 'Configure →'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Continue button */}
            {selectedDays.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  !allDaysConfigured && styles.primaryBtnDim,
                ]}
                onPress={() => {
                  if (allDaysConfigured) {
                    goToStep('review');
                  } else {
                    // Start configuring the first unconfigured day
                    const firstUnconfigured = selectedDays.findIndex(d => !isDayConfigured(d));
                    configureDay(firstUnconfigured >= 0 ? firstUnconfigured : 0);
                  }
                }}
              >
                <Text style={styles.primaryBtnText}>
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
            {/* Day progress bar */}
            <View style={styles.dayProgressBar}>
              {selectedDays.map((d, i) => (
                <View
                  key={d}
                  style={[
                    styles.dayProgressDot,
                    i === currentDayIndex && styles.dayProgressDotActive,
                    isDayConfigured(d) && i !== currentDayIndex && styles.dayProgressDotDone,
                    i < currentDayIndex && styles.dayProgressDotDone,
                  ]}
                />
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              {DAY_LABELS_FULL[currentDay]}
            </Text>
            <Text style={styles.sectionSub}>
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
                        style={[styles.muscleChip, isSelected && styles.muscleChipSelected]}
                        onPress={() => toggleMuscle(muscle)}
                      >
                        <Text style={[
                          styles.muscleChipText,
                          isSelected && styles.muscleChipTextSelected,
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
                {/* Currently added exercises */}
                {exercisesForCurrentMuscle.map((ex, i) => (
                  <View key={ex.exerciseId || i} style={[styles.exerciseItem, Shadows.sm]}>
                    <View style={styles.exerciseItemLeft}>
                      <Text style={styles.exerciseItemName}>{ex.name}</Text>
                      {ex.isCustom && (
                        <View style={styles.customBadge}>
                          <Text style={styles.customBadgeText}>Custom</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => removeExercise(ex.exerciseId)}
                      style={styles.removeBtn}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Library exercises for this muscle */}
                <Text style={styles.subsectionTitle}>
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
                        alreadyAdded && styles.exerciseItemAdded,
                        Shadows.sm,
                      ]}
                      onPress={() => !alreadyAdded && addExercise(ex)}
                      disabled={alreadyAdded}
                    >
                      <Text style={[
                        styles.exerciseItemName,
                        alreadyAdded && styles.exerciseItemAddedText,
                      ]}>
                        {ex.name}
                      </Text>
                      <Text style={styles.exerciseItemMeta}>
                        {ex.equipment}
                        {alreadyAdded ? ' • Added' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Custom exercise input */}
                {!showCustomInput ? (
                  <TouchableOpacity
                    style={styles.customAddBtn}
                    onPress={() => setShowCustomInput(true)}
                  >
                    <Text style={styles.customAddBtnText}>+ Add Custom Exercise</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.customInputCard, Shadows.sm]}>
                    <Text style={styles.subsectionTitle}>Custom Exercise</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Exercise name (e.g., Cable Crossover)"
                      placeholderTextColor={Colors.textMuted}
                      value={customExerciseName}
                      onChangeText={setCustomExerciseName}
                    />
                    <View style={styles.customInputRow}>
                      <View style={styles.customInputHalf}>
                        <Text style={styles.inputLabel}>Sets</Text>
                        <TextInput
                          style={styles.textInputSmall}
                          placeholder="3"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="numeric"
                          value={customSets}
                          onChangeText={setCustomSets}
                        />
                      </View>
                      <View style={styles.customInputHalf}>
                        <Text style={styles.inputLabel}>Reps</Text>
                        <TextInput
                          style={styles.textInputSmall}
                          placeholder="10-12"
                          placeholderTextColor={Colors.textMuted}
                          value={customReps}
                          onChangeText={setCustomReps}
                        />
                      </View>
                      <View style={styles.customInputHalf}>
                        <Text style={styles.inputLabel}>Weight (lbs)</Text>
                        <TextInput
                          style={styles.textInputSmall}
                          placeholder="0"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="decimal-pad"
                          value={customWeight}
                          onChangeText={setCustomWeight}
                        />
                      </View>
                    </View>
                    <View style={styles.customInputActions}>
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => setShowCustomInput(false)}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.addBtn,
                          !customExerciseName.trim() && styles.addBtnDisabled,
                        ]}
                        onPress={() => addExercise(null, true)}
                        disabled={!customExerciseName.trim()}
                      >
                        <Text style={styles.addBtnText}>Add Exercise</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Muscle progress within exercises sub-step */}
                {currentConfig.muscles.length > 1 && (
                  <View style={styles.muscleSubProgress}>
                    {currentConfig.muscles.map((m, i) => {
                      const exCount = getDayExercises(currentDay, m).length;
                      return (
                        <View key={m} style={styles.muscleSubDotWrap}>
                          <View style={[
                            styles.muscleSubDot,
                            i === currentMuscleIndex && styles.muscleSubDotActive,
                            i < currentMuscleIndex && styles.muscleSubDotDone,
                          ]} />
                          <Text style={[styles.muscleSubLabel, i === currentMuscleIndex && styles.muscleSubLabelActive]}>
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
                  <View key={ex.exerciseId || i} style={[styles.configCard, Shadows.sm]}>
                    <Text style={styles.configExName}>
                      {ex.name}
                      <Text style={styles.configExMuscle}> — {MUSCLE_LABELS[ex.muscleGroup] || ex.muscleGroup}</Text>
                    </Text>

                    <View style={styles.configRow}>
                      <View style={styles.configField}>
                        <Text style={styles.inputLabel}>Sets</Text>
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => updateExerciseConfig(ex.exerciseId, 'targetSets', Math.max(1, ex.targetSets - 1))}
                          >
                            <Text style={styles.stepperBtnText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepperValue}>{ex.targetSets}</Text>
                          <TouchableOpacity
                            style={styles.stepperBtn}
                            onPress={() => updateExerciseConfig(ex.exerciseId, 'targetSets', Math.min(10, ex.targetSets + 1))}
                          >
                            <Text style={styles.stepperBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.configField}>
                        <Text style={styles.inputLabel}>Reps</Text>
                        <TextInput
                          style={styles.textInputSmall}
                          value={ex.targetReps}
                          onChangeText={(v) => updateExerciseConfig(ex.exerciseId, 'targetReps', v)}
                          placeholderTextColor={Colors.textMuted}
                        />
                      </View>

                      <View style={styles.configField}>
                        <Text style={styles.inputLabel}>Weight (lbs)</Text>
                        <TextInput
                          style={styles.textInputSmall}
                          value={ex.targetWeight ? String(ex.targetWeight) : ''}
                          onChangeText={(v) => updateExerciseConfig(ex.exerciseId, 'targetWeight', parseFloat(v) || 0)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={Colors.textMuted}
                        />
                      </View>
                    </View>
                  </View>
                ))}

                {currentConfig.exercises.length === 0 && (
                  <Text style={styles.emptyText}>
                    No exercises configured. Go back and add some!
                  </Text>
                )}
              </View>
            )}

            {/* Day config navigation */}
            <View style={styles.dayConfigNav}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={backDayConfig}>
                <Text style={styles.secondaryBtnText}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryBtn} onPress={advanceDayConfig}>
                <Text style={styles.primaryBtnText}>
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
            <Text style={styles.sectionTitle}>Review Your Routine</Text>

            {/* Plan name */}
            <Text style={styles.inputLabel}>Routine Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., My PPL Split, Summer Shred, etc."
              placeholderTextColor={Colors.textMuted}
              value={planName}
              onChangeText={setPlanName}
            />

            {/* Mode Selection */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
              Training Mode
            </Text>
            <Text style={styles.sectionSub}>
              What's your goal for this routine?
            </Text>

            <View style={styles.modeGrid}>
              {['bulking', 'leaning'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.modeCard,
                    planMode === mode && styles.modeCardSelected,
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
                    planMode === mode && styles.modeTitleSelected,
                  ]}>
                    {mode === 'bulking' ? 'Bulking' : 'Leaning'}
                  </Text>
                  <Text style={styles.modeDesc}>
                    {mode === 'bulking' ? 'Build muscle & gain strength' : 'Cut fat & maintain muscle'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.modeCard,
                  planMode === 'custom' && styles.modeCardSelected,
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
                  planMode === 'custom' && styles.modeTitleSelected,
                ]}>
                  Custom
                </Text>
                <Text style={styles.modeDesc}>Your own unique goal</Text>
              </TouchableOpacity>
            </View>

            {/* Custom mode name input */}
            {planMode === 'custom' && (
              <TextInput
                style={[styles.textInput, { marginTop: Spacing.md }]}
                placeholder="Name your mode (e.g., Body Recomp, Powerbuilding)"
                placeholderTextColor={Colors.textMuted}
                value={customMode}
                onChangeText={setCustomMode}
              />
            )}

            {/* Mode goal description */}
            {planMode !== '' && (
              <>
                <Text style={[styles.inputLabel, { marginTop: Spacing.lg }]}>
                  Goal Description
                </Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder={
                    planMode === 'bulking'
                      ? 'e.g., Gain 10 lbs of lean muscle over 12 weeks. Focus on progressive overload and calorie surplus.'
                      : planMode === 'leaning'
                      ? 'e.g., Drop to 12% body fat while keeping muscle. Maintain 500kcal deficit with high protein.'
                      : 'Describe what this custom mode means for you and what you want to achieve.'
                  }
                  placeholderTextColor={Colors.textMuted}
                  value={modeGoal}
                  onChangeText={setModeGoal}
                  multiline
                  numberOfLines={3}
                />
              </>
            )}

            {/* Routine Type Selection */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
              Routine Schedule
            </Text>
            <Text style={styles.sectionSub}>
              Should this routine repeat every week, or override a specific week?
            </Text>
            {/* Limit info */}
            <View style={styles.limitInfoRow}>
              <Text style={styles.limitInfoText}>
                Routines: {existingPlans.consistent}/{MAX_CONSISTENT} • Overrides: {existingPlans.oneTime}/{MAX_ONE_TIME}
              </Text>
            </View>

            <View style={styles.routineTypeRow}>
              <TouchableOpacity
                style={[
                  styles.routineTypeCard,
                  routineType === 'consistent' && styles.routineTypeCardSelected,
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
                  routineType === 'consistent' && styles.routineTypeTitleSelected,
                ]}>
                  Consistent
                </Text>
                <Text style={styles.routineTypeDesc}>
                  Repeats every week automatically
                </Text>
                {existingPlans.consistent >= MAX_CONSISTENT && (
                  <Text style={styles.routineTypeLimit}>Limit reached</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.routineTypeCard,
                  routineType === 'one_time' && styles.routineTypeCardSelected,
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
                  routineType === 'one_time' && styles.routineTypeTitleSelected,
                ]}>
                  One-Time
                </Text>
                <Text style={styles.routineTypeDesc}>
                  Overrides a single week only
                </Text>
                {existingPlans.oneTime >= MAX_ONE_TIME && (
                  <Text style={styles.routineTypeLimit}>Limit reached</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Week picker for one-time routines */}
            {routineType === 'one_time' && (
              <View style={styles.weekPickerSection}>
                <Text style={[styles.inputLabel, { marginTop: Spacing.md }]}>
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
                          overrideWeekIndex === i && styles.weekChipSelected,
                        ]}
                        onPress={() => setOverrideWeekIndex(i)}
                      >
                        <Text style={[
                          styles.weekChipLabel,
                          overrideWeekIndex === i && styles.weekChipLabelSelected,
                        ]}>
                          {i === 0 ? 'This Week' : i === 1 ? 'Next Week' : `+${i} Weeks`}
                        </Text>
                        <Text style={[
                          styles.weekChipDate,
                          overrideWeekIndex === i && styles.weekChipDateSelected,
                        ]}>
                          {formatWeekLabel(monday)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Day summaries */}
            <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
              Weekly Schedule
            </Text>
            {selectedDays.map((dayIdx, i) => {
              const config = dayConfigs[dayIdx];
              if (!config) return null;
              return (
                <TouchableOpacity
                  key={dayIdx}
                  style={[styles.reviewDayCard, Shadows.sm]}
                  onPress={() => configureDay(i)}
                >
                  <View style={styles.reviewDayHeader}>
                    <Text style={styles.reviewDayLabel}>
                      {DAY_LABELS_FULL[dayIdx]}
                    </Text>
                    <Text style={styles.reviewDayEdit}>Edit</Text>
                  </View>
                  <Text style={styles.reviewDayMuscles}>
                    {config.muscles.map(m => MUSCLE_LABELS[m] || m).join(' · ')}
                  </Text>
                  {config.exercises.map((ex, j) => (
                    <View key={j} style={styles.reviewExerciseRow}>
                      <Text style={styles.reviewExName}>• {ex.name}</Text>
                      <Text style={styles.reviewExConfig}>
                        {ex.targetSets}×{ex.targetReps}
                        {ex.targetWeight > 0 ? ` @ ${ex.targetWeight}lbs` : ''}
                      </Text>
                    </View>
                  ))}
                </TouchableOpacity>
              );
            })}

            {/* Save / Delete buttons */}
            <TouchableOpacity
              style={[styles.primaryBtn, styles.saveBtn]}
              onPress={savePlan}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (                  <Text style={styles.primaryBtnText}>
                    {isEditing ? 'Update Routine' : 'Create Routine'}
                  </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => goToStep('days')}
            >
              <Text style={styles.secondaryBtnText}>← Back to Days</Text>
            </TouchableOpacity>

            {isEditing && (
              <TouchableOpacity style={styles.deleteBtn} onPress={deletePlan}>
                <Text style={styles.deleteBtnText}>Delete Routine</Text>
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
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.offWhite },
  loadingText: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: Spacing.md },

  // ── Header ─────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  headerBack: { ...Typography.bodyMedium, color: Colors.primary, fontWeight: '600' },
  headerTitle: { ...Typography.h3, color: Colors.black },

  // ── Step Indicator ─────────────────────────────────────────────────
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.white,
    gap: Spacing.xs,
  },
  stepLine: { height: 2, flex: 1, maxWidth: 40, backgroundColor: Colors.gray200 },
  stepLineActive: { backgroundColor: Colors.primary },
  stepDotWrap: { alignItems: 'center' },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: { backgroundColor: Colors.primary },
  stepDotDone: { backgroundColor: Colors.primaryLight },
  stepDotText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '700' },
  stepDotTextActive: { color: Colors.white },
  stepLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  stepLabelActive: { color: Colors.primary, fontWeight: '600' },

  // ── Scroll ─────────────────────────────────────────────────────────
  scrollContent: { padding: Spacing.xl },

  // ── Section Titles ─────────────────────────────────────────────────
  sectionTitle: { ...Typography.h3, color: Colors.black, marginBottom: Spacing.sm },
  sectionSub: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },
  subsectionTitle: { ...Typography.captionMedium, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },

  // ── Approach Step ──────────────────────────────────────────────────
  approachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  approachIcon: { fontSize: 28, marginRight: Spacing.lg },
  approachInfo: { flex: 1 },
  approachTitle: { ...Typography.h4, color: Colors.black, marginBottom: 4 },
  approachDesc: { ...Typography.bodySmall, color: Colors.textSecondary, lineHeight: 18 },
  approachArrow: { fontSize: 24, color: Colors.primary, fontWeight: '700' },

  templateCard: {
    backgroundColor: Colors.cardBg,
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
  templateName: { ...Typography.h4, color: Colors.black },
  templateDays: {
    ...Typography.captionMedium,
    color: Colors.primary,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  templateDesc: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },
  templateMuscles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  miniMuscleChip: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  miniMuscleText: { ...Typography.caption, color: Colors.textSecondary },
  templateAction: { ...Typography.captionMedium, color: Colors.primary, fontWeight: '700' },

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
    backgroundColor: Colors.cardBg,
    borderWidth: 2,
    borderColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayChipSelected: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primaryLight,
  },
  dayChipConfigured: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.success,
    borderWidth: 2,
  },
  dayChipText: { ...Typography.captionMedium, color: Colors.textSecondary },
  dayChipTextSelected: { color: Colors.primary, fontWeight: '700' },
  dayChipCheck: { ...Typography.caption, color: Colors.success, marginTop: 2, fontWeight: '700' },

  selectedDaysSection: { marginBottom: Spacing.xl },
  selectedDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  selectedDayRowDone: { borderLeftWidth: 3, borderLeftColor: Colors.success },
  selectedDayLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDotDone: { backgroundColor: Colors.success },
  dayDotText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '700' },
  selectedDayLabel: { ...Typography.bodyMedium, color: Colors.black, fontWeight: '600' },
  selectedDayRight: { alignItems: 'flex-end' },
  selectedDaySummary: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 2 },
  selectedDayAction: { ...Typography.captionMedium, color: Colors.primary, fontWeight: '600' },

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
    backgroundColor: Colors.gray200,
  },
  dayProgressDotActive: { backgroundColor: Colors.primary, width: 24, borderRadius: 5 },
  dayProgressDotDone: { backgroundColor: Colors.success },

  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  muscleChip: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cardBg,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
  },
  muscleChipSelected: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primary,
  },
  muscleChipText: { ...Typography.captionMedium, color: Colors.textSecondary },
  muscleChipTextSelected: { color: Colors.primary, fontWeight: '700' },

  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  exerciseItemAdd: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderStyle: 'dashed',
  },
  exerciseItemAdded: {
    opacity: 0.5,
    backgroundColor: Colors.gray100,
  },
  exerciseItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  exerciseItemName: { ...Typography.captionMedium, color: Colors.black, flex: 1 },
  exerciseItemMeta: { ...Typography.caption, color: Colors.textMuted },
  exerciseItemAddedText: { color: Colors.textMuted },
  customBadge: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  customBadgeText: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  removeBtnText: { fontSize: 12, color: Colors.error, fontWeight: '700' },

  customAddBtn: {
    padding: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  customAddBtnText: { ...Typography.captionMedium, color: Colors.primary, fontWeight: '600' },

  customInputCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginTop: Spacing.md,
  },
  customInputRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  customInputHalf: { flex: 1 },
  customInputActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },

  // ── Config Step ───────────────────────────────────────────────────
  configCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  configExName: { ...Typography.captionMedium, color: Colors.black, marginBottom: Spacing.md },
  configExMuscle: { color: Colors.textMuted },
  configRow: { flexDirection: 'row', gap: Spacing.sm },
  configField: { flex: 1, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: { fontSize: 18, color: Colors.black, fontWeight: '600' },
  stepperValue: { ...Typography.bodyMedium, color: Colors.black, fontWeight: '700', minWidth: 24, textAlign: 'center' },

  // ── Muscle sub-progress ───────────────────────────────────────────
  muscleSubProgress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  muscleSubDotWrap: { alignItems: 'center', gap: 4 },
  muscleSubDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gray200,
  },
  muscleSubDotActive: { backgroundColor: Colors.primary },
  muscleSubDotDone: { backgroundColor: Colors.success },
  muscleSubLabel: { ...Typography.caption, color: Colors.textMuted },
  muscleSubLabelActive: { color: Colors.primary, fontWeight: '600' },

  // ── Review Step ───────────────────────────────────────────────────
  reviewDayCard: {
    backgroundColor: Colors.cardBg,
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
  reviewDayLabel: { ...Typography.h4, color: Colors.black },
  reviewDayEdit: { ...Typography.captionMedium, color: Colors.primary },
  reviewDayMuscles: { ...Typography.captionMedium, color: Colors.primary, marginBottom: Spacing.md },
  reviewExerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.sm,
  },
  reviewExName: { ...Typography.bodySmall, color: Colors.black, flex: 1 },
  reviewExConfig: { ...Typography.caption, color: Colors.textSecondary },

  // ── Day Config Nav ────────────────────────────────────────────────
  dayConfigNav: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing['2xl'],
  },

  // ── Buttons ───────────────────────────────────────────────────────
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  primaryBtnDim: { opacity: 0.6 },
  primaryBtnText: { ...Typography.bodyMedium, color: Colors.white, fontWeight: '700' },
  secondaryBtn: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  secondaryBtnText: { ...Typography.bodyMedium, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: { marginTop: Spacing['2xl'] },
  deleteBtn: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  deleteBtnText: { ...Typography.bodyMedium, color: Colors.error, fontWeight: '700' },

  addBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { ...Typography.captionMedium, color: Colors.white, fontWeight: '700' },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: { ...Typography.captionMedium, color: Colors.textSecondary },

  // ── Inputs ────────────────────────────────────────────────────────
  textInput: {
    ...Typography.bodyMedium,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    color: Colors.black,
    marginTop: Spacing.xs,
  },
  textInputSmall: {
    ...Typography.captionMedium,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    color: Colors.black,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  inputLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  emptyText: { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl },

  // ── Mode Selection ──────────────────────────────────────────
  modeGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modeCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.gray200,
  },
  modeCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  modeIcon: { fontSize: 32, marginBottom: Spacing.sm },
  modeTitle: { ...Typography.captionMedium, color: Colors.textPrimary, fontWeight: '700', marginBottom: 4 },
  modeTitleSelected: { color: Colors.primary },
  modeDesc: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
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
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.gray200,
  },
  routineTypeCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  routineTypeCardDisabled: {
    opacity: 0.5,
    borderColor: Colors.gray200,
  },
  routineTypeIcon: { fontSize: 28, marginBottom: Spacing.xs },
  routineTypeTitle: { ...Typography.captionMedium, color: Colors.textPrimary, fontWeight: '700', marginBottom: 4 },
  routineTypeTitleSelected: { color: Colors.primary },
  routineTypeDesc: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
  routineTypeLimit: { ...Typography.caption, color: Colors.error, fontWeight: '600', marginTop: 4 },

  // ── Limit Info ──────────────────────────────────────────────────
  limitInfoRow: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  limitInfoText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },

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
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    alignItems: 'center',
  },
  weekChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  weekChipLabel: { ...Typography.captionMedium, color: Colors.textPrimary, fontWeight: '600', marginBottom: 2 },
  weekChipLabelSelected: { color: Colors.primary },
  weekChipDate: { ...Typography.caption, color: Colors.textMuted, fontSize: 11 },
  weekChipDateSelected: { color: Colors.primary },
});
