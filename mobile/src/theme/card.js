// Resolution Fitness App — Card theme tokens
//
// ONE place to edit card visuals app-wide:
//   ▸ Hero gradient (the brand orange→gray block at the top of each
//     tab — the cross-scheme accent that bookmarks a screen).
//   ▸ Card shape (corner radius used by every <Card>).
//   ▸ Card shadows (the SOLE depth cue used by every <Card>).
//
// ────────────────────────────────────────────────────────────────────
//  ── HERO / GRADIENT  ──  used by HeroCard background only
// ────────────────────────────────────────────────────────────────────
//
// Static across light + dark modes by design — the hero card is the
// cross-scheme accent that bookmarks each tab.

export const heroGradient = {
  start: '#EA580C', // orange-600 — brand orange
  end: '#374151',   // gray-700 — anchors the gradient with depth
  startLocation: 0,
  endLocation: 1,
};

/** Default diagonal direction (top-left → bottom-right) */
export const heroStart = { x: 0, y: 0 };
export const heroEnd = { x: 1, y: 1 };

/** Convenience array — pass directly to LinearGradient.colors */
export const heroColors = [heroGradient.start, heroGradient.end];

// ────────────────────────────────────────────────────────────────────
//  ── CARD SHAPE  ──  corner radius for every <Card>
// ────────────────────────────────────────────────────────────────────

import { BorderRadius } from './spacing';

/**
 * Default outer / inner corner radius for every <Card>.
 * Edit this single value to retune every Card's shape app-wide.
 * `xl` (18) — modern, well-rounded without feeling overly soft.
 */
export const CARD_BORDER_RADIUS = BorderRadius.xl;

// ────────────────────────────────────────────────────────────────────
//  ── CARD SHADOWS  ──  the SOLE depth cue
// ────────────────────────────────────────────────────────────────────
//
// Modern, feathered drop shadow — large blur radius with low opacity
// gives an iOS-26 / Material-You feel rather than the harsh single-
// layer black drop. Three pre-tuned levels so callers can pick the
// right depth for the card's role (sitting flush, default depth,
// lifting over hero content, pressed state).
//
// On Android, `elevation` paints only when the View casting the
// shadow has a solid `backgroundColor`. Every <Card> defaults to a
// non-transparent `lightTheme.colors.surface`, so shadows paint on
// Android. Callers who override `backgroundColor` to transparent
// values will lose the Android shadow.
//
// On iOS, the OUTER View intentionally avoids `overflow:hidden`, so
// the drop shadow paints past the rounded corners instead of getting
// clipped. Content clipping happens on the INNER View.

export const cardShadows = {
  // no shadow — for cards that sit flush with the background
  none: {},
  // very faint halo — for dense lists of nested cards
  subtle: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  // default depth — every standard <Card> uses this
  default: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  // heavy lift — reserved for hero / pressed states
  strong: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 22,
    elevation: 8,
  },
};

/**
 * Default shadow applied to every <Card> unless overridden.
 * Change this single word to retune ALL Card shadows app-wide
 * ('subtle' for flatter UI, 'strong' for deeper lift).
 */
export const DEFAULT_CARD_SHADOW = 'default';

// ────────────────────────────────────────────────────────────────────
//  ── BUNDLED DEFAULT EXPORT  ──  for callers that want a single import
// ────────────────────────────────────────────────────────────────────

export default {
  // hero gradient
  heroGradient,
  heroStart,
  heroEnd,
  heroColors,
  // shape
  CARD_BORDER_RADIUS,
  // shadow
  cardShadows,
  DEFAULT_CARD_SHADOW,
};
