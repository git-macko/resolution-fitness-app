// Resolution Fitness App — Aurora Text Stroke Helper
// ═══════════════════════════════════════════════════════════════════
// Render a true 1px white stroke around every <Text> element inside
// aurora-gradient surfaces (GradientCard hero, GradientButton
// primary/hero, GradientBackground aurora).
//
// WHY 4-OVERLAY (not textShadow):
//   React Native only supports ONE `textShadow*` style per <Text>;
//   you cannot stack four text-shadows via the style array (CSS's
//   `text-shadow: a,b,c,d;` shorthand isn't available). So we add 4
//   sibling Text copies offset in the four cardinal directions
//   (-1,0)(1,0)(0,-1)(0,1) with color forced to the outline color.
//
// WHY TWO PLATFORM-AWARE IMPLEMENTATIONS:
//   - inline (iOS default): the 4 shadow siblings are nested inside
//     the original <Text> clone. cloneElement preserves every prop on
//     the original Text (numberOfLines, onPress, ref, etc.) so the
//     caller's flex/alignment assumptions stay intact.
//   - view-wrap (Android fallback): the original <Text> is wrapped in
//     a positioning <View> that contains the 4 shadow siblings.
//     Nested <Text> + position:absolute on Android RN 0.81 is
//     platform-fragile (Text layout engines may render absolute
//     children inline and silently flatten the stroke); wrapping in
//     a real <View> guarantees the absolute positions are honored.
//     Trade-off: the parent sees a <View> instead of <Text>, so flex
//     rows/alignment that relied on the original Text being inline
//     may shift on Android.
//
// The dispatch in `wrapWithStroke` chooses inline on iOS and view-wrap
// everywhere else (including Android). Both produce the same visual
// stroke — color #FFFFFF, lighter than the gradient's gray anchor
// (#302F2C) AND lighter than the saturated orange portions, so the
// halo reads as a bright stroke against every part of the aurora
// gradient in both light and dark themes.
//
// CAVEAT — children double-evaluation: each shadow Text re-renders
// the original children, so non-string React content (expressions,
// components) is evaluated 4 extra times per logical Text. The app's
// Text content is mostly plain strings / simple variables, so this
// is safe; switch to a memoized element form if it ever isn't.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { Text, View, Platform } from 'react-native';
import Colors from './colors';

function outlineColor() {
  return Colors.textWhite;
}

// Four cardinal-direction overlays — the absolute position delta for
// each shadow sibling. Top/bottom/left/right placed in a stable order
// so React keys are deterministic across renders.
const STROKE_OFFSETS = [
  [-1,  0], // top
  [ 1,  0], // bottom
  [ 0, -1], // left
  [ 0,  1], // right
];

// iOS overlay added to the original Text clone so its absolute
// shadow children can paint past the line-box.
const INLINE_OUTER_OVERLAY = {
  position: 'relative',
  overflow: 'visible',
};

// Android fallback's wrapper container.
const VIEW_WRAPPER_STYLE = {
  position: 'relative',
  overflow: 'visible',
};

// Cross-platform recipe to take a Text fully out of the accessibility
// tree so screen readers don't announce the duplicated content.
//   - `accessible: false`                       — focus removal
//   - `accessibilityElementsHidden: true`       — iOS hide (VoiceOver)
//   - `importantForAccessibility: 'no-hide-descendants'` — Android
//     hide (TalkBack), AND hides any descendants of the shadow.
const SHADOW_ACCESSIBILITY = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
};

/**
 * Make one shadow Text element — same base style as the original,
 * absolutely positioned at `(top, left)` and forced to the outline
 * color, with the cross-platform a11y props suppressing screen-reader
 * announcement of the duplicated content. Returns a React element so
 * both variants can splice it into their respective trees.
 */
function makeShadow({ key, baseStyle, color, top, left, children }) {
  return React.createElement(Text, {
    key,
    ...SHADOW_ACCESSIBILITY,
    style: [
      baseStyle,
      {
        position: 'absolute',
        top,
        left,
        color,
      },
    ],
  }, children);
}

/**
 * Build the 4-stroke shadow siblings — the same set is reused by
 * both the inline and view-wrap variants. The shadow element is keyed
 * by `top,left` so React reconciles them stably across re-renders.
 */
function buildShadows(baseStyle, color, children) {
  return STROKE_OFFSETS.map(([top, left]) =>
    makeShadow({
      key: `stroke-${top}-${left}`,
      baseStyle,
      color,
      top,
      left,
      children,
    })
  );
}

/**
 * iOS variant: keep the outer element as the original <Text> and
 * append the 4 shadow siblings as inline children. cloneElement
 * preserves every prop the caller passed (numberOfLines, onPress,
 * ref, accessibilityLabel, etc.).
 */
export function wrapWithInlineStroke(textElement, color) {
  const baseStyle = textElement.props.style;
  const originalChildren = textElement.props.children;

  return React.cloneElement(textElement, {
    style: [baseStyle, INLINE_OUTER_OVERLAY],
    children: [...buildShadows(baseStyle, color, originalChildren), originalChildren],
  });
}

/**
 * Android fallback: wrap the original <Text> in a positioning <View>
 * that contains the 4 shadow siblings above the original. Robust on
 * every platform at the cost of changing the outer type from Text
 * to View (may shift flex/alignment in parents).
 */
export function wrapWithViewStroke(textElement, color) {
  const baseStyle = textElement.props.style;
  const originalChildren = textElement.props.children;

  return (
    <View style={VIEW_WRAPPER_STYLE}>
      {buildShadows(baseStyle, color, originalChildren)}
      {textElement}
    </View>
  );
}

/**
 * Platform-aware dispatch — inline shape on iOS, view-wrap shape on
 * Android. Both style variants render the same 1px white stroke; the
 * platform branch exists to work around RN 0.81 Android's
 * inconsistent handling of nested Text + position:absolute children.
 */
function wrapWithStroke(textElement, color) {
  return Platform.OS === 'android'
    ? wrapWithViewStroke(textElement, color)
    : wrapWithInlineStroke(textElement, color);
}

/**
 * Walk a React child tree and apply the platform-appropriate 4-overlay
 * stroke to every <Text> element. Non-text wrappers are traversed so
 * deeply-nested text receives the stroke too.
 *
 * Returns a new tree ready to pass as `children`. Strings, numbers,
 * fragments, and nullish values pass through unchanged.
 */
export function applyAuroraOutline(children) {
  if (children === undefined || children === null) return children;

  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;

    if (child.type === Text) {
      return wrapWithStroke(child, outlineColor());
    }

    // Non-Text element with children — recurse so deeply-nested text
    // (e.g. <View><Text>...</Text></View>) also gets the stroke.
    if (child.props && child.props.children !== undefined) {
      return React.cloneElement(child, {
        children: applyAuroraOutline(child.props.children),
      });
    }

    return child;
  });
}

export default applyAuroraOutline;
