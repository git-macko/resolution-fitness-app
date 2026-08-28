/**
 * DashboardScreen.test.js
 *
 * Tests for the Dashboard tab:
 *   - Greeting + streak + hero stats rendering
 *   - Daily quote / gym fact (fresh + fallback)
 *   - Next Workout card + Start Workout navigation
 *   - Quick Actions navigation
 *   - Ask Mimi navigation
 *   - Error banner + Retry
 *   - Gym crowd reporting and hours refresh
 */

import React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Alert } from 'react-native';

// ── Mock fixtures ─────────────────────────────────────────────────
const createDashboard = (overrides = {}) => ({
  stats: { totalWorkouts: 12, totalMinutes: 360, currentStreak: 5, fitnessLevel: 3 },
  dailyQuote: { text: 'Push harder today', author: 'Coach X' },
  healthFact: { text: 'Muscle grows during rest.', source: 'Science Daily' },
  nextWorkout: { id: 'day-1', workoutName: 'Push Day', estimatedDuration: 50, dayLabel: 'Today' },
  caloriesBurned: 320,
  waterMl: 750,
  waterGoal: 2000,
  gymCrowd: { level: 2, source: 'live' },
  buildInspiration: null,
  nutritionSuggestions: [],
  ...overrides,
});

// ── Module mocks (all hoisted) ───────────────────────────────────

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getDashboard: jest.fn(() => Promise.resolve({})),
    getRandomQuote: jest.fn(() => Promise.resolve({})),
    getRandomFact: jest.fn(() => Promise.resolve({})),
    reportGymCrowd: jest.fn(() => Promise.resolve({})),
    refreshGymHours: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { displayName: 'Alex' },
  }),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        callback();
      }, []);
    },
    useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  };
});

jest.mock('../../components/HeroCard', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Comp = ({ children, topLabel, title, subtitle, quote, quoteAuthor }) =>
    React.createElement(View, { testID: 'hero-card' },
      React.createElement(Text, null, topLabel),
      React.createElement(Text, null, title),
      React.createElement(Text, null, subtitle),
      React.createElement(Text, null, quote || ''),
      React.createElement(Text, null, quoteAuthor || ''),
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

jest.mock('../../components/Logo', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Comp = () => React.createElement(View, { testID: 'logo' });
  Comp.displayName = 'Logo';
  return Comp;
});

jest.mock('../../components/TodaysSummary', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Comp = ({ metrics }) =>
    React.createElement(View, { testID: 'todays-summary' },
      (metrics || []).map((m, i) =>
        React.createElement(Text, { key: i }, m.value, m.label, m.sub || '')
      )
    );
  Comp.displayName = 'TodaysSummary';
  return Comp;
});

jest.mock('../../components/GymCrowdCard', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const Comp = ({ onReport, onRefreshHours }) =>
    React.createElement(View, { testID: 'gym-crowd-card' },
      React.createElement(TouchableOpacity, { onPress: () => onReport && onReport('busy') },
        React.createElement(Text, null, 'Report Crowd')
      ),
      React.createElement(TouchableOpacity, { onPress: () => onRefreshHours && onRefreshHours() },
        React.createElement(Text, null, 'Refresh Hours')
      )
    );
  Comp.displayName = 'GymCrowdCard';
  return Comp;
});

jest.mock('../../components/BuildInspirationCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Comp = () => React.createElement(View, { testID: 'build-inspiration' });
  Comp.displayName = 'BuildInspirationCard';
  return Comp;
});

jest.mock('../../components/NutritionSuggestionCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Comp = () => React.createElement(View, { testID: 'nutrition-suggestions' });
  Comp.displayName = 'NutritionSuggestionCard';
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
  default: { h1: {}, h3: {}, h4: {}, body: {}, bodyMedium: {}, bodySmall: {}, caption: {}, captionMedium: {}, label: {}, statSmall: {} },
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
    quickActionPlan: '#EA580C',
    quickActionMeal: '#3B82F6',
    quickActionScan: '#22C55E',
    quickActionWater: '#0EA5E9',
    quickActionSettings: '#8B5CF6',
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
import DashboardScreen from '../DashboardScreen';

// ── Helpers ───────────────────────────────────────────────────────

function getMockApi() {
  return require('../../api/client').default;
}

/**
 * Render DashboardScreen with mocked API responses.
 */
async function renderDashboardScreen(options = {}) {
  const {
    dashboard = createDashboard(),
    quote = { id: 'q1', text: 'Push harder today', author: 'Coach X' },
    fact = { id: 'f1', text: 'Muscle grows during rest.', source: 'Science Daily' },
  } = options;

  const api = getMockApi();
  api.getDashboard.mockResolvedValue({ data: dashboard });
  if (quote === false) {
    api.getRandomQuote.mockRejectedValue(new Error('quote unavailable'));
  } else {
    api.getRandomQuote.mockResolvedValue({ data: quote });
  }
  if (fact === false) {
    api.getRandomFact.mockRejectedValue(new Error('fact unavailable'));
  } else {
    api.getRandomFact.mockResolvedValue({ data: fact });
  }

  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

  let tree;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(DashboardScreen, { navigation: mockNavigation }));
  });
  // Flush pending microtasks from async useFocusEffect -> fetchDashboard
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

// ── Tests ─────────────────────────────────────────────────────────

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders greeting, streak, and hero stats', async () => {
    const { root } = await renderDashboardScreen();

    const text = extractText(root);
    expect(text).toContain('Alex!');
    expect(text).toContain('5 day streak');
    expect(text).toContain('Workouts');
    expect(text).toContain('Minutes');
    expect(text).toContain('Lv.3');
    expect(text).toContain('12'); // totalWorkouts
    expect(text).toContain('360'); // totalMinutes
  });

  it('renders the daily quote and gym fact', async () => {
    const { root } = await renderDashboardScreen();

    const text = extractText(root);
    expect(text).toContain('Push harder today');
    expect(text).toContain('Coach X');
    expect(text).toContain('Muscle grows during rest.');
    expect(text).toContain('Science Daily');
  });

  it('falls back to default quote/fact when none are provided', async () => {
    // Quote/fact endpoints failing is non-critical — the dashboard's
    // built-in defaults should still render.
    const { root } = await renderDashboardScreen({
      dashboard: createDashboard({ dailyQuote: null, healthFact: null }),
      quote: false,
      fact: false,
    });

    const text = extractText(root);
    expect(text).toContain('Strive for progress, not perfection.');
    expect(text).toContain('Consistency is the key to fitness success.');
  });

  it('shows TodaysSummary calories burned and water', async () => {
    const { root } = await renderDashboardScreen();

    const text = extractText(root);
    expect(text).toContain('Cal Burned');
    expect(text).toContain('320');
    expect(text).toContain('Water');
    expect(text).toContain('750ml');
    expect(text).toContain('of 2000ml');
  });

  it('renders Next Workout card and starts the workout on press', async () => {
    const { root, navigation } = await renderDashboardScreen();

    const text = extractText(root);
    expect(text).toContain('Next Workout');
    expect(text).toContain('Push Day');
    expect(text).toContain('50 min');
    expect(text).toContain('Today');

    const startBtn = findTouchableByText(root, 'Start Workout');
    expect(startBtn).not.toBeNull();
    await act(async () => { startBtn.props.onPress(); });

    expect(navigation.navigate).toHaveBeenCalledWith('Fitness', {
      screen: 'WorkoutExecution',
      params: { planDayId: 'day-1', workoutName: 'Push Day' },
    });
  });

  it('hides the Next Workout card when there is no next workout', async () => {
    const { root } = await renderDashboardScreen({
      dashboard: createDashboard({ nextWorkout: null }),
    });

    expect(extractText(root)).not.toContain('Next Workout');
  });

  it('navigates to the right screens from Quick Actions', async () => {
    const { root, navigation } = await renderDashboardScreen();

    const planCard = findTouchableByText(root, 'Plan Workout');
    await act(async () => { planCard.props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Fitness');

    const mealCard = findTouchableByText(root, 'Log Meal');
    await act(async () => { mealCard.props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Health');

    const scanCard = findTouchableByText(root, 'Scan Food');
    await act(async () => { scanCard.props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Health', { screen: 'FoodScan' });

    const settingsCard = findTouchableByText(root, 'Settings');
    await act(async () => { settingsCard.props.onPress(); });
    expect(navigation.navigate).toHaveBeenCalledWith('Account', { screen: 'Settings' });
  });

  it('navigates to Chat when Ask Mimi is pressed', async () => {
    const { root, navigation } = await renderDashboardScreen();

    const mimi = root.findByProps({ accessibilityLabel: 'Ask Mimi' });
    await act(async () => { mimi.props.onPress(); });

    expect(navigation.navigate).toHaveBeenCalledWith('Chat');
  });

  it('shows an error banner with Retry when the dashboard fetch fails', async () => {
    const api = getMockApi();
    api.getDashboard.mockRejectedValueOnce(new Error('Network down'));

    const { root } = await renderDashboardScreen();

    const text = extractText(root);
    expect(text).toContain('Network down');
    expect(text).toContain('Retry');

    // Retry refetches and recovers
    const retry = findTouchableByText(root, 'Retry');
    await act(async () => { retry.props.onPress(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(api.getDashboard).toHaveBeenCalledTimes(2);
    expect(extractText(root)).not.toContain('Network down');
  });

  it('reports gym crowd level and refreshes the dashboard', async () => {
    const { root, api } = await renderDashboardScreen();

    const reportBtn = findTouchableByText(root, 'Report Crowd');
    await act(async () => { await reportBtn.props.onPress(); });

    expect(api.reportGymCrowd).toHaveBeenCalledWith('busy');
    // Dashboard is re-fetched after reporting
    expect(api.getDashboard).toHaveBeenCalledTimes(2);
  });

  it('shows an alert when reporting gym crowd fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const api = getMockApi();
    api.reportGymCrowd.mockRejectedValueOnce(new Error('Could not save'));

    const { root } = await renderDashboardScreen();

    const reportBtn = findTouchableByText(root, 'Report Crowd');
    await act(async () => { await reportBtn.props.onPress(); });

    expect(alertSpy).toHaveBeenCalledWith('Could not save report', 'Could not save');
    alertSpy.mockRestore();
  });

  it('refreshes gym hours on demand', async () => {
    const { root, api } = await renderDashboardScreen();

    const refreshBtn = findTouchableByText(root, 'Refresh Hours');
    await act(async () => { await refreshBtn.props.onPress(); });

    expect(api.refreshGymHours).toHaveBeenCalled();
    expect(api.getDashboard).toHaveBeenCalledTimes(2);
  });
});
