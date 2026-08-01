// Resolution Fitness App — Scan History Screen
// Lists previously scanned foods with quick re-log actions.
// Theme-aware.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../api/client';
import { BASE_URL } from '../api/config';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';
import Card from '../components/Card';

export default function ScanHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.getScanHistory();
      setHistory(data.data || data || []);
    } catch (err) {
      console.warn('Scan history fetch failed:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const handleReLog = async (scanId, mealType) => {
    try {
      await api.logScannedFood(scanId, mealType);
      navigation.navigate('HealthHome');
    } catch (err) {
      console.warn('Re-log failed:', err.message);
    }
  };

  const renderItem = ({ item }) => {
    const detected = item.detectedFoods || [];
    const firstFood = detected[0] || 'Unknown food';
    const photoUrl = item.photoUrl ? `${BASE_URL}${item.photoUrl}` : null;
    const dishName = item.name || firstFood;
    const ingredientsPreview = item.ingredients?.slice(0, 3).join(', ') || '';

    return (
      <Card style={styles.card} contentStyle={styles.cardInner}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardTouchable}
          onPress={() => navigation.navigate('FoodScan', { pastScan: item })}
        >
          <View style={styles.cardRow}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, { backgroundColor: colors.divider, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: 24 }}>🍽️</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={[styles.foodTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {dishName}
              </Text>
              {ingredientsPreview ? (
                <Text style={[styles.foodIngredients, { color: colors.textMuted }]} numberOfLines={1}>
                  {ingredientsPreview}
                </Text>
              ) : null}
              <Text style={[styles.foodMeta, { color: colors.textMuted }]}>
                {item.calories || 0} cal • {item.proteinG || 0}g protein
              </Text>
              <Text style={[styles.foodDate, { color: colors.textMuted }]}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <View style={[styles.scoreBadge, { backgroundColor: colors.accentBg }]}>
              <Text style={[styles.scoreText, { color: colors.accent }]}>{item.healthScore || 0}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.logRow}>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: colors.accentBg }]}
            onPress={() => handleReLog(item.id, 'preworkout')}
          >
            <Text style={[styles.logBtnText, { color: colors.accent }]}>⚡ Pre</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: colors.accentBg }]}
            onPress={() => handleReLog(item.id, 'postworkout')}
          >
            <Text style={[styles.logBtnText, { color: colors.accent }]}>🔄 Post</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: colors.accent }]}
            onPress={() => handleReLog(item.id, 'general')}
          >
            <Text style={[styles.logBtnText, { color: colors.textInverse }]}>🥗 Log</Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No scans yet. Snap your first meal!
            </Text>
          </View>
        }
      />
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: Spacing.xl, paddingBottom: Spacing['4xl'] },
    card: {
      marginBottom: Spacing.md,
    },
    cardInner: {
      padding: Spacing.lg,
    },
    cardTouchable: {
      width: '100%',
    },
    foodIngredients: {
      ...Typography.caption,
      marginTop: 2,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center' },
    thumb: {
      width: 64,
      height: 64,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.divider,
    },
    cardContent: { flex: 1, marginHorizontal: Spacing.md },
    foodTitle: { ...Typography.bodyMedium, fontWeight: '600' },
    foodMeta: { ...Typography.caption, marginTop: 2 },
    foodDate: { ...Typography.caption, marginTop: 2 },
    scoreBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreText: { ...Typography.bodyMedium, fontWeight: '700' },
    logRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    logBtn: {
      flex: 1,
      borderRadius: BorderRadius.md,
      paddingVertical: Spacing.md,
      alignItems: 'center',
    },
    logBtnText: { ...Typography.captionMedium, fontWeight: '600' },
    empty: { padding: Spacing['3xl'], alignItems: 'center' },
    emptyText: { ...Typography.bodySmall, textAlign: 'center' },
  });
}
