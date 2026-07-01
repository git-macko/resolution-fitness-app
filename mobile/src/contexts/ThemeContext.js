// Resolution Fitness App — Theme Context
// Provides the active color scheme and theme tokens to the entire app.
//
// Priority:
//   1. User override stored in AsyncStorage under `@theme/schemeOverride`
//      — values: 'light' | 'dark' | 'system'
//   2. Otherwise, fall back to the device's appearance (Appearance API).
//
// The provider re-renders on:
//   - the user picking Light / Dark / System in Settings
//   - the OS color scheme flipping while the app is running
//
// `useTheme()` is the only consumer-facing API; it returns:
//   - `scheme`:   the resolved 'light' | 'dark' string in effect
//   - `theme`:    { scheme, colors } — the resolved theme object
//   - `override`: the current user override ('light' | 'dark' | 'system')
//   - `setOverride(value)`: persist + apply a new override
//
// Screens that need to react to scheme changes should call useTheme() and
// build their StyleSheet dynamically with `useThemedStyles(factory)`.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../theme/themes';

const STORAGE_KEY = '@theme/schemeOverride';

export const ThemeContext = createContext(null);

/**
 * Resolve a theme object from an override and the OS appearance.
 *  - 'system' → use OS scheme (Appearance.getColorScheme())
 *  - 'light' | 'dark' → honor explicitly
 */
function resolveTheme(override, systemScheme) {
  const effective =
    override === 'system' || !override ? systemScheme : override;
  return effective === 'dark' ? darkTheme : lightTheme;
}

export function ThemeProvider({ children }) {
  // React Native's useColorScheme() is reactive on both iOS and Android —
  // it re-renders when the OS flips dark mode while the app is running.
  const systemScheme = useColorScheme() || 'light';
  const [override, setOverrideState] = useState('system');
  const [hydrated, setHydrated] = useState(false);

  // ── Hydrate the persisted override once on mount ─────────────────────
  // We do this in an effect so the rest of the app can render with the
  // default ('system') immediately, avoiding a flash of unstyled content.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setOverrideState(stored);
        }
      })
      .catch(() => {
        // If storage fails, stay on the system default. Fail silently.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setOverride = useCallback(async (next) => {
    if (next !== 'light' && next !== 'dark' && next !== 'system') return;
    setOverrideState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage failure isn't fatal — UI still flips for the session.
    }
  }, []);

  const value = useMemo(() => {
    const theme = resolveTheme(override, systemScheme);
    return {
      scheme: theme.scheme,
      theme,
      colors: theme.colors,
      override,
      setOverride,
      hydrated,
    };
  }, [override, systemScheme, setOverride, hydrated]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Hook — returns `{ scheme, theme, colors, override, setOverride, hydrated }`.
 * Throws if used outside a ThemeProvider so misuse fails loudly.
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

/**
 * Hook — builds a StyleSheet that reacts to theme changes.
 * Pass a factory `(theme) => StyleSheet.create({...})` and the result will
 * be memoized until the theme changes again.
 *
 * Usage:
 *   const styles = useThemedStyles((t) => StyleSheet.create({
 *     bg: { backgroundColor: t.colors.background },
 *     title: { color: t.colors.title },
 *   }));
 *
 * Note: StyleSheet.create() returns an `id`-mapped numeric object; calling
 * it again on every render is wasteful but harmless. The memoization here
 * is worth it for screens with large stylesheets.
 */
export function useThemedStyles(factory) {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}

export default ThemeProvider;
