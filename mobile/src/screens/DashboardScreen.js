// Resolution Fitness App — Dashboard Screen
// Summary hub showing progression from both Fitness and Health tabs.
// Includes: motivational quote (in hero card), gym facts, streaks,
// today's summary, next workout, and AI Coach quick access.

import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import HeroCard from '../components/HeroCard';
import HeroStatRow from '../components/HeroStat';
import Card from '../components/Card';
import MimiMark from '../components/MimiMark';
import TodaysSummary from '../components/TodaysSummary';
import Logo from '../components/Logo';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Layout } from '../theme/spacing';
import usePressScale from '../utils/usePressScale';

const QA_CARD_WIDTH = 170;
const QA_CARD_GAP = 12;
const QA_SNAP_INTERVAL = QA_CARD_WIDTH + QA_CARD_GAP;

const UNS = 'https://images.unsplash.com/photo-';

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const mimiPress = usePressScale(0.92);
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

  const QUICK_ACTIONS = useMemo(() => [
    { id: 'plan', title: 'Plan Workout', sub: 'Create or start your routine', accent: '#EF4444', image: UNS + '1517836357463-d25dfeac3438?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Fitness') },
    { id: 'meal', title: 'Log Meal', sub: 'Track your nutrition intake', accent: '#22C55E', image: UNS + '1490645935967-10de6ba17061?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Health') },
    { id: 'scan', title: 'Scan Food', sub: 'Snap a photo for nutrition facts', accent: '#3B82F6', image: UNS + '1546069901-ba9599a7e63c?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Health', { screen: 'FoodScan' }) },
    { id: 'water', title: 'Log Water', sub: 'Stay hydrated, track intake', accent: '#14B8A6', image: UNS + '1548839140-29a749e1cf4d?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Health') },
    { id: 'settings', title: 'Settings', sub: 'Customize your experience', accent: '#8B5CF6', image: UNS + '1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Account', { screen: 'Settings' }) },
  ], [navigation]);

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
  const fact = ds.fact || { text: 'Consistency is the key to fitness success.', source: '' };
  const nextWorkout = ds.nextWorkout || null;

  return (
    <View style={styles.container}>
      {/* ── Header ───────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <Logo variant="full" size={48} />
          <Text style={styles.logoLabel}>Resolution</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Chat')}
          {...mimiPress.handlers}
          accessibilityLabel="Ask Mimi"
        >
          <Animated.View style={[styles.mimiButton, mimiPress.animatedStyle]}>
            <MimiMark size={32} />
            <Text style={styles.mimiLabel}>Ask Mimi</Text>
          </Animated.View>
        </Pressable>
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
        {/* ── Hero Card ──────────────────────────────────────────── */}
        <HeroCard
          topLabel="TODAY"
          quote={quote.text}
          quoteAuthor={quote.author}
          title={`${greeting()}, ${user?.displayName || 'Athlete'}!`}
          subtitle={`🔥 ${stats.currentStreak || 0} day streak`}
        >
          <HeroStatRow
            stats={[
              { value: stats.totalWorkouts || 0, label: 'Workouts', tone: 'default' },
              { value: stats.totalMinutes || 0, label: 'Minutes', tone: 'default' },
              { value: `Lv.${stats.fitnessLevel || 1}`, label: 'Level', tone: 'warning' },
            ]}
          />
        </HeroCard>

        {/* ── Today's Summary ──────────────────────────────────
            Position of the Cal Burned + Water cards lives in
            `components/TodaysSummary.js`. Edit that file to retune
            the row layout, gap, or inner alignment. Add more metrics
            by pushing another entry into the `metrics` array below. */}
        <TodaysSummary
          metrics={[
            { value: ds.caloriesBurned || 0, label: 'Cal Burned', sub: 'kcal today' },
            { value: `${ds.waterMl || 0}ml`, label: 'Water', sub: `of ${ds.waterGoal || 2000}ml` },
          ]}
        />

        {/* ── Gym Facts ────────────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.factCard}>
          <View style={styles.factHeader}>
            <Text style={styles.factIcon}>🧠</Text>
            <Text style={styles.factCategory}>Gym Facts</Text>
          </View>
          <Text style={styles.factText}>{fact.text}</Text>
          {fact.source ? (
            <Text style={styles.factSource}>Source: {fact.source}</Text>
          ) : null}
        </Card>

        {/* ── Next Workout ───────────────────────────────────── */}
        {nextWorkout && (
          <Card
            style={styles.marginBottom}
            contentStyle={styles.nextWorkoutCard}
          >
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
          </Card>
        )}

        {/* ── Quick Actions Carousel ───────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={QA_SNAP_INTERVAL}
          decelerationRate="fast"
          contentContainerStyle={styles.qaCarouselContent}
        >
          {QUICK_ACTIONS.map((action) => (
            <Card key={action.id} style={styles.qaCard} contentStyle={styles.qaCardInner} onPress={action.onPress}>
              <QACardImage image={action.image} accent={action.accent} />
              <View style={[styles.qaAccentBar, { backgroundColor: action.accent }]} />
              <View style={styles.qaPillRow}>
                <View style={[styles.qaPill, { backgroundColor: action.accent + '18' }]}>
                  <Text style={[styles.qaPillText, { color: action.accent }]}>
                    {action.title.split(' ')[0]}
                  </Text>
                </View>
              </View>
              <Text style={styles.qaTitle} numberOfLines={2}>{action.title}</Text>
              <Text style={styles.qaSub} numberOfLines={2}>{action.sub}</Text>
            </Card>
          ))}
        </ScrollView>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>


    </View>
  );
}

function QACardImage({ image, accent }) {
  const [failed, setFailed] = useState(false);
  if (failed || !image) {
    return (
      <View style={[styles.qaImage, { backgroundColor: accent + '18' }]}>
        <Text style={styles.qaPlaceholderIcon}>✨</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri: image }} style={styles.qaImage} resizeMode="cover" onError={() => setFailed(true)} />
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  logoLabel: {
    ...Typography.h4,
    color: Colors.gray600,
    letterSpacing: 0.5,
  },
  mimiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  mimiLabel: {
    ...Typography.bodySmall,
    color: Colors.gray500,
    
    fontWeight: '600',
  },
  // ── Scroll ─────────────────────────────────────────────────
  scrollContent: {
    padding: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.bodyMedium,
    color: Colors.black,
    marginBottom: Spacing.md,
  },
  marginBottom: {
    marginBottom: Spacing.lg,
  },
  // ── Fact Card ──────────────────────────────────────────────
  factCard: {
    padding: Spacing.lg,
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
    padding: Spacing.xl,
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
  // ── Quick Actions Carousel ─────────────────────────────────
  qaCarouselContent: {
    paddingBottom: Spacing.sm,
  },
  qaCard: {
    width: QA_CARD_WIDTH,
    height: 236,
    marginRight: QA_CARD_GAP,
    marginBottom: Spacing.lg,
  },
  qaCardInner: {
    padding: 0,
    overflow: 'hidden',
    flex: 1,
  },
  qaImage: {
    width: '100%',
    height: 88,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qaPlaceholderIcon: {
    fontSize: 36,
  },
  qaAccentBar: {
    height: 4,
    width: '100%',
  },
  qaPillRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  qaPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  qaPillText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  qaTitle: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    minHeight: 44,
  },
  qaSub: {
    ...Typography.caption,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
  },
});
