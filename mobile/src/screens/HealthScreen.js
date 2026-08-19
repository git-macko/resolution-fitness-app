// Resolution Fitness App — Health Screen
// Nutrition tracking, food scanning, pre/post workout meals,
// water tracking, and personalized meal suggestions.
// Theme-aware.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import HeroCard from '../components/HeroCard';
import HeroStatRow from '../components/HeroStat';
import Card from '../components/Card';
import MimiMark from '../components/MimiMark';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Layout } from '../theme/spacing';
import usePressScale from '../utils/usePressScale';

// ── Meal type options & helpers ────────────────────────────────────
const MEAL_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'preworkout', label: 'Pre-Workout' },
  { value: 'postworkout', label: 'Post-Workout' },
];

const MEAL_TYPE_LABELS = {
  general: 'General',
  preworkout: 'Pre-Workout',
  postworkout: 'Post-Workout',
};

function mealTypeLabel(type) {
  return MEAL_TYPE_LABELS[type] || 'General';
}

// Infers the log category from a suggestion's tags.
function suggestionMealType(suggestion) {
  const tags = suggestion.tags || [];
  if (tags.includes('preworkout')) return 'preworkout';
  if (tags.includes('postworkout')) return 'postworkout';
  return 'general';
}

export default function HealthScreen({ navigation }) {
  const mimiPress = usePressScale(0.92);
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, updateUser } = useAuth();

  const [dailyNutrition, setDailyNutrition] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // ── Quick food log state ──────────────────────────────────────
  const [quickMeal, setQuickMeal] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', water: '' });
  const [quickMealType, setQuickMealType] = useState('general');
  const [addingSuggestion, setAddingSuggestion] = useState(null);

  const setQuickField = useCallback((field, value) => {
    setQuickMeal((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ── Body stats shortcut (height / weight) ─────────────────────
  const [bodyHeight, setBodyHeight] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [savingStats, setSavingStats] = useState(false);

  // Prefill from the profile whenever the stored height/weight change.
  // Depends on the primitive values (not the user object) so typing in the
  // fields never gets clobbered by an unrelated re-render.
  useEffect(() => {
    if (user) {
      setBodyHeight(user.heightCm > 0 ? String(user.heightCm) : '');
      setBodyWeight(user.weightKg > 0 ? String(user.weightKg) : '');
    }
  }, [user?.heightCm, user?.weightKg]);

  // Updates height/weight and recalculates the daily calorie / protein /
  // water targets, then refreshes today's nutrition so the goal bars reflect
  // the new targets immediately.
  const handleSaveBodyStats = async () => {
    const height = parseFloat(bodyHeight) || 0;
    const weight = parseFloat(bodyWeight) || 0;

    if (height <= 0 || weight <= 0) {
      Alert.alert('Missing info', 'Enter your height and weight to update your goals.');
      return;
    }

    setSavingStats(true);
    try {
      const data = await api.recalculateGoals({
        heightCm: height,
        weightKg: weight,
        primaryGoal: user?.primaryGoal || 'general',
      });
      const goals = data.data || data || {};

      if (user) {
        updateUser({ ...user, heightCm: height, weightKg: weight });
      }
      Alert.alert(
        'Goals updated 🎯',
        `Your daily targets are now ${goals.calorieTarget || 0} kcal, ` +
          `${goals.proteinTargetGrams || 0} g protein, and ${goals.waterGoalMl || 0} ml water.`
      );
      fetchData(); // refresh goal targets + totals
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update body stats.');
    } finally {
      setSavingStats(false);
    }
  };

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

  // ── Quick food log ─────────────────────────────────────────────
  // User enters calories, protein, and water (and optionally a name),
  // picks a meal type, and it lands in today's log — adding straight
  // toward their calorie / protein / water goals.
  const handleQuickAdd = async () => {
    const calories = parseInt(quickMeal.calories, 10) || 0;
    const protein = parseFloat(quickMeal.protein) || 0;
    const carbs = parseFloat(quickMeal.carbs) || 0;
    const fat = parseFloat(quickMeal.fat) || 0;
    const water = parseInt(quickMeal.water, 10) || 0;

    if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0 && water <= 0) {
      Alert.alert('Nothing to log', 'Enter calories, protein, carbs, fat, or water first.');
      return;
    }

    try {
      if (calories > 0 || protein > 0 || carbs > 0 || fat > 0) {
        await api.createMeal({
          mealType: quickMealType,
          items: [{
            name: quickMeal.name.trim() || 'Quick log',
            calories,
            proteinG: protein,
            carbsG: carbs,
            fatG: fat,
            source: 'manual',
          }],
        });
      }
      if (water > 0) {
        await api.logWater(water);
      }
      setQuickMeal({ name: '', calories: '', protein: '', carbs: '', fat: '', water: '' });
      fetchData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to log.');
    }
  };

  // ── Choose a suggested meal ────────────────────────────────────
  // Logs the suggestion straight into the food log, categorized as
  // pre-workout / post-workout / general based on its tags.
  const handleAddSuggestion = async (suggestion) => {
    const key = suggestion.title || suggestion.name || 'meal';
    setAddingSuggestion(key);
    try {
      const mealType = suggestionMealType(suggestion);
      await api.createMeal({
        mealType,
        items: [{
          name: suggestion.title || suggestion.name || 'Meal',
          calories: suggestion.calories || 0,
          proteinG: suggestion.proteinG || 0,
          carbsG: suggestion.carbsG || 0,
          fatG: suggestion.fatG || 0,
          source: 'suggestion',
        }],
      });
      Alert.alert(
        'Added! 🍽️',
        `${suggestion.title || suggestion.name} was added to your log as a ${MEAL_TYPE_LABELS[mealType]} meal.`
      );
      fetchData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not add that meal.');
    } finally {
      setAddingSuggestion(null);
    }
  };

  const handleDeleteMeal = (meal) => {
    Alert.alert(
      'Delete meal?',
      `Remove "${meal.name || 'Meal'}" from your log?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMeal(meal.id);
              fetchData();
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete meal.');
            }
          },
        },
      ]
    );
  };

  const meals = dailyNutrition?.meals || [];
  // Days with no meals and no water logged are marked "no update".
  const noUpdate = dailyNutrition ? !dailyNutrition.hasActivity : false;
  // The backend returns totals as flat fields on the daily nutrition object
  // (totalCalories, totalProteinG, ...) — not a nested "totals" object.
  const totals = {
    calories: dailyNutrition?.totalCalories || 0,
    proteinG: dailyNutrition?.totalProteinG || 0,
    carbsG: dailyNutrition?.totalCarbsG || 0,
    fatG: dailyNutrition?.totalFatG || 0,
  };
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
          subtitle={noUpdate ? 'No update yet today' : `${(totals.calories || 0)} kcal today`}
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

        {/* ── Quick Food Log ──────────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.quickCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>⚡ Quick Log</Text>
          <Text style={[styles.quickHint, { color: colors.textMuted }]}>
            Track calories, protein, carbs, fat & water — they add up toward your daily goals.
          </Text>

          <TextInput
            style={[styles.quickInput, styles.quickInputWide, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
            value={quickMeal.name}
            onChangeText={(v) => setQuickField('name', v)}
            placeholder="Meal name (optional)"
            placeholderTextColor={colors.textMuted}
            testID="quick-name"
          />

          <View style={styles.quickRow}>
            <View style={styles.quickField}>
              <Text style={[styles.quickLabel, { color: colors.textMuted }]}>Calories</Text>
              <TextInput
                style={[styles.quickInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={quickMeal.calories}
                onChangeText={(v) => setQuickField('calories', v)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
                testID="quick-calories"
              />
            </View>
            <View style={styles.quickField}>
              <Text style={[styles.quickLabel, { color: colors.textMuted }]}>Protein (g)</Text>
              <TextInput
                style={[styles.quickInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={quickMeal.protein}
                onChangeText={(v) => setQuickField('protein', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
                testID="quick-protein"
              />
            </View>
            <View style={styles.quickField}>
              <Text style={[styles.quickLabel, { color: colors.textMuted }]}>Carbs (g)</Text>
              <TextInput
                style={[styles.quickInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={quickMeal.carbs}
                onChangeText={(v) => setQuickField('carbs', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
                testID="quick-carbs"
              />
            </View>
          </View>

          <View style={[styles.quickRow, styles.quickRowSecond]}>
            <View style={styles.quickField}>
              <Text style={[styles.quickLabel, { color: colors.textMuted }]}>Fat (g)</Text>
              <TextInput
                style={[styles.quickInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={quickMeal.fat}
                onChangeText={(v) => setQuickField('fat', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
                testID="quick-fat"
              />
            </View>
            <View style={styles.quickField}>
              <Text style={[styles.quickLabel, { color: colors.textMuted }]}>Water (ml)</Text>
              <TextInput
                style={[styles.quickInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                value={quickMeal.water}
                onChangeText={(v) => setQuickField('water', v)}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
                testID="quick-water"
              />
            </View>
            <View style={styles.quickField} />
          </View>

          {/* Meal type chips: General / Pre-Workout / Post-Workout */}
          <View style={styles.quickTypeRow}>
            {MEAL_TYPE_OPTIONS.map((opt) => {
              const active = quickMealType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.quickTypeChip,
                    {
                      backgroundColor: active ? colors.accent : colors.surfaceMuted,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setQuickMealType(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.quickTypeText,
                      { color: active ? colors.textInverse : colors.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.quickAddBtn, { backgroundColor: colors.accent }]}
            onPress={handleQuickAdd}
            activeOpacity={0.8}
          >
            <Text style={[styles.quickAddText, { color: colors.textInverse }]}>＋ Add to Log</Text>
          </TouchableOpacity>
        </Card>

        {/* ── Body Stats Shortcut ─────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>📏 Body Stats</Text>
            <Text style={[styles.statsHint, { color: colors.textMuted }]}>
              Keep your height & weight current so your daily goals stay accurate.
            </Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statsField}>
              <Text style={[styles.statsLabel, { color: colors.textMuted }]}>Height (cm)</Text>
              <TextInput
                style={[styles.statsInput, { backgroundColor: colors.accentWash, color: colors.textPrimary, borderColor: colors.accent }]}
                value={bodyHeight}
                onChangeText={setBodyHeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 175"
                placeholderTextColor={colors.textMuted}
                testID="body-height"
              />
            </View>
            <View style={styles.statsField}>
              <Text style={[styles.statsLabel, { color: colors.textMuted }]}>Weight (kg)</Text>
              <TextInput
                style={[styles.statsInput, { backgroundColor: colors.accentWash, color: colors.textPrimary, borderColor: colors.accent }]}
                value={bodyWeight}
                onChangeText={setBodyWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 70"
                placeholderTextColor={colors.textMuted}
                testID="body-weight"
              />
            </View>
          </View>
          <TouchableOpacity
            style={[styles.statsSaveBtn, { backgroundColor: colors.accent }]}
            onPress={handleSaveBodyStats}
            disabled={savingStats}
            activeOpacity={0.8}
          >
            {savingStats ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={[styles.statsSaveText, { color: colors.textInverse }]}>
                Update & Recalculate Goals
              </Text>
            )}
          </TouchableOpacity>
        </Card>

        {/* ── Daily Nutrition Summary ─────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.summaryCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Today's Intake</Text>

          {/* Days without any logged food or water show a "no update" state. */}
          {noUpdate ? (
            <View style={[styles.noUpdateWrap, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={styles.noUpdateEmoji}>🕓</Text>
              <Text style={[styles.noUpdateTitle, { color: colors.textPrimary }]}>No update</Text>
              <Text style={[styles.noUpdateSub, { color: colors.textMuted }]}>
                You haven't logged anything today. Use Quick Log above to record your meals and water.
              </Text>
            </View>
          ) : (
            <>
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

          {/* ── Goal progress ─────────────────────────────────── */}
          <View style={styles.goalProgressSection}>
            <GoalBar
              label="Calories"
              value={totals.calories || 0}
              goal={dailyNutrition?.calorieTarget || 0}
              unit="kcal"
              color={colors.accent}
              colors={colors}
              styles={styles}
            />
            <GoalBar
              label="Protein"
              value={totals.proteinG || 0}
              goal={dailyNutrition?.proteinTarget || 0}
              unit="g"
              color={colors.info}
              colors={colors}
              styles={styles}
            />
          </View>
            </>
          )}
        </Card>

        {/* ── Water Tracking ──────────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.waterCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>💧 Water</Text>
          <View style={styles.waterRow}>
            <Text style={[styles.waterValue, { color: colors.info }]}>{dailyNutrition?.waterMl || 0}ml</Text>
            <Text style={[styles.waterGoal, { color: colors.textMuted }]}>/ {dailyNutrition?.waterGoalMl || 2000}ml</Text>
          </View>
          <View style={[styles.waterBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.waterFill,
                { width: `${Math.min(100, ((dailyNutrition?.waterMl || 0) / (dailyNutrition?.waterGoalMl || 2000)) * 100)}%`, backgroundColor: colors.info },
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
              <MealLogCard
                key={meal.id || idx}
                meal={meal}
                fallbackName={`Pre-workout Meal ${idx + 1}`}
                onDelete={handleDeleteMeal}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        )}

        {/* ── Postworkout Meals ───────────────────────────────── */}
        {postworkoutMeals.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>🔄 Post-Workout Meals</Text>
            {postworkoutMeals.map((meal, idx) => (
              <MealLogCard
                key={meal.id || idx}
                meal={meal}
                fallbackName={`Post-workout Meal ${idx + 1}`}
                onDelete={handleDeleteMeal}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        )}

        {/* ── General Meals ───────────────────────────────────── */}
        {generalMeals.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>🥗 Meals</Text>
            {generalMeals.map((meal, idx) => (
              <MealLogCard
                key={meal.id || idx}
                meal={meal}
                fallbackName={`Meal ${idx + 1}`}
                onDelete={handleDeleteMeal}
                colors={colors}
                styles={styles}
              />
            ))}
          </View>
        )}

        {/* ── Meal Suggestions ────────────────────────────────── */}
        {suggestions.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>💡 Suggestions For You</Text>
            {suggestions.map((suggestion, idx) => {
              const sType = suggestionMealType(suggestion);
              const sKey = suggestion.title || suggestion.name || 'meal';
              const adding = addingSuggestion === sKey;
              return (
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
                    <View style={[styles.suggestionTypeBadge, { backgroundColor: colors.accentBg }]}>
                      <Text style={[styles.suggestionTypeText, { color: colors.accent }]}>
                        {mealTypeLabel(sType)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.suggestionAddBtn,
                      { backgroundColor: colors.accent },
                      adding && styles.suggestionAddBtnDisabled,
                    ]}
                    onPress={() => handleAddSuggestion(suggestion)}
                    disabled={adding}
                    activeOpacity={0.8}
                  >
                    {adding ? (
                      <ActivityIndicator size="small" color={colors.textInverse} />
                    ) : (
                      <Text style={[styles.suggestionAddText, { color: colors.textInverse }]}>
                        {`＋ Add to Log as ${mealTypeLabel(sType)}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                </Card>
              );
            })}
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
    // ── Quick Log ─────────────────────────────────────────────
    quickCard: {
      padding: Spacing.lg,
    },
    quickHint: {
      ...Typography.caption,
      marginTop: -Spacing.sm,
      marginBottom: Spacing.md,
    },
    quickInput: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
    quickInputWide: {
      textAlign: 'left',
      marginBottom: Spacing.md,
    },
    quickRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    quickRowSecond: {
      marginTop: Spacing.md,
    },
    quickField: {
      flex: 1,
    },
    quickLabel: {
      ...Typography.caption,
      marginBottom: Spacing.xs,
    },
    quickTypeRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
      marginBottom: Spacing.md,
    },
    quickTypeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    quickTypeText: {
      ...Typography.captionMedium,
      fontWeight: '600',
    },
    quickAddBtn: {
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
    },
    quickAddText: {
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    // ── Body Stats shortcut ───────────────────────────────────
    statsCard: {
      padding: Spacing.lg,
    },
    statsHeader: {
      marginBottom: Spacing.md,
    },
    statsHint: {
      ...Typography.caption,
      marginTop: -Spacing.sm,
    },
    statsRow: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    statsField: {
      flex: 1,
    },
    statsLabel: {
      ...Typography.caption,
      marginBottom: Spacing.xs,
    },
    statsInput: {
      ...Typography.body,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderWidth: 1,
    },
    statsSaveBtn: {
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    statsSaveText: {
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    // ── Summary ───────────────────────────────────────────────
    summaryCard: {
      padding: Spacing.lg,
    },
    macroRow: { flexDirection: 'row', alignItems: 'center' },
    macroItem: { flex: 1, alignItems: 'center' },
    macroValue: { ...Typography.statSmall },
    macroLabel: { ...Typography.caption, marginTop: 2 },
    macroDivider: { width: 1, height: 28 },
    // ── No-update state ───────────────────────────────────────
    noUpdateWrap: {
      alignItems: 'center',
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing['2xl'],
      paddingHorizontal: Spacing.lg,
      marginTop: Spacing.sm,
    },
    noUpdateEmoji: {
      fontSize: 30,
      marginBottom: Spacing.sm,
    },
    noUpdateTitle: {
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    noUpdateSub: {
      ...Typography.caption,
      textAlign: 'center',
      marginTop: Spacing.xs,
      lineHeight: 17,
    },
    // ── Goal progress ─────────────────────────────────────────
    goalProgressSection: {
      marginTop: Spacing.lg,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    goalBarRow: {
      marginBottom: Spacing.md,
    },
    goalBarHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.xs,
    },
    goalBarLabel: {
      ...Typography.captionMedium,
      fontWeight: '600',
    },
    goalBarValue: {
      ...Typography.caption,
      fontVariant: ['tabular-nums'],
    },
    goalBarBg: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
    },
    goalBarFill: {
      height: 6,
      borderRadius: 3,
    },
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
    mealCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    mealCardInfo: {
      flex: 1,
    },
    mealName: { ...Typography.bodyMedium },
    mealCal: { ...Typography.caption, marginTop: 2 },
    mealDeleteBtn: {
      padding: Spacing.sm,
      marginLeft: Spacing.sm,
    },
    mealDeleteText: {
      fontSize: 16,
      fontWeight: '700',
    },
    // ── Suggestions ──────────────────────────────────────────
    suggestionCard: {
      padding: Spacing.lg,
    },
    suggestionTitle: { ...Typography.bodyMedium },
    suggestionDesc: { ...Typography.caption, marginTop: 2 },
    suggestionMacros: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm, alignItems: 'center' },
    suggestionMacro: { ...Typography.caption },
    suggestionTypeBadge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: BorderRadius.sm,
    },
    suggestionTypeText: {
      ...Typography.caption,
      fontWeight: '600',
    },
    suggestionAddBtn: {
      marginTop: Spacing.md,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    suggestionAddBtnDisabled: {
      opacity: 0.6,
    },
    suggestionAddText: {
      ...Typography.bodySmall,
      fontWeight: '700',
    },
    emptyText: { ...Typography.bodySmall, textAlign: 'center', marginTop: Spacing['3xl'] },
  });
}

// ── GoalBar ────────────────────────────────────────────────────────
// Renders a labeled progress bar comparing today's intake to the goal.
function GoalBar({ label, value, goal, unit, color, colors, styles }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <View style={styles.goalBarRow}>
      <View style={styles.goalBarHeader}>
        <Text style={[styles.goalBarLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.goalBarValue, { color: colors.textMuted }]}>
          {Math.round(value)} / {goal} {unit}
        </Text>
      </View>
      <View style={[styles.goalBarBg, { backgroundColor: colors.divider }]}>
        <View style={[styles.goalBarFill, { backgroundColor: color, width: `${pct}%` }]} />
      </View>
    </View>
  );
}

// ── MealLogCard ────────────────────────────────────────────────────
// A single logged meal row with its macros and a delete action.
function MealLogCard({ meal, fallbackName, onDelete, colors, styles }) {
  return (
    <Card style={styles.marginBottomSm} contentStyle={styles.mealCard}>
      <View style={styles.mealCardTop}>
        <View style={styles.mealCardInfo}>
          <Text style={[styles.mealName, { color: colors.textPrimary }]} numberOfLines={1}>
            {meal.name || fallbackName}
          </Text>
          <Text style={[styles.mealCal, { color: colors.textMuted }]}>
            {meal.totalCalories || 0} cal • {meal.totalProteinG || 0}g protein
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onDelete(meal)}
          style={styles.mealDeleteBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Delete ${meal.name || fallbackName}`}
        >
          <Text style={[styles.mealDeleteText, { color: colors.error }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}
