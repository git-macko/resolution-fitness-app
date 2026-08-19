// Resolution Fitness App — NutritionSuggestionCard
// Dashboard widget: a carousel of food suggestions personalized to the
// user's fitness goal. Each slide shows the foods, a short summary of
// why it helps, and the macro breakdown.
//
// Props:
//  - suggestions: [{ title, description, foods[], calories, proteinG,
//                    carbsG, fatG, reason, tags[] }]
//  - onOpenHealth: callback to jump to the Health tab for more ideas

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Card from './Card';
import CarouselDots from './CarouselDots';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

export default function NutritionSuggestionCard({ suggestions = [], onOpenHealth }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(0);

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return (
      <Card style={styles.marginBottom} contentStyle={styles.content}>
        <Text style={[styles.label, { color: colors.accent }]}>FUEL FOR YOUR GOAL</Text>
        <Text style={[styles.emptyTitle, { color: colors.textHeading }]}>No ideas yet 🥗</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Set your fitness goal to get personalized food suggestions that support it.
        </Text>
        {typeof onOpenHealth === 'function' && (
          <TouchableOpacity
            style={[styles.healthBtn, { borderColor: colors.accent }]}
            onPress={onOpenHealth}
            activeOpacity={0.7}
          >
            <Text style={[styles.healthBtnText, { color: colors.accent }]}>Explore meal ideas →</Text>
          </TouchableOpacity>
        )}
      </Card>
    );
  }

  return (
    <Card style={styles.marginBottom} contentStyle={styles.content}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: colors.accent }]}>FUEL FOR YOUR GOAL</Text>
          <Text style={[styles.title, { color: colors.textHeading }]}>Eat to win 🍽</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            Swipe for ideas matched to your fitness goal
          </Text>
        </View>
      </View>

      {/* ── Carousel ───────────────────────────────────────── */}
      <View style={styles.carousel} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <ScrollView
            horizontal
            nestedScrollEnabled
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              setActiveIndex(Math.max(0, Math.min(suggestions.length - 1, idx)));
            }}
          >
            {suggestions.map((s, idx) => (
              <View key={`${s.title}-${idx}`} style={[styles.slide, { width }]}>
                <Text style={[styles.suggestionTitle, { color: colors.textHeading }]} numberOfLines={2}>
                  {s.title || s.name || `Idea ${idx + 1}`}
                </Text>
                {s.description ? (
                  <Text style={[styles.suggestionDesc, { color: colors.textSecondary }]}>
                    {s.description}
                  </Text>
                ) : null}

                {Array.isArray(s.foods) && s.foods.length > 0 ? (
                  <View style={styles.foodChips}>
                    {s.foods.map((food, i) => (
                      <View
                        key={i}
                        style={[styles.foodChip, { backgroundColor: colors.accentBg }]}
                      >
                        <Text style={[styles.foodChipText, { color: colors.accent }]} numberOfLines={1}>
                          {food}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {s.reason ? (
                  <View style={[styles.benefitBox, { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[styles.benefitLabel, { color: colors.accent }]}>Why it helps</Text>
                    <Text style={[styles.benefitText, { color: colors.textPrimary }]} numberOfLines={4}>
                      {s.reason}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.macroRow}>
                  <Macro value={s.calories || 0} label="cal" colors={colors} styles={styles} />
                  <Macro value={`${s.proteinG || 0}g`} label="protein" colors={colors} styles={styles} />
                  <Macro value={`${s.carbsG || 0}g`} label="carbs" colors={colors} styles={styles} />
                  <Macro value={`${s.fatG || 0}g`} label="fat" colors={colors} styles={styles} />
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <CarouselDots count={suggestions.length} activeIndex={activeIndex} />

      {typeof onOpenHealth === 'function' && (
        <TouchableOpacity
          style={styles.moreLink}
          onPress={onOpenHealth}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel="See more meal suggestions on the Health tab"
        >
          <Text style={[styles.moreLinkText, { color: colors.accent }]}>
            More ideas on Health tab →
          </Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

function Macro({ value, label, colors, styles }) {
  return (
    <View style={styles.macroItem}>
      <Text style={[styles.macroValue, { color: colors.textHeading }]}>{value}</Text>
      <Text style={[styles.macroLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    marginBottom: {
      marginBottom: Spacing.lg,
    },
    content: {
      padding: Spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    headerText: {
      flex: 1,
    },
    label: {
      ...Typography.label,
      marginBottom: Spacing.xs,
    },
    title: {
      ...Typography.h4,
      fontWeight: '700',
    },
    caption: {
      ...Typography.caption,
      marginTop: 2,
    },
    carousel: {
      overflow: 'hidden',
      borderRadius: BorderRadius.md,
    },
    slide: {
      paddingVertical: Spacing.xs,
    },
    suggestionTitle: {
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    suggestionDesc: {
      ...Typography.caption,
      marginTop: 2,
    },
    foodChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    foodChip: {
      borderRadius: BorderRadius.full,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      maxWidth: '100%',
    },
    foodChipText: {
      ...Typography.caption,
      fontWeight: '600',
    },
    benefitBox: {
      marginTop: Spacing.md,
      padding: Spacing.md,
      borderRadius: BorderRadius.sm,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
    },
    benefitLabel: {
      ...Typography.captionMedium,
      fontWeight: '700',
      marginBottom: 2,
    },
    benefitText: {
      ...Typography.bodySmall,
      lineHeight: 19,
    },
    macroRow: {
      flexDirection: 'row',
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    macroItem: {
      flex: 1,
      alignItems: 'center',
    },
    macroValue: {
      ...Typography.captionMedium,
      fontWeight: '700',
    },
    macroLabel: {
      ...Typography.caption,
      marginTop: 2,
    },
    moreLink: {
      marginTop: Spacing.md,
      alignSelf: 'flex-start',
      paddingVertical: Spacing.xs,
    },
    moreLinkText: {
      ...Typography.captionMedium,
      fontWeight: '600',
    },
    // ── Empty state ─────────────────────────────────────────
    emptyTitle: {
      ...Typography.bodyMedium,
      fontWeight: '700',
      marginTop: Spacing.sm,
    },
    emptyText: {
      ...Typography.bodySmall,
      marginTop: Spacing.xs,
      lineHeight: 19,
    },
    healthBtn: {
      alignSelf: 'flex-start',
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
    },
    healthBtnText: {
      ...Typography.captionMedium,
      fontWeight: '600',
    },
  });
}
