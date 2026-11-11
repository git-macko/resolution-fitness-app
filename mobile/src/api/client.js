// Resolution Fitness App — API Client
// Handles all communication with the Go backend server.
// Manages JWT token storage and automatic header injection.
//
// ── Physical Device Setup ──────────────────────────────────────
// See src/api/config.js for instructions on configuring the
// backend URL for physical device testing.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from './config';

const TOKEN_KEY = 'auth_token';

// ── Simple in-memory cache with TTL ─────────────────────────────
// Caches GET responses so frequent screen re-mounts don't
// trigger redundant network requests.
const cache = new Map();
const CACHE_TTL_MS = 30_000; // 30 seconds

// ── Cold-start warm-up ───────────────────────────────────────────────
// The backend runs on Render's free tier, which sleeps the instance after
// ~15 minutes without traffic; the next request waits 30-60 s for it to
// boot. That is longer than the per-request timeout below, so the first
// request after any idle period used to fail every time. When the API has
// been quiet we ping /api/health first (with a generous budget) and only
// then send the real, normally-timed request.
const IDLE_BEFORE_WAKE_MS = 5 * 60 * 1000;
const WAKE_TIMEOUT_MS = 60_000;
const WAKE_ATTEMPT_TIMEOUT_MS = 10_000;
const WAKE_RETRY_DELAY_MS = 3_000;

// Last time the API answered successfully (0 = nothing yet this session).
let lastSuccessAt = 0;
// Shared in-flight warm-up, so parallel requests wait on one health poll.
let wakingUp = null;
// Warm-up state is shared with the UI so a cold start can explain itself.
let isWarming = false;
const warmUpListeners = new Set();

function setWarming(next) {
  if (isWarming === next) return;
  isWarming = next;
  for (const listener of warmUpListeners) {
    try {
      listener(isWarming);
    } catch {
      // A broken listener must never break a request.
    }
  }
}

function getCacheKey(endpoint, options) {
  // Only cache GET requests
  if (options.method && options.method !== 'GET') return null;
  return `${endpoint}|${JSON.stringify(options.headers || {})}`;
}

function getCached(key) {
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  if (!key) return;
  cache.set(key, { data, timestamp: Date.now() });
  // Evict old entries if cache grows too large
  if (cache.size > 50) {
    const oldest = cache.entries().next().value;
    if (oldest) cache.delete(oldest[0]);
  }
}

function invalidateCache(pattern) {
  // Invalidate all cache keys that start with the given endpoint pattern
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) {
      cache.delete(key);
    }
  }
}

class ApiClient {
  // ── Token Management ───────────────────────────────────────────

  async getToken() {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  async setToken(token) {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.error('Failed to save token', e);
    }
  }

  async removeToken() {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.error('Failed to remove token', e);
    }
  }

  // ── Cold-start Warm-up ─────────────────────────────────────────────

  // Whether the client is currently waiting for a sleeping server to boot.
  isWarmingUp() {
    return isWarming;
  }

  // Subscribes to warm-up state changes (for the "waking up" notice).
  // Returns an unsubscribe function.
  subscribeWarmUp(listener) {
    warmUpListeners.add(listener);
    return () => warmUpListeners.delete(listener);
  }

  // Waits for a sleeping instance to boot when the API has been idle.
  // Never throws: the caller's own request reports any real failure.
  async warmUpIfIdle() {
    if (Date.now() - lastSuccessAt < IDLE_BEFORE_WAKE_MS) return;
    if (!wakingUp) {
      setWarming(true);
      wakingUp = this.waitForServer().finally(() => {
        wakingUp = null;
        setWarming(false);
      });
    }
    try {
      await wakingUp;
    } catch {
      // Still booting or offline — let the request below surface the error.
    }
  }

  // Polls /api/health until the instance answers, so a sleeping service gets
  // its full boot budget before the real request is sent.
  async waitForServer() {
    const deadline = Date.now() + WAKE_TIMEOUT_MS;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WAKE_ATTEMPT_TIMEOUT_MS);
      try {
        const response = await fetch(`${BASE_URL}/api/health`, {
          signal: controller.signal,
        });
        if (response.ok) {
          lastSuccessAt = Date.now();
          return;
        }
      } catch (err) {
        // A real network failure (offline, DNS, connection refused) won't fix
        // itself by waiting, so give up immediately and let the request fail
        // fast. Only a timeout means the instance is still booting.
        if (err?.name !== 'AbortError') throw err;
      } finally {
        clearTimeout(timer);
      }
      if (Date.now() + WAKE_RETRY_DELAY_MS >= deadline) {
        throw new Error('Server did not respond in time');
      }
      await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAY_MS));
    }
  }

  // ── Core Request Method ────────────────────────────────────────

  async request(endpoint, options = {}) {
    const token = await this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    // Don't set Content-Type for FormData (multipart)
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    // ── Check cache for GET requests (unless skipCache is set) ──
    const cacheKey = getCacheKey(endpoint, options);
    if (cacheKey && !options.skipCache) {
      const cached = getCached(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // ── Wake a sleeping instance before the timed request ──────
    await this.warmUpIfIdle();

    // ── 15-second timeout to prevent infinite loading ──────────
    // Longer-lived calls (e.g. AI image generation) can pass options.timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);
    config.signal = controller.signal;

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, config);

      // Handle non-JSON responses (e.g. plain-text 404 from reverse proxy)
      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        // If it looks like JSON, try to parse it
        const trimmed = text.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { data = JSON.parse(trimmed); } catch { data = null; }
        }
        if (!data) {
          const error = new Error(
            response.ok ? 'Unexpected response format' : `Request failed (${response.status})`
          );
          error.status = response.status;
          throw error;
        }
      }

      if (!response.ok) {
        const error = new Error(data.error || 'Something went wrong');
        // Attach the HTTP status so screens can react to specific cases
        // (e.g. 409 Conflict → email already registered).
        error.status = response.status;
        throw error;
      }

      // Any successful (2xx) response proves the API is awake.
      lastSuccessAt = Date.now();

      // Cache successful GET responses
      if (cacheKey && !options.skipCache) {
        setCached(cacheKey, data);
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Auth ───────────────────────────────────────────────────────

  async register(email, password) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await this.setToken(data.token);
    cache.clear(); // Drop anything cached for a previous session
    return data;
  }

  async login(email, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await this.setToken(data.token);
    cache.clear(); // Ensure no stale data from a previous session bleeds in
    return data;
  }

  async refreshToken() {
    return this.request('/api/auth/refresh', { method: 'POST' });
  }

  async logout() {
    cache.clear(); // Clear all cached responses so stale data doesn't persist across sessions
    await this.removeToken();
  }

  // ── Profile ────────────────────────────────────────────────────

  async getProfile() {
    return this.request('/api/profile');
  }

  async updateProfile(fields) {
    return this.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  async uploadProfilePicture(imageUri) {
    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename || '');
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('profilePic', {
      uri: imageUri,
      name: filename || 'photo.jpg',
      type,
    });

    return this.request('/api/profile/picture', {
      method: 'POST',
      body: formData,
    });
  }

  async completeOnboarding(fields) {
    return this.request('/api/profile/onboarding', {
      method: 'POST',
      body: JSON.stringify(fields),
    });
  }

  // Recomputes daily calorie / protein / water targets from body stats.
  // Pass heightCm / weightKg / primaryGoal to also update the profile.
  async recalculateGoals(fields) {
    invalidateCache('/api/profile/settings');
    invalidateCache('/api/nutrition');
    invalidateCache('/api/dashboard');
    return this.request('/api/profile/goals', {
      method: 'POST',
      body: JSON.stringify(fields || {}),
    });
  }

  async deleteAccount(password) {
    return this.request('/api/profile', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  }

  // ── Settings ───────────────────────────────────────────────────

  async getSettings(options) {
    return this.request('/api/profile/settings', options);
  }

  async updateSettings(fields) {
    return this.request('/api/profile/settings', {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  // ── Dashboard ──────────────────────────────────────────────────

  async getDashboard(options) {
    return this.request('/api/dashboard', options);
  }

  // ── Gym ────────────────────────────────────────────────────────────

  async getGym() {
    return this.request('/api/profile/gym');
  }

  async updateGym(fields) {
    invalidateCache('/api/profile/gym');
    invalidateCache('/api/dashboard');
    return this.request('/api/profile/gym', {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  async refreshGymHours() {
    invalidateCache('/api/profile/gym');
    invalidateCache('/api/dashboard');
    invalidateCache('/api/gym-crowd');
    return this.request('/api/profile/gym/refresh-hours', {
      method: 'POST',
      body: '',
    });
  }

  async getGymCrowd() {
    return this.request('/api/gym-crowd');
  }

  async reportGymCrowd(level) {
    invalidateCache('/api/gym-crowd');
    invalidateCache('/api/dashboard');
    return this.request('/api/gym-crowd/report', {
      method: 'POST',
      body: JSON.stringify({ level }),
    });
  }

  async searchGyms(query) {
    return this.request(`/api/gyms/search?q=${encodeURIComponent(query || '')}`);
  }

  async getGymDetails({ placeId, lat, lng } = {}) {
    let url = '/api/gyms/details?';
    if (placeId) {
      url += `placeId=${encodeURIComponent(placeId)}`;
    } else if (lat != null && lng != null) {
      url += `lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    }
    return this.request(url);
  }

  // ── Exercises ──────────────────────────────────────────────────

  async getExercises(muscleGroup, options) {
    const query = muscleGroup ? `?muscle_group=${muscleGroup}` : '';
    return this.request(`/api/exercises${query}`, options);
  }

  async getExercise(exerciseId, options) {
    return this.request(`/api/exercises/${exerciseId}`, options);
  }

  async generateExerciseImage(exerciseId, options) {
    invalidateCache('/api/exercises');
    return this.request(`/api/exercises/${exerciseId}/generate-image`, {
      method: 'POST',
      timeout: 90000,
      ...options,
    });
  }

  async generateAllExerciseImages(muscleGroup, options) {
    invalidateCache('/api/exercises');
    const query = muscleGroup ? `?muscle_group=${encodeURIComponent(muscleGroup)}` : '';
    return this.request(`/api/exercises/generate-images${query}`, {
      method: 'POST',
      ...options,
    });
  }

  async getExerciseImageStatus(jobId, options) {
    return this.request(`/api/exercises/generate-images/status?id=${encodeURIComponent(jobId)}`, options);
  }

  // ── Weekly Plans ───────────────────────────────────────────────

  async getPlans(options) {
    const query = options?.week ? `?week=${encodeURIComponent(options.week)}` : '';
    return this.request(`/api/plans${query}`, options);
  }

  async createPlan(plan) {
    invalidateCache('/api/plans');
    return this.request('/api/plans', {
      method: 'POST',
      body: JSON.stringify({
        name: plan.name,
        mode: plan.mode || '',
        modeGoal: plan.modeGoal || '',
        routineType: plan.routineType || 'consistent',
        weekStartDate: plan.weekStartDate || '',
        days: plan.days,
      }),
    });
  }

  async getPlan(planId, options) {
    return this.request(`/api/plans/${planId}`, options);
  }

  async updatePlan(planId, fields) {
    invalidateCache('/api/plans');
    return this.request(`/api/plans/${planId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: fields.name,
        mode: fields.mode || '',
        modeGoal: fields.modeGoal || '',
        routineType: fields.routineType || '',
        weekStartDate: fields.weekStartDate || '',
        days: fields.days,
      }),
    });
  }

  async deletePlan(planId) {
    invalidateCache('/api/plans');
    return this.request(`/api/plans/${planId}`, { method: 'DELETE' });
  }

  async clonePlan(planId) {
    invalidateCache('/api/plans');
    return this.request(`/api/plans/${planId}/clone`, { method: 'POST' });
  }

  async setActivePlan(planId) {
    invalidateCache('/api/plans');
    invalidateCache('/api/dashboard');
    return this.request(`/api/plans/${planId}/activate`, { method: 'POST' });
  }

  async getWorkoutTemplates(options) {
    return this.request('/api/workout-templates', options);
  }

  // ── Workout Sessions ───────────────────────────────────────────

  async startWorkout(session) {
    invalidateCache('/api/workouts');
    invalidateCache('/api/dashboard');
    return this.request('/api/workouts', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  }

  async getWorkoutSession(sessionId, options) {
    return this.request(`/api/workouts/${sessionId}`, options);
  }

  async updateWorkoutSession(sessionId, fields) {
    return this.request(`/api/workouts/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  async completeWorkout(sessionId) {
    invalidateCache('/api/workouts');
    invalidateCache('/api/dashboard');
    invalidateCache('/api/plans');
    return this.request(`/api/workouts/${sessionId}/complete`, {
      method: 'POST',
    });
  }

  async cancelWorkout(sessionId) {
    invalidateCache('/api/workouts');
    return this.request(`/api/workouts/${sessionId}/cancel`, {
      method: 'POST',
    });
  }

  async getWorkoutHistory(options) {
    return this.request('/api/workouts/history', options);
  }

  // ── Nutrition ──────────────────────────────────────────────────

  async getDailyNutrition(date, options) {
    const query = date ? `?date=${date}` : '';
    return this.request(`/api/nutrition/daily${query}`, options);
  }

  async createMeal(meal) {
    invalidateCache('/api/nutrition');
    invalidateCache('/api/dashboard');
    return this.request('/api/nutrition/meals', {
      method: 'POST',
      body: JSON.stringify(meal),
    });
  }

  async updateMeal(mealId, fields) {
    invalidateCache('/api/nutrition');
    invalidateCache('/api/dashboard');
    return this.request(`/api/nutrition/meals/${mealId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  }

  async deleteMeal(mealId) {
    invalidateCache('/api/nutrition');
    invalidateCache('/api/dashboard');
    return this.request(`/api/nutrition/meals/${mealId}`, {
      method: 'DELETE',
    });
  }

  async logWater(amountMl) {
    invalidateCache('/api/nutrition');
    invalidateCache('/api/dashboard');
    return this.request('/api/nutrition/water', {
      method: 'POST',
      body: JSON.stringify({ amountMl }),
    });
  }

  async getWeeklyNutrition(options) {
    return this.request('/api/nutrition/weekly', options);
  }

  async getMealSuggestions(options) {
    return this.request('/api/nutrition/suggestions', options);
  }

  // ── Build Inspiration ──────────────────────────────────────────
  // Inspiration data rides along in the GET /api/dashboard payload.

  async uploadInspirationPhoto(imageUri) {
    invalidateCache('/api/dashboard');
    invalidateCache('/api/inspiration');
    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename || '');
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('photo', {
      uri: imageUri,
      name: filename || 'photo.jpg',
      type,
    });

    return this.request('/api/inspiration/photos', {
      method: 'POST',
      body: formData,
    });
  }

  async deleteInspirationPhoto(photoId) {
    invalidateCache('/api/dashboard');
    invalidateCache('/api/inspiration');
    return this.request(`/api/inspiration/photos/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
    });
  }

  async reorderInspirationPhotos(photoIds) {
    invalidateCache('/api/dashboard');
    invalidateCache('/api/inspiration');
    return this.request('/api/inspiration/reorder', {
      method: 'PUT',
      body: JSON.stringify({ photoIds }),
    });
  }

  // ── Food Scanner ───────────────────────────────────────────────

  async scanFood(imageUri) {
    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename || '');
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('foodPhoto', {
      uri: imageUri,
      name: filename || 'food.jpg',
      type,
    });

    return this.request('/api/food-scan', {
      method: 'POST',
      body: formData,
    });
  }

  async logScannedFood(scanId, mealType) {
    return this.request('/api/food-scan/log', {
      method: 'POST',
      body: JSON.stringify({ scanId, mealType }),
    });
  }

  async getScanHistory(options) {
    return this.request('/api/food-scan/history', options);
  }

  // ── Weight Tracking ────────────────────────────────────────────

  async getWeightLogs(options) {
    return this.request('/api/weight', options);
  }

  async logWeight(weightKg, bodyFatPercentage, notes) {
    invalidateCache('/api/weight');
    invalidateCache('/api/dashboard');
    return this.request('/api/weight', {
      method: 'POST',
      body: JSON.stringify({ weightKg, bodyFatPercentage, notes }),
    });
  }

  async deleteWeightLog(logId) {
    invalidateCache('/api/weight');
    invalidateCache('/api/dashboard');
    return this.request(`/api/weight/${logId}`, { method: 'DELETE' });
  }

  // ── Body Measurements ──────────────────────────────────────────

  async getMeasurements(options) {
    return this.request('/api/measurements', options);
  }

  async logMeasurements(measurements) {
    invalidateCache('/api/measurements');
    invalidateCache('/api/dashboard');
    return this.request('/api/measurements', {
      method: 'POST',
      body: JSON.stringify(measurements),
    });
  }

  // ── Sleep ──────────────────────────────────────────────────────

  async getSleepLogs(options) {
    return this.request('/api/sleep', options);
  }

  async logSleep(sleep) {
    invalidateCache('/api/sleep');
    invalidateCache('/api/dashboard');
    return this.request('/api/sleep', {
      method: 'POST',
      body: JSON.stringify(sleep),
    });
  }

  // ── Progression Badges ───────────────────────────────────────

  async getBadges(options) {
    return this.request('/api/badges', options);
  }

  // ── Quotes & Facts ───────────────────────────────────────────

  async getRandomQuote(excludeId, options) {
    const query = excludeId ? `?exclude=${encodeURIComponent(excludeId)}` : '';
    return this.request(`/api/quotes${query}`, options);
  }

  async getRandomFact(excludeId, options) {
    const query = excludeId ? `?exclude=${encodeURIComponent(excludeId)}` : '';
    return this.request(`/api/facts${query}`, options);
  }

  // ── AI Chat ────────────────────────────────────────────────────

  async sendChatMessage(message) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async createChatPlan(message, routineType) {
    invalidateCache('/api/plans');
    return this.request('/api/chat/plan', {
      method: 'POST',
      body: JSON.stringify({ message, routineType }),
    });
  }

  // Streams a chat message from POST /api/chat/stream.
  // Calls onChunk(text) as each piece of the reply arrives and onDone(fullText)
  // when the stream finishes. onError(error) is called if the request fails.
  async sendChatMessageStream(message, onChunk, onDone, onError) {
    const token = await this.getToken();
    // The streaming XHR has its own 60 s timeout; wake the server first.
    await this.warmUpIfIdle();

    const xhr = new XMLHttpRequest();
    let rawBuffer = '';
    let fullText = '';
    let parseOffset = 0; // bytes of responseText already processed

    xhr.open('POST', `${BASE_URL}/api/chat/stream`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    const parseEvents = (text) => {
      rawBuffer += text;
      const parts = rawBuffer.split('\n\n');
      // Keep the last incomplete part in the buffer.
      rawBuffer = parts.pop() || '';

      for (const eventText of parts) {
        const trimmed = eventText.trim();
        if (!trimmed) continue;

        const lines = trimmed.split('\n');
        let eventName = 'chunk';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            data = line.slice(5).trim();
          }
        }

        try {
          const payload = JSON.parse(data);
          if (eventName === 'chunk' && payload.text) {
            fullText += payload.text;
            onChunk(payload.text);
          } else if (eventName === 'done') {
            fullText = payload.text || fullText;
          } else if (eventName === 'error') {
            onError(new Error(payload.text || 'AI limit reached'));
          }
        } catch (e) {
          // Ignore malformed events.
        }
      }
    };

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(parseOffset);
      parseOffset = xhr.responseText.length;
      if (!newText) return;
      parseEvents(newText);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        onError(new Error(`Request failed with status ${xhr.status}`));
        return;
      }
      // Parse any remaining buffered data.
      parseEvents('');
      onDone(fullText);
    };

    xhr.onerror = () => {
      onError(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      onError(new Error('Request timed out'));
    };

    xhr.timeout = 60000;
    xhr.send(JSON.stringify({ message }));

    return xhr;
  }

  async getChatHistory(options) {
    return this.request('/api/chat/history', options);
  }

  async getChatSuggestions(options) {
    return this.request('/api/chat/suggestions', options);
  }

  async clearChatHistory() {
    return this.request('/api/chat/history', { method: 'DELETE' });
  }

  async deleteChatMessage(messageId) {
    return this.request(`/api/chat/history/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
  }
}

export default new ApiClient();
