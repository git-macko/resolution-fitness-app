// Resolution Fitness App — Shared Date Utilities
// Used by CreatePlanScreen, FitnessScreen, and any other screen
// that needs week-based date calculations.

/**
 * Returns the Monday of the current week as YYYY-MM-DD.
 * Weeks start on Monday (ISO week standard).
 */
export function getThisWeekMonday() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday offset
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

/**
 * Returns the Monday date `weeksAhead` weeks from this week.
 * 0 = this week, 1 = next week, 2 = week after, etc.
 */
export function getWeekMonday(weeksAhead = 0) {
  const d = new Date(getThisWeekMonday() + 'T00:00:00');
  d.setDate(d.getDate() + weeksAhead * 7);
  return d.toISOString().split('T')[0];
}

/**
 * Formats a Monday date string into a readable week range label.
 * Example: "Jun 2 – Jun 8"
 */
export function formatWeekLabel(mondayStr) {
  if (!mondayStr) return '';
  const d = new Date(mondayStr + 'T00:00:00');
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${d.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

/**
 * Given a plan's weekStartDate, calculates how many weeks ahead it is
 * from this week's Monday. Returns 0 for this week, 1 for next, etc.
 * Returns 0 if the date is in the past or can't be parsed.
 */
export function getWeeksAhead(weekStartDate) {
  if (!weekStartDate) return 0;
  const thisMonday = new Date(getThisWeekMonday() + 'T00:00:00');
  const target = new Date(weekStartDate + 'T00:00:00');
  if (isNaN(target.getTime())) return 0;
  const diffMs = target.getTime() - thisMonday.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, diffWeeks);
}
