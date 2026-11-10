// Resolution Fitness App — MobileFrame
//
// The app is a phone app. On a desktop browser it is contained in a device
// frame in the middle of the page, the way an emulator previews it, instead of
// being stretched across the whole window.
//
// Behaviour:
//   ▸ Native (iOS / Android) — renders children untouched.
//   ▸ Narrow browser window (a phone browsing the web) — children untouched,
//     so the app stays genuinely full screen.
//   ▸ Wider browser window — children are centred in a device frame with a
//     rounded bezel, camera cutout, home indicator and a soft shadow. The frame
//     is scaled down to fit the window, so an iPad preview still shows the
//     iPad's real 820pt layout rather than being squeezed into a narrow box.
//   ▸ A size switcher under the frame toggles between iPhone, Android phone,
//     iPad and Android tablet.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { BorderRadius, Spacing } from '../theme/spacing';

/**
 * Previewable devices. Sizes are logical (CSS) pixels:
 *   iPhone 15, Pixel 7, iPad Air 10.9", Galaxy Tab S8.
 * `cutout` is the camera treatment, `homeBar` the gesture indicator.
 */
export const DEVICE_PRESETS = [
  {
    id: 'iphone',
    label: 'iPhone',
    width: 393,
    height: 852,
    radius: 46,
    cutout: 'island',
    homeBar: true,
  },
  {
    id: 'android-phone',
    label: 'Android',
    width: 412,
    height: 915,
    radius: 36,
    cutout: 'punch-hole',
    homeBar: true,
  },
  {
    id: 'ipad',
    label: 'iPad',
    width: 820,
    height: 1180,
    radius: 34,
    cutout: null,
    homeBar: false,
  },
  {
    id: 'android-tablet',
    label: 'Tablet',
    width: 800,
    height: 1280,
    radius: 26,
    cutout: null,
    homeBar: false,
  },
];

export const DEFAULT_PRESET_ID = 'iphone';

/** Below this viewport width the frame is skipped (real phone browser). */
const FRAME_MIN_VIEWPORT = 600;

/** Gap between the frame and the browser edges. */
const STAGE_PADDING = 24;

/** Space reserved under the frame for the size switcher. */
const CONTROL_ROW_HEIGHT = 40;
const CONTROL_GAP = 20;

export default function MobileFrame({ children }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);

  if (Platform.OS !== 'web' || width < FRAME_MIN_VIEWPORT) {
    return children;
  }

  const preset =
    DEVICE_PRESETS.find((item) => item.id === presetId) || DEVICE_PRESETS[0];

  // Scale the device down to fit instead of resizing it, so the contents keep
  // the device's real logical width (a tablet must not render as a wide phone).
  const availableWidth = width - STAGE_PADDING * 2;
  const availableHeight =
    height - STAGE_PADDING * 2 - CONTROL_ROW_HEIGHT - CONTROL_GAP;
  const scale = Math.min(
    1,
    Math.max(0.1, availableWidth / preset.width),
    Math.max(0.1, availableHeight / preset.height)
  );

  return (
    <View style={[styles.stage, { backgroundColor: colors.surfaceMuted }]}>
      <View
        style={{
          width: preset.width * scale,
          height: preset.height * scale,
        }}
      >
        <View
          style={[
            styles.bezel,
            {
              width: preset.width,
              height: preset.height,
              borderRadius: preset.radius,
              backgroundColor: colors.background,
              borderColor: colors.border,
              shadowColor: colors.shadow,
              transform: [{ scale }],
            },
          ]}
        >
          <View
            style={[styles.screen, { borderRadius: preset.radius - 1 }]}
          >
            {children}

            {preset.cutout === 'island' ? (
              <View style={styles.islandTrack} pointerEvents="none">
                <View style={styles.island} />
              </View>
            ) : null}

            {preset.cutout === 'punch-hole' ? (
              <View style={styles.punchTrack} pointerEvents="none">
                <View style={styles.punch} />
              </View>
            ) : null}

            {preset.homeBar ? (
              <View style={styles.homeTrack} pointerEvents="none">
                <View
                  style={[styles.homeBar, { backgroundColor: colors.textMuted }]}
                />
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View
        style={[
          styles.switcher,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.switcherLabel, { color: colors.textSecondary }]}>
          Preview
        </Text>
        {DEVICE_PRESETS.map((item) => {
          const active = item.id === preset.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setPresetId(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Preview as ${item.label}, ${item.width} by ${item.height}`}
              style={[styles.option, active && { backgroundColor: colors.accent }]}
            >
              <Text
                style={[
                  styles.optionLabel,
                  { color: active ? colors.textInverse : colors.textPrimary },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
        <Text style={[styles.switcherSize, { color: colors.textMuted }]}>
          {preset.width}×{preset.height}
          {scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: STAGE_PADDING,
  },
  bezel: {
    borderWidth: 1,
    overflow: 'hidden',
    // Scaling from the top-left keeps the scaled device inside its wrapper box.
    transformOrigin: 'top left',
    // react-native-web maps these to box-shadow.
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
  },
  // Inner layer carries the clipping so the bezel above can keep its shadow.
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  islandTrack: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  island: {
    width: 124,
    height: 30,
    borderRadius: 16,
    backgroundColor: '#0B0B0B',
  },
  punchTrack: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  punch: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#0B0B0B',
  },
  homeTrack: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  homeBar: {
    width: 128,
    height: 5,
    borderRadius: 3,
    opacity: 0.75,
  },
  switcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    height: CONTROL_ROW_HEIGHT,
    marginTop: CONTROL_GAP,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  switcherLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  option: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  switcherSize: {
    fontSize: 11,
    marginHorizontal: Spacing.sm,
    fontVariant: ['tabular-nums'],
  },
});
