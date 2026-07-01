// Resolution Fitness App — Theme Tokens
// Orange + gray design system with full light / dark mode support.
//
// Design philosophy:
//   - Light: white surfaces, soft orange-cream chrome, dark orange titles
//     and dark grey body text.
//   - Dark:  dark gray surfaces, mid-gray chrome, light orange titles
//     and plain white body text.
//   - Orange is the single vibrant accent — used for primary CTAs,
//     active states, progress, and branding.
//
// Semantic token names let screens do `colors.background`, `colors.title`,
// etc. — the resolved value flips with the active color scheme. Anything in
// the hero gradient (orange → gray) stays constant across schemes by design.

export const lightTheme = {
  scheme: 'light',
  colors: {
    // ── Surfaces ─────────────────────────────────────────
    /** Plain white page body — screens, lists, modals. */
    background: '#FFFFFF',
    /** Card surface — same as background in light mode for crispness. */
    surface: '#FFFFFF',
    /** Soft surface used for nested sections (e.g. Settings rows). */
    surfaceMuted: '#FFF7EE',
    /** Tabs and headers background — light orange cream. */
    tabsAndHeader: '#ffffff',

    // ── Brand ────────────────────────────────────────────
    /** Title / header accent — dark orange. */
    title: '#B45309',
    /** Primary accent — orange (buttons, links, badges). */
    accent: '#EA580C',
    accentSoft: '#552f03',
    accentBg: '#FFEDD5',
    accentDeep: '#C2410C',

    // ── Text ─────────────────────────────────────────────
    /** Body text — dark grey. */
    textPrimary: '#374151',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    /** Pillow / inverse text (drawn on orange surfaces). */
    textInverse: '#FFFFFF',
    /** True black for emphatic titles when needed. */
    textHeading: '#1F2937',

    // ── Lines ────────────────────────────────────────────
    border: '#E5E7EB',
    divider: '#F3F4F6',

    // ── Semantic ─────────────────────────────────────────
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    // ── Chrome ───────────────────────────────────────────
    tabBarBg: '#fdfdfd',
    tabBarBorder: '#F4D5B5',
    tabBarActive: '#C2410C',
    tabBarInactive: '#A3A3A3',
    headerBg: '#FFE6CF',
    headerText: '#1F2937',

    // ── Misc ─────────────────────────────────────────────
    overlay: 'rgba(0, 0, 0, 0.45)',
    scrim: 'rgba(0, 0, 0, 0.55)',
    shadow: 'rgba(0, 0, 0, 0.08)',
    /** Soft on-accent tint used for the food-scan / chip backgrounds. */
    accentWash: '#FEF3E7',
  },
};

export const darkTheme = {
  scheme: 'dark',
  colors: {
    // ── Surfaces ─────────────────────────────────────────
    /** Dark gray page body (gray-800). */
    background: '#1F2937',
    /** Card surface — slightly darker than body for separation. */
    surface: '#111827',
    /** Soft nested-surface tone (gray-700 with extra warmth). */
    surfaceMuted: '#1B2433',
    /** Tabs and headers — mid gray. */
    tabsAndHeader: '#374151',

    // ── Brand ────────────────────────────────────────────
    /** Title / header accent — light orange (orange-300). */
    title: '#FDBA74',
    /** Primary accent — brighter orange (orange-400) for dark mode contrast. */
    accent: '#FB923C',
    accentSoft: '#7C2D12',
    accentBg: '#3F1E0C',
    accentDeep: '#FED7AA',

    // ── Text ─────────────────────────────────────────────
    textPrimary: '#FFFFFF',
    textSecondary: '#D1D5DB',
    textMuted: '#9CA3AF',
    textInverse: '#1F2937',
    textHeading: '#FFFFFF',

    // ── Lines ────────────────────────────────────────────
    border: '#374151',
    divider: '#1F2937',

    // ── Semantic ─────────────────────────────────────────
    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',

    // ── Chrome ───────────────────────────────────────────
    tabBarBg: '#374151',
    tabBarBorder: '#1F2937',
    tabBarActive: '#FB923C',
    tabBarInactive: '#9CA3AF',
    headerBg: '#374151',
    headerText: '#FFFFFF',

    // ── Misc ─────────────────────────────────────────────
    overlay: 'rgba(0, 0, 0, 0.65)',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadow: 'rgba(0, 0, 0, 0.45)',
    accentWash: '#3F1E0C',
  },
};

export default lightTheme;
