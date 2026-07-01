// Resolution Fitness App — Fitness Screen
// Weekly workout plan calendar, exercise library, and plan builder.
// Each planned workout day has an "Execute/Lock In" button.

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
import Colors from '../theme/colors';
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

  const [stats, setStats] = useState(null); // user workout stats for hero card
  const [fetchError, setFetchError] = useState(null);

  // Effective plan for this week (one-time override takes precedence over consistent)
  const thisWeekMonday = getThisWeekMonday();
  const effectiveWeekPlan = resolveEffectivePlan(plans, thisWeekMonday);
  const consistentPlans = plans.filter(p => p.routineType !== 'one_time');
  const oneTimePlans = plans.filter(p => p.routineType === 'one_time');

  // ── Resolve the effective plan for a given week ─────────────────
  // One-time overrides take precedence over consistent routines.
  // Falls back to the active consistent routine.
  function resolveEffectivePlan(allPlans, weekMonday) {
    // 1. Look for a one-time plan whose weekStartDate matches
    const override = allPlans.find(
      p => p.routineType === 'one_time' && p.weekStartDate === weekMonday
    );
    if (override) return override;
    // 2. Fall back to the active consistent plan
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

      // Extract stats from dashboard for progression summary
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

  // ── Refetch data whenever the screen gains focus ─────────────────
  // This ensures plans are always fresh after:
  //   - Logging back in after logout
  //   - Navigating back from CreatePlan / WorkoutExecution
  //   - Switching back to the Fitness tab
  // Cache is safe to use here because it's already:
  //   - Wiped on logout (api.logout clears the entire cache)
  //   - Invalidated on plan create/update/delete/clone mutations
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

  // Build the week header string
  const weekHeader = currentPlan
    ? (currentPlan.routineType === 'one_time'
      ? `One-time — ${formatWeekLabel(currentPlan.weekStartDate || thisWeekMonday)}`
      : `Consistent — Week of ${formatWeekLabel(thisWeekMonday)}`)
    : (consistentPlans.length > 0 ? 'No active routine' : 'No routine yet');

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header ───────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>Fitness</Text>
            <Text style={styles.headerSub}>
              {weekHeader}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.headerCreateBtn,
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
            <Text style={styles.headerCreateBtnIcon}>+</Text>
            <Text style={styles.headerCreateBtnText}>Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Error Banner ─────────────────────────────────── */}
      {fetchError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{fetchError}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={styles.errorRetry}>Retry</Text>
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
        {/* Outlined card: no fill, 2px primary border. Inner text/icon */}
        {/* pick up the primary color so the row stays cohesive without */}
        {/* washing out against the off-white page background. */}
        <Pressable
          onPress={() => navigation.navigate('Chat')}
          {...mimiPress.handlers}
          accessibilityLabel="Ask Mimi, AI Coach"
        >
          <Animated.View style={[styles.mimiCard, mimiPress.animatedStyle]}>
            <MimiMark size={48} color={Colors.white} background={Colors.primaryLight || Colors.primary} />
            <View style={styles.mimiTextWrap}>
              <Text style={styles.mimiCardTitle}>Ask Mimi</Text>
              <Text style={styles.mimiCardSub}>Your AI fitness coach — get tips, plans & answers</Text>
            </View>
            <Text style={styles.mimiCardArrow}>→</Text>
          </Animated.View>
        </Pressable>

        {/* ── Existing Plans ───────────────────────────────────── */}
        {plans.length > 0 && (
          <View style={styles.existingPlansSection}>
            <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
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
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planMeta}>
                      {plan.days?.length || plan.planDays?.length || 0} days
                    </Text>
                  </View>
                  <Text style={styles.planExpand}>
                    {showPlanActions === plan.id ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {showPlanActions === plan.id && (
                  <View style={styles.planActions}>
                    {/* Plan metadata tags */}
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
                        <Text style={styles.planGoalExpanded} numberOfLines={3}>
                          {plan.modeGoal}
                        </Text>
                      ) : null}
                    </View>

                    {/* Workout days inside the expanded card — tappable to start session */}
                    <View style={styles.planDaysList}>
                      <Text style={styles.planDaysListTitle}>Workout Days</Text>
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
                            day.isRestDay ? styles.planDayDotRest : day.completed ? styles.planDayDotCompleted : styles.planDayDotActive,
                          ]} />
                          <View style={styles.planDayInfo}>
                            <Text style={[
                              styles.planDayName,
                              day.completed && styles.planDayCompleted,
                            ]}>
                              {DAY_LABELS[day.dayOfWeek ?? idx]} — {day.isRestDay ? 'Rest Day' : (day.workoutName || 'Workout')}
                            </Text>
                            {!day.isRestDay && (
                              <Text style={styles.planDayDetail}>
                                {day.exercises?.length || 0} exercises • ~{day.estimatedDuration || 45} min
                              </Text>
                            )}
                          </View>
                          {!day.isRestDay && (
                            day.completed ? (
                              <Text style={styles.planDayCheck}>✓</Text>
                            ) : (
                              <Text style={styles.planDayArrow}>›</Text>
                            )
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Action buttons */}
                    <View style={styles.planActionButtons}>
                      {!plan.isActive && (
                        <TouchableOpacity
                          style={[styles.planActionBtn, styles.planActionActivate]}
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
                        style={styles.planActionBtn}
                        onPress={() => {
                          setShowPlanActions(null);
                          navigation.navigate('CreatePlan', { planId: plan.id });
                        }}
                      >
                        <Text style={styles.planActionBtnText}>✎ Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.planActionBtn}
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
                        <Text style={styles.planActionBtnText}>↻ Clone</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.planActionBtn, styles.planActionDelete]}
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
                        <Text style={styles.planActionDeleteText}>✕ Delete</Text>
                      </TouchableOpacity>
                      </View>
                    </View>
                  )}
              </Card>
            ))}

            {/* One-time overrides */}
            {oneTimePlans.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
                  Upcoming Overrides ({oneTimePlans.length}/3)
                </Text>
                {oneTimePlans.map((plan) => (
                  <Card key={plan.id} style={styles.marginBottom} contentStyle={styles.planCard}>
                    <TouchableOpacity
                      style={styles.planCardMain}
                      onPress={() => setShowPlanActions(showPlanActions === plan.id ? null : plan.id)}
                    >
                      <View style={styles.planCardLeft}>
                        <Text style={styles.planName}>{plan.name}</Text>
                        <Text style={styles.planMeta}>
                          {plan.weekStartDate
                            ? formatWeekLabel(plan.weekStartDate)
                            : 'Upcoming'}
                          {' • '}
                          {plan.days?.length || plan.planDays?.length || 0} days
                        </Text>
                      </View>
                      <Text style={styles.planExpand}>
                        {showPlanActions === plan.id ? '▲' : '▼'}
                      </Text>
                    </TouchableOpacity>

                    {showPlanActions === plan.id && (
                      <View style={styles.planActions}>
                        {/* Plan metadata tags */}
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
                            <Text style={styles.planGoalExpanded} numberOfLines={3}>
                              {plan.modeGoal}
                            </Text>
                          ) : null}
                        </View>

                        {/* Workout days inside the expanded card — tappable to start session */}
                        <View style={styles.planDaysList}>
                          <Text style={styles.planDaysListTitle}>Workout Days</Text>
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
                                day.isRestDay ? styles.planDayDotRest : day.completed ? styles.planDayDotCompleted : styles.planDayDotActive,
                              ]} />
                              <View style={styles.planDayInfo}>
                                <Text style={[
                                  styles.planDayName,
                                  day.completed && styles.planDayCompleted,
                                ]}>
                                  {DAY_LABELS[day.dayOfWeek ?? idx]} — {day.isRestDay ? 'Rest Day' : (day.workoutName || 'Workout')}
                                </Text>
                                {!day.isRestDay && (
                                  <Text style={styles.planDayDetail}>
                                    {day.exercises?.length || 0} exercises • ~{day.estimatedDuration || 45} min
                                  </Text>
                                )}
                              </View>
                              {!day.isRestDay && (
                                day.completed ? (
                                  <Text style={styles.planDayCheck}>✓</Text>
                                ) : (
                                  <Text style={styles.planDayArrow}>›</Text>
                                )
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>

                        {/* Action buttons */}
                        <View style={styles.planActionButtons}>
                          <TouchableOpacity
                            style={styles.planActionBtn}
                            onPress={() => {
                              setShowPlanActions(null);
                              navigation.navigate('CreatePlan', { planId: plan.id });
                            }}
                          >
                            <Text style={styles.planActionBtnText}>✎ Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.planActionBtn, styles.planActionDelete]}
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
                            <Text style={styles.planActionDeleteText}>✕ Delete</Text>
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
            <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
              Templates
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.templateRow}>
                {templates.map((tmpl, idx) => (
                  <Card
                    key={idx}
                    backgroundColor={Colors.white}
                    style={styles.marginBottomSm}
                    contentStyle={styles.templateMiniCard}
                    onPress={() => navigation.navigate('CreatePlan', { template: tmpl })}
                  >
                    <Text style={styles.templateMiniName}>{tmpl.name}</Text>
                    <Text style={styles.templateMiniDays}>
                      {tmpl.days?.length || 0} days
                    </Text>
                  </Card>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* ── Exercise Library ─────────────────────────────────
            Position of the filter strip + 2-column grid + empty
            state lives in `components/ExerciseLibrary.js`. Caller
            wires the filter state (`selectedGroup`/`onSelectGroup`)
            and the navigation (`onPressExercise`). */}
        <Text style={[styles.sectionTitle, { marginTop: Spacing['2xl'] }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  // ── Error Banner ────────────────────────────────────────
  errorBanner: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    flex: 1,
  },
  errorRetry: {
    ...Typography.captionMedium,
    color: Colors.error,
    marginLeft: Spacing.md,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.offWhite },
  // ── Header ─────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleGroup: { flex: 1 },
  headerTitle: { ...Typography.h1, color: Colors.black },
  headerSub: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: Spacing.xs },
  headerCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  headerCreateBtnIcon: {
    fontSize: 18,
    color: Colors.white,
    fontWeight: '700',
  },
  headerCreateBtnText: {
    ...Typography.captionMedium,
    color: Colors.white,
    fontWeight: '700',
  },
  headerCreateBtnDisabled: { opacity: 0.5 },
  // ── Scroll ─────────────────────────────────────────────────
  scrollContent: { padding: Spacing.xl },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md },
  marginBottom: {
    marginBottom: Spacing.lg,
  },
  marginBottomSm: {
    marginBottom: Spacing.sm,
  },
  // ── Existing Plans ────────────────────────────────────────
  existingPlansSection: { marginTop: Spacing.lg },
  planCard: {
    overflow: 'hidden',
  },
  planCardMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  planCardLeft: { flex: 1 },
  planName: { ...Typography.captionMedium, color: Colors.black, fontWeight: '700' },
  planMeta: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  planExpand: { ...Typography.bodyMedium, color: Colors.textMuted, paddingLeft: Spacing.md },
  planActions: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  // ── Plan metadata section inside expanded card ────────────
  planMetadataSection: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  // ── Workout days list inside expanded plan card ────────────
  planDaysList: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  planDaysListTitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
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
  planDayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  planDayDotActive: { backgroundColor: Colors.primary },
  planDayDotCompleted: { backgroundColor: Colors.success || '#22C55E' },
  planDayDotRest: { backgroundColor: Colors.gray300 },
  planDayInfo: { flex: 1 },
  planDayName: { ...Typography.captionMedium, color: Colors.black, fontWeight: '600' },
  planDayDetail: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  planDayArrow: {
    fontSize: 22,
    color: Colors.textMuted,
    fontWeight: '300',
    marginLeft: Spacing.sm,
  },
  planDayCheck: {
    fontSize: 18,
    color: Colors.success || '#22C55E',
    fontWeight: '700',
    marginLeft: Spacing.sm,
  },
  planDayCompleted: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  // ── Action buttons row ─────────────────────────────────────
  planActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  planActionBtn: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  planActionBtnText: { ...Typography.caption, color: Colors.textPrimary },
  planActionDelete: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.error },
  planActionDeleteText: { ...Typography.caption, color: Colors.error, fontWeight: '600' },
  planActionActivate: { backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#F57F17' },
  planActionActivateText: { ...Typography.caption, color: '#F57F17', fontWeight: '700' },
  // ── Templates Mini ─────────────────────────────────────────
  templateRow: { flexDirection: 'row', gap: Spacing.sm },
  templateMiniCard: {
    padding: Spacing.lg,
    width: 140,
    alignItems: 'center',
  },
  templateMiniName: { ...Typography.captionMedium, color: Colors.primary, textAlign: 'center', fontWeight: '700' },
  templateMiniDays: { ...Typography.caption, color: Colors.textSecondary, marginTop: 4 },
  // ── Ask Mimi Card ────────────────────────────────────────────
  // Outlined variant — transparent fill with a 2px primary border.
  mimiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  mimiTextWrap: { flex: 1, marginHorizontal: Spacing.md },
  mimiCardTitle: { ...Typography.h4, color: Colors.primary, fontWeight: '700' },
  mimiCardSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  mimiCardArrow: { fontSize: 24, color: Colors.primary, fontWeight: '700' },
  // ── Mode Badge ───────────────────────────────────────────────
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  modeBadge: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  modeBadgeBulking: { backgroundColor: '#E3F2FD' },
  modeBadgeLeaning: { backgroundColor: '#FFF3E0' },
  modeBadgeText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600', textTransform: 'capitalize' },
  modeBadgeBulkingText: { color: '#1565C0' },
  modeBadgeLeaningText: { color: '#E65100' },
  planGoalExpanded: { ...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.xs, lineHeight: 18 },
  routineTypeBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  routineTypeBadgeText: { ...Typography.caption, color: '#2E7D32', fontWeight: '600', fontSize: 10 },
  oneTimeBadge: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  oneTimeBadgeText: { ...Typography.caption, color: '#F57F17', fontWeight: '600', fontSize: 10 },
  // ── Active Badge ───────────────────────────────────────────
  activeBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#1565C0',
  },
  activeBadgeText: { ...Typography.caption, color: '#1565C0', fontWeight: '700', fontSize: 10 },
});
