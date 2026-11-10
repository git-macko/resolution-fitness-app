// Resolution Fitness App — Backend URL Configuration
//
// ── How It Works ─────────────────────────────────────────────
// Production builds use extra.backendUrl from app.json (the deployed API).
//
// Development builds (`npx expo start`) deliberately ignore that override
// and talk to the Go server running on this machine instead, so backend
// changes are testable without a deploy:
//
//   Web                → same host as the page (localhost:8080)
//   Android Emulator   → 10.0.2.2:8080  (virtual router to host)
//   iOS Simulator      → localhost:8080 (same machine)
//   Physical device    → dev-server host from Expo (LAN_IP:8080)
//
// ── Before Each Session ──────────────────────────────────────
// 1. Start backend:  cd backend && go run .
// 2. Start Expo:     npx expo start --clear
//
// YOUR_LAN_IP is only a last-resort fallback for development builds where
// Expo cannot report the dev-server host. It rotates with DHCP, so prefer
// the auto-detected host; update it only if a physical device can't connect.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

// ── 1. Your computer's LAN IP — fallback only ──
const YOUR_LAN_IP = '172.16.1.32';

// ── 2. Backend port ──
const BACKEND_PORT = '8080';

const LAN_URL = `http://${YOUR_LAN_IP}:${BACKEND_PORT}`;

// Host of the Expo dev server — i.e. the machine running the backend.
// Examples: "172.16.1.32:8081", "localhost:8081".
function devServerHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return host || null;
}

function resolveBackendUrl() {
  // Production builds → deployed backend from app.json.
  // Development builds ignore it so the local backend is used.
  const extraUrl = Constants.expoConfig?.extra?.backendUrl;
  if (extraUrl && !__DEV__) {
    return extraUrl.replace(/\/+$/, '');
  }

  // ── Web ──────────────────────────────────────────────────
  // Use the same host the page was served from, so localhost and LAN
  // both work without editing this file.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:${BACKEND_PORT}`;
    }
    return LAN_URL;
  }

  // ── Android emulator → 10.0.2.2 is the virtual route to the host ──
  if (Platform.OS === 'android' && !Device.isDevice) {
    return `http://10.0.2.2:${BACKEND_PORT}`;
  }

  // ── iOS simulator → shares the host machine ──
  if (Platform.OS === 'ios' && !Device.isDevice) {
    return `http://localhost:${BACKEND_PORT}`;
  }

  // ── Physical device → the address Expo reached this machine on ──
  const devHost = devServerHost();
  if (devHost) {
    return `http://${devHost}:${BACKEND_PORT}`;
  }

  return LAN_URL;
}

export const BASE_URL = resolveBackendUrl();
export default BASE_URL;
