// Resolution Fitness App — Health Screen
// Nutrition tracking, food scanning, pre/post workout meals,
// water tracking, and personalized meal suggestions.

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';

export default function HealthScreen({ navigation }) {
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
  // This ensures health data is fresh after:
  //   - Logging back in after logout
  //   - Returning from another tab
  //   - Adding meals/water from other screens
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Health</Text>
        <Text style={styles.headerSub}>Nutrition & Diet</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Food Scanner Button ─────────────────────────────── */}
        <TouchableOpacity
          style={[styles.scanBtn, Shadows.md]}
          onPress={() => navigation.navigate('FoodScan')}
        >
          <Text style={styles.scanIcon}>📸</Text>
          <View style={styles.scanTextWrap}>
            <Text style={styles.scanTitle}>Scan Your Food</Text>
            <Text style={styles.scanSub}>
              Take a photo to get instant nutrition facts
            </Text>
          </View>
          <Text style={styles.scanArrow}>→</Text>
        </TouchableOpacity>

        {/* ── Daily Nutrition Summary ─────────────────────────── */}
        <View style={[styles.summaryCard, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Today's Intake</Text>
          <View style={styles.macroRow}>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{totals.calories || 0}</Text>
              <Text style={styles.macroLabel}>Calories</Text>
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: Colors.info }]}>
                {totals.proteinG || 0}g
              </Text>
              <Text style={styles.macroLabel}>Protein</Text>
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: Colors.warning }]}>
                {totals.carbsG || 0}g
              </Text>
              <Text style={styles.macroLabel}>Carbs</Text>
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: Colors.error }]}>
                {totals.fatG || 0}g
              </Text>
              <Text style={styles.macroLabel}>Fat</Text>
            </View>
          </View>
        </View>

        {/* ── Water Tracking ──────────────────────────────────── */}
        <View style={[styles.waterCard, Shadows.sm]}>
          <Text style={styles.sectionTitle}>💧 Water</Text>
          <View style={styles.waterRow}>
            <Text style={styles.waterValue}>{waterData.totalMl || 0}ml</Text>
            <Text style={styles.waterGoal}>/ {waterData.goalMl || 2000}ml</Text>
          </View>
          <View style={styles.waterBar}>
            <View
              style={[
                styles.waterFill,
                { width: `${Math.min(100, ((waterData.totalMl || 0) / (waterData.goalMl || 2000)) * 100)}%` },
              ]}
            />
          </View>
          <TouchableOpacity
            style={styles.addWaterBtn}
            onPress={async () => {
              try {
                await api.logWater(250);
                fetchData();
              } catch (err) {
                Alert.alert('Error', err.message || 'Failed to log water.');
              }
            }}
          >
            <Text style={styles.addWaterBtnText}>+ Add 250ml</Text>
          </TouchableOpacity>
        </View>

        {/* ── Preworkout Meals ────────────────────────────────── */}
        {preworkoutMeals.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>⚡ Pre-Workout Meals</Text>
            {preworkoutMeals.map((meal, idx) => (
              <View key={meal.id || idx} style={[styles.mealCard, Shadows.sm]}>
                <Text style={styles.mealName}>
                  {meal.name || `Pre-workout Meal ${idx + 1}`}
                </Text>
                <Text style={styles.mealCal}>
                  {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Postworkout Meals ───────────────────────────────── */}
        {postworkoutMeals.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>🔄 Post-Workout Meals</Text>
            {postworkoutMeals.map((meal, idx) => (
              <View key={meal.id || idx} style={[styles.mealCard, Shadows.sm]}>
                <Text style={styles.mealName}>
                  {meal.name || `Post-workout Meal ${idx + 1}`}
                </Text>
                <Text style={styles.mealCal}>
                  {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── General Meals ───────────────────────────────────── */}
        {generalMeals.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>🥗 Meals</Text>
            {generalMeals.map((meal, idx) => (
              <View key={meal.id || idx} style={[styles.mealCard, Shadows.sm]}>
                <Text style={styles.mealName}>
                  {meal.name || `Meal ${idx + 1}`}
                </Text>
                <Text style={styles.mealCal}>
                  {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Meal Suggestions ────────────────────────────────── */}
        {suggestions.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>💡 Suggestions For You</Text>
            {suggestions.map((suggestion, idx) => (
              <View key={idx} style={[styles.suggestionCard, Shadows.sm]}>
                <Text style={styles.suggestionTitle}>
                  {suggestion.title || suggestion.name || 'Meal Suggestion'}
                </Text>
                <Text style={styles.suggestionDesc}>
                  {suggestion.description || suggestion.desc || ''}
                </Text>
                <View style={styles.suggestionMacros}>
                  <Text style={styles.suggestionMacro}>
                    {suggestion.calories || 0} cal
                  </Text>
                  <Text style={styles.suggestionMacro}>
                    {suggestion.proteinG || 0}g protein
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {meals.length === 0 && suggestions.length === 0 && (
          <Text style={styles.emptyText}>
            No meals logged yet. Scan food or create a meal to get started!
          </Text>
        )}

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
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
  },
  headerTitle: { ...Typography.h1, color: Colors.black },
  headerSub: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: Spacing.xs },
  scrollContent: { padding: Spacing.xl },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md, marginTop: Spacing.lg },
  // ── Scan Button ───────────────────────────────────────────
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  scanIcon: { fontSize: 36, marginRight: Spacing.lg },
  scanTextWrap: { flex: 1 },
  scanTitle: { ...Typography.h4, color: Colors.white },
  scanSub: { ...Typography.caption, color: Colors.primaryLight, marginTop: 2 },
  scanArrow: { fontSize: 24, color: Colors.white },
  // ── Summary ───────────────────────────────────────────────
  summaryCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  macroRow: { flexDirection: 'row', alignItems: 'center' },
  macroItem: { flex: 1, alignItems: 'center' },
  macroValue: { ...Typography.statSmall, color: Colors.primary },
  macroLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  macroDivider: { width: 1, height: 28, backgroundColor: Colors.gray200 },
  // ── Water ─────────────────────────────────────────────────
  waterCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  waterRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.md },
  waterValue: { ...Typography.statSmall, color: Colors.info },
  waterGoal: { ...Typography.bodySmall, color: Colors.textMuted, marginLeft: Spacing.xs },
  waterBar: {
    height: 8,
    backgroundColor: Colors.gray200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  waterFill: { height: 8, backgroundColor: Colors.info, borderRadius: 4 },
  addWaterBtn: {
    backgroundColor: Colors.offWhite,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  addWaterBtnText: { ...Typography.captionMedium, color: Colors.info },
  // ── Meals ─────────────────────────────────────────────────
  mealCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  mealName: { ...Typography.bodyMedium, color: Colors.textPrimary },
  mealCal: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  // ── Suggestions ──────────────────────────────────────────
  suggestionCard: {
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  suggestionTitle: { ...Typography.bodyMedium, color: Colors.primary },
  suggestionDesc: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  suggestionMacros: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  suggestionMacro: { ...Typography.caption, color: Colors.textMuted },
  emptyText: { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing['3xl'] },
});
