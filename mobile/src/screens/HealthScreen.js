// Resolution Fitness App — Health Screen
// Nutrition tracking, food scanning, pre/post workout meals,
// water tracking, and personalized meal suggestions.
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
import MimiMark from '../components/MimiMark';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Layout } from '../theme/spacing';
import usePressScale from '../utils/usePressScale';

export default function HealthScreen({ navigation }) {
  const mimiPress = usePressScale(0.92);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [dailyNutrition, setDailyNutrition] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [nutrition, mealSuggestions] = await Promise.all([
        api.getDailyNutrition(),
        api.getMealSuggestions(),
      ]);
      setDailyNutrition(nutrition.data || nutrition || {});
      setSuggestions(mealSuggestions.data || mealSuggestions.suggestions || []);
      if (Array.isArray(mealSuggestions)) setSuggestions(mealSuggestions);
      setFetchError(null);
    } catch (err) {
      console.warn('Health fetch failed:', err.message);
      setFetchError(err.message || 'Failed to load health data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Refetch whenever the screen gains focus (tab switch, back nav) ──
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const meals = dailyNutrition?.meals || [];
  const totals = dailyNutrition?.totals || {};
  const waterData = dailyNutrition?.water || {};
  const preworkoutMeals = meals.filter((m) => m.mealType === 'preworkout');
  const postworkoutMeals = meals.filter((m) => m.mealType === 'postworkout');
  const generalMeals = meals.filter((m) => m.mealType === 'general');

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.textHeading }]}>Health</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>Nutrition & Diet</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ───────────────────────────────────────── */}
        <HeroCard
          topLabel="TODAY"
          title="Nutrition Summary"
          subtitle={`${(totals.calories || 0)} kcal today`}
        >
          <HeroStatRow
            stats={[
              { value: totals.calories || 0, label: 'Calories', tone: 'primary' },
              { value: `${totals.proteinG || 0}g`, label: 'Protein', tone: 'info' },
              { value: `${totals.carbsG || 0}g`, label: 'Carbs', tone: 'warning' },
              { value: `${totals.fatG || 0}g`, label: 'Fat', tone: 'error' },
            ]}
          />
        </HeroCard>

        {/* ── Food Scanner Button ─────────────────────────────── */}
        <TouchableOpacity
          style={[styles.scanBtn, { borderColor: colors.accent }]}
          onPress={() => navigation.navigate('FoodScan')}
        >
          <Text style={styles.scanIcon}>📸</Text>
          <View style={styles.scanTextWrap}>
            <Text style={[styles.scanTitle, { color: colors.accent }]}>Scan Your Food</Text>
            <Text style={[styles.scanSub, { color: colors.textSecondary }]}>
              Take a photo to get instant nutrition facts
            </Text>
          </View>
          <Text style={[styles.scanArrow, { color: colors.accent }]}>→</Text>
        </TouchableOpacity>

        {/* ── Daily Nutrition Summary ─────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.summaryCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Today's Intake</Text>
          <View style={styles.macroRow}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.accent }]}>{totals.calories || 0}</Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Calories</Text>
            </View>
            <View style={[styles.macroDivider, { backgroundColor: colors.border }]} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.info }]}>
                {totals.proteinG || 0}g
              </Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Protein</Text>
            </View>
            <View style={[styles.macroDivider, { backgroundColor: colors.border }]} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.warning }]}>
                {totals.carbsG || 0}g
              </Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Carbs</Text>
            </View>
            <View style={[styles.macroDivider, { backgroundColor: colors.border }]} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.error }]}>
                {totals.fatG || 0}g
              </Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Fat</Text>
            </View>
          </View>
        </Card>

        {/* ── Water Tracking ──────────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.waterCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>💧 Water</Text>
          <View style={styles.waterRow}>
            <Text style={[styles.waterValue, { color: colors.info }]}>{waterData.totalMl || 0}ml</Text>
            <Text style={[styles.waterGoal, { color: colors.textMuted }]}>/ {waterData.goalMl || 2000}ml</Text>
          </View>
          <View style={[styles.waterBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.waterFill,
                { width: `${Math.min(100, ((waterData.totalMl || 0) / (waterData.goalMl || 2000)) * 100)}%`, backgroundColor: colors.info },
              ]}
            />
          </View>
          <TouchableOpacity
            style={[styles.addWaterBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={async () => {
              try {
                await api.logWater(250);
                fetchData();
              } catch (err) {
                Alert.alert('Error', err.message || 'Failed to log water.');
              }
            }}
          >
            <Text style={[styles.addWaterBtnText, { color: colors.info }]}>+ Add 250ml</Text>
          </TouchableOpacity>
        </Card>

        {/* ── Preworkout Meals ────────────────────────────────── */}
        {preworkoutMeals.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>⚡ Pre-Workout Meals</Text>
            {preworkoutMeals.map((meal, idx) => (
              <Card key={meal.id || idx} style={styles.marginBottomSm} contentStyle={styles.mealCard}>
                <Text style={[styles.mealName, { color: colors.textPrimary }]}>
                  {meal.name || `Pre-workout Meal ${idx + 1}`}
                </Text>
                <Text style={[styles.mealCal, { color: colors.textMuted }]}>
                  {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
                </Text>
              </Card>
            ))}
          </View>
        )}

        {/* ── Postworkout Meals ───────────────────────────────── */}
        {postworkoutMeals.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>🔄 Post-Workout Meals</Text>
            {postworkoutMeals.map((meal, idx) => (
              <Card key={meal.id || idx} style={styles.marginBottomSm} contentStyle={styles.mealCard}>
                <Text style={[styles.mealName, { color: colors.textPrimary }]}>
                  {meal.name || `Post-workout Meal ${idx + 1}`}
                </Text>
                <Text style={[styles.mealCal, { color: colors.textMuted }]}>
                  {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
                </Text>
              </Card>
            ))}
          </View>
        )}

        {/* ── General Meals ───────────────────────────────────── */}
        {generalMeals.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>🥗 Meals</Text>
            {generalMeals.map((meal, idx) => (
              <Card key={meal.id || idx} style={styles.marginBottomSm} contentStyle={styles.mealCard}>
                <Text style={[styles.mealName, { color: colors.textPrimary }]}>
                  {meal.name || `Meal ${idx + 1}`}
                </Text>
                <Text style={[styles.mealCal, { color: colors.textMuted }]}>
                  {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
                </Text>
              </Card>
            ))}
          </View>
        )}

        {/* ── Meal Suggestions ────────────────────────────────── */}
        {suggestions.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>💡 Suggestions For You</Text>
            {suggestions.map((suggestion, idx) => (
              <Card
                key={idx}
                style={styles.marginBottomSm}
                contentStyle={styles.suggestionCard}
              >
                <Text style={[styles.suggestionTitle, { color: colors.accent }]}>
                  {suggestion.title || suggestion.name || 'Meal Suggestion'}
                </Text>
                <Text style={[styles.suggestionDesc, { color: colors.textSecondary }]}>
                  {suggestion.description || suggestion.desc || ''}
                </Text>
                <View style={styles.suggestionMacros}>
                  <Text style={[styles.suggestionMacro, { color: colors.textMuted }]}>
                    {suggestion.calories || 0} cal
                  </Text>
                  <Text style={[styles.suggestionMacro, { color: colors.textMuted }]}>
                    {suggestion.proteinG || 0}g protein
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {meals.length === 0 && suggestions.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No meals logged yet. Scan food or create a meal to get started!
          </Text>
        )}

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      paddingHorizontal: Spacing.xl,
      paddingTop: Layout.screenTopPadding,
      paddingBottom: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: { ...Typography.h1 },
    headerSub: { ...Typography.bodySmall, marginTop: Spacing.xs },
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
    scrollContent: { padding: Spacing.xl },
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md, marginTop: Spacing.lg },
    marginBottom: { marginBottom: Spacing.lg },
    marginBottomSm: { marginBottom: Spacing.sm },
    // ── Scan Button ───────────────────────────────────────────
    scanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.lg,
      borderWidth: 2,
      padding: Spacing.xl,
      marginBottom: Spacing.lg,
    },
    scanIcon: { fontSize: 36, marginRight: Spacing.lg },
    scanTextWrap: { flex: 1 },
    scanTitle: { ...Typography.h4, fontWeight: '700' },
    scanSub: { ...Typography.caption, marginTop: 2 },
    scanArrow: { fontSize: 24 },
    // ── Summary ───────────────────────────────────────────────
    summaryCard: {
      padding: Spacing.lg,
    },
    macroRow: { flexDirection: 'row', alignItems: 'center' },
    macroItem: { flex: 1, alignItems: 'center' },
    macroValue: { ...Typography.statSmall },
    macroLabel: { ...Typography.caption, marginTop: 2 },
    macroDivider: { width: 1, height: 28 },
    // ── Water ─────────────────────────────────────────────────
    waterCard: {
      padding: Spacing.lg,
    },
    waterRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.md },
    waterValue: { ...Typography.statSmall },
    waterGoal: { ...Typography.bodySmall, marginLeft: Spacing.xs },
    waterBar: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: Spacing.md,
    },
    waterFill: { height: 8, borderRadius: 4 },
    addWaterBtn: {
      borderRadius: BorderRadius.md,
      padding: Spacing.md,
      alignItems: 'center',
      borderWidth: 1,
    },
    addWaterBtnText: { ...Typography.captionMedium },
    // ── Meals ─────────────────────────────────────────────────
    mealCard: {
      padding: Spacing.lg,
    },
    mealName: { ...Typography.bodyMedium },
    mealCal: { ...Typography.caption, marginTop: 2 },
    // ── Suggestions ──────────────────────────────────────────
    suggestionCard: {
      padding: Spacing.lg,
    },
    suggestionTitle: { ...Typography.bodyMedium },
    suggestionDesc: { ...Typography.caption, marginTop: 2 },
    suggestionMacros: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
    suggestionMacro: { ...Typography.caption },
    emptyText: { ...Typography.bodySmall, textAlign: 'center', marginTop: Spacing['3xl'] },
  });
}
