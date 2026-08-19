// Resolution Fitness App — PhotoLightbox
// Full-screen, swipeable photo viewer used by the dashboard's Build
// Inspiration card. Dark immersive background with a slide counter, a
// bottom caption bar, and zoom gestures on each photo:
//   ▸ pinch to zoom (1x–3x)
//   ▸ drag to pan while zoomed
//   ▸ double-tap to toggle 1x / 2.5x
//   ▸ single-tap anywhere to dismiss
//
// Props:
//  - visible: boolean — whether the lightbox is open
//  - photos:  [{ id?, photoUrl, caption?, sub? }] — slides to show
//  - startIndex: number — slide to open on
//  - onClose: () => void — dismiss callback

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar, PanResponder, Animated,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing } from '../theme/spacing';
import { resolveImageUrl } from '../utils/imageUrl';

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
// Must be >= DOUBLE_TAP_MS so the second tap of a double-tap always wins
// the race against the single-tap close timer.
const SINGLE_TAP_DELAY_MS = 320;

// Distance between two touches (pinch).
function touchDistance(t1, t2) {
  return Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
}

// Midpoint of two touches (pinch pivot).
function touchMidpoint(t1, t2) {
  return { x: (t1.pageX + t2.pageX) / 2, y: (t1.pageY + t2.pageY) / 2 };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export default function PhotoLightbox({ visible, photos = [], startIndex = 0, onClose }) {
  const { colors } = useTheme();
  // The component is unmounted while closed (early return below), so each
  // open is a fresh mount and lazy state init lands directly on the
  // requested slide — no reset effect needed.
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(startIndex, Math.max(0, photos.length - 1)))
  );
  const [width, setWidth] = useState(0);

  if (!visible || photos.length === 0) return null;

  const slideWidth = Math.max(1, width);
  const current = photos[index] || {};

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <StatusBar hidden />
      <View style={styles.container}>
        {/* ── Top bar: counter + close ─────────────────────── */}
        <View style={styles.topBar}>
          <Text style={styles.counter}>
            {index + 1} / {photos.length}
          </Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ── Paged photos ─────────────────────────────────── */}
        <View
          style={styles.carousel}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          {width > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: startIndex * slideWidth, y: 0 }}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
                setIndex(Math.max(0, Math.min(photos.length - 1, idx)));
              }}
            >
              {photos.map((photo, i) => (
                <View key={photo.id || i} style={[styles.page, { width: slideWidth }]}>
                  <ZoomableImage
                    url={photo.photoUrl}
                    colors={colors}
                    resetKey={photo.id || i}
                    onTap={onClose}
                    accessibilityLabel={`Inspiration photo ${i + 1} of ${photos.length}. Double-tap to zoom. Tap to close.`}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Caption bar ──────────────────────────────────── */}
        <View style={styles.captionBar}>
          <Text style={styles.captionTitle} numberOfLines={1}>
            {current.caption || `Inspiration photo ${index + 1}`}
          </Text>
          {current.sub ? (
            <Text style={styles.captionSub} numberOfLines={1}>
              {current.sub}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ── ZoomableImage ────────────────────────────────────────────────────
// One photo page. Handles pinch-to-zoom + pan (while zoomed) via a
// PanResponder that only claims the gesture once it's a pinch or a
// movement while zoomed — single-finger drags at 1x are left to the
// parent pager so swiping between photos still works. Tap detection
// lives on a TouchableOpacity wrapper so plain taps reach it.
function ZoomableImage({ url, colors, resetKey, onTap, accessibilityLabel }) {
  const [failed, setFailed] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const zoomRef = useRef(1); // current applied scale
  const gestureRef = useRef(null);
  const movedRef = useRef(false);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const onTapRef = useRef(onTap);
  // Container size lives in a ref (not state) so the mount-once PanResponder
  // closure always reads the latest measured dimensions.
  const containerRef = useRef({ width: 0, height: 0 });
  onTapRef.current = onTap;

  // Reset zoom whenever the photo changes (new page).
  useEffect(() => {
    scale.setValue(1);
    tx.setValue(0);
    ty.setValue(0);
    zoomRef.current = 1;
    movedRef.current = false;
    gestureRef.current = null;
  }, [resetKey, scale, tx, ty]);

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  const clampPan = useCallback((s, x, y, w, h) => {
    const maxX = Math.max(0, (w * s - w) / 2);
    const maxY = Math.max(0, (h * s - h) / 2);
    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  }, []);

  const toggleZoom = useCallback(() => {
    if (zoomRef.current > MIN_SCALE + 0.0001) {
      Animated.parallel([
        Animated.spring(scale, { toValue: MIN_SCALE, useNativeDriver: true }),
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
      ]).start();
      zoomRef.current = MIN_SCALE;
    } else {
      Animated.spring(scale, { toValue: DOUBLE_TAP_SCALE, useNativeDriver: true }).start();
      zoomRef.current = DOUBLE_TAP_SCALE;
    }
  }, [scale, tx, ty]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // Double-tap → toggle zoom (cancel the pending single-tap close).
      lastTapRef.current = 0;
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      toggleZoom();
      return;
    }
    lastTapRef.current = now;
    tapTimerRef.current = setTimeout(() => {
      if (typeof onTapRef.current === 'function') onTapRef.current();
    }, SINGLE_TAP_DELAY_MS);
  }, [toggleZoom]);

  const panResponder = useRef(
    PanResponder.create({
      // Only take over once it's clearly a pinch or a pan while zoomed —
      // taps and 1x horizontal swipes stay with the touchable / pager.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt) => {
        const touches = evt.nativeEvent.touches;
        return touches.length === 2 || zoomRef.current > MIN_SCALE + 0.0001;
      },
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        movedRef.current = false;
        if (touches.length === 2) {
          const mid = touchMidpoint(touches[0], touches[1]);
          gestureRef.current = {
            mode: 'pinch',
            startDist: touchDistance(touches[0], touches[1]),
            startScale: zoomRef.current,
            startTx: tx._value,
            startTy: ty._value,
            midX: mid.x,
            midY: mid.y,
          };
        } else {
          const t = touches[0] || evt.nativeEvent;
          gestureRef.current = {
            mode: 'pan',
            startX: t.pageX,
            startY: t.pageY,
            startTx: tx._value,
            startTy: ty._value,
          };
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        const g = gestureRef.current;
        if (!g) return;

        if (g.mode === 'pinch' && touches.length === 2) {
          movedRef.current = true;
          const dist = touchDistance(touches[0], touches[1]);
          const nextScale = clamp(MAX_SCALE, MIN_SCALE, g.startScale * (dist / g.startDist));
          const mid = touchMidpoint(touches[0], touches[1]);
          const w = containerRef.current.width;
          const h = containerRef.current.height;
          // Keep the pinch midpoint anchored: t' = u - (s'/s)(u - t).
          const ux = mid.x - w / 2;
          const uy = mid.y - h / 2;
          const ratio = nextScale / g.startScale;
          const clamped = clampPan(
            nextScale,
            ux - ratio * (ux - g.startTx),
            uy - ratio * (uy - g.startTy),
            w,
            h
          );
          scale.setValue(nextScale);
          tx.setValue(clamped.x);
          ty.setValue(clamped.y);
          zoomRef.current = nextScale;
          return;
        }

        if (g.mode === 'pan' && touches.length === 1) {
          const dx = touches[0].pageX - g.startX;
          const dy = touches[0].pageY - g.startY;
          if (Math.abs(dx) + Math.abs(dy) > 6) movedRef.current = true;
          const clamped = clampPan(zoomRef.current, g.startTx + dx, g.startTy + dy, containerRef.current.width, containerRef.current.height);
          tx.setValue(clamped.x);
          ty.setValue(clamped.y);
        }
      },
      onPanResponderRelease: (evt) => {
        const g = gestureRef.current;
        // A tap = single-finger gesture with no real movement.
        if (g && g.mode === 'pan' && !movedRef.current) {
          handleTap();
        }
        // Snap fully zoomed-out images back to a clean 1x/centered state.
        if (zoomRef.current <= MIN_SCALE + 0.0001) {
          Animated.parallel([
            Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
            Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
          ]).start();
        } else if (zoomRef.current < 1.15) {
          Animated.parallel([
            Animated.spring(scale, { toValue: MIN_SCALE, useNativeDriver: true }),
            Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
            Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
          ]).start();
          zoomRef.current = MIN_SCALE;
        }
        gestureRef.current = null;
        movedRef.current = false;
      },
      onPanResponderTerminate: () => {
        gestureRef.current = null;
        movedRef.current = false;
      },
    })
  ).current;

  if (failed || !url) {
    return (
      <TouchableOpacity
        style={[styles.pageInner, styles.fallback, { backgroundColor: colors.accentBg }]}
        activeOpacity={1}
        onPress={onTap}
        accessibilityRole="imagebutton"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={styles.fallbackEmoji}>🐼</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.pageInner}
      activeOpacity={1}
      onPress={handleTap}
      accessibilityRole="imagebutton"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[
          styles.pageInner,
          { transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
        ]}
        {...panResponder.panHandlers}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          containerRef.current = { width: w, height: h };
        }}
      >
        <Image
          source={{ uri: resolveImageUrl(url) }}
          style={styles.image}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.md,
  },
  counter: {
    ...Typography.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  carousel: {
    flex: 1,
  },
  page: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageInner: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
  },
  fallbackEmoji: {
    fontSize: 72,
  },
  captionBar: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing['3xl'],
    alignItems: 'center',
  },
  captionTitle: {
    ...Typography.bodyMedium,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  captionSub: {
    ...Typography.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
});
