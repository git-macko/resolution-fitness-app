/**
 * HealthScreen.test.js
 *
 * Tests for the Health tab's nutrition features:
 *   - Quick Log card (calories / protein / carbs / fat / water → goals)
 *   - Goal progress bars rendering
 *   - Pre/Post/General meal selection from goal-ranked suggestions
 *   - Deleting a logged meal
 */

import React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Alert } from 'react-native';

// ── Mock fixtures ─────────────────────────────────────────────────
const createDaily = (overrides = {}) => ({
  date: '2026-08-15',
  totalCalories: 500,
  totalProteinG: 40,
  totalCarbsG: 20,
  totalFatG: 10,
  waterMl: 750,
  waterGoalMl: 2000,
  calorieTarget: 2000,
  proteinTarget: 150,
  hasActivity: true,
  meals: [],
  ...overrides,
});

const createSuggestion = (overrides = {}) => ({
  title: 'Muscle Builder 💪',
  description: 'High-protein meal for muscle gain.',
  foods: ['Lean beef steak', 'Brown rice'],
  calories: 580,
  proteinG: 45,
  carbsG: 55,
  fatG: 15,
  reason: 'Beef is rich in creatine and amino acids.',
  tags: ['high-protein', 'muscle-gain'],
  ...overrides,
});

// ── Module mocks (all hoisted) ───────────────────────────────────

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getDailyNutrition: jest.fn(() => Promise.resolve({})),
    getMealSuggestions: jest.fn(() => Promise.resolve({})),
    createMeal: jest.fn(() => Promise.resolve({})),
    logWater: jest.fn(() => Promise.resolve({})),
    deleteMeal: jest.fn(() => Promise.resolve({})),
    updateMeal: jest.fn(() => Promise.resolve({})),
    recalculateGoals: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { heightCm: 175, weightKg: 70, primaryGoal: 'build_muscle' },
    updateUser: jest.fn(),
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
  default: { h1: {}, h3: {}, h4: {}, body: {}, bodyMedium: {}, bodySmall: {}, caption: {}, captionMedium: {}, label: {}, statSmall: {} },
}));

jest.mock('../../theme/spacing', () => ({
  Spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48, '4xl': 64, '5xl': 80 },
  BorderRadius: { sm: 6, md: 10, lg: 14, xl: 18, full: 9999 },
  Shadows: { sm: {}, md: {} },
  Layout: { screenTopPadding: 48 },
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
import HealthScreen from '../HealthScreen';

// ── Helpers ───────────────────────────────────────────────────────

// Captures the button list passed to Alert.alert so tests can press them.
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

/**
 * Render HealthScreen with mocked nutrition + suggestions.
 */
async function renderHealthScreen(options = {}) {
  const { daily = createDaily(), suggestions = [] } = options;
  const api = getMockApi();
  api.getDailyNutrition.mockResolvedValue({ data: daily });
  api.getMealSuggestions.mockResolvedValue({ data: suggestions });

  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

  let tree;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(HealthScreen, { navigation: mockNavigation }));
  });
  // Flush pending microtasks from async useFocusEffect -> fetchData
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  return { tree, root: tree.root, api };
}

/**
 * Extract clean text from the rendered tree, collapsing whitespace.
 */
function extractText(node) {
  return allTextContent(node).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Recursively collect all rendered text strings from a test instance tree.
 */
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

/**
 * Find the first node with an onPress prop whose rendered text includes `text`.
 */
function findTouchableByText(root, text) {
  const results = [];
  collectPressableNodes(root, results);
  for (const node of results) {
    const innerText = allTextContent(node).join(' ');
    if (innerText.includes(text)) return node;
  }
  return null;
}

/** Recursively collect all test-instance nodes that have an onPress prop. */
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

/**
 * Set the value of a Quick Log TextInput by testID.
 */
async function setQuickField(root, testID, value) {
  const input = root.findByProps({ testID });
  await act(async () => {
    input.props.onChangeText(value);
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('HealthScreen — Quick Log & nutrition tracking', () => {
  it('marks a day with no logged food or water as "no update"', async () => {
    const { root } = await renderHealthScreen({
      daily: createDaily({ hasActivity: false, totalCalories: 0, totalProteinG: 0, waterMl: 0 }),
    });

    const text = extractText(root);
    expect(text).toContain('No update');
    expect(text).toContain("You haven't logged anything today");
    // The zero-filled totals row is replaced by the no-update state.
    expect(text).not.toContain('500 / 2000 kcal');
  });

  it('renders the Quick Log card, today totals, and goal progress bars', async () => {
    const { root } = await renderHealthScreen({
      daily: createDaily({ totalCalories: 500, totalProteinG: 40, waterMl: 750 }),
    });

    const text = extractText(root);
    expect(text).toContain('⚡ Quick Log');
    expect(text).toContain('Calories');
    expect(text).toContain('Protein (g)');
    expect(text).toContain('Carbs (g)');
    expect(text).toContain('Fat (g)');
    expect(text).toContain('Water (ml)');

    // Goal progress bars: value / goal
    expect(text).toContain('500 / 2000 kcal');
    expect(text).toContain('40 / 150 g');
    expect(text).toContain('750 ml');
    expect(text).toContain('/ 2000 ml');
  });

  it('logs entered macros and water through the Quick Log card', async () => {
    const { root, api } = await renderHealthScreen();

    await setQuickField(root, 'quick-name', 'Chicken Bowl');
    await setQuickField(root, 'quick-calories', '550');
    await setQuickField(root, 'quick-protein', '45');
    await setQuickField(root, 'quick-carbs', '40');
    await setQuickField(root, 'quick-fat', '12');
    await setQuickField(root, 'quick-water', '500');

    // Switch meal type to Pre-Workout
    const preChip = findTouchableByText(root, 'Pre-Workout');
    expect(preChip).not.toBeNull();
    await act(async () => { preChip.props.onPress(); });

    const addBtn = findTouchableByText(root, '＋ Add to Log');
    await act(async () => { await addBtn.props.onPress(); });

    expect(api.createMeal).toHaveBeenCalledWith({
      mealType: 'preworkout',
      items: [{ name: 'Chicken Bowl', calories: 550, proteinG: 45, carbsG: 40, fatG: 12, source: 'manual' }],
    });
    expect(api.logWater).toHaveBeenCalledWith(500);
  });

  it('logs only water when no macros are entered', async () => {
    const { root, api } = await renderHealthScreen();

    await setQuickField(root, 'quick-water', '750');
    const addBtn = findTouchableByText(root, '＋ Add to Log');
    await act(async () => { await addBtn.props.onPress(); });

    expect(api.createMeal).not.toHaveBeenCalled();
    expect(api.logWater).toHaveBeenCalledWith(750);
  });

  it('shows an alert and skips logging when every field is empty', async () => {
    const { root, api } = await renderHealthScreen();

    const addBtn = findTouchableByText(root, '＋ Add to Log');
    await act(async () => { await addBtn.props.onPress(); });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Nothing to log',
      'Enter calories, protein, carbs, fat, or water first.'
    );
    expect(api.createMeal).not.toHaveBeenCalled();
    expect(api.logWater).not.toHaveBeenCalled();
  });

  it('adds a goal-ranked suggestion to the log with its inferred meal type', async () => {
    const { root, api } = await renderHealthScreen({
      daily: createDaily(),
      suggestions: [
        createSuggestion({
          title: 'Recovery Bowl 🍚',
          tags: ['postworkout', 'recovery'],
          calories: 480,
          proteinG: 40,
          carbsG: 50,
          fatG: 10,
        }),
      ],
    });

    const btn = findTouchableByText(root, '＋ Add to Log as Post-Workout');
    expect(btn).not.toBeNull();
    await act(async () => { await btn.props.onPress(); });

    expect(api.createMeal).toHaveBeenCalledWith({
      mealType: 'postworkout',
      items: [{ name: 'Recovery Bowl 🍚', calories: 480, proteinG: 40, carbsG: 50, fatG: 10, source: 'suggestion' }],
    });
  });

  it('labels a preworkout-tagged suggestion as a Pre-Workout add', async () => {
    const { root, api } = await renderHealthScreen({
      daily: createDaily(),
      suggestions: [
        createSuggestion({
          title: 'Quick Energy ⚡',
          tags: ['preworkout', 'energy'],
          calories: 280,
          proteinG: 15,
          carbsG: 45,
          fatG: 3,
        }),
      ],
    });

    const btn = findTouchableByText(root, '＋ Add to Log as Pre-Workout');
    expect(btn).not.toBeNull();
    await act(async () => { await btn.props.onPress(); });

    expect(api.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        mealType: 'preworkout',
        items: [expect.objectContaining({ name: 'Quick Energy ⚡', source: 'suggestion' })],
      })
    );
  });

  it('updates height/weight and recalculates goals from the Body Stats shortcut', async () => {
    const { root, api } = await renderHealthScreen();
    api.recalculateGoals.mockResolvedValue({
      data: { calorieTarget: 2200, proteinTargetGrams: 160, waterGoalMl: 2800 },
    });

    // Fields are prefilled from the profile (175 cm / 70 kg).
    expect(root.findByProps({ testID: 'body-height' }).props.value).toBe('175');
    expect(root.findByProps({ testID: 'body-weight' }).props.value).toBe('70');

    await setQuickField(root, 'body-height', '180');
    await setQuickField(root, 'body-weight', '80');
    const btn = findTouchableByText(root, 'Update & Recalculate Goals');
    expect(btn).not.toBeNull();
    await act(async () => { await btn.props.onPress(); });

    expect(api.recalculateGoals).toHaveBeenCalledWith({
      heightCm: 180,
      weightKg: 80,
      primaryGoal: 'build_muscle',
    });
    expect(Alert.alert).toHaveBeenCalledWith('Goals updated 🎯', expect.stringContaining('2200'));
  });

  it('deletes a logged meal after confirmation', async () => {
    const { root, api } = await renderHealthScreen({
      daily: createDaily({
        meals: [{ id: 'm1', mealType: 'general', totalCalories: 300, totalProteinG: 20 }],
      }),
    });

    const deleteBtn = root.findByProps({ accessibilityLabel: 'Delete Meal 1' });
    expect(deleteBtn).not.toBeNull();
    await act(async () => { deleteBtn.props.onPress(); });

    const deleteAction = alertButtons.find((b) => b.text === 'Delete');
    expect(deleteAction).toBeTruthy();
    await act(async () => { await deleteAction.onPress(); });

    expect(api.deleteMeal).toHaveBeenCalledWith('m1');
  });
});
