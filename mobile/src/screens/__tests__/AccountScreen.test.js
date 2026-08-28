/**
 * AccountScreen.test.js
 *
 * Tests for the Account tab:
 *   - Profile header + hero stats
 *   - Progression badges (earned / in-progress / empty)
 *   - Profile info rows (level, goal, height, weight)
 *   - Body stats editing + goal recalculation
 *   - Photo upload flow (permission + upload + updateUser)
 *   - Settings navigation + logout flow
 */

import React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Alert } from 'react-native';

// ── Mock fixtures ─────────────────────────────────────────────────
const defaultUser = {
  displayName: 'Alex Carter',
  email: 'alex@example.com',
  photoUrl: null,
  heightCm: 175,
  weightKg: 70,
  gender: '',
  fitnessLevel: 'intermediate',
  primaryGoal: 'build_muscle',
  stats: { totalWorkouts: 12, currentStreak: 5, fitnessLevel: 3 },
  allergies: ['peanuts'],
  dietaryPrefs: ['high-protein'],
};

const createBadge = (overrides = {}) => ({
  id: 'b1',
  name: 'First Workout',
  emoji: '🏋️',
  description: 'Complete your first workout',
  earned: true,
  progress: 1,
  progressText: '',
  ...overrides,
});

// ── Module mocks (all hoisted) ───────────────────────────────────

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getSettings: jest.fn(() => Promise.resolve({})),
    getBadges: jest.fn(() => Promise.resolve({})),
    recalculateGoals: jest.fn(() => Promise.resolve({})),
    uploadProfilePicture: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
}));

jest.mock('../../utils/imageUrl', () => ({
  resolveImageUrl: (url) => url,
}));

// Shared mock instances so the component and the tests see the same fns
const mockUpdateUser = jest.fn();
const mockLogout = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      displayName: 'Alex Carter',
      email: 'alex@example.com',
      photoUrl: null,
      heightCm: 175,
      weightKg: 70,
      gender: '',
      fitnessLevel: 'intermediate',
      primaryGoal: 'build_muscle',
      stats: { totalWorkouts: 12, currentStreak: 5, fitnessLevel: 3 },
      allergies: ['peanuts'],
      dietaryPrefs: ['high-protein'],
    },
    updateUser: mockUpdateUser,
    logout: mockLogout,
  }),
}));

jest.mock('../../components/HeroCard', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Comp = ({ children, topLabel, title, subtitle }) =>
    React.createElement(View, { testID: 'hero-card' },
      React.createElement(Text, null, topLabel),
      React.createElement(Text, null, title),
      React.createElement(Text, null, subtitle),
      children
    );
  Comp.displayName = 'HeroCard';
  return Comp;
});

jest.mock('../../components/HeroStat', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Comp = ({ stats }) =>
    React.createElement(View, { testID: 'hero-stat-row' },
      (stats || []).map((s, i) =>
        React.createElement(Text, { key: i }, s.value, s.label)
      )
    );
  Comp.displayName = 'HeroStatRow';
  return Comp;
});

jest.mock('../../components/Card', () => {
  const React = require('react');
  const { View, TouchableOpacity } = require('react-native');
  const Comp = ({ children, onPress, testID }) => {
    const inner = React.createElement(View, { testID: testID || 'card-inner' }, children);
    if (onPress) {
      return React.createElement(TouchableOpacity, { onPress, testID }, inner);
    }
    return React.createElement(View, { testID }, inner);
  };
  Comp.displayName = 'Card';
  return Comp;
});

jest.mock('../../components/MimiMark', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Comp = () => React.createElement(View, { testID: 'mimi-mark' });
  Comp.displayName = 'MimiMark';
  return Comp;
});

jest.mock('../../utils/usePressScale', () => ({
  __esModule: true,
  default: () => ({
    handlers: { onPressIn: jest.fn(), onPressOut: jest.fn() },
    animatedStyle: {},
  }),
}));

jest.mock('../../theme/typography', () => ({
  __esModule: true,
  default: { h1: {}, h2: {}, h3: {}, h4: {}, body: {}, bodyMedium: {}, bodySmall: {}, caption: {}, captionMedium: {}, label: {}, statSmall: {} },
}));

jest.mock('../../theme/spacing', () => ({
  Spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64, '5xl': 80 },
  BorderRadius: { sm: 6, md: 10, lg: 14, xl: 18, full: 9999 },
  Shadows: { sm: {}, md: {} },
  Layout: { screenTopPadding: 48 },
}));

jest.mock('../../theme/card', () => ({
  CARD_BORDER_RADIUS: 18,
  cardShadows: { default: {} },
  DEFAULT_CARD_SHADOW: 'default',
}));

jest.mock('../../theme/themes', () => ({
  lightTheme: { colors: { surface: '#FFFFFF' } },
}));

jest.mock('../../contexts/ThemeContext', () => {
  const React = require('react');
  const mockColors = {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F5F5F5',
    tabsAndHeader: '#FFFFFF',
    title: '#B45309',
    accent: '#EA580C',
    accentSoft: '#C2410C',
    accentBg: '#FFEDD5',
    accentDeep: '#C2410C',
    textPrimary: '#374151',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    textInverse: '#FFFFFF',
    textHeading: '#1F2937',
    border: '#E5E7EB',
    divider: '#F3F4F6',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    tabBarBg: '#FDFDFD',
    tabBarBorder: '#F4D5B5',
    tabBarActive: '#C2410C',
    tabBarInactive: '#A3A3A3',
    headerBg: '#FFE6CF',
    headerText: '#1F2937',
    overlay: 'rgba(0,0,0,0.45)',
    scrim: 'rgba(0,0,0,0.55)',
    shadow: 'rgba(0,0,0,0.08)',
    accentWash: '#FEF3E7',
    heroAvatarBg: '#C2410C',
    heroText: '#FFFFFF',
    heroTextMuted: '#FFEDD5',
  };
  const mockTheme = { scheme: 'light', colors: mockColors };
  return {
    __esModule: true,
    useTheme: () => ({ scheme: 'light', theme: mockTheme, colors: mockColors, override: 'system', setOverride: jest.fn(), hydrated: true }),
    useThemedStyles: (factory) => React.useMemo(() => factory(mockTheme), [factory]),
    ThemeProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve(null)),
  clear: jest.fn(() => Promise.resolve(null)),
}));

// Import after mocks
import AccountScreen from '../AccountScreen';
import * as ImagePicker from 'expo-image-picker';

// ── Helpers ───────────────────────────────────────────────────────

let alertButtons = [];
beforeEach(() => {
  jest.clearAllMocks();
  alertButtons = [];
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    alertButtons = buttons || [];
  });
});

function getMockApi() {
  return require('../../api/client').default;
}


async function renderAccountScreen(options = {}) {
  const { settings = {}, badges = [] } = options;

  const api = getMockApi();
  api.getSettings.mockResolvedValue({ data: settings });
  api.getBadges.mockResolvedValue({ data: badges });
  api.recalculateGoals.mockResolvedValue({
    data: { calorieTarget: 2200, proteinTargetGrams: 160, waterGoalMl: 2800 },
  });

  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

  let tree;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(AccountScreen, { navigation: mockNavigation }));
  });
  // Flush pending microtasks from the mount effect -> fetchAccountData
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  return { tree, root: tree.root, api, navigation: mockNavigation };
}

function extractText(node) {
  return allTextContent(node).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function allTextContent(node) {
  const results = [];
  if (typeof node === 'string') {
    results.push(node);
    return results;
  }
  if (!node || node === true || node === false || node === null || node === undefined) return results;
  if (typeof node !== 'object') return results;
  if (node.type === 'Text') {
    const kids = node.children;
    if (Array.isArray(kids)) {
      for (const k of kids) results.push(...allTextContent(k));
    } else if (typeof kids === 'string') {
      results.push(kids);
    } else if (kids !== null && kids !== undefined && typeof kids === 'object') {
      results.push(...allTextContent(kids));
    }
    return results;
  }
  const kids = node.children;
  if (Array.isArray(kids)) {
    for (const k of kids) results.push(...allTextContent(k));
  } else if (typeof kids === 'string') {
    results.push(kids);
  } else if (kids !== null && kids !== undefined && typeof kids === 'object') {
    results.push(...allTextContent(kids));
  }
  return results;
}

function findTouchableByText(root, text) {
  const results = [];
  collectPressableNodes(root, results);
  for (const node of results) {
    const innerText = allTextContent(node).join(' ');
    if (innerText.includes(text)) return node;
  }
  return null;
}

function collectPressableNodes(node, acc) {
  if (!node || typeof node !== 'object') return;
  if (node.props && typeof node.props.onPress === 'function') {
    acc.push(node);
  }
  const kids = node.children;
  if (Array.isArray(kids)) {
    for (const k of kids) collectPressableNodes(k, acc);
  } else if (kids && typeof kids === 'object') {
    collectPressableNodes(kids, acc);
  }
}

async function setFieldByPlaceholder(root, placeholder, value) {
  const input = root.findByProps({ placeholder });
  await act(async () => {
    input.props.onChangeText(value);
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('AccountScreen', () => {
  it('renders profile header, hero stats, and Ask Mimi', async () => {
    const { root, navigation } = await renderAccountScreen();

    const text = extractText(root);
    expect(text).toContain('Alex Carter');
    expect(text).toContain('alex@example.com');
    expect(text).toContain('12');
    expect(text).toContain('Day Streak');
    expect(text).toContain('5');
    expect(text).toContain('Lv.3');
    expect(text).toContain('Change photo');

    const mimi = root.findByProps({ accessibilityLabel: 'Ask Mimi' });
    await act(async () => { mimi.props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Chat');
  });

  it('shows avatar initial when the user has no photo', async () => {
    const { root } = await renderAccountScreen();

    // The avatar placeholder is a Text node containing exactly the initial letter
    const initials = root.findAll((n) =>
      n.type === 'Text' &&
      Array.isArray(n.children) &&
      n.children.length === 1 &&
      n.children[0] === 'A'
    );
    expect(initials.length).toBeGreaterThan(0);
  });

  it('renders earned and in-progress badges with progress', async () => {
    const { root } = await renderAccountScreen({
      badges: [
        createBadge({ id: 'b1', name: 'First Workout', emoji: '🏋️', earned: true, progress: 1 }),
        createBadge({
          id: 'b2',
          name: '7-Day Streak',
          emoji: '🔥',
          description: 'Work out 7 days in a row',
          earned: false,
          progress: 0.57,
          progressText: '4/7 days',
        }),
      ],
    });

    const text = extractText(root);
    expect(text).toContain('First Workout');
    expect(text).toContain('✓ Earned');
    expect(text).toContain('7-Day Streak');
    expect(text).toContain('Work out 7 days in a row');
    expect(text).toContain('4/7 days');
    // Unearned badge should not show the earned tag for it (only one total)
    expect(text.match(/✓ Earned/g) || []).toHaveLength(1);
  });

  it('shows the empty state when no badges are earned', async () => {
    const { root } = await renderAccountScreen({ badges: [] });

    expect(extractText(root)).toContain('Keep training and tracking meals to start earning badges');
  });

  it('renders profile info rows (level, goal, height, weight, allergies, diet)', async () => {
    const { root } = await renderAccountScreen();

    const text = extractText(root);
    expect(text).toContain('Fitness Level');
    expect(text).toContain('Intermediate');
    expect(text).toContain('Goal');
    expect(text).toContain('build muscle');
    expect(text).toContain('Height');
    expect(text).toContain('175 cm');
    expect(text).toContain('Weight');
    expect(text).toContain('70 kg');
    expect(text).toContain('Allergies:');
    expect(text).toContain('peanuts');
    expect(text).toContain('Diet:');
    expect(text).toContain('high-protein');
  });

  it('shows daily goal targets from settings', async () => {
    const { root } = await renderAccountScreen({
      settings: { calorieTarget: 2400, proteinTargetGrams: 180, waterGoalMl: 3000 },
    });

    const text = extractText(root);
    expect(text).toContain('2400');
    expect(text).toContain('180 g protein');
    expect(text).toContain('3000 ml water');
  });

  it('updates body stats and recalculates goals', async () => {
    const { root, api } = await renderAccountScreen();

    // Fields prefilled from the profile (175 cm / 70 kg)
    await setFieldByPlaceholder(root, 'e.g. 175', '180');
    await setFieldByPlaceholder(root, 'e.g. 70', '80');

    // Select a gender chip
    const femaleChip = findTouchableByText(root, 'Female');
    await act(async () => { femaleChip.props.onPress(); });

    const btn = findTouchableByText(root, 'Update & Recalculate Goals');
    expect(btn).not.toBeNull();
    await act(async () => { await btn.props.onPress(); });

    expect(api.recalculateGoals).toHaveBeenCalledWith({
      heightCm: 180,
      weightKg: 80,
      gender: 'female',
      primaryGoal: 'build_muscle',
    });
    expect(Alert.alert).toHaveBeenCalledWith('Goals updated 🎯', expect.stringContaining('2200'));
  });

  it('warns when height or weight is missing before recalculation', async () => {
    const { root, api } = await renderAccountScreen();

    await setFieldByPlaceholder(root, 'e.g. 175', '');
    const btn = findTouchableByText(root, 'Update & Recalculate Goals');
    await act(async () => { await btn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('Missing info', 'Enter your height and weight to recalculate your goals.');
    expect(api.recalculateGoals).not.toHaveBeenCalled();
  });

  it('uploads a profile photo when permission is granted', async () => {
    const { root, api } = await renderAccountScreen();

    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/photo.jpg' }],
    });
    api.uploadProfilePicture.mockResolvedValue({ photoUrl: '/uploads/avatar.jpg' });

    const changePhoto = findTouchableByText(root, 'Change photo');
    await act(async () => { await changePhoto.props.onPress(); });

    expect(api.uploadProfilePicture).toHaveBeenCalledWith('file:///tmp/photo.jpg');
    expect(mockUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ photoUrl: '/uploads/avatar.jpg' })
    );
  });

  it('shows a permission alert when photo access is denied', async () => {
    const { root, api } = await renderAccountScreen();

    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    const changePhoto = findTouchableByText(root, 'Change photo');
    await act(async () => { await changePhoto.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('Permission', 'Photo library access is needed.');
    expect(api.uploadProfilePicture).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('navigates to Settings from the settings card', async () => {
    const { root, navigation } = await renderAccountScreen();

    // The menu item renders "⚙️  Settings" (with a double space)
    const settingsCard = findTouchableByText(root, 'Settings');
    expect(settingsCard).not.toBeNull();
    await act(async () => { settingsCard.props.onPress(); });

    expect(navigation.navigate).toHaveBeenCalledWith('Settings');
  });

  it('confirms logout before calling logout', async () => {
    const { root } = await renderAccountScreen();

    const logoutBtn = findTouchableByText(root, 'Logout');
    await act(async () => { logoutBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith('Logout', 'Are you sure you want to log out?', expect.any(Array));
    const confirmBtn = alertButtons.find((b) => b.text === 'Logout');
    expect(confirmBtn).toBeTruthy();
    await act(async () => { confirmBtn.onPress(); });

    expect(mockLogout).toHaveBeenCalled();
  });
});
