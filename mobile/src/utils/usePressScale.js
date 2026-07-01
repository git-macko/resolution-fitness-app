// Resolution Fitness App — usePressScale
// Returns Animated transform style + Pressable event handlers for a
// spring-based scale-down-and-bounce-back press animation.
//
// Usage:
//   const mimi = usePressScale(0.92);
//   <Pressable {...mimi.handlers}>
//     <Animated.View style={[styles.btn, mimi.animatedStyle]}>
//       ...
//     </Animated.View>
//   </Pressable>

import { useRef, useMemo } from 'react';
import { Animated } from 'react-native';

/**
 * @param {number} [toValue=0.92]  Scale factor when pressed (0–1).
 * @param {object} [springConfig]  Optional Animated.spring overrides.
 * @returns {{ handlers: { onPressIn, onPressOut }, animatedStyle: { transform } }}
 */
export default function usePressScale(toValue = 0.92, springConfig = {}) {
  const scale = useRef(new Animated.Value(1)).current;

  const defaults = { useNativeDriver: true, speed: 50, bounciness: 4 };

  const onPressIn = () => {
    Animated.spring(scale, { ...defaults, ...springConfig, toValue }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, { ...defaults, ...springConfig, toValue: 1 }).start();
  };

  const animatedStyle = useMemo(() => ({ transform: [{ scale }] }), [scale]);

  return {
    handlers: { onPressIn, onPressOut },
    animatedStyle,
  };
}
