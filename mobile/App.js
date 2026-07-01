// Resolution Fitness App — Entry Point
// Wraps the app in AuthProvider + ThemeProvider, shows an animated splash
// screen (logo fade-in + overlay fade-out), then renders the root navigator.
// StatusBar style is reactive to the resolved color scheme.

import React, { useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashAnimation from './src/components/SplashAnimation';

// Keep the native splash visible until our JS-driven animation takes over.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Inner component so we can read the resolved scheme from context and pick
 * the matching StatusBar style. (In light mode we want dark icons on the
 * light chrome; in dark mode we want light icons on the gray chrome.)
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  // Hide the native splash once our animated overlay is on screen.
  useEffect(() => {
    // Short delay to guarantee the overlay has painted.
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 100);
    return () => clearTimeout(t);
  }, []);

  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <AppNavigator />
          {!splashDone && (
            <SplashAnimation isReady onFadeComplete={handleSplashComplete} />
          )}
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
