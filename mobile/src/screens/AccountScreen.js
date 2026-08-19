// Resolution Fitness App — Account Screen
// User profile, stats, settings, and account management.
// Theme-aware.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, ActivityIndicator, Alert, Image, TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Card from '../components/Card';
import HeroCard from '../components/HeroCard';
import HeroStatRow from '../components/HeroStat';
import MimiMark from '../components/MimiMark';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Layout } from '../theme/spacing';
import usePressScale from '../utils/usePressScale';

export default function AccountScreen({ navigation }) {
  const { user, updateUser, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const mimiPress = usePressScale(0.92);
  const [settings, setSettings] = useState(null);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Body stats editing ──────────────────────────────────────
  const [bodyHeight, setBodyHeight] = useState('');
  const [bodyWeight, setBodyWeight] = useState('');
  const [bodyGender, setBodyGender] = useState('');
  const [savingStats, setSavingStats] = useState(false);

  useEffect(() => {
    fetchAccountData();
  }, []);

  // Sync the editable fields whenever the stored profile values change.
  // Depends on the primitive values (not the user object) so typing in the
  // fields never gets clobbered by an unrelated re-render.
  useEffect(() => {
    if (user) {
      setBodyHeight(user.heightCm > 0 ? String(user.heightCm) : '');
      setBodyWeight(user.weightKg > 0 ? String(user.weightKg) : '');
      setBodyGender(user.gender || '');
    }
  }, [user?.heightCm, user?.weightKg, user?.gender]);

  const fetchAccountData = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data.data || data || {});
    } catch (err) {
      console.warn('Settings fetch failed:', err.message);
    }
    // Progression badges are computed server-side from Fitness + Health activity.
    try {
      const data = await api.getBadges();
      const list = data.data || data || [];
      setBadges(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Badges fetch failed:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Body stats: save + recompute daily goals ─────────────────
  // Height and weight feed the calorie / protein / water targets, so
  // updating them recalculates the goals and stores both on the server.
  const handleSaveBodyStats = async () => {
    const height = parseFloat(bodyHeight) || 0;
    const weight = parseFloat(bodyWeight) || 0;

    if (height <= 0 || weight <= 0) {
      Alert.alert('Missing info', 'Enter your height and weight to recalculate your goals.');
      return;
    }

    setSavingStats(true);
    try {
      const data = await api.recalculateGoals({
        heightCm: height,
        weightKg: weight,
        gender: bodyGender,
        primaryGoal: user?.primaryGoal || 'general',
      });
      const goals = data.data || data || {};

      if (user) {
        updateUser({ ...user, heightCm: height, weightKg: weight, gender: bodyGender });
      }
      setSettings((prev) => ({ ...(prev || {}), ...goals }));

      Alert.alert(
        'Goals updated 🎯',
        `Your daily targets are now ${goals.calorieTarget || 0} kcal, ` +
          `${goals.proteinTargetGrams || 0} g protein, and ` +
          `${goals.waterGoalMl || 0} ml water. Fine-tune them anytime in Settings.`
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update body stats.');
    } finally {
      setSavingStats(false);
    }
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission', 'Photo library access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      try {
        const data = await api.uploadProfilePicture(result.assets[0].uri);
        const photoUrl = data.photoUrl || data.data?.photoUrl;
        if (photoUrl && user) {
          updateUser({ ...user, photoUrl });
        }
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to upload photo.');
      }
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };



  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const stats = user?.stats || {};

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.textHeading }]}>Account</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>Profile & Settings</Text>
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Profile Card (Hero Gradient) ────────────────────── */}
        <HeroCard
          topLabel="PROFILE"
          title={user?.displayName || 'Athlete'}
          subtitle={user?.email || ''}
        >
          {/* Avatar + Change Photo */}
          <TouchableOpacity onPress={handlePickPhoto} style={styles.heroAvatarWrap}>
            <View style={[styles.heroAvatar, { backgroundColor: colors.heroAvatarBg }]}>
              {user?.photoUrl ? (
                <Image source={{ uri: user.photoUrl }} style={styles.heroAvatarImage} />
              ) : (
                <Text style={styles.heroAvatarPlaceholder}>
                  {(user?.displayName || 'A')[0].toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.heroChangePhoto}>Change photo</Text>
          </TouchableOpacity>
          <HeroStatRow
            stats={[
              { value: stats.totalWorkouts || 0, label: 'Workouts', tone: 'default' },
              { value: stats.currentStreak || 0, label: 'Day Streak', tone: 'primary' },
              { value: `Lv.${stats.fitnessLevel || 1}`, label: 'Level', tone: 'warning' },
            ]}
          />
        </HeroCard>

        {/* ── Progression Badges ───────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.badgesCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>
            Progression Badges
          </Text>
          <Text style={[styles.badgesIntro, { color: colors.textMuted }]}>
            Earned from your workouts and nutrition tracking.
          </Text>
          {badges.length === 0 ? (
            <Text style={[styles.badgesEmpty, { color: colors.textSecondary }]}>
              Keep training and tracking meals to start earning badges 🏅
            </Text>
          ) : (
            badges.map((b, idx) => (
              <View
                key={b.id || idx}
                style={[
                  styles.badgeRow,
                  idx < badges.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <View
                  style={[
                    styles.badgeEmojiWrap,
                    { backgroundColor: b.earned ? colors.accentBg : colors.surfaceMuted },
                  ]}
                >
                  <Text style={styles.badgeEmoji}>{b.emoji || '🎖️'}</Text>
                </View>
                <View style={styles.badgeInfo}>
                  <View style={styles.badgeNameRow}>
                    <Text
                      style={[
                        styles.badgeName,
                        { color: b.earned ? colors.accent : colors.textSecondary },
                      ]}
                    >
                      {b.name}
                    </Text>
                    {b.earned ? (
                      <Text style={[styles.badgeEarnedTag, { color: colors.success }]}>
                        ✓ Earned
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.badgeDesc, { color: colors.textMuted }]}>
                    {b.description}
                  </Text>
                  {!b.earned ? (
                    <>
                      <View style={[styles.badgeProgressBg, { backgroundColor: colors.divider }]}>
                        <View
                          style={[
                            styles.badgeProgressFill,
                            {
                              backgroundColor: colors.accent,
                              width: `${Math.round((b.progress || 0) * 100)}%`,
                            },
                          ]}
                        />
                      </View>
                      {b.progressText ? (
                        <Text style={[styles.badgeProgressText, { color: colors.textMuted }]}>
                          {b.progressText}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </Card>

        {/* ── Profile Info ─────────────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.infoCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Profile</Text>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Fitness Level</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {(user?.fitnessLevel || 'beginner').charAt(0).toUpperCase() +
                (user?.fitnessLevel || 'beginner').slice(1)}
            </Text>
          </View>
          <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Goal</Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {(user?.primaryGoal || 'general').replace(/_/g, ' ')}
            </Text>
          </View>
          {user?.gender && (
            <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Gender</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user.gender}</Text>
            </View>
          )}
          {user?.heightCm > 0 && (
            <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Height</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user.heightCm} cm</Text>
            </View>
          )}
          {user?.weightKg > 0 && (
            <View style={[styles.infoRow, { borderBottomColor: colors.divider }]}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Weight</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user.weightKg} kg</Text>
            </View>
          )}
        </Card>

        {/* ── Body Stats & Goals ───────────────────────────────── */}
        <Card style={styles.marginBottom} contentStyle={styles.infoCard}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>
            Body Stats & Daily Goals
          </Text>
          <Text style={[styles.statsIntro, { color: colors.textMuted }]}>
            Your height and weight are used to estimate your calorie, protein, and water goals.
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.statsField}>
              <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Height (cm)</Text>
              <TextInput
                style={[styles.statsInput, { backgroundColor: colors.accentWash, color: colors.textPrimary, borderColor: colors.accent }]}
                value={bodyHeight}
                onChangeText={setBodyHeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 175"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.statsField}>
              <Text style={[styles.statsLabel, { color: colors.textSecondary }]}>Weight (kg)</Text>
              <TextInput
                style={[styles.statsInput, { backgroundColor: colors.accentWash, color: colors.textPrimary, borderColor: colors.accent }]}
                value={bodyWeight}
                onChangeText={setBodyWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 70"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <Text style={[styles.statsLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>
            Gender (optional)
          </Text>
          <View style={styles.genderRow}>
            {[{ key: 'male', label: 'Male' }, { key: 'female', label: 'Female' }, { key: 'other', label: 'Prefer not to say' }].map((g) => {
              const selected = bodyGender === g.key;
              return (
                <TouchableOpacity
                  key={g.key}
                  style={[
                    styles.genderChip,
                    {
                      backgroundColor: selected ? colors.accent : colors.surfaceMuted,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setBodyGender(selected ? '' : g.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.genderChipText,
                      { color: selected ? colors.textInverse : colors.textSecondary },
                    ]}
                  >
                    {g.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.targetsRow, { backgroundColor: colors.surfaceMuted }]}>
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: colors.accent }]}>{settings?.calorieTarget || 2000}</Text>
              <Text style={[styles.targetLabel, { color: colors.textMuted }]}>kcal</Text>
            </View>
            <View style={[styles.targetDivider, { backgroundColor: colors.border }]} />
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: colors.info }]}>{settings?.proteinTargetGrams || 150}g</Text>
              <Text style={[styles.targetLabel, { color: colors.textMuted }]}>protein</Text>
            </View>
            <View style={[styles.targetDivider, { backgroundColor: colors.border }]} />
            <View style={styles.targetItem}>
              <Text style={[styles.targetValue, { color: colors.info }]}>{settings?.waterGoalMl || 2000}ml</Text>
              <Text style={[styles.targetLabel, { color: colors.textMuted }]}>water</Text>
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

        {/* ── Allergies & Diet ─────────────────────────────────── */}
        {(user?.allergies?.length > 0 || user?.dietaryPrefs?.length > 0) && (
          <Card style={styles.marginBottom} contentStyle={styles.infoCard}>
            <Text style={[styles.sectionTitle, { color: colors.textHeading }]}>Diet & Allergies</Text>
            {user?.allergies?.length > 0 && (
              <View style={styles.tagRow}>
                <Text style={[styles.tagLabel, { color: colors.textSecondary }]}>Allergies:</Text>
                <View style={styles.tags}>
                  {user.allergies.map((a, i) => (
                    <View key={i} style={[styles.tag, { backgroundColor: colors.accentWash }]}>
                      <Text style={[styles.tagText, { color: colors.error }]}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {user?.dietaryPrefs?.length > 0 && (
              <View style={styles.tagRow}>
                <Text style={[styles.tagLabel, { color: colors.textSecondary }]}>Diet:</Text>
                <View style={styles.tags}>
                  {user.dietaryPrefs.map((d, i) => (
                    <View key={i} style={[styles.tag, styles.tagPurple, { backgroundColor: colors.accentBg }]}>
                      <Text style={[styles.tagText, styles.tagTextPurple, { color: colors.accent }]}>{d}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Card>
        )}

        {/* ── Settings Link ────────────────────────────────────── */}
        <Card
          style={styles.marginBottomMd}
          contentStyle={styles.menuItem}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={[styles.menuItemText, { color: colors.textPrimary }]}>⚙️  Settings</Text>
          <Text style={[styles.menuArrow, { color: colors.textMuted }]}>→</Text>
        </Card>

        {/* ── Logout ───────────────────────────────────────────── */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.error }]} onPress={handleLogout}>
          <Text style={[styles.logoutBtnText, { color: colors.error }]}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: Spacing['4xl'] }} />

        {/* ── THEME COLOR REFERENCE (uncomment to preview) ───── */}
        {/*
        <Card style={styles.marginBottom} contentStyle={{ padding: Spacing.lg }}>
          <Text style={[styles.sectionTitle, { color: colors.textHeading, marginTop: 0 }]}>
            🎨 Theme Colors
          </Text>
          {Object.entries(colors).map(([key, value]) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
              <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: value, borderWidth: 1, borderColor: colors.border, marginRight: 10 }} />
              <Text style={{ ...Typography.bodySmall, color: colors.textPrimary, flex: 1 }}>{key}</Text>
              <Text style={{ ...Typography.caption, color: colors.textMuted }}>{value}</Text>
            </View>
          ))}
        </Card>
        */}
      </ScrollView>
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1 },
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
    headerSub: { ...Typography.bodySmall, marginTop: Spacing.xs },
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md, marginTop: Spacing.lg },
    marginBottom: { marginBottom: Spacing.lg },
    marginBottomMd: { marginBottom: Spacing.md },
    // ── Hero Avatar (inside gradient HeroCard) ──────────────
    heroAvatarWrap: {
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    heroAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    heroAvatarImage: { width: 72, height: 72, borderRadius: 36 },
    heroAvatarPlaceholder: { ...Typography.h2, color: colors.heroText },
    heroChangePhoto: { ...Typography.caption, color: colors.heroTextMuted, marginTop: Spacing.sm },
    // ── Info Card ─────────────────────────────────────────────
    infoCard: {
      padding: Spacing.lg,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
    },
    infoLabel: { ...Typography.bodySmall },
    infoValue: { ...Typography.bodyMedium },
    // ── Body Stats & Daily Goals ──────────────────────────────
    statsIntro: {
      ...Typography.caption,
      marginTop: -Spacing.sm,
      marginBottom: Spacing.md,
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
    genderRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
      marginTop: Spacing.xs,
    },
    genderChip: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
    },
    genderChipText: {
      ...Typography.caption,
      fontWeight: '600',
    },
    targetsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      marginTop: Spacing.lg,
    },
    targetItem: {
      flex: 1,
      alignItems: 'center',
    },
    targetValue: {
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    targetLabel: {
      ...Typography.caption,
      marginTop: 2,
    },
    targetDivider: {
      width: 1,
      height: 24,
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
    // ── Progression Badges ────────────────────────────────────
    badgesCard: {
      padding: Spacing.lg,
    },
    badgesIntro: {
      ...Typography.caption,
      marginTop: -Spacing.sm,
      marginBottom: Spacing.md,
    },
    badgesEmpty: {
      ...Typography.bodySmall,
      paddingVertical: Spacing.md,
    },
    badgeRow: {
      flexDirection: 'row',
      paddingVertical: Spacing.md,
    },
    badgeEmojiWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    badgeEmoji: {
      fontSize: 22,
    },
    badgeInfo: {
      flex: 1,
    },
    badgeNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badgeName: {
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    badgeEarnedTag: {
      ...Typography.captionMedium,
      fontWeight: '700',
    },
    badgeDesc: {
      ...Typography.caption,
      marginTop: 2,
      lineHeight: 17,
    },
    badgeProgressBg: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: Spacing.sm,
    },
    badgeProgressFill: {
      height: 6,
      borderRadius: 3,
    },
    badgeProgressText: {
      ...Typography.caption,
      marginTop: Spacing.xs,
    },
    // ── Tags ──────────────────────────────────────────────────
    tagRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.md },
    tagLabel: { ...Typography.caption, marginRight: Spacing.sm, marginTop: 3 },
    tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    tag: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: BorderRadius.full,
    },
    tagText: { ...Typography.caption },
    tagPurple: {},
    tagTextPurple: {},
    // ── Menu ──────────────────────────────────────────────────
    menuItem: {
      padding: Spacing.lg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    menuItemText: { ...Typography.body },
    menuArrow: { ...Typography.body },
    // ── Logout ────────────────────────────────────────────────
    logoutBtn: {
      marginTop: Spacing['2xl'],
      paddingVertical: Spacing.lg,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      borderWidth: 1,
    },
    logoutBtnText: { ...Typography.bodyMedium, fontWeight: '600' },
  });
}
