/**
 * FitnessScreen.test.js
 *
 * Tests for the expanded plan card rendering with metadata tags.
 * Verifies that mode badge, recurring/one-time badge, active badge,
 * and goal description are rendered in the expanded view (not the
 * collapsed header) for both consistent and one-time plans.
 */

import React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';

// ── Mock fixtures ─────────────────────────────────────────────────
const THIS_MONDAY = '2026-06-22';

const createPlanDay = (overrides = {}) => ({
  id: 'd1',
  dayOfWeek: 0,
  workoutName: 'Push Day',
  isRestDay: false,
  exercises: [{ exerciseId: 'ex1', muscleGroup: 'chest' }],
  estimatedDuration: 45,
  ...overrides,
});

const createConsistentPlan = (overrides = {}) => ({
  id: 'plan-consistent-1',
  name: 'PPL Split',
  routineType: 'consistent',
  isActive: true,
  mode: '',
  modeGoal: '',
  days: [createPlanDay()],
  planDays: null,
  ...overrides,
});

const createOneTimePlan = (overrides = {}) => ({
  id: 'plan-onetime-1',
  name: 'Summer Shred',
  routineType: 'one_time',
  weekStartDate: '2026-07-06',
  isActive: false,
  mode: '',
  modeGoal: '',
  days: [createPlanDay({ dayOfWeek: 1, workoutName: 'HIIT' })],
  planDays: null,
  ...overrides,
});

// ── Module mocks (all hoisted) ───────────────────────────────────

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    getPlans: jest.fn(() => Promise.resolve({})),
    getExercises: jest.fn(() => Promise.resolve({})),
    getWorkoutTemplates: jest.fn(() => Promise.resolve({})),
    getDashboard: jest.fn(() => Promise.resolve({})),
    setActivePlan: jest.fn(),
    clonePlan: jest.fn(),
    deletePlan: jest.fn(),
  },
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

jest.mock('../../components/ExerciseLibrary', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Comp = () => React.createElement(View, { testID: 'exercise-library' },
    React.createElement(Text, null, 'Exercise Lib')
  );
  Comp.displayName = 'ExerciseLibrary';
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

jest.mock('../../utils/dates', () => ({
  getThisWeekMonday: () => THIS_MONDAY,
  formatWeekLabel: (date) => date || 'Mock Week',
  getWeekMonday: (i) => `2026-07-${String(6 + i * 7).padStart(2, '0')}`,
  getWeeksAhead: () => 0,
}));

jest.mock('../../theme/colors', () => ({
  __esModule: true,
  default: {
    primary: '#FF6B00', primaryLight: '#FF8C33', primaryBg: '#FFF3E0',
    offWhite: '#FAFAFA', white: '#FFFFFF', black: '#111111',
    textPrimary: '#111111', textSecondary: '#666666', textMuted: '#999999',
    textWhite: '#FFFFFF', textInverse: '#FFFFFF', error: '#EF4444',
    success: '#22C55E', cardBg: '#FFFFFF',
    gray100: '#F5F5F5', gray200: '#E5E5E5', gray300: '#D4D4D4',
  },
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

// Import after mocks
import FitnessScreen from '../FitnessScreen';

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Get a reference to the mocked API client so each test can
 * configure its return values.
 */
function getMockApi() {
  return require('../../api/client').default;
}

/**
 * Render FitnessScreen with planned API responses.
 */
async function renderFitnessScreen(options = {}) {
  const {
    plans = [],
    exercises = [],
    templates = [],
    stats = null,
  } = options;

  const api = getMockApi();
  api.getPlans.mockResolvedValue({ data: plans });
  api.getExercises.mockResolvedValue({ data: exercises });
  api.getWorkoutTemplates.mockResolvedValue({ data: templates });
  api.getDashboard.mockResolvedValue(
    stats ? { data: { progression: stats } } : { data: {} }
  );

  const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

  let tree;
  await act(async () => {
    tree = TestRenderer.create(React.createElement(FitnessScreen, { navigation: mockNavigation }));
  });
  // Flush pending microtasks from async useFocusEffect -> fetchData
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  return { tree, root: tree.root };
}

/**
 * Extract clean text from rendered tree, collapsing whitespace.
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
    // TestRenderer may store children as props.children
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

// ── Tests ─────────────────────────────────────────────────────────

describe('FitnessScreen — expanded plan card metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════
  // COLLAPSED STATE
  // ═══════════════════════════════════════════════════════════════

  it('collapsed consistent plan shows name and days — no tags', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({ mode: 'Bulking', modeGoal: 'Gain muscle' })],
    });

    const textStr = extractText(root);
    expect(textStr).toContain('PPL Split');
    expect(textStr).toContain('1 days');
    // Tags NOT visible when collapsed
    expect(textStr).not.toContain('Bulking');
    expect(textStr).not.toContain('Recurring');
    expect(textStr).not.toContain('Gain muscle');
  });

  it('collapsed one-time plan shows name and week — no tags', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createOneTimePlan({ mode: 'Leaning', modeGoal: 'Cut fat' })],
    });

    const textStr = extractText(root);
    expect(textStr).toContain('Summer Shred');
    expect(textStr).not.toContain('Leaning');
    // '📅 Override' is the badge text; 'Overrides' appears in the section header
    expect(textStr).not.toContain('📅 Override');
    expect(textStr).not.toContain('Cut fat');
  });

  // ═══════════════════════════════════════════════════════════════
  // EXPANDED STATE — CONSISTENT PLAN
  // ═══════════════════════════════════════════════════════════════

  it('expanded consistent plan shows mode, recurring, and active badges', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({ mode: 'Bulking', isActive: true })],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');
    expect(cardBtn).not.toBeNull();
    await act(async () => { cardBtn.props.onPress(); });

    const textStr = extractText(root);
    expect(textStr).toContain('Bulking');
    expect(textStr).toContain('Recurring');
    expect(textStr).toContain('Active');
  });

  it('expanded consistent plan shows goal description', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({ modeGoal: 'Gain 10 lbs of lean muscle over 12 weeks' })],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');
    await act(async () => { cardBtn.props.onPress(); });

    expect(extractText(root)).toContain('Gain 10 lbs of lean muscle over 12 weeks');
  });

  it('active badge hidden when plan is inactive', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({ isActive: false })],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');
    await act(async () => { cardBtn.props.onPress(); });

    const textStr = extractText(root);
    expect(textStr).toContain('Recurring');
    // Inactive plan should show "Set Active" button, not the active badge
    expect(textStr).toContain('Set Active');
  });

  it('mode badge hidden when plan has no mode', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({ mode: '', isActive: true })],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');
    await act(async () => { cardBtn.props.onPress(); });

    const textStr = extractText(root);
    expect(textStr).toContain('Recurring');
    expect(textStr).toContain('Active');
    expect(textStr).not.toContain('Bulking');
  });

  // ═══════════════════════════════════════════════════════════════
  // EXPANDED STATE — ONE-TIME PLAN
  // ═══════════════════════════════════════════════════════════════

  it('expanded one-time plan shows mode badge and one-time badge', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createOneTimePlan({ mode: 'Leaning' })],
    });

    const cardBtn = findTouchableByText(root, 'Summer Shred');
    expect(cardBtn).not.toBeNull();
    await act(async () => { cardBtn.props.onPress(); });

    const textStr = extractText(root);
    expect(textStr).toContain('Leaning');
    expect(textStr).toContain('Override');
    expect(textStr).not.toContain('Recurring');
    expect(textStr).not.toContain('Active');
  });

  it('expanded one-time plan shows goal description', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createOneTimePlan({ modeGoal: 'Drop to 12% body fat' })],
    });

    const cardBtn = findTouchableByText(root, 'Summer Shred');
    await act(async () => { cardBtn.props.onPress(); });

    expect(extractText(root)).toContain('Drop to 12% body fat');
  });

  // ═══════════════════════════════════════════════════════════════
  // WORKOUT DAYS IN EXPANDED VIEW
  // ═══════════════════════════════════════════════════════════════

  it('expanded plan shows workout days with exercise counts', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({
        days: [
          createPlanDay({ dayOfWeek: 0, workoutName: 'Push Day', exercises: [{}, {}, {}], estimatedDuration: 45 }),
          createPlanDay({ id: 'd2', dayOfWeek: 2, workoutName: 'Pull Day', exercises: [{}, {}], estimatedDuration: 40 }),
        ],
      })],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');
    await act(async () => { cardBtn.props.onPress(); });

    const textStr = extractText(root);
    expect(textStr).toContain('Workout Days');
    expect(textStr).toContain('Mon');
    expect(textStr).toContain('Push Day');
    expect(textStr).toContain('3 exercises');
    expect(textStr).toContain('~ 45 min');
    expect(textStr).toContain('Wed');
    expect(textStr).toContain('Pull Day');
    expect(textStr).toContain('2 exercises');
  });

  it('expanded plan renders rest day correctly', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan({
        days: [
          createPlanDay({ dayOfWeek: 0, workoutName: 'Push Day' }),
          createPlanDay({ id: 'd2', dayOfWeek: 1, isRestDay: true }),
        ],
      })],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');
    await act(async () => { cardBtn.props.onPress(); });

    expect(extractText(root)).toContain('Rest Day');
  });

  // ═══════════════════════════════════════════════════════════════
  // TOGGLE BEHAVIOUR
  // ═══════════════════════════════════════════════════════════════

  it('tapping an expanded plan collapses it', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan()],
    });

    const cardBtn = findTouchableByText(root, 'PPL Split');

    await act(async () => { cardBtn.props.onPress(); });
    expect(extractText(root)).toContain('Recurring');

    await act(async () => { cardBtn.props.onPress(); });
    expect(extractText(root)).not.toContain('Recurring');
  });

  it('shows expand/collapse arrow indicators', async () => {
    const { root } = await renderFitnessScreen({
      plans: [createConsistentPlan()],
    });

    expect(extractText(root)).toContain('\u25BC');

    const cardBtn = findTouchableByText(root, 'PPL Split');
    await act(async () => { cardBtn.props.onPress(); });

    expect(extractText(root)).toContain('\u25B2');
  });
});
