// Resolution Fitness App — Typography System
// Clean, modern typography optimized for readability on mobile

export const Fonts = {
  // Font weight presets
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

export const Typography = {
  // ── Headings ──────────────────────────────────────────────────
  h1: {
    fontSize: 40,
    fontWeight: Fonts.extrabold,
    lineHeight: 40,
    letterSpacing: 0.5,
    padding: 5
  },
  h2: {
    fontSize: 28,
    fontWeight: Fonts.bold,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 23,
    fontWeight: Fonts.semibold,
    lineHeight: 28,
    padding: 3
  },
  h4: {
    fontSize: 24,
    fontWeight: Fonts.semibold,
    lineHeight: 24,
  },

  // ── Body ──────────────────────────────────────────────────────
  body: {
    fontSize: 18,
    fontWeight: Fonts.regular,
    lineHeight: 24,
  },
  bodyMedium: {
    fontSize: 18,
    fontWeight: Fonts.medium,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 18,
    fontWeight: Fonts.regular,
    lineHeight: 20,
  },

  // ── Captions & Labels ─────────────────────────────────────────
  caption: {
    fontSize: 14,
    fontWeight: Fonts.regular,
    lineHeight: 16,
  },
  captionMedium: {
    fontSize: 16,
    fontWeight: Fonts.medium,
    lineHeight: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: Fonts.bold,
    lineHeight: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Numbers (stats, metrics) ──────────────────────────────────
  stat: {
    fontSize: 28,
    fontWeight: Fonts.extrabold,
    lineHeight: 36,
  },
  statSmall: {
    fontSize: 22,
    fontWeight: Fonts.bold,
    lineHeight: 28,
  },
};

export default Typography;
