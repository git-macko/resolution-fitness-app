// Resolution Fitness App — Settings Screen
// User preferences: units, notifications, rest timer,
// weekly goals, calorie/protein/water targets, theme, AI model, OpenAI key.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Switch,
} from 'react-native';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';

export default function SettingsScreen() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data.data || data || {});
    } catch (err) {
      console.warn('Settings fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fields = {
        units: settings.units,
        notifications: settings.notifications,
        workoutReminderTime: settings.workoutReminderTime,
        restTimerSeconds: settings.restTimerSeconds,
        weeklyWorkoutGoal: settings.weeklyWorkoutGoal,
        calorieTarget: settings.calorieTarget,
        proteinTargetGrams: settings.proteinTargetGrams,
        waterGoalMl: settings.waterGoalMl,
        theme: settings.theme,
        aiModel: settings.aiModel,
      };
      await api.updateSettings(fields);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const s = settings || {};

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Units ───────────────────────────────────────────── */}
        <View style={[styles.section, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Units</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.option, s.units === 'metric' && styles.optionActive]}
              onPress={() => updateField('units', 'metric')}
            >
              <Text style={[styles.optionText, s.units === 'metric' && styles.optionTextActive]}>
                Metric (kg, cm)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, s.units === 'imperial' && styles.optionActive]}
              onPress={() => updateField('units', 'imperial')}
            >
              <Text style={[styles.optionText, s.units === 'imperial' && styles.optionTextActive]}>
                Imperial (lb, in)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Notifications ──────────────────────────────────── */}
        <View style={[styles.section, Shadows.sm]}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.sectionTitle}>Notifications</Text>
              <Text style={styles.switchSub}>
                Workout reminders and tips
              </Text>
            </View>
            <Switch
              value={s.notifications !== false}
              onValueChange={(v) => updateField('notifications', v)}
              trackColor={{ false: Colors.gray300, true: Colors.primaryLight }}
              thumbColor={s.notifications !== false ? Colors.primary : Colors.gray400}
            />
          </View>
        </View>

        {/* ── Rest Timer ─────────────────────────────────────── */}
        <View style={[styles.section, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Rest Timer (seconds)</Text>
          <View style={styles.row}>
            {[30, 60, 90, 120, 180].map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.option, s.restTimerSeconds === val && styles.optionActive]}
                onPress={() => updateField('restTimerSeconds', val)}
              >
                <Text style={[styles.optionText, s.restTimerSeconds === val && styles.optionTextActive]}>
                  {val}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Goals ──────────────────────────────────────────── */}
        <View style={[styles.section, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Daily Targets</Text>

          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Workouts per week</Text>
            <Text style={styles.goalValue}>{s.weeklyWorkoutGoal || 4}</Text>
          </View>

          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Calories (kcal)</Text>
            <Text style={styles.goalValue}>{s.calorieTarget || 2000}</Text>
          </View>

          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Protein (g)</Text>
            <Text style={styles.goalValue}>{s.proteinTargetGrams || 150}</Text>
          </View>

          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Water (ml)</Text>
            <Text style={styles.goalValue}>{s.waterGoalMl || 2000}</Text>
          </View>
        </View>

        {/* ── Theme ─────────────────────────────────────────── */}
        <View style={[styles.section, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Theme</Text>
          <View style={styles.row}>
            {['light', 'dark'].map((theme) => (
              <TouchableOpacity
                key={theme}
                style={[styles.option, s.theme === theme && styles.optionActive]}
                onPress={() => updateField('theme', theme)}
              >
                <Text style={[styles.optionText, s.theme === theme && styles.optionTextActive]}>
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Save ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save Settings</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.offWhite },
  scrollContent: { padding: Spacing.xl },
  // ── Sections ──────────────────────────────────────────────
  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  option: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.offWhite,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  optionText: { ...Typography.caption, color: Colors.textSecondary },
  optionTextActive: { color: Colors.primary, fontWeight: '600' },
  // ── Switch ────────────────────────────────────────────────
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchSub: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  // ── Goals ─────────────────────────────────────────────────
  goalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  goalLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  goalValue: { ...Typography.bodyMedium, color: Colors.primary },
  // ── Save ──────────────────────────────────────────────────
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnDisabled: { backgroundColor: Colors.primaryLight },
  saveBtnText: { ...Typography.bodyMedium, color: Colors.white, fontWeight: '700' },
});
