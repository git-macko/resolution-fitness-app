// Shared helper for formatting a venue's opening hours.
// Supports both Google Places (weekdayText array) and OSM fallback (rawText).
export function formatTodayHours(openingHoursJSON) {
  try {
    const hours = typeof openingHoursJSON === 'string' ? JSON.parse(openingHoursJSON) : openingHoursJSON;
    if (!hours) return '';
    if (hours.rawText) {
      return hours.rawText;
    }
    if (!hours.weekdayText || hours.weekdayText.length === 0) return '';
    const todayIndex = new Date().getDay();
    // Google weekdayText is ordered Monday (0) to Sunday (6)
    const map = [6, 0, 1, 2, 3, 4, 5];
    return hours.weekdayText[map[todayIndex]] || '';
  } catch {
    return '';
  }
}

// Converts a 24-hour time string (e.g. "14:00") to 12-hour format ("2:00 PM").
// Already-12-hour strings and non-time strings pass through unchanged.
function to12HourTime(timeStr) {
  const match = String(timeStr).trim().match(/^([0-9]{1,2}):([0-9]{2})\s*(AM|PM|am|pm)?$/i);
  if (!match) return timeStr;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = match[3] ? match[3].toUpperCase() : null;
  if (meridiem) {
    return `${hour}:${minute} ${meridiem}`;
  }
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
}

// Converts all time tokens inside a string to 12-hour format.
// Handles ranges like "06:00 – 22:00" -> "6:00 AM – 10:00 PM".
export function convertTimeStringTo12Hour(input) {
  if (!input) return input;
  return input.replace(/([0-9]{1,2}):([0-9]{2})(\s*(?:AM|PM|am|pm))?/gi, (match, h, m, meridiem) =>
    meridiem ? match : to12HourTime(`${h}:${m}`)
  );
}

// Returns just the time range for today (e.g. "6:00 AM – 10:00 PM"),
// without the leading weekday label. Used for compact "Open now" labels.
export function formatTodayHoursRange(openingHoursJSON) {
  const full = formatTodayHours(openingHoursJSON);
  if (!full) return '';
  // Google weekdayText format: "Monday: 6:00 AM – 10:00 PM"
  let range = full;
  if (full.includes(': ')) {
    range = full.split(': ').slice(1).join(': ');
  }
  return convertTimeStringTo12Hour(range);
}

// Parses opening hours JSON and returns a structured object with today's
// hours and the full week schedule. Used for the expandable gym card UI.
export function parseOpeningHours(openingHoursJSON) {
  try {
    const hours = typeof openingHoursJSON === 'string' ? JSON.parse(openingHoursJSON) : openingHoursJSON;
    if (!hours) return { hasHours: false, todayRange: '', week: [] };

    if (hours.rawText) {
      return {
        hasHours: true,
        todayRange: hours.rawText,
        week: [{ day: 'Hours', hours: hours.rawText }],
      };
    }

    // Some sources provide periods but no weekdayText. Build a usable
    // weekdayText from the periods so the card can still expand.
    if ((!hours.weekdayText || hours.weekdayText.length === 0) && hours.periods && hours.periods.length > 0) {
      hours.weekdayText = buildWeekdayTextFromPeriods(hours.periods);
    }

    if (!hours.weekdayText || hours.weekdayText.length === 0) {
      return { hasHours: false, todayRange: '', week: [] };
    }

    const todayFull = formatTodayHours(hours);
    const todayRange = todayFull.includes(': ')
      ? todayFull.split(': ').slice(1).join(': ')
      : todayFull;

    const week = hours.weekdayText.map((text) => {
      const parts = text.split(': ');
      return {
        day: parts[0] || '',
        hours: convertTimeStringTo12Hour(parts.slice(1).join(': ')) || '',
      };
    });

    return { hasHours: true, todayRange, week };
  } catch {
    return { hasHours: false, todayRange: '', week: [] };
  }
}

// Builds a 7-day weekdayText array from a list of opening periods.
// Each period is expected to have { open: { day, hour, minute }, close: ... }.
// Used as a fallback when the source only supplies periods.
function buildWeekdayTextFromPeriods(periods) {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  // day in periods is 0=Sunday; convert to 0=Monday for the output.
  const dayMap = [6, 0, 1, 2, 3, 4, 5];
  const hoursByDay = {};

  periods.forEach((period) => {
    if (!period.open || !period.close) return;
    if (typeof period.open.day !== 'number' || typeof period.close.day !== 'number') return;
    if (period.open.day < 0 || period.open.day > 6 || period.close.day < 0 || period.close.day > 6) return;
    if (!Number.isFinite(period.open.hour) || !Number.isFinite(period.open.minute)) return;
    if (!Number.isFinite(period.close.hour) || !Number.isFinite(period.close.minute)) return;
    const openDayIndex = dayMap[period.open.day];
    const closeDayIndex = dayMap[period.close.day];
    const openTime = formatOpeningTime(period.open.hour, period.open.minute);
    const closeTime = formatOpeningTime(period.close.hour, period.close.minute);
    const label = openDayIndex === closeDayIndex
      ? `${openTime} – ${closeTime}`
      : `${openTime} – ${dayNames[closeDayIndex]} ${closeTime}`;
    if (!hoursByDay[openDayIndex]) hoursByDay[openDayIndex] = [];
    hoursByDay[openDayIndex].push(label);
  });

  return dayNames.map((day, index) => {
    const labels = hoursByDay[index];
    return labels ? `${day}: ${labels.join(', ')}` : `${day}: Closed`;
  });
}

function formatOpeningTime(hour, minute) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${ampm}`;
}
