// Resolution Fitness App — Settings Screen
// User preferences: units, notifications, rest timer, weekly goals,
// targets, and theme. (AI model is locked to gemini-3.5-flash server-side.)
//
// The "Theme" row now drives a LOCAL state override through the
// theme context — the picker flips the UI in real time.
// We still POST `settings.theme` to the backend so server-side config
// stays in sync (e.g. for email rendering, default avatar color).

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Switch,
} from 'react-native';
import AutocompleteInput from '../components/AutocompleteInput';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';
import { formatTodayHours } from '../utils/openingHours';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { scheme, override, setOverride, colors } = useTheme();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  // Must be defined BEFORE the loading early-return — the loading view
  // references styles.loadingContainer.
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await api.getSettings();
      const loaded = data.data || data || {};
      setSettings(loaded);
      // No additional state needed; gym selection is always search-based.
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
      // ── General settings via the generic settings endpoint ──
      const generalFields = {
        units: settings.units,
        notifications: settings.notifications,
        workoutReminderTime: settings.workoutReminderTime,
        restTimerSeconds: settings.restTimerSeconds,
        weeklyWorkoutGoal: settings.weeklyWorkoutGoal,
        calorieTarget: settings.calorieTarget,
        proteinTargetGrams: settings.proteinTargetGrams,
        waterGoalMl: settings.waterGoalMl,
        theme: scheme,
      };

      // ── Gym settings via the dedicated gym endpoint ──
      const gymFields = {
        type: settings.gymType,
        name: settings.gymName,
        address: settings.gymAddress,
        placeId: settings.gymPlaceId,
        phone: settings.gymPhone || '',
        website: settings.gymWebsite || '',
        lat: settings.gymLat || 0,
        lng: settings.gymLng || 0,
        capacity: settings.gymCapacity || 150,
        openingHours: settings.gymOpeningHours || '',
      };

      await Promise.all([
        api.updateSettings(generalFields),
        api.updateGym(gymFields),
      ]);

      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const s = settings || {};

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Units ───────────────────────────────────────── */}
        <Card colors={colors} styles={styles}>
          <SectionTitle colors={colors} styles={styles}>Units</SectionTitle>
          <Row>
            <Option
              active={s.units === 'metric'}
              onPress={() => updateField('units', 'metric')}
              label="Metric (kg, cm)"
              colors={colors}
              styles={styles}
            />
            <Option
              active={s.units === 'imperial'}
              onPress={() => updateField('units', 'imperial')}
              label="Imperial (lb, in)"
              colors={colors}
              styles={styles}
            />
          </Row>
        </Card>

        {/* ── Notifications ──────────────────────────────── */}
        <Card colors={colors} styles={styles}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: Spacing.md }}>
              <SectionTitle colors={colors} styles={styles}>Notifications</SectionTitle>
              <Text style={[styles.switchSub, { color: colors.textMuted }]}>
                Workout reminders and tips
              </Text>
            </View>
            <Switch
              value={s.notifications !== false}
              onValueChange={(v) => updateField('notifications', v)}
              trackColor={{ false: colors.divider, true: colors.accentSoft }}
              thumbColor={s.notifications !== false ? colors.accent : colors.border}
            />
          </View>
        </Card>

        {/* ── Rest Timer ─────────────────────────────────── */}
        <Card colors={colors} styles={styles}>
          <SectionTitle colors={colors} styles={styles}>Rest Timer (seconds)</SectionTitle>
          <Row>
            {[30, 60, 90, 120, 180].map((val) => (
              <Option
                key={val}
                active={s.restTimerSeconds === val}
                onPress={() => updateField('restTimerSeconds', val)}
                label={`${val}s`}
                colors={colors}
                styles={styles}
              />
            ))}
          </Row>
        </Card>

        {/* ── Goals ──────────────────────────────────────── */}
        <Card colors={colors} styles={styles}>
          <SectionTitle colors={colors} styles={styles}>Daily Targets</SectionTitle>
          <GoalRow label="Workouts per week" value={s.weeklyWorkoutGoal || 4} colors={colors} styles={styles} />
          <GoalRow label="Calories (kcal)" value={s.calorieTarget || 2000} colors={colors} styles={styles} />
          <GoalRow label="Protein (g)" value={s.proteinTargetGrams || 150} colors={colors} styles={styles} />
          <GoalRow label="Water (ml)" value={s.waterGoalMl || 2000} colors={colors} styles={styles} />
        </Card>

        {/* ── Gym ─────────────────────────────────────────── */}
        <Card colors={colors} styles={styles}>
          <SectionTitle colors={colors} styles={styles}>Your Gym</SectionTitle>
          <Text style={[styles.switchSub, { color: colors.textMuted, marginBottom: Spacing.md }]}>
            Set the gym you go to so the dashboard can estimate how busy it is.
          </Text>
          <Row>
            <Option
              active={s.gymType === 'commercial'}
              onPress={() => updateField('gymType', 'commercial')}
              label="Commercial Gym"
              colors={colors}
              styles={styles}
            />
            <Option
              active={s.gymType === 'home'}
              onPress={() => updateField('gymType', 'home')}
              label="I have my own"
              colors={colors}
              styles={styles}
            />
          </Row>
          {s.gymType === 'commercial' && (
            <View style={{ marginTop: Spacing.md }}>
              {s.gymName && !fetchingDetails ? (
                // ── Read-only selected gym card ─────────────────────────
                <View
                  style={[
                    styles.selectedGymCard,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.selectedGymName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {s.gymName}
                  </Text>
                  <Text style={[styles.selectedGymAddress, { color: colors.textMuted }]} numberOfLines={2}>
                    {s.gymAddress || 'No address provided'}
                  </Text>
                  {s.gymOpeningHours ? (
                    <Text style={[styles.selectedGymHours, { color: colors.textMuted }]}>
                      {formatTodayHours(s.gymOpeningHours)}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={styles.changeGymBtn}
                    onPress={() => {
                    updateField('gymName', '');
                    updateField('gymAddress', '');
                    updateField('gymPlaceId', '');
                    updateField('gymPhone', '');
                    updateField('gymWebsite', '');
                    updateField('gymLat', 0);
                    updateField('gymLng', 0);
                    updateField('gymOpeningHours', '');
                    }}
                  >
                    <Text style={[styles.changeGymBtnText, { color: colors.accent }]}>Change gym</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                // ── Gym search (only way to set a commercial gym) ─────────
                <>
                  <AutocompleteInput
                    label="Search gyms"
                    placeholder="Start typing a gym name or address..."
                    value={s.gymName || ''}
                    searchFn={(q) => api.searchGyms(q)}
                    onSelectSuggestion={async (item) => {
                      setFetchingDetails(true);
                      try {
                        // Google Places gyms have a placeId; Nominatim gyms use lat/lng.
                        const params = item.placeId
                          ? { placeId: item.placeId }
                          : { lat: item.lat, lng: item.lng };
                        const details = await api.getGymDetails(params);
                        updateField('gymName', details.data?.name || item.name || '');
                        updateField('gymAddress', details.data?.address || item.address || '');
                        updateField('gymPlaceId', details.data?.placeId || item.placeId || '');
                        updateField('gymPhone', details.data?.phone || item.phone || '');
                        updateField('gymWebsite', details.data?.website || item.website || '');
                        updateField('gymLat', details.data?.lat || item.lat || 0);
                        updateField('gymLng', details.data?.lng || item.lng || 0);
                        updateField('gymOpeningHours', details.data?.openingHours || '');
                      } catch (err) {
                        console.warn('Failed to fetch gym details:', err.message);
                        // Fall back to the suggestion data we already have.
                        // Preserve the placeId from the suggestion so future
                        // refreshes can still target the same venue.
                        updateField('gymName', item.name || '');
                        updateField('gymAddress', item.address || '');
                        updateField('gymPlaceId', item.placeId || '');
                        updateField('gymPhone', item.phone || '');
                        updateField('gymWebsite', item.website || '');
                        updateField('gymLat', item.lat || 0);
                        updateField('gymLng', item.lng || 0);
                        updateField('gymOpeningHours', '');
                      } finally {
                        setFetchingDetails(false);
                      }
                    }}
                  />
                  {fetchingDetails && (
                    <ActivityIndicator style={{ marginVertical: Spacing.md }} color={colors.accent} />
                  )}
                  <Text style={[styles.caption, { color: colors.textMuted, marginTop: Spacing.sm }]}>
                    Search by name, brand, or address.
                  </Text>
                </>
              )}
              <Text style={[styles.caption, { color: colors.textMuted, marginTop: Spacing.md }]}>
                Used for live crowd data via BestTime.
              </Text>
            </View>
          )}
        </Card>

        {/* ── Theme ──────────────────────────────────────── */}
        <Card colors={colors} styles={styles}>
          <SectionTitle colors={colors} styles={styles}>Theme</SectionTitle>
          <Text style={[styles.switchSub, { color: colors.textMuted, marginBottom: Spacing.md }]}>
            Currently previewing: <Text style={{ fontWeight: '700', color: colors.title }}>{THEME_OPTIONS.find(o => o.value === (override || 'system'))?.label || 'System'} ({scheme})</Text>
          </Text>
          <Row>
            {THEME_OPTIONS.map((opt) => (
              <Option
                key={opt.value}
                active={(override || 'system') === opt.value}
                onPress={() => setOverride(opt.value)}
                label={opt.label}
                colors={colors}
                styles={styles}
              />
            ))}
          </Row>
        </Card>

        {/* ── Save ───────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled, { backgroundColor: colors.accent }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={[styles.saveBtnText, { color: colors.textInverse }]}>Save Settings</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

// ── Local sub-components (kept inline to avoid forward-style pain) ──

function Card({ children, colors, styles }) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: colors.surface, borderColor: colors.border },
        Shadows.sm,
      ]}
    >
      {children}
    </View>
  );
}

function SectionTitle({ children, colors, styles }) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>
      {children}
    </Text>
  );
}

function Row({ children }) {
  return <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>{children}</View>;
}

function Option({ active, onPress, label, colors, styles }) {
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: active ? colors.accentBg : colors.surfaceMuted,
          borderColor: active ? colors.accent : 'transparent',
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.optionText,
          {
            color: active ? colors.accentDeep : colors.textSecondary,
            fontWeight: active ? '600' : '400',
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function GoalRow({ label, value, colors, styles }) {
  return (
    <View
      style={[styles.goalRow, { borderBottomColor: colors.divider }]}
    >
      <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.goalValue, { color: colors.accent }]}>{value}</Text>
    </View>
  );
}

// ── Style factory (driven by theme tokens) ──────────────────────────
function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: Spacing.xl },
    section: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      borderWidth: 1,
    },
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
    option: {
      flex: 1,
      minWidth: 100,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      borderWidth: 2,
    },
    optionText: { ...Typography.caption, textAlign: 'center' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchSub: { ...Typography.caption, marginTop: 2 },
    goalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
    },
    goalLabel: { ...Typography.bodySmall },
    goalValue: { ...Typography.bodyMedium, fontWeight: '600' },
    saveBtn: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { ...Typography.bodyMedium, fontWeight: '700' },
    selectedGymCard: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      padding: Spacing.md,
    },
    selectedGymName: {
      ...Typography.bodyMedium,
      fontWeight: '600',
      marginBottom: Spacing.xs,
    },
    selectedGymAddress: {
      ...Typography.caption,
      marginBottom: Spacing.sm,
    },
    selectedGymHours: {
      ...Typography.caption,
      fontStyle: 'italic',
      marginBottom: Spacing.sm,
    },
    changeGymBtn: {
      alignSelf: 'flex-start',
      marginTop: Spacing.xs,
    },
    changeGymBtnText: {
      ...Typography.bodySmall,
      fontWeight: '600',
    },
    caption: { ...Typography.caption },
  });
}
