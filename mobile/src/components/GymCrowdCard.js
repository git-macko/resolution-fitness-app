// Resolution Fitness App — GymCrowdCard
// Dashboard widget showing estimated gym occupancy with a segmented
// bar UI inspired by the Planet Fitness crowd meter.
//
// Props:
//  - gymCrowd: { type, name, percentage, label, capacity }
//  - onSetupPress: callback when the card is in the unset state and tapped
//  - onReport: callback(level) when the user reports the current crowd level
//  - reporting: boolean indicating a report is being submitted
//  - onRefreshHours: optional callback when the user taps "Tap to refresh" while hours are unknown
//  - refreshingHours: boolean indicating the manual refresh request is in flight

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, Pressable } from 'react-native';
import Card from './Card';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';
import { parseOpeningHours } from '../utils/openingHours';

const TOTAL_SEGMENTS = 10;

const REPORT_OPTIONS = [
  { level: 1, label: 'Not busy' },
  { level: 2, label: 'Quiet' },
  { level: 3, label: 'Moderate' },
  { level: 4, label: 'Busy' },
];

function levelLabel(level) {
  switch (level) {
    case 1: return 'Not busy';
    case 2: return 'Quiet';
    case 3: return 'Moderate';
    case 4: return 'Busy';
    case 5: return 'Very busy';
    default: return 'Unknown';
  }
}

function formatTimeAgo(iso) {
  if (!iso) return '';
  const parsed = new Date(`${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  const diff = Date.now() - parsed.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
export default function GymCrowdCard({ gymCrowd, onSetupPress, onReport, reporting, onRefreshHours, refreshingHours }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Unset state — prompt the user to configure their gym.
  if (!gymCrowd) {
    return (
      <Card style={styles.marginBottom} onPress={onSetupPress}>
        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.accent }]}>GYM CROWD</Text>
          <Text style={[styles.title, { color: colors.textHeading }]}>
            Set up your gym
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            See live crowd estimates for the gym you go to.
          </Text>
          <TouchableOpacity
            style={[styles.setupBtn, { backgroundColor: colors.accent }]}
            onPress={onSetupPress}
            activeOpacity={0.7}
          >
            <Text style={[styles.setupBtnText, { color: colors.textInverse }]}>
              Set up gym →
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }

  const [hoursExpanded, setHoursExpanded] = useState(false);

  const isHome = gymCrowd.type === 'home';
  const activeCount = Math.max(0, Math.min(TOTAL_SEGMENTS, Math.round(gymCrowd.percentage / (100 / TOTAL_SEGMENTS))));
  const { hasHours: hasOpeningHours, todayRange: todayHoursRange, week: hoursWeek } = !isHome && gymCrowd.openingHours
    ? parseOpeningHours(gymCrowd.openingHours)
    : { hasHours: false, todayRange: '', week: [] };
  const showHoursRow = !isHome && (hasOpeningHours || !!gymCrowd.statusText);

  const handleOpenWebsite = () => {
    if (isHome || !gymCrowd.website) return;
    const url = gymCrowd.website?.startsWith('http') ? gymCrowd.website : `https://${gymCrowd.website}`;
    Alert.alert(
      gymCrowd.name || 'Your Gym',
      'Open the gym website in your browser?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open',
          onPress: () => Linking.openURL(url).catch(() => {}),
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <Card style={styles.marginBottom}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[styles.label, { color: colors.accent }]}>GYM CROWD</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleOpenWebsite}
              disabled={isHome || !gymCrowd.website}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.title, { color: colors.textHeading }]} numberOfLines={2}>
                {isHome ? 'Home Gym' : gymCrowd.name || 'Your Gym'}
              </Text>
            </TouchableOpacity>
            {!isHome && gymCrowd.address ? (
              <Text style={[styles.address, { color: colors.textSecondary }]} numberOfLines={2} ellipsizeMode="tail">
                {gymCrowd.address}
              </Text>
            ) : null}
            {showHoursRow && (
              <Pressable
                onPress={() => setHoursExpanded((prev) => !prev)}
                style={({ pressed }) => [styles.openingHoursRow, { opacity: pressed ? 0.7 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={hoursExpanded ? 'Hide full opening hours' : 'Show full opening hours'}
                accessibilityHint="Toggles the full weekly opening hours panel"
              >
                <Text style={[styles.openingHours, { color: colors.textSecondary }]} numberOfLines={1}>
                  {gymCrowd.isOpen === false
                    ? gymCrowd.statusText || 'Closed now'
                    : `Open now: ${todayHoursRange || 'Unavailable'}`}
                </Text>
                <Text style={[styles.openingHours, { color: colors.accent, marginLeft: Spacing.sm }]}>
                  {hoursExpanded ? '▲' : '▼'}
                </Text>
              </Pressable>
            )}
            {hoursExpanded && hasOpeningHours && (
              <View style={[styles.hoursPanel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                {hoursWeek.map((item) => (
                  <View key={item.day} style={styles.hoursRow}>
                    <Text style={[styles.hoursDay, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.day}
                    </Text>
                    <Text style={[styles.hoursValue, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.hours}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {!isHome && onSetupPress ? (
              <TouchableOpacity onPress={onSetupPress} activeOpacity={0.7} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <Text style={[styles.changeGymText, { color: colors.accent }]}>Change gym</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.percentage, { color: colors.textHeading }]}>
            {isHome ? '—' : `${gymCrowd.percentage}%`}
          </Text>
        </View>

        {!isHome && gymCrowd.phone && (
          <Text style={[styles.phone, { color: colors.accent }]}>
            {gymCrowd.phone}
          </Text>
        )}

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {isHome ? 'Perfect time to train — no waiting!' : gymCrowd.label}
        </Text>

        {!isHome && gymCrowd.source !== 'closed' && gymCrowd.source !== 'unknown_hours' && (
          <View
            style={styles.barContainer}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: gymCrowd.percentage }}
            accessibilityLabel={`Crowd level: ${gymCrowd.percentage} percent`}
          >
            {Array.from({ length: TOTAL_SEGMENTS }).map((_, i) => {
              const isActive = i < activeCount;
              const isHigh = i >= 7;
              const isMedium = i >= 4 && i < 7;
              let segmentColor = colors.divider;
              if (isActive) {
                if (isHigh) segmentColor = colors.error;
                else if (isMedium) segmentColor = colors.warning;
                else segmentColor = colors.success;
              }
              return (
                <View
                  key={i}
                  style={[
                    styles.segment,
                    { backgroundColor: segmentColor },
                    i === 0 && { borderTopLeftRadius: BorderRadius.sm, borderBottomLeftRadius: BorderRadius.sm },
                    i === TOTAL_SEGMENTS - 1 && { borderTopRightRadius: BorderRadius.sm, borderBottomRightRadius: BorderRadius.sm },
                  ]}
                />
              );
            })}
          </View>
        )}

        {!isHome && (
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            {gymCrowd.source === 'besttime'
              ? 'Live via BestTime'
              : gymCrowd.source === 'user_report'
              ? 'Reported by you'
              : gymCrowd.source === 'community'
              ? 'Community report'
              : gymCrowd.source === 'closed'
              ? 'Closed now'
              : gymCrowd.source === 'unknown_hours'
              ? 'Hours not set'
              : 'Estimated'}
          </Text>
        )}

        {!isHome && gymCrowd.source === 'unknown_hours' && onRefreshHours && (
          <TouchableOpacity
            style={[
              styles.refreshPill,
              {
                borderColor: colors.divider,
                backgroundColor: refreshingHours ? colors.surfaceMuted : colors.surface,
              },
            ]}
            onPress={onRefreshHours}
            disabled={refreshingHours}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={refreshingHours ? 'Refreshing gym hours' : 'Refresh gym hours now'}
            accessibilityHint="Asks the server to re-fetch your gym's opening hours so the crowd card can show whether it is open"
          >
            <Text style={[styles.refreshPillText, { color: refreshingHours ? colors.textMuted : colors.accent }]}>
              {refreshingHours ? 'Refreshing hours…' : 'Tap to refresh hours'}
            </Text>
          </TouchableOpacity>
        )}

        {!isHome && onReport && gymCrowd.isOpen && (
          <View style={styles.reportSection}>
            <Text style={[styles.reportLabel, { color: colors.textSecondary }]}>
              How busy is it right now?
            </Text>
            <View style={styles.reportRow}>
              {REPORT_OPTIONS.map((opt) => {
                const selected = gymCrowd?.userReport?.level === opt.level;
                return (
                  <TouchableOpacity
                    key={opt.level}
                    style={[
                      styles.reportBtn,
                      {
                        borderColor: colors.divider,
                        backgroundColor: selected ? colors.accent : colors.surface,
                      },
                    ]}
                    onPress={() => onReport(opt.level)}
                    disabled={reporting}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.reportBtnText,
                        { color: selected ? colors.textInverse : colors.textPrimary },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {gymCrowd?.userReport ? (
              <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                You reported {levelLabel(gymCrowd.userReport.level).toLowerCase()} {formatTimeAgo(gymCrowd.userReport.reportedAt)}
              </Text>
            ) : null}
            {gymCrowd?.community ? (
              <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                Community: {levelLabel(gymCrowd.community.level).toLowerCase()} ({gymCrowd.community.count} reports)
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </Card>
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
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    label: {
      ...Typography.label,
      marginBottom: Spacing.xs,
    },
    title: {
      ...Typography.h4,
      fontSize: 20,
    },
    address: {
      ...Typography.caption,
      marginTop: Spacing.xs,
    },
    headerText: {
      flex: 1,
      paddingRight: Spacing.md,
    },
    changeGymText: {
      ...Typography.caption,
      fontWeight: '600',
      marginTop: 2,
    },
    percentage: {
      ...Typography.statSmall,
      fontSize: 20,
      flexShrink: 0,
    },
    subtitle: {
      ...Typography.bodySmall,
      marginTop: Spacing.xs,
    },
    barContainer: {
      flexDirection: 'row',
      gap: 4,
      height: 14,
      marginTop: Spacing.md,
    },
    segment: {
      flex: 1,
      borderRadius: 2,
    },
    caption: {
      ...Typography.caption,
      marginTop: Spacing.sm,
      textAlign: 'right',
    },
    openingHours: {
      ...Typography.caption,
    },
    openingHoursRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.xs,
      alignSelf: 'flex-start',
      paddingVertical: Spacing.xs,
      paddingRight: Spacing.sm,
    },
    hoursPanel: {
      marginTop: Spacing.sm,
      padding: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
    },
    hoursRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.xs,
    },
    hoursDay: {
      ...Typography.caption,
      flex: 1,
    },
    hoursValue: {
      ...Typography.caption,
      flex: 1,
      textAlign: 'right',
      fontWeight: '600',
    },
    phone: {
      ...Typography.caption,
      fontWeight: '600',
      marginTop: Spacing.xs,
    },
    setupBtn: {
      alignSelf: 'flex-start',
      marginTop: Spacing.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
    },
    setupBtnText: {
      ...Typography.caption,
      fontWeight: '600',
    },
    reportSection: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    reportLabel: {
      ...Typography.bodySmall,
      fontWeight: '600',
      marginBottom: Spacing.sm,
    },
    reportRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    reportBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
    },
    reportBtnText: {
      ...Typography.caption,
      fontWeight: '600',
      textAlign: 'center',
    },
    reportMeta: {
      ...Typography.caption,
      marginTop: Spacing.sm,
    },
    refreshPill: {
      alignSelf: 'flex-start',
      marginTop: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
    },
    refreshPillText: {
      ...Typography.caption,
      fontWeight: '600',
    },
  });
}
