// Resolution Fitness — Logo Component
// Renders the app logo as an Image. Use the `size` prop to control
// dimensions and `variant` to pick between "icon" (square symbol) or
// "full" (stacked logo with text).
//
// Both variants resolve to logo.png — the single brand logo asset.
// The `variant` prop is retained for future extensibility (e.g. a
// dedicated icon-only variant could be swapped in without touching
// every call site).

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const logoAsset = require('../../assets/logo.png');

/**
 * @param {'icon' | 'full'} variant  – "icon" for the square symbol,
 *   "full" for the stacked logo with RESOLUTION FITNESS text.
 *   Currently both resolve to the same asset (logo.png).
 * @param {number} size – width & height in dp (default 72).
 * @param {object} [style] – extra style overrides.
 */
export default function Logo({ variant = 'icon', size = 72, style }) {
  const source = logoAsset;

  return (
    <View style={[styles.wrapper, style]}>
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible
        accessibilityLabel="Resolution Fitness logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
