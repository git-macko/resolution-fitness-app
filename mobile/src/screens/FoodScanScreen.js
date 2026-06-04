// Resolution Fitness App — Food Scan Screen
// Allows the user to take/upload a photo of food
// and get AI-powered nutrition analysis with allergen flags.

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../api/client';
import Colors from '../theme/colors';
import Typography from '../theme/typography';
import { Spacing, BorderRadius, Shadows } from '../theme/spacing';

export default function FoodScanScreen({ navigation }) {
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
      {/* ── Image Area ────────────────────────────────────────── */}
      {imageUri ? (
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} />
          <TouchableOpacity
            style={styles.changeImageBtn}
            onPress={() => setImageUri(null)}
          >
            <Text style={styles.changeImageText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.uploadArea}>
          <Text style={styles.uploadIcon}>📸</Text>
          <Text style={styles.uploadTitle}>Scan Your Food</Text>
          <Text style={styles.uploadSub}>
            Take a photo of your meal to see nutrition facts
          </Text>
          <View style={styles.uploadButtons}>
            <TouchableOpacity style={styles.uploadBtn} onPress={takePhoto}>
              <Text style={styles.uploadBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadBtn, styles.uploadBtnSecondary]}
              onPress={pickFromGallery}
            >
              <Text style={styles.uploadBtnSecondaryText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Scan Button ──────────────────────────────────────── */}
      {imageUri && !scanResult && (
        <TouchableOpacity
          style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
          onPress={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.scanBtnText}>🔍 Analyze Food</Text>
          )}
        </TouchableOpacity>
      )}

      {/* ── Results ──────────────────────────────────────────── */}
      {scanResult && (
        <View style={styles.resultsSection}>
          {/* Health Score */}
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>Health Score</Text>
            <Text
              style={[
                styles.scoreValue,
                { color: healthScore >= 7 ? Colors.success : healthScore >= 4 ? Colors.warning : Colors.error },
              ]}
            >
              {healthScore}/10
            </Text>
          </View>

          {/* Detected Foods */}
          <Text style={styles.sectionTitle}>Detected</Text>
          {Array.isArray(detectedFoods)
            ? detectedFoods.map((food, idx) => (
                <View key={idx} style={styles.foodItem}>
                  <Text style={styles.foodName}>
                    {typeof food === 'string' ? food : food.name || 'Food item'}
                  </Text>
                  {typeof food === 'object' && food.confidence && (
                    <Text style={styles.foodConfidence}>
                      {Math.round(food.confidence * 100)}% confidence
                    </Text>
                  )}
                </View>
              ))
            : (
                <Text style={styles.foodSummary}>{String(detectedFoods)}</Text>
              )
          }

          {/* Macros */}
          <Text style={styles.sectionTitle}>Nutrition (Estimated)</Text>
          <View style={styles.macroRow}>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{scanResult.calories || 0}</Text>
              <Text style={styles.macroLabel}>Calories</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{scanResult.proteinG || 0}g</Text>
              <Text style={styles.macroLabel}>Protein</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{scanResult.carbsG || 0}g</Text>
              <Text style={styles.macroLabel}>Carbs</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroValue}>{scanResult.fatG || 0}g</Text>
              <Text style={styles.macroLabel}>Fat</Text>
            </View>
          </View>

          {/* Health Facts */}
          {scanResult.healthFacts ? (
            <View style={styles.factsCard}>
              <Text style={styles.factsTitle}>Health Facts</Text>
              <Text style={styles.factsText}>{scanResult.healthFacts}</Text>
            </View>
          ) : null}

          {/* Allergen Flags */}
          {allergens.length > 0 && (
            <View style={styles.allergenCard}>
              <Text style={styles.allergenTitle}>⚠️ Allergen Alerts</Text>
              {allergens.map((allergen, idx) => (
                <Text key={idx} style={styles.allergenItem}>
                  • {allergen}
                </Text>
              ))}
            </View>
          )}

          {/* Log Buttons */}
          <Text style={styles.sectionTitle}>Add to your log?</Text>
          <View style={styles.logButtons}>
            <TouchableOpacity
              style={styles.logBtn}
              onPress={() => handleLogFood('preworkout')}
              disabled={logging}
            >
              <Text style={styles.logBtnText}>⚡ Pre-Workout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logBtn}
              onPress={() => handleLogFood('postworkout')}
              disabled={logging}
            >
              <Text style={styles.logBtnText}>🔄 Post-Workout</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logBtn, styles.logBtnGeneral]}
              onPress={() => handleLogFood('general')}
              disabled={logging}
            >
              <Text style={styles.logBtnGeneralText}>🥗 General</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
    paddingBottom: Spacing['5xl'],
    backgroundColor: Colors.offWhite,
  },
  // ── Upload Area ───────────────────────────────────────────
  uploadArea: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3xl'],
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  uploadIcon: { fontSize: 48, marginBottom: Spacing.lg },
  uploadTitle: { ...Typography.h3, color: Colors.black, marginBottom: Spacing.sm },
  uploadSub: { ...Typography.bodySmall, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  uploadButtons: { flexDirection: 'row', gap: Spacing.md },
  uploadBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
  },
  uploadBtnText: { ...Typography.bodyMedium, color: Colors.white, fontWeight: '600' },
  uploadBtnSecondary: {
    backgroundColor: Colors.offWhite,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  uploadBtnSecondaryText: { ...Typography.bodyMedium, color: Colors.textSecondary, fontWeight: '600' },
  // ── Image ─────────────────────────────────────────────────
  imageContainer: { marginBottom: Spacing.xl },
  image: {
    width: '100%',
    height: 280,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.gray200,
  },
  changeImageBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.overlay,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  changeImageText: { ...Typography.captionMedium, color: Colors.white },
  // ── Scan Button ───────────────────────────────────────────
  scanBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  scanBtnDisabled: { backgroundColor: Colors.primaryLight },
  scanBtnText: { ...Typography.bodyMedium, color: Colors.white, fontWeight: '700' },
  // ── Results ───────────────────────────────────────────────
  resultsSection: { marginTop: Spacing.xl },
  scoreCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  scoreLabel: { ...Typography.caption, color: Colors.textSecondary },
  scoreValue: { ...Typography.stat, marginTop: Spacing.xs },
  sectionTitle: { ...Typography.bodyMedium, color: Colors.black, marginBottom: Spacing.md, marginTop: Spacing.lg },
  foodItem: {
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  foodName: { ...Typography.bodyMedium, color: Colors.textPrimary },
  foodConfidence: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  foodSummary: { ...Typography.body, color: Colors.textPrimary },
  macroRow: { flexDirection: 'row', marginBottom: Spacing.xl },
  macroItem: { flex: 1, alignItems: 'center' },
  macroValue: { ...Typography.statSmall, color: Colors.primary },
  macroLabel: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  factsCard: {
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  factsTitle: { ...Typography.captionMedium, color: Colors.primary, marginBottom: Spacing.sm },
  factsText: { ...Typography.bodySmall, color: Colors.textPrimary },
  allergenCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  allergenTitle: { ...Typography.captionMedium, color: Colors.error, marginBottom: Spacing.sm },
  allergenItem: { ...Typography.bodySmall, color: Colors.textPrimary, marginBottom: 2 },
  logButtons: { gap: Spacing.sm },
  logBtn: {
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  logBtnText: { ...Typography.bodyMedium, color: Colors.primary, fontWeight: '600' },
  logBtnGeneral: {
    backgroundColor: Colors.primary,
  },
  logBtnGeneralText: { ...Typography.bodyMedium, color: Colors.white, fontWeight: '600' },
});
