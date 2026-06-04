// Resolution Fitness App — Color Theme
// White, Black, and Purple design system
//
// Design philosophy:
//   - White + off-white for backgrounds, cards, modals
//   - Black for text, headers, dark accents
//   - Purple as the single vibrant highlight — used sparingly
//     for primary buttons, active states, progress, branding

const Colors = {
  // ── Primary Purple ─────────────────────────────────────────────
  primary: '#7C3AED',        // Vivid purple — main accent
  primaryLight: '#A78BFA',   // Soft purple — hover/light states
  primaryDark: '#5B21B6',    // Deep purple — pressed/dark states
  primaryBg: '#F5F3FF',      // Very light purple — backgrounds

  // ── Black & White ──────────────────────────────────────────────
  black: '#000000',
  white: '#FFFFFF',
  offWhite: '#F5F5F5',       // Screen backgrounds, subtle layers
  cardBg: '#FFFFFF',         // Card surfaces

  // ── Grays ──────────────────────────────────────────────────────
  gray100: '#F5F5F5',        // Lightest gray (backgrounds)
  gray200: '#E5E5E5',        // Borders, dividers
  gray300: '#D4D4D4',        // Disabled states
  gray400: '#A3A3A3',        // Muted text, placeholders
  gray500: '#737373',        // Secondary text
  gray600: '#525252',        // Body text alternative
  gray700: '#404040',        // Strong secondary
  gray800: '#262626',        // Near-black text
  gray900: '#171717',        // Almost black

  // ── Text ───────────────────────────────────────────────────────
  textPrimary: '#000000',
  textSecondary: '#737373',
  textMuted: '#A3A3A3',
  textWhite: '#FFFFFF',
  textPurple: '#7C3AED',

  // ── Semantic ───────────────────────────────────────────────────
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // ── Specific UI ────────────────────────────────────────────────
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E5E5E5',
  tabBarActive: '#7C3AED',
  tabBarInactive: '#A3A3A3',
  headerBg: '#FFFFFF',
  headerText: '#000000',
  separator: '#F5F5F5',
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.08)',
};

export default Colors;
