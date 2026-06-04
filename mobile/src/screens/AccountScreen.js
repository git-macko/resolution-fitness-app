// Resolution Fitness App — Account Screen
// User profile, stats, settings, and account management.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../theme/spacing';

export default function AccountScreen({ navigation }) {
  const { user, updateUser, logout } = useAuth();
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
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Profile Card ─────────────────────────────────────── */}
        <View style={[styles.profileCard, Shadows.md]}>
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
        </View>

        {/* ── Stats ────────────────────────────────────────────── */}
        <View style={[styles.statsCard, Shadows.sm]}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalWorkouts || 0}</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.currentStreak || 0}</Text>
              <Text style={styles.statLabel}>Day Streak</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.fitnessLevel || 1}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
          </View>
        </View>

        {/* ── Profile Info ─────────────────────────────────────── */}
        <View style={[styles.infoCard, Shadows.sm]}>
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
        </View>

        {/* ── Allergies & Diet ─────────────────────────────────── */}
        {(user?.allergies?.length > 0 || user?.dietaryPrefs?.length > 0) && (
          <View style={[styles.infoCard, Shadows.sm]}>
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
          </View>
        )}

        {/* ── Settings Link ────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.menuItem, Shadows.sm]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.menuItemText}>⚙️  Settings</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>

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
  },
  headerTitle: { ...Typography.h1, color: Colors.black },
  scrollContent: { padding: Spacing.xl },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md },
  // ── Profile Card ──────────────────────────────────────────
  profileCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing['2xl'],
    alignItems: 'center',
    marginBottom: Spacing.lg,
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
  changePhotoHint: { ...Typography.caption, color: Colors.primary, marginTop: Spacing.sm },
  displayName: { ...Typography.h3, color: Colors.black, marginTop: Spacing.lg },
  email: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  // ── Stats ─────────────────────────────────────────────────
  statsCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { ...Typography.statSmall, color: Colors.primary },
  statLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.gray200 },
  // ── Info Card ─────────────────────────────────────────────
  infoCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
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
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
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
