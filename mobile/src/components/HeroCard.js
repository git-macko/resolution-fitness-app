// Resolution Fitness App — HeroCard
// Reusable hero block with the brand orange → gray gradient.
//
// Renders as a NORMAL rounded card by default — it sits inside its parent
// with the standard content margin and uses BorderRadius.lg clipping. Pass
// `edgeToEdge` to opt back into the full-bleed screen-wide mode (the card
// spans edge to edge with no rounded corners for use under a flush header).
//
// The gradient is STATIC — light mode and dark mode both render the same
// orange → gray, by design. Inside the card we always use white text.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { heroGradient, heroStart, heroEnd, cardShadows } from '../theme/card';
import { Spacing, BorderRadius } from '../theme/spacing';
import Typography from '../theme/typography';

/**
 * HeroCard — the brand gradient block at the top of a tab.
 *
 * Props:
 *  - topLabel?      Small uppercase label above the title (e.g. "TODAY")
 *  - title          Main headline (e.g. "Good morning, Alex!")
 *  - subtitle?      One-line subtitle below the title
 *  - quote?         Optional italic quote motif (renders before subtitle)
 *  - quoteAuthor?   Optional italic author credit
 *  - children?      Freeform content rendered after the title block —
 *                   use for stat rows, body copy, etc.
 *  - style?         Outer style override (rare)
 *  - contentStyle?  Inner content style override
 *  - edgeToEdge?    Boolean — when true, uses negative horizontal bleed
 *                   to extend gradient to screen edges. Default false
 *                   (renders as a normal rounded card).
 *  - bleedPadding?  When edgeToEdge=true, how far to bleed. Defaults to
 *                   Spacing.xl (matches standard content padding).
 */
export default function HeroCard({
  topLabel,
  title,
  subtitle,
  quote,
  quoteAuthor,
  children,
  style,
  contentStyle,
  edgeToEdge = false,
  bleedPadding = Spacing.xl,
}) {
  // Hero card gets the heavier 'strong' modern shadow since it's
  // the focal point of every tab. When edgeToEdge is set, the card
  // bleeds to the screen edges and we skip the shadow (a full-bleed
  // card sits flush against its parent header, so a shadow would
  // either be clipped or painted onto the header itself).
  const shadowStyle = edgeToEdge ? {} : cardShadows.strong;
  const outerStyle = edgeToEdge
    ? { marginHorizontal: -bleedPadding, borderRadius: 0 }
    : {
        borderRadius: BorderRadius.lg,
        // Solid bg required for Android's `elevation` to paint the
        // drop shadow — this color is fully covered by the gradient
        // but gives Android a defined shape to shadow.
        backgroundColor: heroGradient.start,
        ...shadowStyle,
      };

  return (
    <View style={[styles.outer, outerStyle, style]}>
      <LinearGradient
        colors={[heroGradient.start, heroGradient.end]}
        locations={[heroGradient.startLocation, heroGradient.endLocation]}
        start={heroStart}
        end={heroEnd}
        style={edgeToEdge ? styles.gradient : [styles.gradient, { borderRadius: BorderRadius.lg }]}
      >
        <View style={edgeToEdge ? styles.contentFullBleed : styles.content}>
          {topLabel ? <Text style={styles.topLabel}>{topLabel}</Text> : null}

          {quote ? (
            <View style={styles.quoteBlock}>
              <Text style={styles.quoteMark}>"</Text>
              <Text style={styles.quote}>{quote}</Text>
              {quoteAuthor ? (
                <Text style={styles.quoteAuthor}>— {quoteAuthor}</Text>
              ) : null}
            </View>
          ) : null}

          {title ? (
            <Text style={[styles.title, !quote && styles.titleNoQuote]}>{title}</Text>
          ) : null}

          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {children ? (
            <View style={[styles.body, contentStyle]}>{children}</View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginBottom: Spacing.lg,
  },
  gradient: {
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  // When edgeToEdge=true, content uses full container width; we still
  // inset it a little so headline text doesn't kiss the screen edge.
  contentFullBleed: {
    paddingHorizontal: Spacing.xl,
  },
  // Boxed variant — when the card has its own rounded container.
  content: {
    paddingHorizontal: Spacing.xs,
  },
  topLabel: {
    ...Typography.label,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  // ── Quote motif (used for dashboard "merge with motivation") ──────
  quoteBlock: {
    marginBottom: Spacing.md,
  },
  quoteMark: {
    fontSize: 56,
    fontWeight: '800',
    lineHeight: 44,
    color: 'rgba(255, 255, 255, 0.35)',
    marginBottom: -Spacing.md,
  },
  quote: {
    ...Typography.body,
    fontStyle: 'italic',
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  quoteAuthor: {
    ...Typography.caption,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  title: {
    ...Typography.h1,
    color: '#FFFFFF',
    marginTop: Spacing.sm,
  },
  titleNoQuote: {
    marginTop: 0,
  },
  subtitle: {
    ...Typography.bodySmall,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: Spacing.sm,
  },
  body: {
    marginTop: Spacing.lg,
  },
});
