// Resolution Fitness App — MimiMark
// The brand identity mark for "Mimi", the AI Coach persona.
// Renders the mimi-logo.png asset as an Image.
// Props:
//  - size?        Width / height in pixels. Default 22.
//  - color?       No-op (kept for backward compatibility with callers).
//  - background?  No-op (kept for backward compatibility with callers).

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const mimiAsset = require('../../assets/mimi-logo.png');

export default function MimiMark({ size = 22, color: _color, background: _background, style }) {
  return (
    <View style={[styles.wrapper, style]}>
      <Image
        source={mimiAsset}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible
        accessibilityLabel="Mimi AI Coach"
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
