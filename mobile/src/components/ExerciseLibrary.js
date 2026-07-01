// Resolution Fitness App — ExerciseLibrary (Carousel Design)
//
// Filter strip + a horizontal snap-scrolling carousel of exercise cards.
// Tap a chip to switch muscle groups; swipe the carousel to browse
// exercises. The next card peeks in from the right to invite scrolling.
//
// ONE place to edit exercise-library layout app-wide:
//   ▸ Filter chip styling      → styles.chip / chipActive
//   ▸ Carousel card size       → CARD_WIDTH + CARD_GAP constants
//   ▸ Card visual layout       → styles.cardInner + muscleColorBar
//   ▸ Empty state copy         → defaultEmptyMessage
//
// ────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Card from './Card';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

/**
 * Default muscle-group filter strip. Edit here to add or rerank
 * filters — all instances using the default pick this up.
 */
const DEFAULT_MUSCLE_GROUPS = [
  'all',
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
];

/** Width of each carousel card. */
const CARD_WIDTH = 170;
/** Horizontal gap between carousel cards. */
const CARD_GAP = 12;
/** Snap distance = card width + gap so each card lands cleanly. */
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

/**
 * Accent tints for the muscle-group color bar at the top of each
 * card. Maps group name → background color.
 */
const MUSCLE_COLORS = {
  chest:    '#EF4444',
  back:     '#3B82F6',
  legs:     '#22C55E',
  shoulders:'#F59E0B',
  arms:     '#8B5CF6',
  core:     '#14B8A6',
  cardio:   '#EC4899',
  all:      Colors.primary,
};

/** Low-opacity wash backgrounds for the muscle-group pills / placeholders. */
const MUSCLE_WASHES = {
  chest:    '#FEF2F2', // red-50
  back:     '#EFF6FF', // blue-50
  legs:     '#F0FDF4', // green-50
  shoulders:'#FFFBEB', // amber-50
  arms:     '#F5F3FF', // violet-50
  core:     '#F0FDFA', // teal-50
  cardio:   '#FDF2F8', // pink-50
  all:      Colors.primaryBg,
};

/** Emoji icons used as exercise image placeholders per muscle group. */
const MUSCLE_ICONS = {
  chest:     '🎯',
  back:      '🦍',
  legs:      '🦵',
  shoulders: '🏋️‍♀️',
  arms:      '💪',
  core:      '🧘',
  cardio:    '🏃',
  all:       '🏋️',
};

/**
 * Default per-group empty-state formatter.
 */
function defaultEmptyMessage(group) {
  return group === 'all'
    ? 'No exercises found for this view.'
    : `No exercises found for ${group}.`;
}

/**
 * @typedef {Object} Exercise
 * @property {string|number} id
 * @property {string}        name
 * @property {string}        muscleGroup
 * @property {string}        equipment
 * @property {string}        [imageUrl]
 */

/**
 * ExerciseLibrary — filter strip + horizontal carousel.
 *
 * Props:
 *  - exercises?            Exercise[]   full list. Defaults to [].
 *  - muscleGroups?         string[]     chip order. Defaults to
 *                                       DEFAULT_MUSCLE_GROUPS.
 *  - selectedGroup?        string       currently selected group
 *                                       (default 'all').
 *  - onSelectGroup?        (group: string) => void  chip tap handler.
 *  - onPressExercise?      (exercise: Exercise) => void  card tap.
 *  - limit?                number       max cards shown (default 20).
 *  - emptyMessage?         (group: string) => string
 */
export default function ExerciseLibrary({
  exercises = [],
  muscleGroups = DEFAULT_MUSCLE_GROUPS,
  selectedGroup = 'all',
  onSelectGroup = () => {},
  onPressExercise = () => {},
  limit = 20,
  emptyMessage = defaultEmptyMessage,
}) {
  // Filtered + limited list for the currently selected group.
  const items = useMemo(() => {
    const list =
      selectedGroup === 'all'
        ? exercises
        : exercises.filter((ex) => ex.muscleGroup === selectedGroup);
    return list.slice(0, limit);
  }, [exercises, selectedGroup, limit]);

  return (
    <>
      {/* ── Filter strip ──────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {muscleGroups.map((group) => {
          const active = selectedGroup === group;
          return (
            <TouchableOpacity
              key={group}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelectGroup(group)}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {group.charAt(0).toUpperCase() + group.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Carousel ───────────────────────────────────────── */}
      {items.length === 0 ? (
        <Text style={styles.emptyText}>
          {emptyMessage(selectedGroup)}
        </Text>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          contentContainerStyle={styles.carouselContent}
        >
          {items.map((ex) => {
            const accent =
              MUSCLE_COLORS[ex.muscleGroup] || MUSCLE_COLORS.all;
            const wash =
              MUSCLE_WASHES[ex.muscleGroup] || MUSCLE_WASHES.all;
            const icon =
              MUSCLE_ICONS[ex.muscleGroup] || MUSCLE_ICONS.all;
            return (
              <Card
                key={ex.id}
                style={styles.card}
                contentStyle={styles.cardInner}
                onPress={() => onPressExercise(ex)}
              >
                <ExerciseCardImage
                  imageUrl={ex.imageUrl}
                  wash={wash}
                  icon={icon}
                />

                {/* Colored accent bar below image */}
                <View
                  style={[
                    styles.muscleColorBar,
                    { backgroundColor: accent },
                  ]}
                />

                {/* Muscle group label pill */}
                <View style={styles.pillRow}>
                  <View
                    style={[
                      styles.pill,
                      { backgroundColor: wash },
                    ]}
                  >
                    <Text style={[styles.pillText, { color: accent }]}>
                      {ex.muscleGroup}
                    </Text>
                  </View>
                </View>

                {/* Exercise name */}
                <Text style={styles.exName} numberOfLines={2}>
                  {ex.name}
                </Text>

                {/* Equipment meta */}
                <Text style={styles.exMeta}>{ex.equipment}</Text>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </>
  );
}

/**
 * Small inner component that handles its own image-load error state.
 * If the remote image fails to load, it falls back to the emoji placeholder.
 */
function ExerciseCardImage({ imageUrl, wash, icon }) {
  const [failed, setFailed] = useState(false);
  const hasImage = !!imageUrl && !failed;

  if (!hasImage) {
    return (
      <View style={[styles.imagePlaceholder, { backgroundColor: wash }]}>
        <Text style={styles.placeholderIcon}>{icon}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={styles.cardImage}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  // ── Filter strip ──
  filterRow: {
    marginBottom: Spacing.md,
  },
  filterRowContent: {
    paddingBottom: Spacing.xs,
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cardBg,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  // ── Carousel ──
  carouselContent: {
    paddingBottom: Spacing.sm,
  },
  card: {
    width: CARD_WIDTH,
    height: 236,
    marginRight: CARD_GAP,
  },
  cardInner: {
    padding: 0,
    overflow: 'hidden',
    flex: 1,
  },
  cardImage: {
    width: '100%',
    height: 88,
    backgroundColor: Colors.gray100,
  },
  imagePlaceholder: {
    width: '100%',
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 36,
    lineHeight: 44,
  },

  // ── Card visuals ──
  muscleColorBar: {
    height: 4,
    width: '100%',
  },
  pillRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  pillText: {
    ...Typography.caption,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  exName: {
    ...Typography.captionMedium,
    color: Colors.textPrimary,
    fontWeight: '700',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    minHeight: 44,
  },
  exMeta: {
    ...Typography.caption,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.lg,
  },

  // ── Empty state ──
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
