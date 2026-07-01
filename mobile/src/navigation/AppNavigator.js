// Resolution Fitness App — Navigation
// Root navigator with conditional auth flow, now theme-aware.
// Authenticated users see bottom tabs; unauthenticated see auth stack.
//
// Tab bar / header chrome reads from `useTheme()` so the navigation
// chrome (tabsAndHeader light orange cream / gray) flips with the
// active scheme without recompiling.

import React, { useMemo, useRef, useEffect } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, Animated, Pressable, Platform } from 'react-native';
import { NavigationContainer, DarkTheme as NavDarkTheme, DefaultTheme as NavLightTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import Typography from '../theme/typography';

// ── Auth Screens ──────────────────────────────────────────────────
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

// ── Tab Screens ───────────────────────────────────────────────────
import DashboardScreen from '../screens/DashboardScreen';
import FitnessScreen from '../screens/FitnessScreen';
import HealthScreen from '../screens/HealthScreen';
import AccountScreen from '../screens/AccountScreen';

// ── Nested Screens ────────────────────────────────────────────────
import WorkoutExecutionScreen from '../screens/WorkoutExecutionScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import CreatePlanScreen from '../screens/CreatePlanScreen';
import FoodScanScreen from '../screens/FoodScanScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChatScreen from '../screens/ChatScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ── Auth Stack (Login / Register / Onboarding) ────────────────────
function AuthStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}

// ── Header chrome for nested-stack screens (Chat, Settings, etc.) ──
function themedStackScreenOptions({ colors }) {
  return {
    headerStyle: { backgroundColor: colors.headerBg },
    headerTintColor: colors.headerText,
    headerTitleStyle: { ...Typography.h4, color: colors.headerText },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.background },
  };
}

// ── Dashboard Stack ───────────────────────────────────────────────
function DashboardStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={themedStackScreenOptions({ colors })}>
      <Stack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'AI Coach' }}
      />
    </Stack.Navigator>
  );
}

// ── Fitness Stack ─────────────────────────────────────────────────
function FitnessStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={themedStackScreenOptions({ colors })}>
      <Stack.Screen
        name="FitnessHome"
        component={FitnessScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WorkoutExecution"
        component={WorkoutExecutionScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: 'Exercise' }}
      />
      <Stack.Screen
        name="CreatePlan"
        component={CreatePlanScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'AI Coach' }}
      />
    </Stack.Navigator>
  );
}

// ── Health Stack ──────────────────────────────────────────────────
function HealthStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={themedStackScreenOptions({ colors })}>
      <Stack.Screen
        name="HealthHome"
        component={HealthScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FoodScan"
        component={FoodScanScreen}
        options={{ title: 'Scan Food' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'AI Coach' }}
      />
    </Stack.Navigator>
  );
}

// ── Account Stack ─────────────────────────────────────────────────
function AccountStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={themedStackScreenOptions({ colors })}>
      <Stack.Screen
        name="AccountHome"
        component={AccountScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'AI Coach' }}
      />
    </Stack.Navigator>
  );
}

// ── Helpers ──────────────────────────────────────────────────────
/** Converts a 6-char hex color + alpha (0–1) to an rgba() string. */
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Tab Icon Map ──────────────────────────────────────────────────
// Each tab maps to [outlineName, filledName] Ionicons.
const TAB_ICONS = {
  Dashboard: ['grid-outline', 'grid'],
  Fitness: ['barbell-outline', 'barbell'],
  Health: ['heart-outline', 'heart'],
  Account: ['person-outline', 'person'],
};

// ── Animated Tab Icon ─────────────────────────────────────────────
// Bounces aggressively (scale + lift) when the tab becomes active.
// The icon overshoots then settles for a lively, playful feel.
function TabIcon({ label, focused, color, accentColor }) {
  const scale = useRef(new Animated.Value(focused ? 1.2 : 1)).current;
  const translateY = useRef(new Animated.Value(focused ? -4 : 0)).current;
  const opacity = useRef(new Animated.Value(focused ? 1 : 0.55)).current;

  useEffect(() => {
    let cancelled = false;

    if (focused) {
      // Phase 1: overshoot
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1.3,
          useNativeDriver: true,
          speed: 18,
          bounciness: 18,
        }),
        Animated.spring(translateY, {
          toValue: -6,
          useNativeDriver: true,
          speed: 18,
          bounciness: 18,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (cancelled) return;
        // Phase 2: settle to resting active state
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1.18,
            useNativeDriver: true,
            speed: 30,
            bounciness: 8,
          }),
          Animated.spring(translateY, {
            toValue: -3,
            useNativeDriver: true,
            speed: 30,
            bounciness: 8,
          }),
        ]).start();
      });
    } else {
      // Deactivate: spring back to rest
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 30,
          bounciness: 6,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 30,
          bounciness: 6,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      cancelled = true;
      scale.stopAnimation();
      translateY.stopAnimation();
      opacity.stopAnimation();
    };
  }, [focused]);

  const [outlineName, filledName] = TAB_ICONS[label] || [
    'ellipse-outline',
    'ellipse',
  ];
  const name = focused ? filledName : outlineName;

  return (
    <Animated.View
      style={[
        styles.iconWrap,
        focused && { backgroundColor: hexAlpha(accentColor, 0.12) },
        { transform: [{ scale }, { translateY }], opacity },
      ]}
    >
      <Ionicons name={name} size={24} color={color} />
      {focused && (
        <View
          style={[
            styles.activeIndicator,
            { backgroundColor: color },
          ]}
        />
      )}
    </Animated.View>
  );
}

// ── Tab Button ───────────────────────────────────────────────────
// Simple Pressable wrapper that fires haptic feedback on tap.
// The press animation lives in TabIcon, not here.
function TabButton({ children, onPress, ...rest }) {
  const handlePress = (e) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      style={styles.tabButton}
    >
      {children}
    </Pressable>
  );
}

// ── Main Tab Navigator ────────────────────────────────────────────
function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        tabBarIcon: ({ focused, color }) => (
          <TabIcon label={route.name} focused={focused} color={color} accentColor={colors.tabBarActive} />
        ),
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 0,
          height: 90,
          paddingBottom: 8,
          paddingTop: 8,
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
            },
            android: { elevation: 8 },
          }),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Fitness" component={FitnessStack} />
      <Tab.Screen name="Health" component={HealthStack} />
      <Tab.Screen name="Account" component={AccountStack} />
    </Tab.Navigator>
  );
}

// ── Onboarding-only Stack ─────────────────────────────────────────
// Used when user is logged in but hasn't completed onboarding.
function OnboardingStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────────
function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
        Loading...
      </Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const { scheme, colors } = useTheme();

  // Build a NavigationContainer theme that matches our tokens so things like
  // the iOS modal backdrop and back-button tint blend with the chrome.
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? NavDarkTheme : NavLightTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.tabsAndHeader,
        primary: colors.accent,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.error,
      },
    };
  }, [scheme, colors]);

  if (loading) {
    return <LoadingScreen />;
  }

  const showOnboarding = user && !user.onboardingCompleted;

  return (
    <NavigationContainer theme={navTheme}>
      {user ? (
        showOnboarding ? (
          <OnboardingStack />
        ) : (
          <MainTabs />
        )
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    ...Typography.bodySmall,
  },
  // ── Tab icon styles ─────────────────────────────────────────────
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 36,
    borderRadius: 12,
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
