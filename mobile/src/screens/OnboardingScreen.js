// Resolution Fitness App — Onboarding Screen
// 4-step flow: Welcome → Fitness Level → Goal → Diet & Allergies.
// Theme-aware — uses useTheme() so onboarding respects the active scheme.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import api from '../api/client';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';
import Logo from '../components/Logo';

const FITNESS_LEVELS = [
  { key: 'beginner', label: 'Beginner', desc: 'New to fitness' },
  { key: 'intermediate', label: 'Intermediate', desc: '6+ months experience' },
  { key: 'advanced', label: 'Advanced', desc: '2+ years training' },
];

const GOALS = [
  { key: 'build_muscle', label: 'Build Muscle', icon: '💪' },
  { key: 'lose_weight', label: 'Lose Weight', icon: '⚖️' },
  { key: 'get_toned', label: 'Get Toned', icon: '🏃' },
  { key: 'general', label: 'General Fitness', icon: '🏋️' },
  { key: 'strength', label: 'Strength', icon: '🦾' },
];

const COMMON_ALLERGIES = [
  'Dairy', 'Eggs', 'Gluten', 'Nuts', 'Shellfish',
  'Soy', 'Wheat', 'Fish', 'Peanuts', 'Sesame',
];

const DIETARY_PREFS = [
  'Vegetarian', 'Vegan', 'Keto', 'Paleo',
  'Mediterranean', 'Halal', 'Kosher', 'High Protein',
];

export default function OnboardingScreen({ navigation }) {
  const { updateUser } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [allergies, setAllergies] = useState([]);
  const [dietaryPrefs, setDietaryPrefs] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggleItem = (list, setList, item) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleComplete = async () => {
    if (!fitnessLevel || !primaryGoal) {
      Alert.alert('Incomplete', 'Please select your fitness level and goal.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.completeOnboarding({
        displayName: displayName.trim() || 'Athlete',
        fitnessLevel,
        primaryGoal,
        allergies,
        dietaryPrefs,
      });
      updateUser(data.data || data);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save onboarding.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 0: Welcome ─────────────────────────────────────
  if (step === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.welcomeSection}>
            <Logo variant="icon" size={96} style={{ marginBottom: Spacing.lg }} />
            <Text style={styles.welcomeTitle}>Welcome to Resolution!</Text>
            <Text style={styles.welcomeSubtitle}>
              Let's personalize your experience. First, what should we call you?
            </Text>
          </View>
          <TextInput
            style={[styles.nameInput, {
              borderBottomColor: colors.accent,
              color: colors.textPrimary,
            }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              onPress={handleComplete}
            >
              <Text style={styles.secondaryBtnText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setStep(1)}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Step 1: Fitness Level ──────────────────────────────
  if (step === 1) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.stepTitle}>Your Fitness Level</Text>
          <Text style={styles.stepSubtitle}>
            This helps us tailor workouts to your ability
          </Text>
          {FITNESS_LEVELS.map((level) => {
            const selected = fitnessLevel === level.key;
            return (
              <TouchableOpacity
                key={level.key}
                style={[
                  styles.optionCard,
                  selected && {
                    backgroundColor: colors.accentBg,
                    borderColor: colors.accent,
                  },
                ]}
                onPress={() => setFitnessLevel(level.key)}
              >
                <View style={styles.optionTextWrap}>
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && { color: colors.accent },
                    ]}
                  >
                    {level.label}
                  </Text>
                  <Text style={styles.optionDesc}>{level.desc}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selected && {
                      borderColor: colors.accent,
                      backgroundColor: colors.accent,
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              onPress={() => setStep(0)}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                !fitnessLevel && styles.primaryBtnDisabled,
              ]}
              onPress={() => fitnessLevel && setStep(2)}
              disabled={!fitnessLevel}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Step 2: Primary Goal ───────────────────────────────
  if (step === 2) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.stepTitle}>What's Your Goal?</Text>
          <Text style={styles.stepSubtitle}>
            We'll optimize your plan around this
          </Text>
          <View style={styles.goalsGrid}>
            {GOALS.map((goal) => {
              const selected = primaryGoal === goal.key;
              return (
                <TouchableOpacity
                  key={goal.key}
                  style={[
                    styles.goalCard,
                    selected && {
                      backgroundColor: colors.accentBg,
                      borderColor: colors.accent,
                    },
                  ]}
                  onPress={() => setPrimaryGoal(goal.key)}
                >
                  <Text style={styles.goalIcon}>{goal.icon}</Text>
                  <Text
                    style={[
                      styles.goalLabel,
                      selected && { color: colors.accent },
                    ]}
                  >
                    {goal.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              onPress={() => setStep(1)}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                !primaryGoal && styles.primaryBtnDisabled,
              ]}
              onPress={() => primaryGoal && setStep(3)}
              disabled={!primaryGoal}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Step 3: Allergies & Diet ──────────────────────────
  if (step === 3) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.stepTitle}>Diet & Allergies</Text>
          <Text style={styles.stepSubtitle}>
            We'll warn you about allergens in scanned foods
          </Text>

          <Text style={styles.sectionLabel}>Allergies</Text>
          <View style={styles.chipGrid}>
            {COMMON_ALLERGIES.map((item) => {
              const selected = allergies.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.chip,
                    selected && {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                    },
                  ]}
                  onPress={() => toggleItem(allergies, setAllergies, item)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && {
                        color: colors.textInverse,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Dietary Preferences</Text>
          <View style={styles.chipGrid}>
            {DIETARY_PREFS.map((item) => {
              const selected = dietaryPrefs.includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.chip,
                    selected && {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                    },
                  ]}
                  onPress={() => toggleItem(dietaryPrefs, setDietaryPrefs, item)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && {
                        color: colors.textInverse,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              onPress={() => setStep(2)}
            >
              <Text style={styles.secondaryBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleComplete}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.primaryBtnText}>Let's Go!</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing['2xl'],
      paddingVertical: Spacing['4xl'],
    },
    scrollContent: {
      paddingHorizontal: Spacing['2xl'],
      paddingVertical: Spacing['4xl'],
      paddingBottom: Spacing['5xl'],
    },
    // ── Welcome (Step 0) ────────────────────────────────
    welcomeSection: {
      alignItems: 'center',
      marginBottom: Spacing['3xl'],
    },
    welcomeTitle: {
      ...Typography.h2,
      color: colors.title,
      textAlign: 'center',
      marginBottom: Spacing.sm,
    },
    welcomeSubtitle: {
      ...Typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    nameInput: {
      ...Typography.h3,
      textAlign: 'center',
      borderBottomWidth: 2,
      paddingVertical: Spacing.md,
      marginBottom: Spacing['3xl'],
    },
    // ── Steps 1-3 ───────────────────────────────────────
    stepTitle: {
      ...Typography.h2,
      color: colors.title,
      marginBottom: Spacing.sm,
    },
    stepSubtitle: {
      ...Typography.bodySmall,
      color: colors.textSecondary,
      marginBottom: Spacing['2xl'],
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceMuted,
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    optionTextWrap: {
      flex: 1,
    },
    optionLabel: {
      ...Typography.bodyMedium,
      color: colors.textPrimary,
    },
    optionDesc: {
      ...Typography.caption,
      color: colors.textMuted,
      marginTop: 2,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
    },
    goalsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.md,
      marginBottom: Spacing['3xl'],
    },
    goalCard: {
      width: '47%',
      backgroundColor: colors.surfaceMuted,
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    goalIcon: {
      fontSize: 28,
      marginBottom: Spacing.sm,
    },
    goalLabel: {
      ...Typography.captionMedium,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    sectionLabel: {
      ...Typography.bodyMedium,
      color: colors.textPrimary,
      marginBottom: Spacing.md,
      marginTop: Spacing.lg,
    },
    chipGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    chip: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: {
      ...Typography.caption,
      color: colors.textSecondary,
    },
    // ── Navigation ───────────────────────────────────────
    navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: Spacing['3xl'],
      gap: Spacing.md,
    },
    primaryBtn: {
      flex: 1,
      backgroundColor: colors.accent,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    primaryBtnDisabled: {
      backgroundColor: colors.divider,
    },
    primaryBtnText: {
      ...Typography.bodyMedium,
      color: colors.textInverse,
      fontWeight: '700',
    },
    secondaryBtn: {
      flex: 1,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      borderWidth: 1,
    },
    secondaryBtnText: {
      ...Typography.bodyMedium,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
}
