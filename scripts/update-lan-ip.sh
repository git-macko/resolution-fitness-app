#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# update-lan-ip.sh
# Auto-detects the current LAN IPv4 address and updates YOUR_LAN_IP
# in the mobile app's config.js.
#
# Usage:
#   cd Resolution-fitnessapp && bash scripts/update-lan-ip.sh
#
# Or from anywhere:
#   bash path/to/scripts/update-lan-ip.sh
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────
CONFIG_FILE="mobile/src/api/config.js"
SENTINEL="YOUR_LAN_IP"

# ── Resolve CONFIG_FILE relative to script location ─────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_PATH="$PROJECT_DIR/$CONFIG_FILE"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "❌ Could not find $CONFIG_FILE at $CONFIG_PATH"
  echo "   Run this script from the Resolution-fitnessapp directory or use an absolute path."
  exit 1
fi

# ── Step 1: Detect current LAN IP ───────────────────────────────────
# On Windows (bash): parse ipconfig output for IPv4 addresses,
# excluding loopback (127.x), Docker, Hyper-V, etc.
# On macOS/Linux: use ifconfig | inet.
#
# Strategy: prefer the first non-virtual, non-loopback IPv4 address
# found on an active adapter.

detected_ip=""

if command -v ipconfig &>/dev/null; then
  # ── Windows via ipconfig ─────────────────────────────────────────
  # ipconfig output looks like:
  #   IPv4 Address. . . . . . . . . . . : 192.168.1.42
  # We take the first IPv4 address that isn't 127.x, 169.254.x, or
  # a virtual adapter range (172.x, 10.x are fine — they're real LANs).
  detected_ip=$(ipconfig 2>/dev/null | grep -i "IPv4" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
    | grep -v '^127\.' | grep -v '^169\.254\.' | head -1)
elif command -v ifconfig &>/dev/null; then
  # ── macOS / Linux via ifconfig ───────────────────────────────────
  detected_ip=$(ifconfig 2>/dev/null | grep -oE 'inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' \
    | grep -v '^127\.' | grep -v '^169\.254\.' | head -1)
fi

if [ -z "$detected_ip" ]; then
  echo "❌ Could not detect a valid LAN IPv4 address."
  echo "   Make sure you are connected to a network."
  echo ""
  echo "   Manually check with:"
  echo "     Windows: ipconfig | grep IPv4"
  echo "     macOS:   ifconfig | grep inet"
  exit 1
fi

echo "🔍 Detected LAN IP: $detected_ip"

# ── Step 2: Extract current IP from config.js ───────────────────────
current_ip=$(grep -oE "${SENTINEL} *= *'[^']*'" "$CONFIG_PATH" \
  | sed "s/^${SENTINEL} *= *'//;s/'$//" || echo "")

if [ -z "$current_ip" ]; then
  echo "⚠️  Could not read current IP from $CONFIG_FILE (format may differ from expected)."
  echo "   Will attempt replacement anyway."
fi

if [ "$current_ip" = "$detected_ip" ]; then
  echo "✅ LAN IP is already up to date ($detected_ip). No changes needed."
  exit 0
fi

# ── Step 3: Update config.js ────────────────────────────────────────
if command -v sed &>/dev/null; then
  # Use sed with a backup (.bak)
  sed -i.bak "s/\(${SENTINEL}\s*=\s*'\)[^']*'/\1${detected_ip}'/" "$CONFIG_PATH"
  rm -f "${CONFIG_PATH}.bak"  # Clean up backup
  echo "✏️  Updated $CONFIG_FILE: $current_ip → $detected_ip"
else
  # Fallback: use Node.js (should be available since this is a React Native project)
  node -e "
    const fs = require('fs');
    const path = '$CONFIG_PATH';
    let content = fs.readFileSync(path, 'utf8');
    const updated = content.replace(
      /(${SENTINEL}\s*=\s*')[^']*'/,
      '\$1${detected_ip}\''
    );
    fs.writeFileSync(path, updated, 'utf8');
    console.log('✅ Updated via Node.js');
  "
  echo "✏️  Updated $CONFIG_FILE: ${current_ip:-unknown} → $detected_ip"
fi

# ── Step 4: Confirm ─────────────────────────────────────────────────
echo ""
echo "┌──────────────────────────────────────────────────┐"
echo "│  ✅ config.js updated with your current LAN IP   │"
echo "│                                                  │"
echo "│  ${detected_ip} ← your server IP            │"
echo "│                                                  │"
echo "│  Start your backend:                             │"
echo "│    cd backend && go run .                        │"
echo "│                                                  │"
echo "│  Start Expo:                                     │"
echo "│    cd mobile && npx expo start                   │"
echo "└──────────────────────────────────────────────────┘"
