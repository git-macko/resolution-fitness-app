// Resolution Fitness App — Register Screen
// Registration form with email/password + navigation to onboarding.
// Theme-aware.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter email and password.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password', 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Onboarding' }],
      });
    } catch (err) {
      Alert.alert('Registration Failed', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* ── Header ────────────────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>
              Start your fitness journey today
            </Text>
          </View>

          {/* ── Form ──────────────────────────────────────────── */}
          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Footer ────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.footerLink}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.footerText}>
              Already have an account?{' '}
              <Text style={styles.footerLinkText}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing['2xl'],
      paddingVertical: Spacing['4xl'],
    },
    header: {
      marginBottom: Spacing['3xl'],
    },
    headerTitle: {
      ...Typography.h1,
      color: colors.title,
      marginBottom: Spacing.xs,
    },
    headerSubtitle: {
      ...Typography.bodySmall,
      color: colors.textSecondary,
    },
    formSection: {
      marginBottom: Spacing['3xl'],
    },
    inputGroup: {
      marginBottom: Spacing.lg,
    },
    label: {
      ...Typography.captionMedium,
      color: colors.textSecondary,
      marginBottom: Spacing.sm,
    },
    input: {
      ...Typography.body,
      backgroundColor: colors.surfaceMuted,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md + 2,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.lg,
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    buttonDisabled: {
      backgroundColor: colors.accentSoft,
    },
    buttonText: {
      ...Typography.bodyMedium,
      color: colors.textInverse,
      fontWeight: '700',
    },
    footerLink: {
      alignItems: 'center',
    },
    footerText: {
      ...Typography.bodySmall,
      color: colors.textSecondary,
    },
    footerLinkText: {
      color: colors.accent,
      fontWeight: '600',
    },
  });
}
