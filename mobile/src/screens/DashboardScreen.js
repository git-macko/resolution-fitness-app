// Resolution Fitness App — Dashboard Screen
// Summary hub showing progression from both Fitness and Health tabs.
// Includes: motivational quote (in hero card), gym facts, streaks,
// today's summary, next workout, and AI Coach quick access.
// Theme-aware.

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import HeroCard from '../components/HeroCard';
import HeroStatRow from '../components/HeroStat';
import Card from '../components/Card';
import MimiMark from '../components/MimiMark';
import TodaysSummary from '../components/TodaysSummary';
import GymCrowdCard from '../components/GymCrowdCard';
import BuildInspirationCard from '../components/BuildInspirationCard';
import NutritionSuggestionCard from '../components/NutritionSuggestionCard';
import Logo from '../components/Logo';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Layout } from '../theme/spacing';
import usePressScale from '../utils/usePressScale';

const QA_CARD_WIDTH = 170;
const QA_CARD_GAP = 12;
const QA_SNAP_INTERVAL = QA_CARD_WIDTH + QA_CARD_GAP;

// Layout-only styles for the QACardImage sub-component (theme colors
// come from inline overrides). These live at module scope so the
// helper component can reference them without being inside the hook.
const qaStyles = StyleSheet.create({
  image: {
    width: '100%',
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 36,
  },
});

const UNS = 'https://images.unsplash.com/photo-';

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const mimiPress = usePressScale(0.92);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [reportingCrowd, setReportingCrowd] = useState(false);
  const [refreshingHours, setRefreshingHours] = useState(false);
  const lastQuoteIdRef = useRef(null);
  const lastFactIdRef = useRef(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.getDashboard();
      const dash = data.data || data;
      setDashboard(dash);

      // ── Fetch fresh quote & fact from dedicated endpoints ──
      // Use exclude param so the same item never appears twice in a row.
      try {
        const [quoteRes, factRes] = await Promise.all([
          api.getRandomQuote(lastQuoteIdRef.current),
          api.getRandomFact(lastFactIdRef.current),
        ]);
        const freshQuote = quoteRes.data || quoteRes;
        const freshFact = factRes.data || factRes;
        if (freshQuote?.id) lastQuoteIdRef.current = freshQuote.id;
        if (freshFact?.id) lastFactIdRef.current = freshFact.id;
        // Merge fresh quote/fact into the dashboard data so the UI
        // shows the newest content without waiting for the full dashboard reload.
        setDashboard((prev) => ({
          ...(prev || dash),
          dailyQuote: freshQuote,
          healthFact: freshFact,
        }));
      } catch {
        // Non-critical — if the dedicated endpoints fail, the dashboard
        // already includes a quote and fact as fallback.
      }

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
  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  // ── Build Inspiration card edits (upload/delete) keep the
  // dashboard state in sync without a full refetch.
  const handleInspirationChange = useCallback((next) => {
    setDashboard((prev) => ({ ...(prev || {}), buildInspiration: next }));
  }, []);

  const handleReportCrowd = useCallback(async (level) => {
    if (!level) return;
    setReportingCrowd(true);
    try {
      await api.reportGymCrowd(level);
      await fetchDashboard();
    } catch (err) {
      Alert.alert('Could not save report', err.message || 'Please try again.');
    } finally {
      setReportingCrowd(false);
    }
  }, [fetchDashboard]);

  // ── Manual "Tap to refresh hours" affordance ─────────────────
  // Re-fetches the gym's details from the server, which itself calls Google
  // Places / Overpass in case the background enrichment failed. The dashboard
  // is then re-fetched so the card transitions from "Hours unknown" to
  // "Open now / Closed now" without leaving the screen.
  const handleRefreshHours = useCallback(async () => {
    if (refreshingHours) return;
    setRefreshingHours(true);
    try {
      await api.refreshGymHours();
      await fetchDashboard();
    } catch (err) {
      Alert.alert('Could not refresh hours', err.message || 'Please try again.');
    } finally {
      setRefreshingHours(false);
    }
  }, [fetchDashboard, refreshingHours]);

  // ── Auto-retry the dashboard once after a short delay ───────────
  // The backend kicks off a background enrichment goroutine on the first
  // unknown_hours fetch. By the time this effect fires, that goroutine
  // should have populated the stored opening hours. We re-fetch the
  // dashboard exactly once per mount to pick up the new hours without
  // thrashing the screen.
  // The consumedRef guard is NOT a dependency on purpose - refs don't trigger
  // re-renders - but reading/mutating it is enough to break the loop if source
  // flips back to unknown_hours later in the session.
  const autoRetryConsumedRef = useRef(false);
  useEffect(() => {
    const crowd = dashboard?.gymCrowd;
    if (!crowd || crowd.source !== 'unknown_hours') return;
    if (autoRetryConsumedRef.current) return;
    autoRetryConsumedRef.current = true;
    const timer = setTimeout(() => {
      fetchDashboard();
    }, 3000);
    return () => clearTimeout(timer);
  }, [dashboard?.gymCrowd?.source, fetchDashboard]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const QUICK_ACTIONS = useMemo(() => [
    { id: 'plan', title: 'Plan Workout', sub: 'Create or start your routine', accent: colors.quickActionPlan, image: UNS + '1517836357463-d25dfeac3438?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Fitness') },
    { id: 'meal', title: 'Log Meal', sub: 'Track your nutrition intake', accent: colors.quickActionMeal, image: UNS + '1490645935967-10de6ba17061?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Health') },
    { id: 'scan', title: 'Scan Food', sub: 'Snap a photo for nutrition facts', accent: colors.quickActionScan, image: UNS + '1546069901-ba9599a7e63c?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Health', { screen: 'FoodScan' }) },
    { id: 'water', title: 'Log Water', sub: 'Stay hydrated, track intake', accent: colors.quickActionWater, image: UNS + '1548839140-29a749e1cf4d?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Health') },
    { id: 'settings', title: 'Settings', sub: 'Customize your experience', accent: colors.quickActionSettings, image: UNS + '1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop', onPress: () => navigation.navigate('Account', { screen: 'Settings' }) },
  ], [navigation, colors]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const ds = dashboard || {};
  const stats = ds.stats || {};
  const quote = ds.dailyQuote || ds.quote || { text: 'Strive for progress, not perfection.', author: 'Unknown' };
  const fact = ds.healthFact || ds.fact || { text: 'Consistency is the key to fitness success.', source: '' };
  const nextWorkout = ds.nextWorkout || null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ───────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.brandGroup}>
          <Logo variant="full" size={48} />
          <Text style={[styles.logoLabel, { color: colors.textSecondary }]}>Resolution</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Chat')}
          {...mimiPress.handlers}
          accessibilityLabel="Ask Mimi"
        >
          <Animated.View style={[styles.mimiButton, { borderColor: colors.accent }, mimiPress.animatedStyle]}>
            <MimiMark size={32} />
            <Text style={[styles.mimiLabel, { color: colors.textSecondary }]}>Ask Mimi</Text>
          </Animated.View>
        </Pressable>
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

        {/* ── Today's Summary ────────────────────────────────── */}
        <TodaysSummary
          metrics={[
            { value: ds.caloriesBurned || 0, label: 'Cal Burned', sub: 'kcal today' },
            { value: `${ds.waterMl || 0}ml`, label: 'Water', sub: `of ${ds.waterGoal || 2000}ml` },
          ]}
        />

        {/* ── Gym Crowd ──────────────────────────────────────── */}
        <GymCrowdCard
          gymCrowd={ds.gymCrowd}
          onSetupPress={() => navigation.navigate('Account', { screen: 'Settings' })}
          onReport={handleReportCrowd}
          reporting={reportingCrowd}
          onRefreshHours={handleRefreshHours}
          refreshingHours={refreshingHours}
        />

        {/* ── Build Inspiration ─────────────────────────────── */}
        <BuildInspirationCard
          data={ds.buildInspiration}
          onChange={handleInspirationChange}
        />

        {/* ── Nutrition Suggestions ─────────────────────────── */}
        <NutritionSuggestionCard
          suggestions={ds.nutritionSuggestions}
          onOpenHealth={() => navigation.navigate('Health')}
        />

        {/* ── Gym Facts ────────────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.factCard}>
          <View style={styles.factHeader}>
            <Text style={styles.factIcon}>🧠</Text>
            <Text style={[styles.factCategory, { color: colors.accent }]}>Gym Facts</Text>
          </View>
          <Text style={[styles.factText, { color: colors.textPrimary }]}>{fact.text}</Text>
          {fact.source ? (
            <Text style={[styles.factSource, { color: colors.textMuted }]}>Source: {fact.source}</Text>
          ) : null}
        </Card>

        {/* ── Next Workout ───────────────────────────────────── */}
        {nextWorkout && (
          <Card
            style={styles.marginBottom}
            contentStyle={styles.nextWorkoutCard}
          >
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Next Workout</Text>
            <Text style={[styles.workoutName, { color: colors.textHeading }]}>{nextWorkout.workoutName}</Text>
            <Text style={[styles.workoutMeta, { color: colors.textSecondary }]}>
              {nextWorkout.estimatedDuration || 45} min • {nextWorkout.dayLabel || 'Today'}
            </Text>
            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: colors.accent }]}
              onPress={() => {
                navigation.navigate('Fitness', {
                  screen: 'WorkoutExecution',
                  params: { planDayId: nextWorkout.id, workoutName: nextWorkout.workoutName },
                });
              }}
            >
              <Text style={[styles.startBtnText, { color: colors.textInverse }]}>Start Workout →</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* ── Quick Actions Carousel ───────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Quick Actions</Text>
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
              <QACardImage image={action.image} accent={action.accent} colors={colors} />
              <View style={[styles.qaAccentBar, { backgroundColor: action.accent }]} />
              <View style={styles.qaPillRow}>
                <View style={[styles.qaPill, { backgroundColor: action.accent + '18' }]}>
                  <Text style={[styles.qaPillText, { color: action.accent }]}>
                    {action.title.split(' ')[0]}
                  </Text>
                </View>
              </View>
              <Text style={[styles.qaTitle, { color: colors.textPrimary }]} numberOfLines={2}>{action.title}</Text>
              <Text style={[styles.qaSub, { color: colors.textMuted }]} numberOfLines={2}>{action.sub}</Text>
            </Card>
          ))}
        </ScrollView>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>


    </View>
  );
}

function QACardImage({ image, accent, colors }) {
  const [failed, setFailed] = useState(false);
  if (failed || !image) {
    return (
      <View style={[qaStyles.image, { backgroundColor: accent + '18' }]}>
        <Text style={qaStyles.placeholderIcon}>✨</Text>
      </View>
    );
  }
  return (
    <Image source={{ uri: image }} style={[qaStyles.image, { backgroundColor: colors.divider }]} resizeMode="cover" onError={() => setFailed(true)} />
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ── Error Banner ────────────────────────────────────────
    errorBanner: {
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: {
      ...Typography.caption,
      flex: 1,
    },
    errorRetry: {
      ...Typography.captionMedium,
      marginLeft: Spacing.md,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Header ─────────────────────────────────────────────────
    header: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Layout.screenTopPadding,
      paddingBottom: Spacing.lg,
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
    },
    mimiLabel: {
      ...Typography.bodySmall,
      fontWeight: '600',
    },
    // ── Scroll ─────────────────────────────────────────────────
    scrollContent: {
      padding: Spacing.xl,
    },
    sectionTitle: {
      ...Typography.bodyMedium,
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
    },
    factText: {
      ...Typography.bodySmall,
    },
    factSource: {
      ...Typography.caption,
      marginTop: Spacing.sm,
      fontStyle: 'italic',
    },
    // ── Next Workout ───────────────────────────────────────────
    nextWorkoutCard: {
      padding: Spacing.xl,
    },
    workoutName: {
      ...Typography.h4,
      marginBottom: Spacing.xs,
    },
    workoutMeta: {
      ...Typography.bodySmall,
      marginBottom: Spacing.lg,
    },
    startBtn: {
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    startBtnText: {
      ...Typography.bodyMedium,
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
      fontWeight: '700',
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      minHeight: 44,
    },
    qaSub: {
      ...Typography.caption,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.lg,
    },
  });
}
