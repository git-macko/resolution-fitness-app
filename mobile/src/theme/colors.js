// Resolution Fitness App — Legacy Color Module (DEPRECATED entry point)
//
// Historically every screen imported `Colors from '../theme/colors'` — a
// flat object of purple/white/black tokens. With the new theme system the
// app now supports light + dark modes, and screens should read colors via
// `useTheme()` and `useThemedStyles()` instead.
//
// To avoid breaking the ~10 screens that haven't been migrated yet, this
// file still exports a flat object — but it now points at the LIGHT theme
// tokens. Migrated screens (Dashboard, Fitness, Health, Account) no longer
// import from here.
//
// If you're touching a screen that still imports `Colors`, prefer migrating
// it to `useThemedStyles` rather than adding new tokens here.

import { lightTheme } from './themes';

const Colors = {
  // Legacy purple tones — kept so old screens don't break visually while
  // we're in the middle of the migration. New screens should not use them.
  primary: lightTheme.colors.accent,
  primaryLight: lightTheme.colors.accentSoft,
  primaryDark: lightTheme.colors.accentDeep,
  primaryBg: lightTheme.colors.accentBg,

  black: '#1F2937',
  white: '#FFFFFF',
  offWhite: lightTheme.colors.background,
  cardBg: lightTheme.colors.surface,

  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  textPrimary: lightTheme.colors.textPrimary,
  textSecondary: lightTheme.colors.textSecondary,
  textMuted: lightTheme.colors.textMuted,
  textWhite: '#FFFFFF',
  textPurple: lightTheme.colors.accent,

  success: lightTheme.colors.success,
  warning: lightTheme.colors.warning,
  error: lightTheme.colors.error,
  info: lightTheme.colors.info,

  tabBarBg: lightTheme.colors.tabBarBg,
  tabBarBorder: lightTheme.colors.tabBarBorder,
  tabBarActive: lightTheme.colors.tabBarActive,
  tabBarInactive: lightTheme.colors.tabBarInactive,
  headerBg: lightTheme.colors.headerBg,
  headerText: lightTheme.colors.headerText,
  separator: lightTheme.colors.divider,
  overlay: lightTheme.colors.overlay,
  shadow: lightTheme.colors.shadow,
};

export default Colors;
