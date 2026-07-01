// Resolution Fitness App — Login Screen
// Clean, minimal login form with email/password.
// Theme-aware: reads all colors from useTheme() so it renders correctly
// in both light and dark mode.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';
import Logo from '../components/Logo';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* ── Brand ──────────────────────────────────────────── */}
        <View style={styles.brandSection}>
          <Logo variant="full" size={200} style={{ marginBottom: Spacing.xs }} />
          <Text style={styles.tagline}>Your fitness, elevated.</Text>
        </View>

        {/* ── Form ───────────────────────────────────────────── */}
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Welcome back</Text>
          <Text style={styles.formSubtitle}>Sign in to continue your journey</Text>

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
              placeholder="Enter your password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Footer ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.footerLink}
          onPress={() => navigation.navigate('Register')}
        >
          <Text style={styles.footerText}>
            Don't have an account?{' '}
            <Text style={styles.footerLinkText}>Create one</Text>
          </Text>
        </TouchableOpacity>
      </View>
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
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing['2xl'],
    },
    // ── Brand ─────────────────────────────────────────────
    brandSection: {
      alignItems: 'center',
      marginBottom: Spacing['4xl'],
    },
    tagline: {
      ...Typography.bodySmall,
      color: colors.textSecondary,
      marginTop: Spacing.xs,
    },
    // ── Form ──────────────────────────────────────────────
    formSection: {
      marginBottom: Spacing['3xl'],
    },
    formTitle: {
      ...Typography.h2,
      color: colors.title,
      marginBottom: Spacing.xs,
    },
    formSubtitle: {
      ...Typography.bodySmall,
      color: colors.textSecondary,
      marginBottom: Spacing['2xl'],
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
    // ── Footer ────────────────────────────────────────────
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
