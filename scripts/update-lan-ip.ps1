# ─────────────────────────────────────────────────────────────────────
# update-lan-ip.ps1
# PowerShell version — auto-detects the current LAN IPv4 address
# and updates YOUR_LAN_IP in the mobile app's config.js.
#
# Compatible with PowerShell 5.1+ (Windows 10/11 default).
#
# Usage:
#   Right-click → "Run with PowerShell"
#   OR
#   powershell -ExecutionPolicy Bypass -File scripts\update-lan-ip.ps1
# ─────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# ── Config ──────────────────────────────────────────────────────────
$ConfigRelPath = "mobile\src\api\config.js"
$Sentinel = "YOUR_LAN_IP"

# ── Resolve paths ──────────────────────────────────────────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$ConfigPath = Join-Path $ProjectDir $ConfigRelPath

if (-not (Test-Path $ConfigPath)) {
    Write-Host "Could not find $ConfigRelPath at $ConfigPath" -ForegroundColor Red
    Write-Host "Run this script from the Resolution-fitnessapp directory."
    exit 1
}

# ── Step 1: Detect current LAN IP ──────────────────────────────────
$detectedIp = $null

# Try: Get-NetAdapter (Win8+/Server 2012+, requires NetAdapter module)
$adapters = Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }

foreach ($adapter in $adapters) {
    $ipConfig = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
    foreach ($ip in $ipConfig) {
        $addr = $ip.IPAddress
        if ($addr -like '127.*') { continue }
        if ($addr -like '169.254.*') { continue }
        $detectedIp = $addr
        break
    }
    if ($detectedIp) { break }
}

# Fallback: broader search (works without admin or NetAdapter module)
if (-not $detectedIp) {
    $detectedIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $detectedIp) {
    Write-Host "Could not detect a valid LAN IPv4 address." -ForegroundColor Red
    Write-Host "Make sure you are connected to a network."
    Write-Host ""
    Write-Host "Manually check with: ipconfig | findstr IPv4"
    exit 1
}

Write-Host "Detected LAN IP: $detectedIp" -ForegroundColor Cyan

# ── Step 2: Extract current IP from config.js ──────────────────────
$content = Get-Content $ConfigPath -Raw
$pattern = "${Sentinel}\s*=\s*'(?<ip>[^']+)'"
$match = [regex]::Match($content, $pattern)

if (-not $match.Success) {
    Write-Host "Could not read current IP from config.js (format may differ)." -ForegroundColor Yellow
}

$currentIp = $null
if ($match.Success) {
    $currentIp = $match.Groups['ip'].Value
}

if ($currentIp -eq $detectedIp) {
    Write-Host "LAN IP is already up to date ($detectedIp). No changes needed." -ForegroundColor Green
    exit 0
}

# ── Step 3: Update config.js ───────────────────────────────────────
$escapedSentinel = [regex]::Escape($Sentinel)
$updatedContent = [regex]::Replace($content, "${escapedSentinel}\s*=\s*'[^']*'", "${Sentinel} = '${detectedIp}'")
Set-Content -Path $ConfigPath -Value $updatedContent -NoNewline

$oldDisplay = $currentIp
if (-not $oldDisplay) { $oldDisplay = "unknown" }
Write-Host "Updated config.js: $oldDisplay -> $detectedIp" -ForegroundColor Yellow

# ── Step 4: Confirm ────────────────────────────────────────────────
Write-Host ""
Write-Host "+----------------------------------------------------+"
Write-Host "|  config.js updated with your current LAN IP        |"
Write-Host "|                                                    |"
Write-Host "|  $detectedIp <- your server IP                    |"
Write-Host "|                                                    |"
Write-Host "|  Start your backend:                               |"
Write-Host "|    cd backend && go run .                          |"
Write-Host "|                                                    |"
Write-Host "|  Start Expo:                                       |"
Write-Host "|    cd mobile && npx expo start                     |"
Write-Host "|                                                    |"
Write-Host "|  If Expo was already running, clear the cache:     |"
Write-Host "|    npx expo start --clear                          |"
Write-Host "+----------------------------------------------------+"
