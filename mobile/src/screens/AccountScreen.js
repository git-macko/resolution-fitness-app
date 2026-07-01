// Resolution Fitness App — Account Screen
// User profile, stats, settings, and account management.

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
import Colors from '../theme/colors';
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
      // Subtle spring-pulse flourish on completion
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const stats = user?.stats || {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account</Text>
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
              <View style={styles.avatar}>
                {user?.photoUrl ? (
                  <Image source={{ uri: user.photoUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarPlaceholder}>
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
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fitness Level</Text>
            <Text style={styles.infoValue}>
              {(user?.fitnessLevel || 'beginner').charAt(0).toUpperCase() +
                (user?.fitnessLevel || 'beginner').slice(1)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Goal</Text>
            <Text style={styles.infoValue}>
              {(user?.primaryGoal || 'general').replace(/_/g, ' ')}
            </Text>
          </View>
          {user?.gender && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Gender</Text>
              <Text style={styles.infoValue}>{user.gender}</Text>
            </View>
          )}
          {user?.heightCm > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Height</Text>
              <Text style={styles.infoValue}>{user.heightCm} cm</Text>
            </View>
          )}
        </Card>

        {/* ── Allergies & Diet ─────────────────────────────────── */}
        {(user?.allergies?.length > 0 || user?.dietaryPrefs?.length > 0) && (
          <Card style={styles.marginBottom} contentStyle={styles.infoCard}>
            <Text style={styles.sectionTitle}>Diet & Allergies</Text>
            {user?.allergies?.length > 0 && (
              <View style={styles.tagRow}>
                <Text style={styles.tagLabel}>Allergies:</Text>
                <View style={styles.tags}>
                  {user.allergies.map((a, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{a}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {user?.dietaryPrefs?.length > 0 && (
              <View style={styles.tagRow}>
                <Text style={styles.tagLabel}>Diet:</Text>
                <View style={styles.tags}>
                  {user.dietaryPrefs.map((d, i) => (
                    <View key={i} style={[styles.tag, styles.tagPurple]}>
                      <Text style={[styles.tagText, styles.tagTextPurple]}>{d}</Text>
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
          <Text style={styles.menuItemText}>⚙️  Settings</Text>
          <Text style={styles.menuArrow}>→</Text>
        </Card>

        {/* ── Logout ───────────────────────────────────────────── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.offWhite },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.offWhite },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Layout.screenTopPadding,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { ...Typography.h1, color: Colors.black },
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
  scrollContent: { padding: Spacing.xl },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md },
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
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { ...Typography.h2, color: Colors.primary },
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
    borderBottomColor: Colors.gray100,
  },
  infoLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  infoValue: { ...Typography.bodyMedium, color: Colors.textPrimary },
  // ── Tags ──────────────────────────────────────────────────
  tagRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.md },
  tagLabel: { ...Typography.caption, color: Colors.textSecondary, marginRight: Spacing.sm, marginTop: 3 },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  tagText: { ...Typography.caption, color: Colors.error },
  tagPurple: { backgroundColor: Colors.primaryBg },
  tagTextPurple: { color: Colors.primary },
  // ── Menu ──────────────────────────────────────────────────
  menuItem: {
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuItemText: { ...Typography.body, color: Colors.textPrimary },
  menuArrow: { ...Typography.body, color: Colors.textMuted },
  // ── Logout ────────────────────────────────────────────────
  logoutBtn: {
    marginTop: Spacing['2xl'],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  logoutBtnText: { ...Typography.bodyMedium, color: Colors.error, fontWeight: '600' },
});
