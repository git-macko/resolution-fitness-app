// Resolution Fitness — Splash Animation
// Renders a full-screen overlay that matches the native splash screen.
// When `isReady` flips to true the overlay fades out, revealing the app.
// Uses expo-splash-screen to keep the *native* splash visible until
// the first frame of this component has rendered (so there's no flash).

import React, { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Dimensions } from 'react-native';

const splashLogo = require('../../assets/logo-cover.png');

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_SIZE = Math.min(SCREEN_W * 0.45, 220);

/**
 * @param {boolean} isReady  – set to true once the app's critical data
 *   (auth state, fonts, etc.) has loaded. The fade-out begins on this signal.
 * @param {function} onFadeComplete – called once the fade-out animation
 *   finishes so the parent can unmount this component.
 */
export default function SplashAnimation({ isReady, onFadeComplete }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  // Entrance: logo gently scales in and fades in (300 ms)
  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Exit: once ready, fade the entire overlay out
  useEffect(() => {
    if (!isReady) return;
    // Delay so the user actually sees the logo after it scales in.
    // 400ms entrance + 1000ms hold = ~1.4s before the fade-out starts.
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        onFadeComplete?.();
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [isReady]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Animated.Image
        source={splashLogo}
        style={[
          styles.logo,
          { transform: [{ scale: logoScale }], opacity: logoOpacity },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#454746', // matches the Dynamic R logo background
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
