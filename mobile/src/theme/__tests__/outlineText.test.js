/**
 * outlineText.test.js
 *
 * Regression guard for the aurora stroke helper.
 *
 * Two platform-aware implementations:
 *
 *   - `wrapWithInlineStroke` (iOS default): keeps the outer element
 *     as <Text>, appends 4 shadow siblings as inline children. Uses
 *     `cloneElement` so every original Text prop (numberOfLines,
 *     onPress, ref, etc.) is preserved.
 *
 *   - `wrapWithViewStroke` (Android fallback): wraps the original
 *     <Text> in a positioning <View> that contains the 4 shadow
 *     siblings + the original. Robust on every platform at the cost
 *     of changing the outer type from Text to View (may shift flex
 *     layouts in parents).
 *
 *   - `applyAuroraOutline` dispatches via `Platform.OS`:
 *     `android` → view-wrap; everything else → inline.
 *
 * Cross-platform accessibility props on every shadow sibling:
 *   - `accessible: false`
 *   - `accessibilityElementsHidden: true`  (iOS)
 *   - `importantForAccessibility: 'no-hide-descendants'` (Android)
 *
 * Tests assert:
 *   1. wrapWithInlineStroke outputs outer Text + 4 shadow siblings.
 *   2. wrapWithViewStroke outputs outer View wrapping 4 shadow
 *      siblings + the original Text.
 *   3. Both: shadow siblings position=absolute, color=#FFFFFF,
 *      offsets match (-1,0)(1,0)(0,-1)(0,1).
 *   4. Both: shadow siblings carry the cross-platform a11y props.
 *   5. Both: NO leaked `textShadow*` / `textStroke*` props on the
 *      helper-added overlays.
 *   6. applyAuroraOutline dispatch: iOS → inline, android → view-wrap.
 *   7. Nested Text inside a View is rewritten end-to-end.
 *   8. Caller's base style (object + array form) preserved on both.
 *   9. Nullish children pass through.
 */

import React from 'react';
import { Text, View, Platform } from 'react-native';
import {
  applyAuroraOutline,
  wrapWithInlineStroke,
  wrapWithViewStroke,
} from '../outlineText';
import Colors from '../colors';

function collectTextNodes(node, acc = []) {
  if (node === null || node === undefined) return acc;
  if (Array.isArray(node)) {
    for (const child of node) collectTextNodes(child, acc);
    return acc;
  }
  if (typeof node !== 'object' || typeof node.type === 'undefined') return acc;
  if (node.type === Text) acc.push(node);
  const children = node.props && node.props.children;
  if (children !== undefined) collectTextNodes(children, acc);
  return acc;
}

const expectedOffsets = expect.arrayContaining([
  [-1, 0],
  [ 1, 0],
  [ 0, -1],
  [ 0,  1],
]);

const forbiddenOverlayStrokeProps = [
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textStrokeColor',
  'textStrokeWidth',
];

function expectNoLeakedStrokeProps(overlayStyle) {
  for (const key of forbiddenOverlayStrokeProps) {
    expect(overlayStyle[key]).toBeUndefined();
  }
}

function expectCrossPlatformA11y(shadowProps) {
  expect(shadowProps.accessible).toBe(false);
  expect(shadowProps.accessibilityElementsHidden).toBe(true);
  expect(shadowProps.importantForAccessibility).toBe('no-hide-descendants');
}

function expectShadowShape(shadowText) {
  expect(shadowText.type).toBe(Text);
  const overlay = shadowText.props.style[1];
  expect(overlay.position).toBe('absolute');
  expect(overlay.color).toBe(Colors.textWhite);
  expectNoLeakedStrokeProps(overlay);
}

describe('wrapWithInlineStroke (iOS path)', () => {
  it('keeps the outer element as Text and adds 4 white shadow siblings', () => {
    const out = wrapWithInlineStroke(
      <Text style={{ color: 'red' }}>hello</Text>,
      Colors.textWhite
    );
    expect(out.type).toBe(Text);

    const outerStyle = out.props.style;
    expect(Array.isArray(outerStyle)).toBe(true);
    expect(outerStyle[0]).toEqual({ color: 'red' });
    expect(outerStyle[1]).toEqual({
      position: 'relative',
      overflow: 'visible',
    });
    expectNoLeakedStrokeProps(outerStyle[1]);

    const outerChildren = out.props.children;
    expect(Array.isArray(outerChildren)).toBe(true);
    expect(outerChildren.length).toBe(5);

    const shadows = outerChildren.slice(0, 4);
    for (const s of shadows) {
      expectShadowShape(s);
      expectCrossPlatformA11y(s.props);
    }

    expect(outerChildren[4]).toBe('hello');

    const offsets = shadows.map((s) => [
      s.props.style[1].top,
      s.props.style[1].left,
    ]);
    expect(offsets).toEqual(expectedOffsets);
  });

  it('does not pollute the original Text with shadow-only a11y props', () => {
    const out = wrapWithInlineStroke(
      <Text style={{ color: 'red' }}>hello</Text>,
      Colors.textWhite
    );
    expect(out.props.accessible).toBeUndefined();
    expect(out.props.accessibilityElementsHidden).toBeUndefined();
    expect(out.props.importantForAccessibility).toBeUndefined();
  });

  it('preserves array-form base style by reference on the outer + shadows', () => {
    const baseStyle = [{ fontWeight: '700' }, { fontSize: 16 }];
    const out = wrapWithInlineStroke(
      <Text style={baseStyle}>styled</Text>,
      Colors.textWhite
    );
    expect(out.props.style[0]).toBe(baseStyle);
    const shadows = out.props.children.slice(0, 4);
    for (const s of shadows) {
      expect(s.props.style[0]).toBe(baseStyle);
    }
  });
});

describe('wrapWithViewStroke (Android fallback)', () => {
  it('returns a View wrapping 4 absolute shadow Texts + the original', () => {
    const out = wrapWithViewStroke(
      <Text style={{ color: 'red' }}>hello</Text>,
      Colors.textWhite
    );

    // Outer type changes from the original Text to a View —
    // the trade-off that the iOS inline path avoids.
    expect(out.type).toBe(View);

    // View overlay carries overflow:visible (so 1px shadows render).
    expect(out.props.style).toEqual({
      position: 'relative',
      overflow: 'visible',
    });

    // props.children is grouped as [arr_of_4_shadows, original_Text]
    // by JSX-compilation ordering — count actual Text nodes instead of
    // assuming a flat length 5 array.
    const textNodes = collectTextNodes(out);
    expect(textNodes.length).toBe(5);

    const shadows = textNodes.slice(0, 4);
    for (const s of shadows) {
      expectShadowShape(s);
      expectCrossPlatformA11y(s.props);
    }

    // Last Text element is the ORIGINAL, untouched.
    const original = textNodes[4];
    expect(original.type).toBe(Text);
    expect(original.props.style).toEqual({ color: 'red' });
    // Original keeps NO a11y pollution from the helper.
    expect(original.props.accessible).toBeUndefined();
    expect(original.props.accessibilityElementsHidden).toBeUndefined();
    expect(original.props.importantForAccessibility).toBeUndefined();

    const offsets = shadows.map((s) => [
      s.props.style[1].top,
      s.props.style[1].left,
    ]);
    expect(offsets).toEqual(expectedOffsets);
  });
});

describe('applyAuroraOutline (platform dispatch)', () => {
  // Jest 29+ replaces Platform.OS, restoring after each test.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the inline-text path when Platform.OS is iOS', () => {
    // jest-expo exposes Platform.OS as a plain data property, not a
    // getter, so use jest.replaceProperty (Jest 29+).
    jest.replaceProperty(Platform, 'OS', 'ios');

    const outlined = applyAuroraOutline(
      <Text style={{ color: 'red' }}>hello</Text>
    );
    const arr = Array.isArray(outlined) ? outlined : [outlined];
    // Inline path: outer type is Text.
    expect(arr[0].type).toBe(Text);
    // Count actual Text nodes (the inline path produces a flat
    // children array of 5; the view-wrap path produces nested 4+1,
    // so we use collectTextNodes uniformly).
    expect(collectTextNodes(arr[0]).length).toBe(5);
  });

  it('uses the view-wrap path when Platform.OS is android', () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    const outlined = applyAuroraOutline(
      <Text style={{ color: 'red' }}>hello</Text>
    );
    const arr = Array.isArray(outlined) ? outlined : [outlined];
    // View-wrap path: outer type is View.
    expect(arr[0].type).toBe(View);
    expect(collectTextNodes(arr[0]).length).toBe(5);
  });

  it('walks nested children (Text inside View) end-to-end', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    const original = (
      <View>
        <Text style={{ color: 'blue' }}>nested</Text>
      </View>
    );
    const outlined = applyAuroraOutline(original);

    // Inner Text rewritten → 1 outer Text + 4 shadow Texts = 5 total.
    const textNodes = collectTextNodes(outlined);
    expect(textNodes.length).toBe(5);

    const shadowed = textNodes.filter((t) => {
      const overlay = Array.isArray(t.props.style) ? t.props.style[1] : null;
      return (
        overlay &&
        overlay.position === 'absolute' &&
        overlay.color === Colors.textWhite
      );
    });
    expect(shadowed.length).toBe(4);
  });

  it('returns nullish children unchanged', () => {
    expect(applyAuroraOutline(null)).toBeNull();
    expect(applyAuroraOutline(undefined)).toBeUndefined();
  });
});
