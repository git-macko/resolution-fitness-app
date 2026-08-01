// Resolution Fitness App — Account Screen
// User profile, stats, settings, and account management.
// Theme-aware.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Pressable, Animated,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Card from '../components/Card';
import MimiMark from '../components/MimiMark';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Layout } from '../theme/spacing';
import { heroGradient, heroStart, heroEnd, cardShadows } from '../theme/card';
import usePressScale from '../utils/usePressScale';

/**
 * AnimatedCounter — counts up from 0 to `value` with a subtle spring-pulse
 * flourish when the count completes. Used inside the gradient profile
 * card to animate stat numbers on mount / value change.
 */
function AnimatedCounter({ value, style, prefix = '' }) {
  const [display, setDisplay] = useState(prefix + '0');
  const animRef = useRef(new Animated.Value(0));
  const scaleRef = useRef(new Animated.Value(1));

  useEffect(() => {
    const anim = animRef.current;
    anim.setValue(0);

    const listener = anim.addListener(({ value: v }) => {
      setDisplay(prefix + Math.round(v).toString());
    });

    Animated.timing(anim, {
      toValue: value,
      duration: 800,
      useNativeDriver: false,
    }).start(() => {
      Animated.sequence([
        Animated.spring(scaleRef.current, { toValue: 1.15, useNativeDriver: true }),
        Animated.spring(scaleRef.current, { toValue: 1, useNativeDriver: true }),
      ]).start();
    });

    return () => anim.removeListener(listener);
  }, [value, prefix]);

  return (
    <Animated.Text style={[style, { transform: [{ scale: scaleRef.current }] }]}>
      {display}
    </Animated.Text>
  );
}

export default function AccountScreen({ navigation }) {
  const { user, updateUser, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const mimiPress = usePressScale(0.92);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data.data || data || {});
    } catch (err) {
      console.warn('Settings fetch failed:', err.message);
    } finally {
      setLoading(false);
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

  // ── Stats row entrance animation (fade + slide up) ──────
  const statsRowOpacity = useRef(new Animated.Value(0)).current;
  const statsRowTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!loading) {
      const delay = setTimeout(() => {
        Animated.parallel([
          Animated.timing(statsRowOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(statsRowTranslateY, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
      }, 600);
      return () => clearTimeout(delay);
    }
  }, [loading]);

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
        <Text style={[styles.headerTitle, { color: colors.textHeading }]}>Account</Text>
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
        {/* ── Profile Card (Gradient) ─────────────────────────── */}
        <View style={[styles.gradientProfileOuter, cardShadows.strong]}>
          <LinearGradient
            colors={[heroGradient.start, heroGradient.end]}
            locations={[heroGradient.startLocation, heroGradient.endLocation]}
            start={heroStart}
            end={heroEnd}
            style={styles.gradientProfileInner}
          >
            <TouchableOpacity onPress={handlePickPhoto}>
              <View style={[styles.avatar, { backgroundColor: colors.accentBg }]}>
                {user?.photoUrl ? (
                  <Image source={{ uri: user.photoUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarPlaceholder, { color: colors.accent }]}>
                    {(user?.displayName || 'A')[0].toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={styles.changePhotoHint}>Change photo</Text>
            </TouchableOpacity>
            <Text style={styles.displayName}>{user?.displayName || 'Athlete'}</Text>
            <Text style={styles.email}>{user?.email || ''}</Text>
            <Animated.View style={[styles.profileStatsRow, { opacity: statsRowOpacity, transform: [{ translateY: statsRowTranslateY }] }]}>
              <View style={styles.profileStatItem}>
                <AnimatedCounter value={stats.totalWorkouts || 0} style={styles.profileStatValue} />
                <Text style={styles.profileStatLabel}>Workouts</Text>
              </View>
              <View style={styles.profileStatDivider} />
              <View style={styles.profileStatItem}>
                <AnimatedCounter value={stats.currentStreak || 0} style={styles.profileStatValue} />
                <Text style={styles.profileStatLabel}>Day Streak</Text>
              </View>
              <View style={styles.profileStatDivider} />
              <View style={styles.profileStatItem}>
                <AnimatedCounter value={stats.fitnessLevel || 1} style={styles.profileStatValue} prefix="Lv." />
                <Text style={styles.profileStatLabel}>Level</Text>
              </View>
            </Animated.View>
          </LinearGradient>
        </View>

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
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md },
    marginBottom: { marginBottom: Spacing.lg },
    marginBottomMd: { marginBottom: Spacing.md },
    // ── Gradient Profile Card ────────────────────────────────
    gradientProfileOuter: {
      borderRadius: BorderRadius.lg,
      backgroundColor: heroGradient.start,
      marginBottom: Spacing.lg,
    },
    gradientProfileInner: {
      borderRadius: BorderRadius.lg,
      padding: Spacing['2xl'],
      alignItems: 'center',
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    avatarImage: { width: 80, height: 80, borderRadius: 40 },
    avatarPlaceholder: { ...Typography.h2 },
    changePhotoHint: { ...Typography.caption, color: 'rgba(255, 255, 255, 0.75)', marginTop: Spacing.sm },
    displayName: { ...Typography.h3, color: '#FFFFFF', marginTop: Spacing.lg },
    email: { ...Typography.bodySmall, color: 'rgba(255, 255, 255, 0.75)', marginTop: 2 },
    // ── Profile Stats Row (inside gradient card) ────────────
    profileStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.xl,
      paddingTop: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: 'rgba(255, 255, 255, 0.2)',
    },
    profileStatItem: { flex: 1, alignItems: 'center' },
    profileStatValue: { ...Typography.statSmall, color: '#FFFFFF' },
    profileStatLabel: { ...Typography.caption, color: 'rgba(255, 255, 255, 0.65)', marginTop: 2 },
    profileStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255, 255, 255, 0.2)' },
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
