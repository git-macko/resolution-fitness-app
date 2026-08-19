// Resolution Fitness App — BuildInspirationCard
// Dashboard widget: a carousel of up to 3 user-uploaded inspiration photos.
// When no photos are uploaded, shows a clean prompt to add one.
//
// Props:
//  - data: { photos: [{id, photoUrl}] }
//  - onChange(nextData): called after upload/delete so the parent
//    can keep its dashboard state in sync.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import Card from './Card';
import CarouselDots from './CarouselDots';
import PhotoLightbox from './PhotoLightbox';
import api from '../api/client';
import { resolveImageUrl } from '../utils/imageUrl';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

const MAX_PHOTOS = 3;
const SLIDE_HEIGHT = 196;

// Format backend timestamps like "2026-08-09 04:12:33" (UTC) into a short
// readable date for the lightbox caption, e.g. "Added Aug 9, 2026".
function formatAddedDate(createdAt) {
  if (!createdAt) return '';
  const parsed = new Date(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  const label = parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Added ${label}`;
}

// Theme-independent layout styles for the slide images. Kept at module
// scope so the InspirationImage sub-component can use them without the
// theme hook.
const imgStyles = StyleSheet.create({
  slideImage: {
    width: '100%',
    height: SLIDE_HEIGHT,
    borderRadius: BorderRadius.md,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  imageFallbackEmoji: {
    fontSize: 48,
  },
});

export default function BuildInspirationCard({ data, onChange }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const photos = data?.photos || [];

  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { photos, index } | null
  const [reorderMode, setReorderMode] = useState(false);
  const [newPhotoIds, setNewPhotoIds] = useState(new Set());
  const [toast, setToast] = useState(null); // string message
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Track which photo IDs are new so we can animate them in.
  const prevPhotoIdsRef = useRef(new Set());
  useEffect(() => {
    const currentIds = new Set(photos.map((p) => p.id));
    const added = new Set();
    for (const id of currentIds) {
      if (!prevPhotoIdsRef.current.has(id)) added.add(id);
    }
    if (added.size > 0) {
      setNewPhotoIds(added);
      // Clear the "new" flag after the animation completes.
      const timer = setTimeout(() => setNewPhotoIds(new Set()), 600);
      return () => clearTimeout(timer);
    }
    prevPhotoIdsRef.current = currentIds;
  }, [photos]);

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const resizeImage = async (uri) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipulated.uri;
    } catch (err) {
      console.warn('Image resize failed, using original:', err.message);
      return uri;
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission', 'Camera permission is needed to add inspiration photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const resizedUri = await resizeImage(result.assets[0].uri);
      uploadPhoto(resizedUri);
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
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const resizedUri = await resizeImage(result.assets[0].uri);
      uploadPhoto(resizedUri);
    }
  };

  const choosePhotoSource = () => {
    Alert.alert('Add Inspiration', 'Where is your inspiration photo?', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (uri) => {
    setUploading(true);
    try {
      const res = await api.uploadInspirationPhoto(uri);
      const photo = res.data || res;
      emit({ photos: [...photosRef.current, photo] });
    } catch (err) {
      Alert.alert('Upload failed', err.message || 'Could not add that photo.');
    } finally {
      setUploading(false);
    }
  };

  // ── Toast helper ───────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setToast(null));
    toastTimerRef.current = setTimeout(() => setToast(null), 1700);
  }, [toastAnim]);

  const movePhoto = async (photoId, direction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const idx = photos.findIndex((p) => p.id === photoId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= photos.length) return;
    const reordered = [...photos];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    emit({ photos: reordered });
    try {
      await api.reorderInspirationPhotos(reordered.map((p) => p.id));
      showToast('Order saved ✨');
    } catch (err) {
      // Revert on failure.
      emit({ photos: photosRef.current });
      Alert.alert('Reorder failed', err.message || 'Please try again.');
    }
  };

  const removePhoto = (photo) => {
    Alert.alert('Remove photo?', 'This inspiration photo will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteInspirationPhoto(photo.id);
            emit({
              photos: photosRef.current.filter((p) => p.id !== photo.id),
            });
          } catch (err) {
            Alert.alert('Could not remove photo', err.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const hasPhotos = photos.length > 0;
  const slideCount = hasPhotos ? photos.length + (photos.length < MAX_PHOTOS ? 1 : 0) : 0;

  return (
    <Card style={styles.marginBottom} contentStyle={styles.content}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: colors.accent }]}>BUILD INSPIRATION</Text>
          <Text style={[styles.title, { color: colors.textHeading }]}>What inspires you? ✨</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            {hasPhotos
              ? `${photos.length}/${MAX_PHOTOS} photos that remind you why you train`
              : 'Add up to 3 photos that fuel your journey'}
          </Text>
          {hasPhotos && (
            <TouchableOpacity
              onPress={() => setReorderMode((v) => !v)}
              activeOpacity={0.7}
              style={styles.reorderToggle}
            >
              <Text style={[styles.reorderToggleText, { color: colors.accent }]}>
                {reorderMode ? 'Done' : 'Reorder'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Photo carousel ─────────────────────────────────── */}
      {hasPhotos ? (
        <>
          <View
            style={styles.carousel}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          >
            {width > 0 && (
              <ScrollView
                horizontal
                nestedScrollEnabled
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                  setActiveIndex(Math.max(0, Math.min(slideCount - 1, idx)));
                }}
              >
                {photos.map((photo, idx) => (
                  <View key={photo.id} style={[styles.slide, { width }]}>
                    <AnimatedPhoto
                      url={photo.photoUrl}
                      colors={colors}
                      isNew={newPhotoIds.has(photo.id)}
                      onPress={() => {
                        if (reorderMode) return;
                        setLightbox({
                          photos: photos.map((p) => ({ ...p, sub: formatAddedDate(p.createdAt) })),
                          index: idx,
                        });
                      }}
                      accessibilityLabel={`View inspiration photo ${idx + 1} full screen`}
                    />
                    {reorderMode ? (
                      <>
                        {/* ── Position badge ── */}
                        <View style={[styles.positionBadge, { backgroundColor: colors.accent }]}>                           <Text style={[styles.positionBadgeText, { color: colors.heroText }]}>{idx + 1}</Text>
                        </View>
                        <View style={styles.reorderControls}>
                          <TouchableOpacity
                            style={[styles.reorderBtn, { backgroundColor: colors.overlay }, idx === 0 && styles.reorderBtnDisabled]}
                            onPress={() => movePhoto(photo.id, -1)}
                            disabled={idx === 0}
                            accessibilityLabel="Move photo left"
                          >                             <Text style={[styles.reorderBtnText, { color: colors.heroText }]}>◀</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.reorderBtn, { backgroundColor: colors.overlay }, idx === photos.length - 1 && styles.reorderBtnDisabled]}
                            onPress={() => movePhoto(photo.id, 1)}
                            disabled={idx === photos.length - 1}
                            accessibilityLabel="Move photo right"
                          >                             <Text style={[styles.reorderBtnText, { color: colors.heroText }]}>▶</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={[styles.deleteBtn, { backgroundColor: colors.overlay }]}
                        onPress={() => removePhoto(photo)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove inspiration photo"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >                         <Text style={[styles.deleteText, { color: colors.heroText }]}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <View style={[styles.slide, { width }]}>
                    <AddTile onPress={choosePhotoSource} uploading={uploading} colors={colors} styles={styles} />
                  </View>
                )}
              </ScrollView>
            )}
          </View>
          <CarouselDots count={slideCount} activeIndex={activeIndex} />
        </>
      ) : (
        /* ── Empty state (no photos) ─────────────────────── */
        <TouchableOpacity
          style={[styles.emptyState, { backgroundColor: colors.accentBg, borderColor: colors.divider }]}
          onPress={choosePhotoSource}
          activeOpacity={0.7}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <>
              <Text style={styles.emptyEmoji}>📸</Text>
              <Text style={[styles.emptyTitle, { color: colors.accent }]}>Add your first inspiration photo</Text>
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                Tap here or use the + button to add up to {MAX_PHOTOS} photos
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* ── Toast ────────────────────────────────────────── */}
      {toast ? (
        <Animated.View
          style={[styles.toast, { backgroundColor: colors.accent, opacity: toastAnim }]}
          pointerEvents="none"
        >           <Text style={[styles.toastText, { color: colors.heroText }]}>{toast}</Text>
        </Animated.View>
      ) : null}

      {/* ── Full-screen viewer ────────────────────────────── */}
      <PhotoLightbox
        visible={lightbox !== null}
        photos={lightbox?.photos || []}
        startIndex={lightbox?.index || 0}
        onClose={() => setLightbox(null)}
      />
    </Card>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function AnimatedPhoto({ url, colors, isNew, onPress, accessibilityLabel }) {
  const [failed, setFailed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const scaleAnim = useRef(new Animated.Value(isNew ? 0.85 : 1)).current;

  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      ]).start();
    }
  }, [isNew, fadeAnim, scaleAnim]);

  const content = failed || !url ? (
    <View style={[imgStyles.slideImage, imgStyles.imageFallback, { backgroundColor: colors.accentBg }]}>
      <Text style={imgStyles.imageFallbackEmoji}>📸</Text>
    </View>
  ) : (
    <Image
      source={{ uri: resolveImageUrl(url) }}
      style={[imgStyles.slideImage, { backgroundColor: colors.divider }]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
        {content}
      </Animated.View>
    </TouchableOpacity>
  );
}

function AddTile({ onPress, uploading, colors, styles }) {
  return (
    <TouchableOpacity
      style={[styles.addTile, { borderColor: colors.divider, backgroundColor: colors.surfaceMuted }]}
      onPress={onPress}
      disabled={uploading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Add inspiration photo"
    >
      {uploading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Text style={[styles.addTilePlus, { color: colors.accent }]}>+</Text>
          <Text style={[styles.addTileText, { color: colors.textSecondary }]}>Add photo</Text>
        </>
      )}
    </TouchableOpacity>
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
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    headerText: {
      flex: 1,
    },
    label: {
      ...Typography.label,
      marginBottom: Spacing.xs,
    },
    title: {
      ...Typography.h4,
      fontWeight: '700',
    },
    caption: {
      ...Typography.caption,
      marginTop: 2,
    },
    carousel: {
      overflow: 'hidden',
      borderRadius: BorderRadius.md,
    },
    slide: {
      height: SLIDE_HEIGHT,
    },
    deleteBtn: {
      position: 'absolute',
      top: Spacing.sm,
      right: Spacing.sm,
      width: 28,
      height: 28,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteText: {
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 18,
    },
    addTile: {
      height: SLIDE_HEIGHT,
      borderRadius: BorderRadius.md,
      borderWidth: 2,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addTilePlus: {
      fontSize: 40,
      fontWeight: '300',
      lineHeight: 46,
    },
    addTileText: {
      ...Typography.caption,
      marginTop: Spacing.xs,
    },
    emptyState: {
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing['2xl'],
      paddingVertical: Spacing['3xl'],
    },
    emptyEmoji: {
      fontSize: 48,
      marginBottom: Spacing.md,
    },
    emptyTitle: {
      ...Typography.bodySmall,
      fontWeight: '600',
      textAlign: 'center',
    },
    emptyHint: {
      ...Typography.caption,
      textAlign: 'center',
      marginTop: Spacing.xs,
    },
    reorderToggle: {
      marginTop: Spacing.xs,
    },
    reorderToggleText: {
      ...Typography.captionMedium,
      fontWeight: '600',
    },
    reorderControls: {
      position: 'absolute',
      bottom: Spacing.sm,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    reorderBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reorderBtnDisabled: {
      opacity: 0.3,
    },
    reorderBtnText: {
      fontSize: 14,
      fontWeight: '700',
    },
    positionBadge: {
      position: 'absolute',
      top: Spacing.sm,
      left: Spacing.sm,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    positionBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 14,
    },
    toast: {
      position: 'absolute',
      bottom: Spacing.xl,
      alignSelf: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.full,
      zIndex: 10,
      elevation: 6,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    toastText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
