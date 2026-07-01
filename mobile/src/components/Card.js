// Resolution Fitness App — Card
//
// The single, centralized shadow-only card surface used everywhere
// outside the brand hero gradient. Replaces the older
// GradientBorderCard.
//
// ONE place to edit any non-hero card visual across the entire app:
//   ▸ Outer corner radius (CARD_BORDER_RADIUS in theme/card.js)
//   ▸ Drop-shadow depth (cardShadows.<level> + DEFAULT_CARD_SHADOW)
//   ▸ Theme-responsive background (lightTheme.colors.surface)
//
// ────────────────────────────────────────────────────────────────────
//  ── WHERE TO EDIT  ──
// Default shape and shadow values live in theme/card.js:
//   ▸ CARD_BORDER_RADIUS         — outer / inner corner radius
//   ▸ cardShadows.<level>        — modern soft drop-shadow presets
//   ▸ DEFAULT_CARD_SHADOW        — which level the Card uses by default
// Edit those to retune every Card in the app at once. Per-card
// overrides are passed via props (borderRadius=, shadow=,
// backgroundColor=).
// ────────────────────────────────────────────────────────────────────

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  CARD_BORDER_RADIUS,
  cardShadows,
  DEFAULT_CARD_SHADOW,
} from '../theme/card';
import { lightTheme } from '../theme/themes';

/**
 * Card — the unified, shadow-only card surface.
 *
 * Modern, simple, uniform: a rounded surface with a soft drop shadow,
 * no border, no outline, no pastel tint, no semantic variant. The only
 * knobs are shape, shadow depth, an optional accent background, and
 * tappability.
 *
 * Two-layer View structure so the drop shadow paints on iOS:
 *   ▸ OUTER View — sets backgroundColor + borderRadius + the shadow.
 *     Does NOT set `overflow:hidden`, so the iOS drop shadow paints
 *     past the rounded corners instead of getting clipped.
 *   ▸ INNER View — sets `borderRadius` + `overflow:hidden`, holds the
 *     children. Clips content (images, colored blocks) cleanly to the
 *     card's rounded shape.
 *
 * Props:
 *  - children              Content rendered inside the rounded surface.
 *  - style?                Outer wrapper style (margins, custom shadow,
 *                          custom radius). Merged AFTER the default
 *                          {backgroundColor, borderRadius, shadow}; a
 *                          caller-supplied key wins on conflict.
 *  - contentStyle?         Inner content style (padding, flex layout,
 *                          alignment). Merged AFTER the inner default
 *                          {borderRadius, overflow:hidden}.
 *  - backgroundColor?      Override the default surface bg.
 *                          Defaults to lightTheme.colors.surface for
 *                          the tonal-elevation look. Pass e.g.
 *                          `Colors.primaryBg` to tint a specific card.
 *  - borderRadius?         Corner radius. Outer & inner both apply it.
 *                          Defaults to CARD_BORDER_RADIUS (xl = 18)
 *                          from `theme/card.js`.
 *  - shadow?               Shadow preset ('none' | 'subtle' | 'default'
 *                          | 'strong') OR a custom {shadowColor,
 *                          shadowOffset, shadowOpacity, shadowRadius,
 *                          elevation} object. Defaults to
 *                          DEFAULT_CARD_SHADOW (='default') from
 *                          `theme/card.js`.
 *  - onPress?              When set, the entire card surface becomes
 *                          tappable (wrapped in TouchableOpacity).
 *  - activeOpacity?        Opacity feedback when onPress fires.
 *                          Defaults to 0.7.
 */
export default function Card({
  children,
  style,
  contentStyle,
  backgroundColor,
  borderRadius = CARD_BORDER_RADIUS,
  shadow = DEFAULT_CARD_SHADOW,
  onPress,
  activeOpacity = 0.7,
}) {
  const resolvedShadow =
    typeof shadow === 'string' ? cardShadows[shadow] || {} : shadow || {};
  const resolvedBg =
    backgroundColor !== undefined
      ? backgroundColor
      : lightTheme.colors.surface;

  const inner = (
    <View style={[{ borderRadius, overflow: 'hidden' }, contentStyle]}>
      {children}
    </View>
  );

  const outerStyle = [
    { backgroundColor: resolvedBg, borderRadius },
    resolvedShadow,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={activeOpacity}
        onPress={onPress}
        style={outerStyle}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={outerStyle}>{inner}</View>;
}
