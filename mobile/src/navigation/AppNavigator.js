// Resolution Fitness App — Navigation
// Root navigator with conditional auth flow.
// Authenticated users see bottom tabs; unauthenticated see auth stack.

import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import Colors from '../theme/colors';
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
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: Colors.offWhite },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}

// ── Dashboard Stack ───────────────────────────────────────────────
function DashboardStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.headerBg },
        headerTintColor: Colors.headerText,
        headerTitleStyle: { ...Typography.h4 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.offWhite },
      }}
    >
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
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.headerBg },
        headerTintColor: Colors.headerText,
        headerTitleStyle: { ...Typography.h4 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.offWhite },
      }}
    >
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
    </Stack.Navigator>
  );
}

// ── Health Stack ──────────────────────────────────────────────────
function HealthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.headerBg },
        headerTintColor: Colors.headerText,
        headerTitleStyle: { ...Typography.h4 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.offWhite },
      }}
    >
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
    </Stack.Navigator>
  );
}

// ── Account Stack ─────────────────────────────────────────────────
function AccountStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.headerBg },
        headerTintColor: Colors.headerText,
        headerTitleStyle: { ...Typography.h4 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: Colors.offWhite },
      }}
    >
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
    </Stack.Navigator>
  );
}

// ── Tab Icon Component ────────────────────────────────────────────
// Simple text-based icons (no external icon library needed)
function TabIcon({ label, focused }) {
  const icons = {
    Dashboard: focused ? '◉' : '○',
    Fitness: focused ? '◆' : '◇',
    Health: focused ? '♥' : '♡',
    Account: focused ? '●' : '○',
  };
  return (
    <Text
      style={{
        fontSize: 22,
        color: focused ? Colors.tabBarActive : Colors.tabBarInactive,
      }}
    >
      {icons[label] || '○'}
    </Text>
  );
}

// ── Main Tab Navigator ────────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBarBg,
          borderTopColor: Colors.tabBarBorder,
          borderTopWidth: 1,
          height: 90,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
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
// Only shows the Onboarding screen (no back navigation to auth).
function OnboardingStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.white },
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}

// ── Root Navigator ────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  // If logged in but onboarding not completed, show onboarding-only stack
  // (prevents navigation back to Login/Register)
  const showOnboarding = user && !user.onboardingCompleted;

  return (
    <NavigationContainer>
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
    backgroundColor: Colors.offWhite,
    gap: 16,
  },
  loadingText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
});
