// Resolution Fitness App — Food Scan Screen
// AI-powered photo nutrition analysis with allergen detection.
// Theme-aware.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../api/client';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';

export default function FoodScanScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [imageUri, setImageUri] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [logging, setLogging] = useState(false);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission', 'Camera permission is needed to scan food.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setScanResult(null);
    }
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission', 'Photo library access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setScanResult(null);
    }
  };

  const handleScan = async () => {
    if (!imageUri) return;
    setScanning(true);
    try {
      const data = await api.scanFood(imageUri);
      const result = data.data || data;
      setScanResult(result);
    } catch (err) {
      Alert.alert('Scan Failed', err.message || 'Could not analyze the food. Try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleLogFood = async (mealType = 'general') => {
    if (!scanResult?.id && !scanResult?.scanId) return;
    setLogging(true);
    try {
      await api.logScannedFood(
        scanResult.id || scanResult.scanId,
        mealType
      );
      Alert.alert('Logged!', `Food added to your ${mealType} meals.`);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to log food.');
    } finally {
      setLogging(false);
    }
  };

  const detectedFoods = scanResult?.detectedFoods || scanResult?.foods || [];
  const healthScore = scanResult?.healthScore ?? scanResult?.health_score ?? 0;
  const allergens = scanResult?.allergenFlags || scanResult?.allergen_flags || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* ── Image Area ──────────────────────────────────────── */}
      {imageUri ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={[styles.image, { backgroundColor: colors.divider }]} />
          <TouchableOpacity
            style={[styles.changeImageBtn, { backgroundColor: colors.overlay }]}
            onPress={() => setImageUri(null)}
          >
            <Text style={[styles.changeImageText, { color: colors.textInverse }]}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.uploadArea, { backgroundColor: colors.surface }]}>
          <Text style={styles.uploadIcon}>📸</Text>
          <Text style={[styles.uploadTitle, { color: colors.title }]}>Scan Your Food</Text>
          <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>
            Take a photo of your meal to see nutrition facts
          </Text>
          <View style={styles.uploadButtons}>
            <TouchableOpacity
              style={[styles.uploadBtn, { backgroundColor: colors.accent }]}
              onPress={takePhoto}
            >
              <Text style={[styles.uploadBtnText, { color: colors.textInverse }]}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
              onPress={pickFromGallery}
            >
              <Text style={[styles.uploadBtnSecondaryText, { color: colors.textSecondary }]}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Scan Button ───────────────────────────────────────── */}
      {imageUri && !scanResult && (
        <TouchableOpacity
          style={[styles.scanBtn, scanning && { backgroundColor: colors.accentSoft }, { backgroundColor: colors.accent }]}
          onPress={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={[styles.scanBtnText, { color: colors.textInverse }]}>🔍 Analyze Food</Text>
          )}
        </TouchableOpacity>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {scanResult && (
        <View style={styles.resultsSection}>
          <View style={[styles.scoreCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>Health Score</Text>
            <Text
              style={[
                styles.scoreValue,
                {
                  color:
                    healthScore >= 7 ? colors.success : healthScore >= 4 ? colors.warning : colors.error,
                },
              ]}
            >
              {healthScore}/10
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.title }]}>Detected</Text>
          {Array.isArray(detectedFoods)
            ? detectedFoods.map((food, idx) => (
                <View key={idx} style={[styles.foodItem, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.foodName, { color: colors.textPrimary }]}>
                    {typeof food === 'string' ? food : food.name || 'Food item'}
                  </Text>
                  {typeof food === 'object' && food.confidence && (
                    <Text style={[styles.foodConfidence, { color: colors.textMuted }]}>
                      {Math.round(food.confidence * 100)}% confidence
                    </Text>
                  )}
                </View>
              ))
            : (
              <Text style={[styles.foodSummary, { color: colors.textPrimary }]}>{String(detectedFoods)}</Text>
            )}

          <Text style={[styles.sectionTitle, { color: colors.title }]}>Nutrition (Estimated)</Text>
          <View style={styles.macroRow}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.accent }]}>{scanResult.calories || 0}</Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Calories</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.accent }]}>{scanResult.proteinG || 0}g</Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Protein</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.accent }]}>{scanResult.carbsG || 0}g</Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Carbs</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.accent }]}>{scanResult.fatG || 0}g</Text>
              <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Fat</Text>
            </View>
          </View>

          {scanResult.healthFacts ? (
            <View style={[styles.factsCard, { backgroundColor: colors.accentBg }]}>
              <Text style={[styles.factsTitle, { color: colors.accent }]}>Health Facts</Text>
              <Text style={[styles.factsText, { color: colors.textPrimary }]}>{scanResult.healthFacts}</Text>
            </View>
          ) : null}

          {allergens.length > 0 && (
            <View style={[styles.allergenCard, { backgroundColor: colors.accentWash, borderLeftColor: colors.error }]}>
              <Text style={[styles.allergenTitle, { color: colors.error }]}>⚠️ Allergen Alerts</Text>
              {allergens.map((allergen, idx) => (
                <Text key={idx} style={[styles.allergenItem, { color: colors.textPrimary }]}>
                  • {allergen}
                </Text>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: colors.title }]}>Add to your log?</Text>
          <View style={styles.logButtons}>
            <TouchableOpacity
              style={[styles.logBtn, { backgroundColor: colors.accentBg }]}
              onPress={() => handleLogFood('preworkout')}
              disabled={logging}
            >
              <Text style={[styles.logBtnText, { color: colors.accent }]}>⚡ Pre-Workout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logBtn, { backgroundColor: colors.accentBg }]}
              onPress={() => handleLogFood('postworkout')}
              disabled={logging}
            >
              <Text style={[styles.logBtnText, { color: colors.accent }]}>🔄 Post-Workout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logBtn, { backgroundColor: colors.accent }]}
              onPress={() => handleLogFood('general')}
              disabled={logging}
            >
              <Text style={[styles.logBtnGeneralText, { color: colors.textInverse }]}>🥗 General</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      padding: Spacing.xl,
      paddingBottom: Spacing['5xl'],
      backgroundColor: colors.background,
    },
    uploadArea: {
      borderRadius: BorderRadius.lg,
      padding: Spacing['3xl'],
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    uploadIcon: { fontSize: 48, marginBottom: Spacing.lg },
    uploadTitle: { ...Typography.h3, marginBottom: Spacing.sm },
    uploadSub: { ...Typography.bodySmall, textAlign: 'center', marginBottom: Spacing.xl },
    uploadButtons: { flexDirection: 'row', gap: Spacing.md },
    uploadBtn: {
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing['2xl'],
      paddingVertical: Spacing.md,
    },
    uploadBtnText: { ...Typography.bodyMedium, fontWeight: '600' },
    uploadBtnSecondary: {
      borderWidth: 1,
    },
    uploadBtnSecondaryText: { ...Typography.bodyMedium, fontWeight: '600' },
    imageContainer: { marginBottom: Spacing.xl },
    image: {
      width: '100%',
      height: 280,
      borderRadius: BorderRadius.lg,
    },
    changeImageBtn: {
      position: 'absolute',
      top: Spacing.md,
      right: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
    },
    changeImageText: { ...Typography.captionMedium },
    scanBtn: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    scanBtnText: { ...Typography.bodyMedium, fontWeight: '700' },
    resultsSection: { marginTop: Spacing.xl },
    scoreCard: {
      borderRadius: BorderRadius.md,
      padding: Spacing.xl,
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    scoreLabel: { ...Typography.caption },
    scoreValue: { ...Typography.stat, marginTop: Spacing.xs },
    sectionTitle: { ...Typography.bodyMedium, marginBottom: Spacing.md, marginTop: Spacing.lg },
    foodItem: {
      borderRadius: BorderRadius.sm,
      padding: Spacing.md,
      marginBottom: Spacing.xs,
    },
    foodName: { ...Typography.bodyMedium },
    foodConfidence: { ...Typography.caption, marginTop: 2 },
    foodSummary: { ...Typography.body },
    macroRow: { flexDirection: 'row', marginBottom: Spacing.xl },
    macroItem: { flex: 1, alignItems: 'center' },
    macroValue: { ...Typography.statSmall },
    macroLabel: { ...Typography.caption, marginTop: 2 },
    factsCard: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    factsTitle: { ...Typography.captionMedium, marginBottom: Spacing.sm },
    factsText: { ...Typography.bodySmall },
    allergenCard: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      marginBottom: Spacing.lg,
      borderLeftWidth: 3,
    },
    allergenTitle: { ...Typography.captionMedium, marginBottom: Spacing.sm },
    allergenItem: { ...Typography.bodySmall, marginBottom: 2 },
    logButtons: { gap: Spacing.sm },
    logBtn: {
      borderRadius: BorderRadius.md,
      padding: Spacing.lg,
      alignItems: 'center',
    },
    logBtnText: { ...Typography.bodyMedium, fontWeight: '600' },
    logBtnGeneralText: { ...Typography.bodyMedium, fontWeight: '600' },
  });
}
