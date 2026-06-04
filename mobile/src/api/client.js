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

    // ── 15-second timeout to prevent infinite loading ──────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    config.signal = controller.signal;

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

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

  // ── Exercises ──────────────────────────────────────────────────

  async getExercises(muscleGroup, options) {
    const query = muscleGroup ? `?muscle_group=${muscleGroup}` : '';
    return this.request(`/api/exercises${query}`, options);
  }

  async getExercise(exerciseId, options) {
    return this.request(`/api/exercises/${exerciseId}`, options);
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

  // ── Food Scanner ───────────────────────────────────────────────

  async scanFood(imageUri) {
    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename || '');
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('foodImage', {
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

  // ── AI Chat ────────────────────────────────────────────────────

  async sendChatMessage(message) {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
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
}

export default new ApiClient();
