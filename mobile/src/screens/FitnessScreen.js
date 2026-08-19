// Resolution Fitness App — Fitness Screen
// Weekly workout plan calendar, exercise library, and plan builder.
// Each planned workout day has an "Execute/Lock In" button.
// Theme-aware.

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import HeroCard from '../components/HeroCard';
import HeroStatRow from '../components/HeroStat';
import Card from '../components/Card';
import ExerciseLibrary from '../components/ExerciseLibrary';
import MimiMark from '../components/MimiMark';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';
import { getThisWeekMonday, formatWeekLabel } from '../utils/dates';
import usePressScale from '../utils/usePressScale';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function FitnessScreen({ navigation }) {
  const [plans, setPlans] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showPlanActions, setShowPlanActions] = useState(false);
  const mimiPress = usePressScale(0.96);
  const [stats, setStats] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Effective plan for this week (one-time override takes precedence over consistent)
  const thisWeekMonday = getThisWeekMonday();
  const effectiveWeekPlan = resolveEffectivePlan(plans, thisWeekMonday);
  const consistentPlans = plans.filter(p => p.routineType !== 'one_time');
  const oneTimePlans = plans.filter(p => p.routineType === 'one_time');

  function resolveEffectivePlan(allPlans, weekMonday) {
    const override = allPlans.find(
      p => p.routineType === 'one_time' && p.weekStartDate === weekMonday
    );
    if (override) return override;
    return allPlans.find(p => p.routineType !== 'one_time' && p.isActive) || null;
  }

  const fetchData = useCallback(async (skipCache = false) => {
    try {
      const opts = skipCache ? { skipCache: true } : {};
      const [plansData, exercisesData, templatesData, dashboardData] = await Promise.all([
        api.getPlans(opts),
        api.getExercises(null, opts),
        api.getWorkoutTemplates(opts),
        api.getDashboard(opts),
      ]);
      const fetchedPlans = (plansData.data || plansData.plans || plansData);
      setPlans(Array.isArray(fetchedPlans) ? fetchedPlans : []);

      const fetchedExercises = (exercisesData.data || exercisesData.exercises || exercisesData);
      setExercises(Array.isArray(fetchedExercises) ? fetchedExercises : []);

      const fetchedTemplates = (templatesData.data || templatesData.templates || templatesData);
      setTemplates(Array.isArray(fetchedTemplates) ? fetchedTemplates : []);

      const dashboard = dashboardData.data || dashboardData;
      if (dashboard) {
        const prog = dashboard.progression || {};
        const fitness = dashboard.fitnessSummary || {};
        setStats({
          totalWorkouts: prog.totalWorkouts || fitness.workoutsCompleted || 0,
          currentStreak: prog.currentStreak || 0,
          totalVolume: fitness.totalVolumeKg || prog.totalVolume || 0,
          fitnessLevel: prog.level || 1,
          fitnessXp: prog.xp || 0,
        });
      }
      setFetchError(null);
    } catch (err) {
      console.warn('Fitness fetch failed:', err.message);
      setFetchError(err.message || 'Failed to load fitness data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const currentPlan = effectiveWeekPlan;

  const weekHeader = currentPlan
    ? (currentPlan.routineType === 'one_time'
      ? `One-time — ${formatWeekLabel(currentPlan.weekStartDate || thisWeekMonday)}`
      : `Consistent — Week of ${formatWeekLabel(thisWeekMonday)}`)
    : (consistentPlans.length > 0 ? 'No active routine' : 'No routine yet');

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ───────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleGroup}>
            <Text style={[styles.headerTitle, { color: colors.textHeading }]}>Fitness</Text>
            <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
              {weekHeader}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.headerCreateBtn,
              { backgroundColor: colors.accent, ...Shadows.sm },
              consistentPlans.length >= 2 && oneTimePlans.length >= 3 && styles.headerCreateBtnDisabled,
            ]}
            onPress={() => {
              if (consistentPlans.length >= 2 && oneTimePlans.length >= 3) {
                Alert.alert('Limit Reached', 'You have reached the maximum number of routines (2) and one-time overrides (3). Delete an existing one to create a new one.');
                return;
              }
              navigation.navigate('CreatePlan');
            }}
          >
            <Text style={[styles.headerCreateBtnIcon, { color: colors.textInverse }]}>+</Text>
            <Text style={[styles.headerCreateBtnText, { color: colors.textInverse }]}>Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Error Banner ─────────────────────────────────── */}
      {fetchError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.accentWash }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>{fetchError}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={[styles.errorRetry, { color: colors.error }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ───────────────────────────────────────── */}
        <HeroCard
          topLabel="FITNESS"
          title={currentPlan ? currentPlan.name : 'Your Fitness Journey'}
          subtitle={currentPlan ? `${currentPlan.days?.length || 0} workout days this week` : weekHeader}
        >
          {stats ? (
            <HeroStatRow
              stats={[
                { value: stats.totalWorkouts || 0, label: 'Workouts', tone: 'default' },
                { value: `${stats.currentStreak || 0}🔥`, label: 'Streak', tone: 'primary' },
                { value: `${Math.round(stats.totalVolume || 0)}kg`, label: 'Volume', tone: 'default' },
                { value: `Lv.${stats.fitnessLevel || 1}`, label: 'Level', tone: 'warning' },
              ]}
            />
          ) : null}
        </HeroCard>

        {/* ── Ask Mimi ───────────────────────────────────────── */}
        <Pressable
          onPress={() => navigation.navigate('Chat')}
          {...mimiPress.handlers}
          accessibilityLabel="Ask Mimi, AI Coach"
        >
          <Animated.View style={[styles.mimiCard, { borderColor: colors.accent }, mimiPress.animatedStyle]}>
            <MimiMark size={48} color={colors.textInverse} background={colors.accentSoft} />
            <View style={styles.mimiTextWrap}>
              <Text style={[styles.mimiCardTitle, { color: colors.accent }]}>Ask Mimi</Text>
              <Text style={[styles.mimiCardSub, { color: colors.textSecondary }]}>Your AI fitness coach — get tips, plans & answers</Text>
            </View>
            <Text style={[styles.mimiCardArrow, { color: colors.accent }]}>→</Text>
          </Animated.View>
        </Pressable>

        {/* ── Existing Plans ───────────────────────────────────── */}
        {plans.length > 0 && (
          <View style={styles.existingPlansSection}>
            <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
              Your Routines ({consistentPlans.length}/2)
            </Text>
            {/* Consistent routines */}
            {consistentPlans.map((plan) => (
              <Card key={plan.id} style={styles.marginBottom} contentStyle={styles.planCard}>
                <TouchableOpacity
                  style={styles.planCardMain}
                  onPress={() => setShowPlanActions(showPlanActions === plan.id ? null : plan.id)}
                >
                  <View style={styles.planCardLeft}>
                    <Text style={[styles.planName, { color: colors.textHeading }]}>{plan.name}</Text>
                    <Text style={[styles.planMeta, { color: colors.textSecondary }]}>
                      {plan.days?.length || plan.planDays?.length || 0} days
                    </Text>
                  </View>
                  <Text style={[styles.planExpand, { color: colors.textMuted }]}>
                    {showPlanActions === plan.id ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {showPlanActions === plan.id && (
                  <View style={[styles.planActions, { borderTopColor: colors.border }]}>
                    <View style={styles.planMetadataSection}>
                      <View style={styles.planNameRow}>
                        {plan.mode ? (
                          <View style={[
                            styles.modeBadge,
                            plan.mode.toLowerCase() === 'bulking' && styles.modeBadgeBulking,
                            plan.mode.toLowerCase() === 'leaning' && styles.modeBadgeLeaning,
                          ]}>
                            <Text style={[
                              styles.modeBadgeText,
                              plan.mode.toLowerCase() === 'bulking' && styles.modeBadgeBulkingText,
                              plan.mode.toLowerCase() === 'leaning' && styles.modeBadgeLeaningText,
                            ]}>
                              {plan.mode}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.routineTypeBadge}>
                          <Text style={styles.routineTypeBadgeText}>🔄 Recurring</Text>
                        </View>
                        {plan.isActive && (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>Active</Text>
                          </View>
                        )}
                      </View>
                      {plan.modeGoal ? (
                        <Text style={[styles.planGoalExpanded, { color: colors.textSecondary }]} numberOfLines={3}>
                          {plan.modeGoal}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.planDaysList}>
                      <Text style={[styles.planDaysListTitle, { color: colors.textSecondary }]}>Workout Days</Text>
                      {(plan.days || plan.planDays || []).map((day, idx) => (
                        <TouchableOpacity
                          key={day.id || idx}
                          style={styles.planDayRow}
                          activeOpacity={day.isRestDay ? 1 : 0.6}
                          disabled={day.isRestDay}
                          onPress={() => {
                            setShowPlanActions(null);
                            navigation.navigate('WorkoutExecution', {
                              planDayId: day.id,
                              workoutName: day.workoutName,
                            });
                          }}
                        >
                          <View style={[
                            styles.planDayDot,
                            day.isRestDay ? { backgroundColor: colors.border } : day.completed ? { backgroundColor: colors.success } : { backgroundColor: colors.accent },
                          ]} />
                          <View style={styles.planDayInfo}>
                            <Text style={[
                              styles.planDayName,
                              { color: day.completed ? colors.textMuted : colors.textHeading },
                              day.completed && styles.planDayCompleted,
                            ]}>
                              {DAY_LABELS[day.dayOfWeek ?? idx]} — {day.isRestDay ? 'Rest Day' : (day.workoutName || 'Workout')}
                            </Text>
                            {!day.isRestDay && (
                              <Text style={[styles.planDayDetail, { color: colors.textMuted }]}>
                                {day.exercises?.length || 0} exercises • ~{day.estimatedDuration || 45} min
                              </Text>
                            )}
                          </View>
                          {!day.isRestDay && (
                            day.completed ? (
                              <Text style={[styles.planDayCheck, { color: colors.success }]}>✓</Text>
                            ) : (
                              <Text style={[styles.planDayArrow, { color: colors.textMuted }]}>›</Text>
                            )
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={[styles.planActionButtons, { borderTopColor: colors.border }]}>
                      {!plan.isActive && (
                        <TouchableOpacity
                          style={styles.planActionActivate}
                          onPress={() => {
                            Alert.alert(
                              'Activate Routine',
                              'Switching your active routine will RESET your progression (XP, level, streak, and volume). This cannot be undone.\n\nYour new routine will be the one you commit to from now on. Continue?',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Activate & Reset',
                                  style: 'destructive',
                                  onPress: async () => {
                                    try {
                                      await api.setActivePlan(plan.id);
                                      setShowPlanActions(null);
                                      onRefresh();
                                    } catch (err) {
                                      Alert.alert('Error', err.message);
                                    }
                                  },
                                },
                              ]
                            );
                          }}
                        >
                          <Text style={styles.planActionActivateText}>★ Set Active</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.planActionBtn, { backgroundColor: colors.divider }]}
                        onPress={() => {
                          setShowPlanActions(null);
                          navigation.navigate('CreatePlan', { planId: plan.id });
                        }}
                      >
                        <Text style={[styles.planActionBtnText, { color: colors.textPrimary }]}>✎ Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.planActionBtn, { backgroundColor: colors.divider }]}
                        onPress={async () => {
                          try {
                            await api.clonePlan(plan.id);
                            Alert.alert('Cloned!', 'One-time override created for next week.');
                            onRefresh();
                          } catch (err) {
                            Alert.alert('Error', err.message);
                          }
                        }}
                      >
                        <Text style={[styles.planActionBtnText, { color: colors.textPrimary }]}>↻ Clone</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.planActionBtn, styles.planActionDelete, { borderColor: colors.error }]}
                        onPress={() => {
                          const deleteMsg = plan.isActive
                            ? `Delete "${plan.name}"? ⚠️ This is your ACTIVE routine. Deleting it will leave you with no active routine.`
                            : `Delete "${plan.name}"? This cannot be undone.`;
                          Alert.alert(
                            plan.isActive ? 'Delete Active Routine' : 'Delete Routine',
                            deleteMsg,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await api.deletePlan(plan.id);
                                    setShowPlanActions(null);
                                    onRefresh();
                                  } catch (err) {
                                    Alert.alert('Error', err.message);
                                  }
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <Text style={[styles.planActionDeleteText, { color: colors.error }]}>✕ Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </Card>
            ))}

            {/* One-time overrides */}
            {oneTimePlans.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing.xl }]}>
                  Upcoming Overrides ({oneTimePlans.length}/3)
                </Text>
                {oneTimePlans.map((plan) => (
                  <Card key={plan.id} style={styles.marginBottom} contentStyle={styles.planCard}>
                    <TouchableOpacity
                      style={styles.planCardMain}
                      onPress={() => setShowPlanActions(showPlanActions === plan.id ? null : plan.id)}
                    >
                      <View style={styles.planCardLeft}>
                        <Text style={[styles.planName, { color: colors.textHeading }]}>{plan.name}</Text>
                        <Text style={[styles.planMeta, { color: colors.textSecondary }]}>
                          {plan.weekStartDate
                            ? formatWeekLabel(plan.weekStartDate)
                            : 'Upcoming'}
                          {' • '}
                          {plan.days?.length || plan.planDays?.length || 0} days
                        </Text>
                      </View>
                      <Text style={[styles.planExpand, { color: colors.textMuted }]}>
                        {showPlanActions === plan.id ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>

                    {showPlanActions === plan.id && (
                      <View style={[styles.planActions, { borderTopColor: colors.border }]}>
                        <View style={styles.planMetadataSection}>
                          <View style={styles.planNameRow}>
                            {plan.mode ? (
                              <View style={[
                                styles.modeBadge,
                                plan.mode.toLowerCase() === 'bulking' && styles.modeBadgeBulking,
                                plan.mode.toLowerCase() === 'leaning' && styles.modeBadgeLeaning,
                              ]}>
                                <Text style={[
                                  styles.modeBadgeText,
                                  plan.mode.toLowerCase() === 'bulking' && styles.modeBadgeBulkingText,
                                  plan.mode.toLowerCase() === 'leaning' && styles.modeBadgeLeaningText,
                                ]}>
                                  {plan.mode}
                                </Text>
                              </View>
                            ) : null}
                            <View style={styles.oneTimeBadge}>
                              <Text style={styles.oneTimeBadgeText}>📅 Override</Text>
                            </View>
                          </View>
                          {plan.modeGoal ? (
                            <Text style={[styles.planGoalExpanded, { color: colors.textSecondary }]} numberOfLines={3}>
                              {plan.modeGoal}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.planDaysList}>
                          <Text style={[styles.planDaysListTitle, { color: colors.textSecondary }]}>Workout Days</Text>
                          {(plan.days || plan.planDays || []).map((day, idx) => (
                            <TouchableOpacity
                              key={day.id || idx}
                              style={styles.planDayRow}
                              activeOpacity={day.isRestDay ? 1 : 0.6}
                              disabled={day.isRestDay}
                              onPress={() => {
                                setShowPlanActions(null);
                                navigation.navigate('WorkoutExecution', {
                                  planDayId: day.id,
                                  workoutName: day.workoutName,
                                });
                              }}
                            >
                              <View style={[
                                styles.planDayDot,
                                day.isRestDay ? { backgroundColor: colors.border } : day.completed ? { backgroundColor: colors.success } : { backgroundColor: colors.accent },
                              ]} />
                              <View style={styles.planDayInfo}>
                                <Text style={[
                                  styles.planDayName,
                                  { color: day.completed ? colors.textMuted : colors.textHeading },
                                  day.completed && styles.planDayCompleted,
                                ]}>
                                  {DAY_LABELS[day.dayOfWeek ?? idx]} — {day.isRestDay ? 'Rest Day' : (day.workoutName || 'Workout')}
                                </Text>
                                {!day.isRestDay && (
                                  <Text style={[styles.planDayDetail, { color: colors.textMuted }]}>
                                    {day.exercises?.length || 0} exercises • ~{day.estimatedDuration || 45} min
                                  </Text>
                                )}
                              </View>
                              {!day.isRestDay && (
                                day.completed ? (
                                  <Text style={[styles.planDayCheck, { color: colors.success }]}>✓</Text>
                                ) : (
                                  <Text style={[styles.planDayArrow, { color: colors.textMuted }]}>›</Text>
                                )
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>

                        <View style={[styles.planActionButtons, { borderTopColor: colors.border }]}>
                          <TouchableOpacity
                            style={[styles.planActionBtn, { backgroundColor: colors.divider }]}
                            onPress={() => {
                              setShowPlanActions(null);
                              navigation.navigate('CreatePlan', { planId: plan.id });
                            }}
                          >
                            <Text style={[styles.planActionBtnText, { color: colors.textPrimary }]}>✎ Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.planActionBtn, styles.planActionDelete, { borderColor: colors.error }]}
                            onPress={() => {
                              Alert.alert(
                                'Delete Routine',
                                `Delete "${plan.name}"? This cannot be undone.`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: async () => {
                                      try {
                                        await api.deletePlan(plan.id);
                                        setShowPlanActions(null);
                                        onRefresh();
                                      } catch (err) {
                                        Alert.alert('Error', err.message);
                                      }
                                    },
                                  },
                                ]
                              );
                            }}
                          >
                            <Text style={[styles.planActionDeleteText, { color: colors.error }]}>✕ Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </Card>
                ))}
              </>
            )}
          </View>
        )}

        {/* ── Templates quick-access (always visible) ─────────── */}
        {templates.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
              Templates
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.templateRow}>
                {templates.map((tmpl, idx) => (
                  <Card
                    key={idx}
                    style={styles.marginBottomSm}
                    contentStyle={styles.templateMiniCard}
                    onPress={() => navigation.navigate('CreatePlan', { template: tmpl })}
                  >
                    <Text style={[styles.templateMiniName, { color: colors.accent }]}>{tmpl.name}</Text>
                    <Text style={[styles.templateMiniDays, { color: colors.textSecondary }]}>
                      {tmpl.days?.length || 0} days
                    </Text>
                  </Card>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── Exercise Library ───────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: Spacing['2xl'] }]}>
          Exercise Library
        </Text>
        <ExerciseLibrary
          exercises={exercises}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          onPressExercise={(ex) => navigation.navigate('ExerciseDetail', {
            exerciseId: ex.id,
            exerciseName: ex.name,
          })}
        />

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    errorBanner: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: { ...Typography.caption, flex: 1 },
    errorRetry: { ...Typography.captionMedium, marginLeft: Spacing.md },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Layout.screenTopPadding,
      paddingBottom: Spacing.lg,
    },
    headerTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    headerTitleGroup: { flex: 1 },
    headerTitle: { ...Typography.h1 },
    headerSub: { ...Typography.bodySmall, marginTop: Spacing.xs },
    headerCreateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.xs,
      gap: Spacing.xs,
    },
    headerCreateBtnIcon: { fontSize: 18, fontWeight: '700' },
    headerCreateBtnText: { ...Typography.captionMedium, fontWeight: '700' },
    headerCreateBtnDisabled: { opacity: 0.5 },
    scrollContent: { padding: Spacing.xl },
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
    marginBottom: { marginBottom: Spacing.lg },
    marginBottomSm: { marginBottom: Spacing.sm },
    existingPlansSection: { marginTop: Spacing.lg },
    planCard: { overflow: 'hidden' },
    planCardMain: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    planCardLeft: { flex: 1 },
    planName: { ...Typography.captionMedium, fontWeight: '700' },
    planMeta: { ...Typography.caption, marginTop: 2 },
    planExpand: { ...Typography.bodyMedium, paddingLeft: Spacing.md },
    planActions: { borderTopWidth: 1 },
    planMetadataSection: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    planDaysList: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
    },
    planDaysListTitle: {
      ...Typography.caption,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: Spacing.sm,
    },
    planDayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
    },
    planDayDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
    planDayInfo: { flex: 1 },
    planDayName: { ...Typography.captionMedium, fontWeight: '600' },
    planDayDetail: { ...Typography.caption, marginTop: 2 },
    planDayArrow: { fontSize: 22, fontWeight: '300', marginLeft: Spacing.sm },
    planDayCheck: { fontSize: 18, fontWeight: '700', marginLeft: Spacing.sm },
    planDayCompleted: { textDecorationLine: 'line-through' },
    planActionButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xl,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
    },
    planActionBtn: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.sm,
    },
    planActionBtnText: { ...Typography.caption },
    planActionDelete: { backgroundColor: 'transparent', borderWidth: 1 },
    planActionDeleteText: { ...Typography.caption, fontWeight: '600' },
    planActionActivate: {
      backgroundColor: colors.badgeActivateBg,
      borderWidth: 1,
      borderColor: colors.badgeActivate,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.sm,
    },
    planActionActivateText: { ...Typography.caption, color: colors.badgeActivate, fontWeight: '700' },
    templateRow: { flexDirection: 'row', gap: Spacing.sm },
    templateMiniCard: {
      padding: Spacing.lg,
      width: 140,
      alignItems: 'center',
    },
    templateMiniName: { ...Typography.captionMedium, textAlign: 'center', fontWeight: '700' },
    templateMiniDays: { ...Typography.caption, marginTop: 4 },
    mimiCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      padding: Spacing.xl,
      marginBottom: Spacing.lg,
    },
    mimiTextWrap: { flex: 1, marginHorizontal: Spacing.md },
    mimiCardTitle: { ...Typography.h4, fontWeight: '700' },
    mimiCardSub: { ...Typography.caption, marginTop: 2 },
    mimiCardArrow: { fontSize: 24, fontWeight: '700' },
    planNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    modeBadge: {
      backgroundColor: colors.divider,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    modeBadgeBulking: { backgroundColor: colors.badgeBulkingBg },
    modeBadgeLeaning: { backgroundColor: colors.badgeLeaningBg },
    modeBadgeText: { ...Typography.caption, fontWeight: '600', textTransform: 'capitalize', color: colors.textSecondary },
    modeBadgeBulkingText: { color: colors.badgeBulking },
    modeBadgeLeaningText: { color: colors.badgeLeaning },
    planGoalExpanded: { ...Typography.caption, marginTop: Spacing.xs, lineHeight: 18 },
    routineTypeBadge: {
      backgroundColor: colors.badgeRoutineBg,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    routineTypeBadgeText: { ...Typography.caption, color: colors.badgeRoutine, fontWeight: '600', fontSize: 10 },
    oneTimeBadge: {
      backgroundColor: colors.badgeActivateBg,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    oneTimeBadgeText: { ...Typography.caption, color: colors.badgeActivate, fontWeight: '600', fontSize: 10 },
    activeBadge: {
      backgroundColor: colors.badgeActiveBg,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
      borderColor: colors.badgeActiveBorder,
    },
    activeBadgeText: { ...Typography.caption, color: colors.badgeActive, fontWeight: '700', fontSize: 10 },

  });
}
