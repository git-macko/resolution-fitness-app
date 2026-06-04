// Resolution Fitness App — Dashboard Screen
// Summary hub showing progression from both Fitness and Health tabs.
// Includes: daily motivational quote, health facts, XP/progress, streaks,
// today's summary, weekly activity, next workout, and AI Coach quick access.

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.getDashboard();
      setDashboard(data.data || data);
      setFetchError(null);
    } catch (err) {
      console.warn('Dashboard fetch failed:', err.message);
      setFetchError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Refetch whenever the screen gains focus (tab switch, back nav) ──
  // This ensures dashboard data is fresh after:
  //   - Logging back in after logout
  //   - Returning from another tab
  //   - Workout completion (stats need updating)
  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const ds = dashboard || {};
  const stats = ds.stats || {};
  const quote = ds.quote || { text: 'Strive for progress, not perfection.', author: 'Unknown' };
  const fact = ds.fact || { text: 'Consistency is the key to fitness success.', category: 'motivation' };
  const nextWorkout = ds.nextWorkout || null;

  return (
    <View style={styles.container}>
      {/* ── Header ───────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {greeting()}, {user?.displayName || 'Athlete'}!
          </Text>
          <Text style={styles.greetingSub}>
            {`🔥 ${stats.currentStreak || 0} day streak`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.aiBtn}
          onPress={() => navigation.navigate('Chat')}
        >
          <Text style={styles.aiBtnText}>AI Coach</Text>
        </TouchableOpacity>
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
        {/* ── Progress Card ──────────────────────────────────── */}
        <View style={[styles.progressCard, Shadows.md]}>
          <Text style={styles.sectionTitle}>Your Progress</Text>
          <View style={styles.progressGrid}>
            <View style={styles.progressItem}>
              <Text style={styles.progressValue}>{stats.totalWorkouts || 0}</Text>
              <Text style={styles.progressLabel}>Workouts</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressItem}>
              <Text style={styles.progressValue}>{stats.totalMinutes || 0}</Text>
              <Text style={styles.progressLabel}>Minutes</Text>
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressItem}>
              <Text style={styles.progressValue}>{stats.fitnessLevel || 1}</Text>
              <Text style={styles.progressLabel}>Level</Text>
            </View>
          </View>
          {/* XP Bar */}
          <View style={styles.xpBar}>
            <View style={[styles.xpFill, { width: `${Math.min(100, ((stats.fitnessXp || 0) % 1000) / 10)}%` }]} />
          </View>
          <Text style={styles.xpText}>
            {stats.fitnessXp || 0} XP • Level {stats.fitnessLevel || 1}
          </Text>
        </View>

        {/* ── Motivational Quote ─────────────────────────────── */}
        <View style={[styles.quoteCard, Shadows.sm]}>
          <Text style={styles.quoteIcon}>"</Text>
          <Text style={styles.quoteText}>{quote.text}</Text>
          <Text style={styles.quoteAuthor}>— {quote.author}</Text>
        </View>

        {/* ── Today's Summary ────────────────────────────────── */}
        <View style={styles.row}>
          <View style={[styles.halfCard, Shadows.sm]}>
            <Text style={styles.miniCardValue}>
              {ds.caloriesBurned || 0}
            </Text>
            <Text style={styles.miniCardLabel}>Cal Burned</Text>
            <Text style={styles.miniCardSub}>kcal today</Text>
          </View>
          <View style={[styles.halfCard, Shadows.sm]}>
            <Text style={styles.miniCardValue}>
              {ds.waterMl || 0}ml
            </Text>
            <Text style={styles.miniCardLabel}>Water</Text>
            <Text style={styles.miniCardSub}>
              of {ds.waterGoal || 2000}ml
            </Text>
          </View>
        </View>

        {/* ── Health Fact ────────────────────────────────────── */}
        <View style={[styles.factCard, Shadows.sm]}>
          <View style={styles.factHeader}>
            <Text style={styles.factIcon}>🧠</Text>
            <Text style={styles.factCategory}>{fact.category || 'Health'}</Text>
          </View>
          <Text style={styles.factText}>{fact.text}</Text>
          {fact.source ? (
            <Text style={styles.factSource}>Source: {fact.source}</Text>
          ) : null}
        </View>

        {/* ── Next Workout ───────────────────────────────────── */}
        {nextWorkout && (
          <View style={[styles.nextWorkoutCard, Shadows.sm]}>
            <Text style={styles.sectionTitle}>Next Workout</Text>
            <Text style={styles.workoutName}>{nextWorkout.workoutName}</Text>
            <Text style={styles.workoutMeta}>
              {nextWorkout.estimatedDuration || 45} min • {nextWorkout.dayLabel || 'Today'}
            </Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => {
                navigation.navigate('Fitness', {
                  screen: 'WorkoutExecution',
                  params: { planDayId: nextWorkout.id, workoutName: nextWorkout.workoutName },
                });
              }}
            >
              <Text style={styles.startBtnText}>Start Workout →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Quick Actions ──────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('Fitness')}
          >
            <Text style={styles.quickBtnIcon}>💪</Text>
            <Text style={styles.quickBtnLabel}>Plan Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('Health')}
          >
            <Text style={styles.quickBtnIcon}>🥗</Text>
            <Text style={styles.quickBtnLabel}>Log Meal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => navigation.navigate('Chat')}
          >
            <Text style={styles.quickBtnIcon}>🤖</Text>
            <Text style={styles.quickBtnLabel}>Ask Coach</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.offWhite,
  },
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.offWhite,
  },
  // ── Header ─────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
  },
  greeting: {
    ...Typography.h3,
    color: Colors.black,
  },
  greetingSub: {
    ...Typography.bodySmall,
    color: Colors.primary,
  },
  aiBtn: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  aiBtnText: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  // ── Scroll ─────────────────────────────────────────────────
  scrollContent: {
    padding: Spacing.xl,
  },
  // ── Progress Card ─────────────────────────────────────────
  progressCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.bodyMedium,
    color: Colors.black,
    marginBottom: Spacing.md,
  },
  progressGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
  },
  progressValue: {
    ...Typography.stat,
    color: Colors.primary,
  },
  progressLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  progressDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.gray200,
  },
  xpBar: {
    height: 6,
    backgroundColor: Colors.gray200,
    borderRadius: 3,
    marginTop: Spacing.lg,
    overflow: 'hidden',
  },
  xpFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  xpText: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  // ── Quote Card ─────────────────────────────────────────────
  quoteCard: {
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  quoteIcon: {
    ...Typography.h1,
    color: Colors.primaryLight,
    marginBottom: Spacing.sm,
  },
  quoteText: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontStyle: 'italic',
    marginBottom: Spacing.sm,
  },
  quoteAuthor: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  // ── Summary Row ────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  halfCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  miniCardValue: {
    ...Typography.statSmall,
    color: Colors.black,
  },
  miniCardLabel: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  miniCardSub: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  // ── Fact Card ──────────────────────────────────────────────
  factCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  factHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  factIcon: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  factCategory: {
    ...Typography.label,
    color: Colors.primary,
  },
  factText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  factSource: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  // ── Next Workout ───────────────────────────────────────────
  nextWorkoutCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  workoutName: {
    ...Typography.h4,
    color: Colors.black,
    marginBottom: Spacing.xs,
  },
  workoutMeta: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  startBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  startBtnText: {
    ...Typography.bodyMedium,
    color: Colors.white,
    fontWeight: '700',
  },
  // ── Quick Actions ─────────────────────────────────────────
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  quickBtnIcon: {
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  quickBtnLabel: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});
