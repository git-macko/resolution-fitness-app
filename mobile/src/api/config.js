// Resolution Fitness App — Backend URL Configuration
//
// ── How It Works ─────────────────────────────────────────────
// The app auto-detects whether it's running on an emulator,
// simulator, or physical device and picks the correct URL:
//
//   Android Emulator  → 10.0.2.2:8080  (virtual router to host)
//   Android Physical  → LAN_IP:8080     (WiFi to host PC)
//   iOS Simulator     → localhost:8080  (same machine)
//   iOS Physical      → LAN_IP:8080     (WiFi to host Mac)
//   Web               → LAN_IP:8080
//
// ── Before Each Session ──────────────────────────────────────
// 1. Run:  bash scripts/update-lan-ip.sh
//    This auto-detects your LAN IP and updates YOUR_LAN_IP below.
// 2. Start backend:  cd backend && go run .
// 3. Start Expo:     npx expo start --clear
// 4. Scan QR code with Expo Go or press 'a' for Android emulator
//
// ── Debug Override ───────────────────────────────────────────
// Set backendUrl in app.json > extra to force a specific URL.
// Leave it empty for auto-detection to work.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

// ── 1. Your computer's LAN IP (auto-updated by update-lan-ip.sh) ──
const YOUR_LAN_IP = '192.168.88.7';

// ── 2. Backend port ──
const BACKEND_PORT = '8080';

// ── URL Resolution ─────────────────────────────────────────────
// Priority:
//   1. app.json extra.backendUrl (manual override for debugging)
//   2. Auto-detect by platform + device type (below)
//   3. YOUR_LAN_IP (fallback)

function resolveBackendUrl() {
  // Explicit override in app.json — only use if explicitly set
  const extraUrl = Constants.expoConfig?.extra?.backendUrl;
  if (extraUrl) {
    return extraUrl.replace(/\/+$/, '');
  }

  // ── Android ──────────────────────────────────────────────
  if (Platform.OS === 'android') {
    if (Device.isDevice) {
      // Physical Android phone on WiFi → need LAN IP
      return `http://${YOUR_LAN_IP}:${BACKEND_PORT}`;
    }
    // Android emulator → 10.0.2.2 is virtual router to host PC
    return `http://10.0.2.2:${BACKEND_PORT}`;
  }

  // ── iOS ──────────────────────────────────────────────────
  if (Platform.OS === 'ios') {
    if (Device.isDevice) {
      // Physical iPhone/iPad on WiFi → need LAN IP
      return `http://${YOUR_LAN_IP}:${BACKEND_PORT}`;
    }
    // iOS simulator → localhost works
    return `http://localhost:${BACKEND_PORT}`;
  }

  // ── Web ──────────────────────────────────────────────────
  return `http://${YOUR_LAN_IP}:${BACKEND_PORT}`;
}

export const BASE_URL = resolveBackendUrl();
export default BASE_URL;
