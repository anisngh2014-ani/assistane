/* eslint-disable */
const { app, Tray, Menu, BrowserWindow, Notification, nativeImage, ipcMain, clipboard, screen } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const config = require("./config");
const permissions = require("./permissions");
const nativeBridge = require("./native-bridge-client");
const { execSync } = require("child_process");
const MARK_OFFLINE_AND_EXIT_ARG = "--mark-offline-and-exit";
const isOfflineMarkerProcess = process.argv.includes(MARK_OFFLINE_AND_EXIT_ARG);

// ── Prevent multiple instances ────────────────────────────────
const gotLock = isOfflineMarkerProcess || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ── State ─────────────────────────────────────────────────────
let tray = null;
let settingsWindow = null;
let screenShareWindow = null;
let blackScreenWindow = null;
let blackScreenWindows = [];
let blackScreenPrivacyTimer = null;
let chatWindow = null;
let pairingWindow = null;
let heartbeatTimer = null;
let signalPollTimer = null;
let commandPollTimer = null;
let lastSignalId = null; // track which signal we already handled
let isOnline = false;
let lastHeartbeat = null;
let deviceInfo = null;
let isPairing = false;
let signalPollInFlight = false;
let commandPollInFlight = false;
let signalBackoffUntil = 0;
let commandBackoffUntil = 0;
let restartingAfterTrayQuit = false;
let remoteControlConfig = {
  remote_input_disabled: false,
  wallpaper_enabled: true,
  video_quality: "high",
};

const SIGNAL_POLL_INTERVAL_MS = 2000;
const COMMAND_POLL_INTERVAL_MS = 2000;
const RATE_LIMIT_BACKOFF_MS = 10000;
const CLIPBOARD_PAIRING_PREFIX = "ASSISTANE_SUPPORT_CODE:";

// ── Paths ─────────────────────────────────────────────────────
const DATA_PATH = path.join(app.getPath("userData"), "device.json");
const MANUAL_STOP_PATH = path.join(app.getPath("userData"), "manual-stop.json");
const SCHEDULED_LAUNCH_ARG = "--scheduled";

// ── Persistence ───────────────────────────────────────────────
function loadDeviceInfo() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
    }
  } catch (_) {}
  return null;
}

function saveDeviceInfo(info) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(info, null, 2));
}

function isScheduledLaunch() {
  return process.argv.includes(SCHEDULED_LAUNCH_ARG);
}

function isManuallyStopped() {
  return fs.existsSync(MANUAL_STOP_PATH);
}

function setManualStop(enabled) {
  try {
    if (enabled) {
      fs.writeFileSync(MANUAL_STOP_PATH, JSON.stringify({ stoppedAt: new Date().toISOString() }, null, 2));
    } else if (fs.existsSync(MANUAL_STOP_PATH)) {
      fs.unlinkSync(MANUAL_STOP_PATH);
    }
  } catch (err) {
    console.warn("[startup] Could not update manual stop state:", err.message);
  }
}

function stopAgentLoops() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (signalPollTimer) {
    clearInterval(signalPollTimer);
    signalPollTimer = null;
  }
  if (commandPollTimer) {
    clearInterval(commandPollTimer);
    commandPollTimer = null;
  }
}

function clearDeviceInfo() {
  stopAgentLoops();
  try {
    if (fs.existsSync(DATA_PATH)) fs.unlinkSync(DATA_PATH);
  } catch (err) {
    console.warn("[pair] Could not remove saved device info:", err.message);
  }
  deviceInfo = null;
  isOnline = false;
  lastHeartbeat = null;
  lastSignalId = null;
  updateTray();
}

function clearUninstallRegistrationFiles() {
  const files = [
    DATA_PATH,
    MANUAL_STOP_PATH,
    path.join(app.getPath("userData"), "pairing_token.txt"),
    path.join(process.env.APPDATA || "", "Assistane Agent", "pairing_token.txt"),
  ];

  for (const filePath of files) {
    try {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.warn("[uninstall] Could not remove saved Agent file:", err.message);
    }
  }
}

function resetSavedDeviceAndPrompt() {
  clearDeviceInfo();
  openPairingWindow();
}

async function markDeviceOffline(reason = "agent_quit") {
  if (!deviceInfo?.registrationToken) return false;
  try {
    await apiPost("device-offline", {
      registration_token: deviceInfo.registrationToken,
      reason,
    });
    return true;
  } catch (err) {
    console.warn("[offline] Could not mark device offline:", err.message);
    return false;
  }
}

async function markDeviceOfflineForUninstall() {
  deviceInfo = loadDeviceInfo();
  if (!deviceInfo?.registrationToken) {
    console.log("[uninstall] No saved device registration found; nothing to mark offline.");
    clearUninstallRegistrationFiles();
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const marked = await markDeviceOffline("agent_uninstalled");
      if (marked) {
        console.log("[uninstall] Device marked offline.");
        clearUninstallRegistrationFiles();
        return;
      }
    } catch (err) {
      console.warn(`[uninstall] Offline attempt ${attempt} failed:`, err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  clearUninstallRegistrationFiles();
}

function isInvalidRegistrationToken(status, data) {
  const message = `${data?.error || data?.message || data?.detail || ""}`;
  return status === 401 && /invalid registration_token/i.test(message);
}

// ── Generate a stable device UID based on hostname + username ─
function generateDeviceUid() {
  const raw = `${os.hostname()}-${os.userInfo().username}-${os.platform()}`;
  // Simple deterministic hash → hex string
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (Math.imul(31, hash) + raw.charCodeAt(i)) | 0;
  }
  const uid = `RP-${Math.abs(hash).toString(16).toUpperCase().padStart(8, "0")}-${os.hostname().slice(0, 6).toUpperCase()}`;
  return uid;
}

// ── HTTP helpers ──────────────────────────────────────────────
function buildHeaders({ json = false } = {}) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (config.API_KEY) headers["x-api-key"] = config.API_KEY;
  return headers;
}

function queryToBody(params = "") {
  const body = {};
  const query = params.startsWith("?") ? params.slice(1) : params;
  for (const [key, value] of new URLSearchParams(query)) body[key] = value;
  return body;
}

async function parseApiResponse(res, endpoint) {
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch (err) {
      throw new Error(`Invalid JSON from ${endpoint}: ${err.message}`);
    }
  }

  const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
  throw new Error(
    `API returned ${contentType || "non-JSON"} for ${endpoint}. ` +
    `Check BASE44_DEVICE_API_URL. Response: ${preview}`
  );
}

function shouldTryFunctionBodyFallback(status, data) {
  const message = `${data?.message || data?.error || data?.detail || ""}`;
  return (
    status === 404 ||
    status === 405 ||
    /Backend function .*not found|not deployed|Method Not Allowed/i.test(message)
  );
}

function isRateLimited(status, data) {
  const message = `${data?.message || data?.error || data?.detail || ""}`;
  return status === 429 || /rate limit/i.test(message);
}

async function apiPost(endpoint, body) {
  const fetch = (await import("node-fetch")).default;
  const baseUrl = config.API_BASE_URL.replace(/\/$/, "");
  const payload = { ...body, endpoint };
  const urls = [`${baseUrl}/${endpoint}`, baseUrl];
  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders({ json: true }),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data = await parseApiResponse(res, endpoint);
      if (url !== baseUrl && shouldTryFunctionBodyFallback(res.status, data)) {
        console.warn(`[api] POST ${endpoint} via ${url} returned ${res.status}; trying function body fallback`);
        continue;
      }
      return { status: res.status, data };
    } catch (err) {
      lastError = err;
      console.warn(`[api] POST ${endpoint} via ${url} failed:`, err.message);
    }
  }

  throw lastError;
}

async function apiGet(endpoint, params = "") {
  const fetch = (await import("node-fetch")).default;
  const baseUrl = config.API_BASE_URL.replace(/\/$/, "");
  const getUrl = `${baseUrl}/${endpoint}${params}`;

  try {
    const res = await fetch(getUrl, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    const data = await parseApiResponse(res, endpoint);
    if (!shouldTryFunctionBodyFallback(res.status, data)) {
      return { status: res.status, data };
    }
    console.warn(`[api] GET ${endpoint} returned ${res.status}; trying function body fallback`);
  } catch (err) {
    console.warn(`[api] GET ${endpoint} failed, trying function body fallback:`, err.message);
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: buildHeaders({ json: true }),
    body: JSON.stringify({ endpoint, ...queryToBody(params) }),
    signal: AbortSignal.timeout(15000),
  });
  return { status: res.status, data: await parseApiResponse(res, endpoint) };
}

// ── Read support code written by installer (optional auto-join) ──────────────
// On Windows the NSIS installer can write the code from the download URL to this file.
// On macOS the DMG post-install script does the same.
// Falls back to showing the manual pairing window if no file exists.
function normalizePairingInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const code = url.searchParams.get("code");
    if (code) return code.trim();
  } catch (_) {}
  const codeMatch = raw.match(/\b\d{6}\b/);
  return codeMatch ? codeMatch[0] : raw;
}

function readClipboardPairingToken() {
  try {
    const text = clipboard.readText().trim();
    if (!text) return null;

    const markerIndex = text.indexOf(CLIPBOARD_PAIRING_PREFIX);
    if (markerIndex >= 0) {
      const markedValue = text.slice(markerIndex + CLIPBOARD_PAIRING_PREFIX.length).trim();
      const normalized = normalizePairingInput(markedValue);
      return /^\d{6}$/.test(normalized) ? normalized : null;
    }

    try {
      const parsed = new URL(text);
      const host = parsed.hostname.toLowerCase();
      const code = parsed.searchParams.get("code");
      if ((host === "app.assistane.com" || host.endsWith(".assistane.com")) && /^\d{6}$/.test(String(code || "").trim())) {
        return String(code).trim();
      }
    } catch (_) {}
  } catch (err) {
    console.warn("[pair] Could not read clipboard support code:", err.message);
  }
  return null;
}

function clearClipboardPairingToken(token) {
  try {
    const text = clipboard.readText();
    const normalized = normalizePairingInput(token);
    if (!normalized) return;
    if (text.includes(`${CLIPBOARD_PAIRING_PREFIX}${normalized}`) || text.includes(`code=${normalized}`)) {
      clipboard.clear();
    }
  } catch (_) {}
}

function getAppFunctionUrl(functionName) {
  const baseUrl = config.API_BASE_URL.replace(/\/$/, "");
  if (/\/functions\/deviceApi$/i.test(baseUrl)) {
    return baseUrl.replace(/\/functions\/deviceApi$/i, `/functions/${functionName}`);
  }
  return baseUrl.replace(/\/deviceApi$/i, `/${functionName}`);
}

async function resolveSupportCodeIfPossible(pairingToken) {
  const normalized = normalizePairingInput(pairingToken);
  if (!/^\d{6}$/.test(normalized)) return normalized;

  try {
    const fetch = (await import("node-fetch")).default;
    const res = await fetch(getAppFunctionUrl("resolveSupportCode"), {
      method: "POST",
      headers: buildHeaders({ json: true }),
      body: JSON.stringify({ code: normalized }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await parseApiResponse(res, "resolveSupportCode");
    if (res.ok && data?.pairing_token) return data.pairing_token;
  } catch (err) {
    console.warn("[pair] Support code resolve failed, trying entered token directly:", err.message);
  }

  return normalized;
}

function readInstallerPairingToken() {
  const candidates = [
    path.join(app.getPath("userData"), "pairing_token.txt"),          // preferred (userData)
    path.join(process.env.APPDATA || "", "Assistane Agent", "pairing_token.txt"), // NSIS fallback
    path.join(process.env.HOME || "", "Library", "Application Support", "Assistane Agent", "pairing_token.txt"), // macOS fallback
    path.join(__dirname, "pairing_token.txt"),                         // dev / portable fallback
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const token = fs.readFileSync(p, "utf8").trim();
        if (token.length > 0) {
          fs.unlinkSync(p); // consume the file so it can't be re-used
          return token;
        }
      }
    } catch (_) {}
  }
  return null;
}

// ── Ask the user for their support code ─────────────
// Only shown when no installer code is present (manual / dev setup)
function askForPairingToken() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 440,
      height: 380,
      resizable: false,
      title: "Assistane — Connect Device",
      webPreferences: { nodeIntegration: true, contextIsolation: false },
      autoHideMenuBar: true,
    });
    win.loadFile(path.join(__dirname, "pairing.html"));
    app.dock?.show();

    let settled = false;
    ipcMain.once("submit-pairing-token", (_e, token) => {
      settled = true;
      app.dock?.hide();
      // Don't close immediately — let registerDevice complete before closing
      setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 500);
      resolve((token || "").trim());
    });
    win.on("closed", () => {
      if (!settled) {
        app.dock?.hide();
        resolve(null);
      }
    });
  });
}

// ── Collect system info ──────────────────────────────────────
function openPairingWindow() {
  if (pairingWindow && !pairingWindow.isDestroyed()) {
    pairingWindow.show();
    pairingWindow.focus();
    return pairingWindow;
  }

  pairingWindow = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    title: "Assistane - Connect Device",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    autoHideMenuBar: true,
  });
  pairingWindow.loadFile(path.join(__dirname, "pairing.html"));
  pairingWindow.on("closed", () => { pairingWindow = null; });
  app.dock?.show();
  return pairingWindow;
}

function sendPairingWindowMessage(channel, message) {
  const win = openPairingWindow();
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send(channel, message);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

function showPairingError(message) {
  sendPairingWindowMessage("pairing-error", message || "Could not connect. Please try again.");
}

function closePairingWindowAfterSuccess() {
  if (!pairingWindow || pairingWindow.isDestroyed()) {
    app.dock?.hide();
    return;
  }
  pairingWindow.webContents.send("pairing-success", "Device connected.");
  setTimeout(() => {
    if (pairingWindow && !pairingWindow.isDestroyed()) pairingWindow.close();
    app.dock?.hide();
  }, 500);
}

function getSystemInfo() {
  const osMap = { win32: "Windows", darwin: "macOS", linux: "Linux" };
  const platform = osMap[os.platform()] || "Other";
  
  // Get OS version
  let osVersion = "Unknown";
  try {
    osVersion = os.release();
  } catch (_) {}
  
  // Get RAM (in GB)
  let ramGb = 0;
  try {
    ramGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  } catch (_) {}
  
  // Get brand name (manufacturer)
  let brandName = "Unknown";
  try {
    if (process.platform === "win32") {
      const result = require("child_process").execSync("wmic computersystem get manufacturer", { encoding: "utf8" }).split("\n")[1]?.trim() || "Unknown";
      brandName = result;
    } else if (process.platform === "darwin") {
      const result = require("child_process").execSync("system_profiler SPHardwareDataType | grep -i 'model name'", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).split(":")[1]?.trim() || "Apple";
      brandName = result || "Apple";
    }
  } catch (_) {}
  
  // Get storage (disk space in GB)
  let storageGb = 0;
  try {
    if (process.platform === "win32") {
      const result = require("child_process").execSync("wmic logicaldisk get size | findstr /v ^$", { encoding: "utf8" }).split("\n")[0]?.trim();
      if (result) storageGb = Math.round(parseInt(result) / (1024 * 1024 * 1024));
    } else {
      const result = require("child_process").execSync("df / | tail -1", { encoding: "utf8" }).split(/\s+/)[1];
      if (result) storageGb = Math.round(parseInt(result) / (1024 * 1024));
    }
  } catch (_) {}
  
  return { platform, osVersion, ramGb, brandName, storageGb };
}

// ── Register device on first launch ──────────────────────────
async function registerDevice(pairingToken) {
  const uid = generateDeviceUid();
  const deviceName = os.hostname();
  const osMap = { win32: "Windows", darwin: "macOS", linux: "Linux" };
  const operatingSystem = osMap[os.platform()] || "Other";

  if (!pairingToken) throw new Error("No support code entered");

  pairingToken = await resolveSupportCodeIfPossible(pairingToken);

  const sysInfo = getSystemInfo();
  console.log(`[register] uid=${uid} name=${deviceName} os=${operatingSystem} version=${sysInfo.osVersion} ram=${sysInfo.ramGb}GB brand=${sysInfo.brandName}`);

  const { status, data } = await apiPost("register-device", {
    device_uid: uid,
    device_name: deviceName,
    operating_system: operatingSystem,
    pairing_token: pairingToken,
    os_version: sysInfo.osVersion,
    ram_gb: sysInfo.ramGb,
    brand_name: sysInfo.brandName,
    storage_gb: sysInfo.storageGb,
  });

  if ((status === 201 || status === 200) && data.success) {
    const info = {
      deviceId: data.device?.id || data.device_id || "",
      uid,
      deviceName,
      operatingSystem,
      registrationToken: data.registration_token,
      registeredAt: new Date().toISOString(),
    };
    saveDeviceInfo(info);
    return info;
  }

  throw new Error(`Registration failed (${status}): ${data?.error || JSON.stringify(data)}`);
}

// ── Heartbeat ─────────────────────────────────────────────────
async function sendHeartbeat() {
  try {
    if (!deviceInfo?.registrationToken) return;
    const { status, data } = await apiPost("heartbeat", {
      registration_token: deviceInfo.registrationToken,
      unattended_enabled: getUnattendedSettings().enabled === true,
    });

    if (status === 200 && data.success) {
      if (data.device_id && deviceInfo && deviceInfo.deviceId !== data.device_id) {
        deviceInfo.deviceId = data.device_id;
        saveDeviceInfo(deviceInfo);
      }
      isOnline = true;
      lastHeartbeat = new Date();
      console.log(`[heartbeat] ✓ online @ ${lastHeartbeat.toLocaleTimeString()}`);
    } else {
      isOnline = false;
      console.warn(`[heartbeat] unexpected response (${status}):`, data);
      if (isInvalidRegistrationToken(status, data)) {
        new Notification({
          title: "Assistane Agent",
          body: "Saved device registration is no longer valid. Please enter a new support code.",
        }).show();
        resetSavedDeviceAndPrompt();
        return;
      }
    }
  } catch (err) {
    isOnline = false;
    console.error("[heartbeat] failed:", err.message);
  }
  updateTray();
}

// ── Tray ──────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Open Assistane Agent",
      click: () => {
        if (deviceInfo) openSettingsWindow();
        else openPairingWindow();
      },
    },
    { label: "Join", click: () => resetSavedDeviceAndPrompt() },
    { label: "Settings", click: () => openSettingsWindow() },
    { type: "separator" },
    {
      label: "Quit Assistane Agent",
      click: async () => {
        restartingAfterTrayQuit = true;
        setManualStop(false);
        stopAgentLoops();
        if (screenShareWindow && !screenShareWindow.isDestroyed()) {
          screenShareWindow.webContents.send("stop-sharing");
          screenShareWindow.destroy();
        }
        app.relaunch();
        app.quit();
      },
    },
  ]);
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  tray.setToolTip(`Assistane Agent — ${isOnline ? "Online" : "Offline"}`);
}

// ── Heartbeat loop + pairing orchestration ───────────────────
function getUnattendedSettings() {
  try {
    const filePath = path.join(app.getPath("userData"), "unattended.json");
    if (!fs.existsSync(filePath)) return { enabled: false };
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return data || { enabled: false };
  } catch (_) {
    return { enabled: false };
  }
}

function verifyUnattendedPassword(password) {
  const settings = getUnattendedSettings();
  if (settings.enabled !== true) return true;
  if (!password || !settings.salt || !settings.hash) return false;
  const crypto = require("crypto");
  const hash = crypto.pbkdf2Sync(String(password), settings.salt, 120000, 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(settings.hash, "hex"));
  } catch (_) {
    return false;
  }
}

async function startHeartbeatLoop() {
  if (heartbeatTimer) return;
  await sendHeartbeat(); // immediate first heartbeat
  heartbeatTimer = setInterval(sendHeartbeat, config.HEARTBEAT_INTERVAL_MS);
  startSignalPolling();
}

async function pairAndStart(pairingToken = null, options = {}) {
  if (!pairingToken) {
    openPairingWindow();
    return;
  }
  if (isPairing) return;
  isPairing = true;
  try {
    sendPairingWindowMessage("pairing-status", "Connecting...");
    deviceInfo = await registerDevice(pairingToken);
    if (options.clearClipboardOnSuccess) clearClipboardPairingToken(pairingToken);
    closePairingWindowAfterSuccess();
    new Notification({
      title: "Assistane Agent",
      body: `Device connected: ${deviceInfo.deviceName}`,
    }).show();
    updateTray();
    startHeartbeatLoop();
  } catch (err) {
    console.error("[pair] failed:", err.message);
    showPairingError(err.message);
    tray.setToolTip("Assistane Agent — Not connected");
    new Notification({
      title: "Assistane Agent",
      body: `Could not connect: ${err.message}`,
    }).show();
    updateTray();
  } finally {
    isPairing = false;
  }
}

ipcMain.on("submit-pairing-token", (_e, token) => {
  pairAndStart((token || "").trim());
});

// ── Screen share hidden renderer window ───────────────────────
function ensureScreenShareWindow() {
  if (screenShareWindow && !screenShareWindow.isDestroyed()) return screenShareWindow;
  screenShareWindow = new BrowserWindow({
    width: 300,
    height: 160,
    show: false, // invisible — only for WebRTC + desktopCapturer
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    skipTaskbar: true,
  });
  screenShareWindow.loadFile(path.join(__dirname, "screen-share.html"));
  screenShareWindow.on("closed", () => { screenShareWindow = null; });
  return screenShareWindow;
}

// Platform-native capture helper (DXGI on Windows, SCK on macOS)
const capture = require("./capture");

// IPC: renderer asks for a desktopCapturer source ID (legacy fallback, kept for settings.html)
const { desktopCapturer } = require("electron");
ipcMain.handle("get-screen-source", async () => {
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
  return sources[0]?.id || null;
});

// ── Mouse control via robotjs ─────────────────────────────────────────────
let robot = null;
try {
  // robotjs is optional — only used on Windows/macOS for mouse control
  robot = require("@jitsi/robotjs");
} catch (err) {
  console.warn("[mouse] robotjs not available — mouse control disabled:", err.message);
}

// ── Key map: browser KeyboardEvent.key → robotjs key names ──────────────────
const KEY_MAP = {
  // Modifiers
  Control: "control", Alt: "alt", Shift: "shift", Meta: "command",
  // Navigation
  Enter: "enter", Escape: "escape", Backspace: "backspace", Delete: "delete",
  Tab: "tab", CapsLock: "caps_lock",
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
  Insert: "insert",
  // Function keys
  F1:"f1", F2:"f2", F3:"f3", F4:"f4", F5:"f5", F6:"f6",
  F7:"f7", F8:"f8", F9:"f9", F10:"f10", F11:"f11", F12:"f12",
  // Editing
  " ": "space",
  // Symbols that robotjs accepts by name
  "!":"!", "@":"@", "#":"#", "$":"$", "%":"%", "^":"^", "&":"&",
  "*":"*", "(":"(", ")":")", "-":"-", "=":"=", "[":"[", "]":"]",
  "\\":"\\", ";":";", "'":"'", ",":","  , ".":".", "/":"/", "`":"`",
};

function resolveRobotKey(key) {
  if (KEY_MAP[key]) return KEY_MAP[key];
  // Single printable character — robotjs accepts it directly
  if (key.length === 1) return key.toLowerCase();
  return null;
}

ipcMain.on("key-event", (_e, data) => {
  if (!robot) return;
  if (remoteControlConfig.remote_input_disabled) return;
  try {
    const { key, ctrl, alt, shift, meta } = data;
    const robotKey = resolveRobotKey(key);
    if (!robotKey) return; // unknown / unhandled key

    // Build modifier array
    const mods = [];
    if (ctrl)  mods.push("control");
    if (alt)   mods.push("alt");
    if (shift) mods.push("shift");
    if (meta)  mods.push("command");

    // Don't double-press lone modifier keys
    const isModifier = ["control","alt","shift","command"].includes(robotKey);
    if (isModifier && mods.length === 0) return;

    // For plain printable characters with no modifiers, typeString is more reliable
    const isPlainChar = robotKey.length === 1 && mods.length === 0;
    if (isPlainChar) {
      robot.typeString(robotKey);
    } else {
      robot.keyTap(robotKey, mods);
    }
  } catch (err) {
    console.error("[key] event error:", err.message);
  }
});

ipcMain.on("file-drop", async (_e, data) => {
  try {
    const fetch = (await import("node-fetch")).default;
    const os = require("os");
    const path = require("path");
    const fs = require("fs");

    const { name, url } = data;
    const destDir = app.getPath("desktop");
    const destPath = path.join(destDir, name);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    new Notification({
      title: "Assistane — File Received",
      body: `${name} saved to Desktop`,
    }).show();
    console.log(`[file-drop] saved: ${destPath}`);
  } catch (err) {
    console.error("[file-drop] error:", err.message);
  }
});

ipcMain.on("chat-message", (_e, data) => {
  const content = String(data?.content || "").trim();
  if (!content) return;
  showChatWindow(content);
});

ipcMain.on("chat-reply", async (_e, text) => {
  const content = String(text || "").trim();
  if (!content || !deviceInfo?.deviceId) return;
  try {
    await apiPost("send-message", {
      device_id: deviceInfo.deviceId,
      content,
      sender_type: "device",
    });
  } catch (err) {
    console.warn("[chat] reply failed:", err.message);
  }
});

ipcMain.on("viewer-command", (_e, data) => {
  executeCommand(String(data?.command || ""));
});

ipcMain.on("black-screen-toggle", (_e, data) => {
  if (data?.enabled) showBlackScreen(data.message || "This device is being serviced by Assistane.");
  else hideBlackScreen();
});

const incomingTransfers = new Map();
function safeTransferName(name) {
  return path.basename(String(name || "file").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_"));
}

ipcMain.on("file-transfer-start", (_e, data) => {
  const id = String(data?.id || "");
  if (!id) return;
  const requestedDir = String(data?.target_dir || "").trim();
  const dir = requestedDir || path.join(app.getPath("downloads"), "Assistane Transfers");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, safeTransferName(data?.name));
  const stream = fs.createWriteStream(filePath);
  incomingTransfers.set(id, { stream, filePath, received: 0, size: Number(data?.size || 0) });
});

ipcMain.on("file-transfer-chunk", (_e, data) => {
  const transfer = incomingTransfers.get(String(data?.id || ""));
  if (!transfer || !data?.chunk) return;
  const chunk = Buffer.from(data.chunk);
  transfer.received += chunk.length;
  transfer.stream.write(chunk);
});

ipcMain.on("file-transfer-end", (_e, data) => {
  const id = String(data?.id || "");
  const transfer = incomingTransfers.get(id);
  if (!transfer) return;
  transfer.stream.end();
  incomingTransfers.delete(id);
  new Notification({
    title: "Assistane - File Received",
    body: `${path.basename(transfer.filePath)} saved to Downloads\\Assistane Transfers`,
  }).show();
});

ipcMain.on("mouse-event", (_e, data) => {
  if (!robot) return;
  if (remoteControlConfig.remote_input_disabled) return;
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const absX = Math.round(data.x * width);
    const absY = Math.round(data.y * height);

    if (data.type === "move") {
      robot.moveMouse(absX, absY);
    } else if (data.type === "mousedown") {
      robot.moveMouse(absX, absY);
      const btn = data.button === 2 ? "right" : "left";
      robot.mouseToggle("down", btn);
    } else if (data.type === "click") {
      robot.moveMouse(absX, absY);
      const btn = data.button === 2 ? "right" : "left";
      robot.mouseClick(btn);
    } else if (data.type === "dblclick") {
      robot.moveMouse(absX, absY);
      robot.mouseClick("left", true);
    } else if (data.type === "rightclick") {
      robot.moveMouse(absX, absY);
      robot.mouseClick("right");
    } else if (data.type === "mouseup") {
      const btn = data.button === 2 ? "right" : "left";
      robot.mouseToggle("up", btn);
    } else if (data.type === "scroll") {
      robot.moveMouse(absX, absY);
      const dir = data.deltaY > 0 ? "down" : "up";
      const amount = Math.ceil(Math.abs(data.deltaY) / 100);
      for (let i = 0; i < amount; i++) robot.scrollMouse(0, dir === "down" ? 3 : -3);
    }
  } catch (err) {
    console.error("[mouse] event error:", err.message);
  }
});

// ── Black screen window ───────────────────────────────────────
function applyBlackScreenPrivacy(win) {
  if (!win || win.isDestroyed()) return;
  win.setContentProtection?.(true);
  win.setIgnoreMouseEvents?.(true, { forward: true });
  win.setAlwaysOnTop?.(true, "screen-saver");
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });

  if (process.platform === "win32") {
    try {
      const handle = win.getNativeWindowHandle();
      const hwnd = process.arch === "x64" ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0));
      const ps = [
        "Add-Type -Namespace Assistane -Name User32 -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);';",
        `[Assistane.User32]::SetWindowDisplayAffinity([IntPtr]${hwnd}, 0x00000011) | Out-Null`,
      ].join(" ");
      const encoded = Buffer.from(ps, "utf16le").toString("base64");
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch (err) {
      console.warn("[black-screen] native capture exclusion unavailable:", err.message);
    }
  }
}

function getBlackScreenWindows() {
  return blackScreenWindows.filter((win) => win && !win.isDestroyed());
}

function scheduleBlackScreenPrivacy() {
  if (blackScreenPrivacyTimer) {
    clearInterval(blackScreenPrivacyTimer);
    blackScreenPrivacyTimer = null;
  }
  let attempts = 0;
  const protect = () => {
    const windows = getBlackScreenWindows();
    if (!windows.length) {
      clearInterval(blackScreenPrivacyTimer);
      blackScreenPrivacyTimer = null;
      return;
    }
    windows.forEach(applyBlackScreenPrivacy);
    attempts += 1;
    if (attempts >= 8) {
      clearInterval(blackScreenPrivacyTimer);
      blackScreenPrivacyTimer = null;
    }
  };
  protect();
  blackScreenPrivacyTimer = setInterval(protect, 250);
}

function showBlackScreen(message) {
  const activeWindows = getBlackScreenWindows();
  if (activeWindows.length) {
    scheduleBlackScreenPrivacy();
    activeWindows.forEach((win) => {
      win.webContents.executeJavaScript(
        `document.getElementById('msg').textContent = ${JSON.stringify(message)};`
      ).catch(() => {});
    });
    return;
  }
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;user-select:none;">
    <p id="msg" style="color:#fff;font-family:system-ui,sans-serif;font-size:22px;text-align:center;max-width:600px;padding:24px;">${escapeHtml(message)}</p>
  </body></html>`;
  const displays = screen.getAllDisplays();
  blackScreenWindows = displays.map((display, index) => {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      width, height, x, y,
      frame: false,
      fullscreen: false,
      alwaysOnTop: true,
      focusable: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: "#000000",
      movable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    if (index === 0) blackScreenWindow = win;
    win.setBounds({ x, y, width, height });
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    win.webContents.once("did-finish-load", () => scheduleBlackScreenPrivacy());
    win.once("ready-to-show", () => {
      if (!win || win.isDestroyed()) return;
      win.setBounds({ x, y, width, height });
      if (typeof win.showInactive === "function") win.showInactive();
      else win.show();
      scheduleBlackScreenPrivacy();
    });
    win.on("show", () => scheduleBlackScreenPrivacy());
    win.on("closed", () => {
      blackScreenWindows = blackScreenWindows.filter((item) => item && !item.isDestroyed() && item !== win);
      if (blackScreenWindow === win) blackScreenWindow = blackScreenWindows[0] || null;
    });
    return win;
  });
  scheduleBlackScreenPrivacy();
}

function hideBlackScreen() {
  if (blackScreenPrivacyTimer) {
    clearInterval(blackScreenPrivacyTimer);
    blackScreenPrivacyTimer = null;
  }
  getBlackScreenWindows().forEach((win) => win.destroy());
  blackScreenWindows = [];
  blackScreenWindow = null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showChatWindow(content) {
  const message = escapeHtml(content || "");
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.show();
    chatWindow.focus();
    chatWindow.webContents.send("chat-message", content || "");
    return;
  }

  chatWindow = new BrowserWindow({
    width: 420,
    height: 420,
    title: "Assistane Chat",
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#101522;color:#e8ecf4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px}
    header{padding:14px 16px;border-bottom:1px solid #26314a;font-weight:700}
    #messages{height:280px;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
    .msg{background:#202942;border:1px solid #303c58;border-radius:10px;padding:10px 12px;line-height:1.4}
    .reply{background:#e8508a;color:white;align-self:flex-end}
    form{display:flex;gap:8px;padding:12px;border-top:1px solid #26314a}
    input{flex:1;background:#0b1020;border:1px solid #303c58;border-radius:8px;color:white;padding:9px 10px;outline:none}
    button{background:#e8508a;border:0;border-radius:8px;color:white;font-weight:700;padding:0 14px;cursor:pointer}
  </style></head><body>
    <header>Assistane Chat</header>
    <div id="messages"><div class="msg">${message}</div></div>
    <form id="form"><input id="reply" placeholder="Type reply..." autocomplete="off" /><button>Send</button></form>
    <script>
      const { ipcRenderer } = require("electron");
      const messages = document.getElementById("messages");
      function add(text, cls) {
        const div = document.createElement("div");
        div.className = "msg " + (cls || "");
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
      }
      ipcRenderer.on("chat-message", (_e, text) => add(text || ""));
      document.getElementById("form").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("reply");
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        add(text, "reply");
        ipcRenderer.send("chat-reply", text);
      });
    </script>
  </body></html>`;

  chatWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  chatWindow.on("closed", () => { chatWindow = null; });
}

async function checkBlackScreen() {
  if (!deviceInfo?.registrationToken) return;
  try {
    const { status, data } = await apiGet("black-screen-status", `?registration_token=${encodeURIComponent(deviceInfo.registrationToken)}`);
    if (isRateLimited(status, data)) {
      commandBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      console.warn("[black-screen] rate limited; backing off command polling for 30s");
      return;
    }
    remoteControlConfig = {
      remote_input_disabled: data.remote_input_disabled === true,
      wallpaper_enabled: data.wallpaper_enabled !== false,
      video_quality: data.video_quality || "high",
    };
    if (data.black_screen) {
      showBlackScreen(data.message || "This device has been locked by the administrator.");
    } else {
      hideBlackScreen();
    }
  } catch (err) {
    console.error("[black-screen] poll error:", err.message);
  }
}

async function executeCommand(cmd) {
  if (!cmd) return;
  if (cmd.startsWith("special-key:")) {
    cmd = cmd.slice("special-key:".length);
  }

  try {
    const { execSync } = require("child_process");
    const platform = process.platform;

    if (cmd === "reboot") {
      console.log("[command] Rebooting...");
      if (platform === "win32") execSync("shutdown /r /t 5");
      else execSync("sudo reboot");
    } else if (cmd === "reboot-safe-mode") {
      console.log("[command] Rebooting in Safe Mode...");
      if (platform === "win32") execSync("bcdedit /set safeboot minimal && shutdown /r /t 5");
      else execSync("sudo reboot");
    } else if (cmd === "lock" || cmd === "ctrl-alt-del") {
      console.log("[command] Locking screen...");
      nativeBridge.notify("lock_state_probe");
      if (platform === "win32") execSync("rundll32.exe user32.dll,LockWorkStation");
      else if (platform === "darwin") execSync("/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend");
      else execSync("loginctl lock-session");
    } else if (cmd === "alt-tab") {
      console.log("[command] Sending Alt+Tab (simulated)...");
      if (robot) robot.keyTap("tab", [platform === "darwin" ? "command" : "alt"]);
    } else if (cmd === "win-d") {
      console.log("[command] Sending Win+D...");
      if (robot) {
        if (platform === "darwin") robot.keyTap("f11");
        else robot.keyTap("d", ["command"]);
      }
    } else if (cmd === "win-l") {
      console.log("[command] Sending Win+L...");
      nativeBridge.notify("lock_state_probe");
      if (platform === "win32") execSync("rundll32.exe user32.dll,LockWorkStation");
      else if (platform === "darwin") execSync("/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend");
      else if (robot) robot.keyTap("l", ["command"]);
    } else if (cmd.startsWith("set-resolution:")) {
      const res = cmd.split(":")[1];
      const [w, h] = res.split("x").map(Number);
      console.log(`[command] Setting resolution to ${w}x${h}...`);
      if (platform === "win32") {
        const ps = `Add-Type "[DllImport(\\"user32.dll\\")]public static extern int SetDisplayMode(int w,int h,int bpp);";[void]::SetDisplayMode(${w},${h},32)`;
        execSync(`powershell -Command "${ps}"`);
      }
    }
  } catch (err) {
    console.error("[command] execution error:", err.message);
  }
}

async function checkPendingCommand() {
  if (!deviceInfo?.registrationToken) return;
  try {
    const { status, data } = await apiGet("pending-command", `?registration_token=${encodeURIComponent(deviceInfo.registrationToken)}`);
    if (isRateLimited(status, data)) {
      commandBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      console.warn("[command] rate limited; backing off command polling");
      return;
    }
    await executeCommand(data.command || "");
  } catch (err) {
    console.error("[command] poll error:", err.message);
  }
}

// ── Signal poller — runs every 1 s for instant connect ────────
function startSignalPolling() {
  if (signalPollTimer) return;
  pollForSignal();
  pollForCommands();
  signalPollTimer = setInterval(() => {
    pollForSignal();
  }, SIGNAL_POLL_INTERVAL_MS);
  commandPollTimer = setInterval(() => {
    pollForCommands();
  }, COMMAND_POLL_INTERVAL_MS);
}

async function pollForCommands() {
  if (commandPollInFlight || Date.now() < commandBackoffUntil) return;
  commandPollInFlight = true;
  try {
    if (deviceInfo?.registrationToken) {
      const { status, data } = await apiGet("agent-state", `?registration_token=${encodeURIComponent(deviceInfo.registrationToken)}`);
      if (isRateLimited(status, data)) {
        commandBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        return;
      }
      remoteControlConfig = {
        remote_input_disabled: data.remote_input_disabled === true,
        wallpaper_enabled: data.wallpaper_enabled !== false,
        video_quality: data.video_quality || "high",
      };
      if (data.black_screen) showBlackScreen(data.message || "This device is being serviced by Assistane.");
      else hideBlackScreen();
      await executeCommand(data.command || "");
    }
  } catch (err) {
    console.error("[command] poll error:", err.message);
  } finally {
    commandPollInFlight = false;
  }
}

function applyVideoQuality(videoConstraints, displayWidth, displayHeight) {
  const quality = remoteControlConfig.video_quality || "high";
  const profiles = {
    ultra:  { maxWidth: 3840, fps: process.platform === "darwin" ? 60 : 30 },
    high:   { maxWidth: 1920, fps: 30 },
    medium: { maxWidth: 1280, fps: 20 },
    low:    { maxWidth: 960, fps: 12 },
  };
  const profile = profiles[quality] || profiles.high;
  const targetWidth = Math.min(displayWidth || 1920, profile.maxWidth);
  const ratio = displayWidth && displayHeight ? displayHeight / displayWidth : 9 / 16;
  const targetHeight = Math.max(480, Math.round(targetWidth * ratio));
  const mandatory = videoConstraints.video?.mandatory;
  if (mandatory) {
    mandatory.maxWidth = targetWidth;
    mandatory.maxHeight = targetHeight;
    mandatory.maxFrameRate = profile.fps;
  }
  return videoConstraints;
}

async function pollForSignal() {
  if (!deviceInfo?.registrationToken) return;
  if (signalPollInFlight || Date.now() < signalBackoffUntil) return;
  signalPollInFlight = true;
  try {
    const { status, data } = await apiGet("webrtc-pending", `?registration_token=${encodeURIComponent(deviceInfo.registrationToken)}`);
    if (isRateLimited(status, data)) {
      signalBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      console.warn("[webrtc] rate limited; backing off signal polling for 30s");
      return;
    }
    if (!data.pending) return;
    if (data.signal_id === lastSignalId) return; // already handled
    lastSignalId = data.signal_id;
    console.log(`[webrtc] pending signal ${data.signal_id}`);

    if (!verifyUnattendedPassword(data.unattended_password || "")) {
      console.warn("[webrtc] rejected session: invalid unattended access password");
      await apiPost("close-signal", { signal_id: data.signal_id }).catch(() => {});
      new Notification({
        title: "Assistane Agent",
        body: "A remote session was rejected because the unattended access password was incorrect.",
      }).show();
      return;
    }

    // Resolve platform-native source (DXGI / ScreenCaptureKit) in main process
    let captureInfo;
    try {
      captureInfo = await capture.getPrimaryScreenSource();
    } catch (capErr) {
      console.error("[webrtc] capture source error:", capErr.message);
      return;
    }
    const videoConstraints = capture.buildVideoConstraints(
      captureInfo.sourceId,
      captureInfo.width,
      captureInfo.height,
      captureInfo.frameRate
    );
    applyVideoQuality(videoConstraints, captureInfo.width, captureInfo.height);

    const win = ensureScreenShareWindow();
    // Show briefly — getUserMedia requires a visible, focused window on some OS versions
    win.show();
    win.webContents.send("start-sharing", {
      apiBaseUrl: config.API_BASE_URL,
      apiKey: config.API_KEY,
      registrationToken: deviceInfo.registrationToken,
      signalId: data.signal_id,
      offerSdp: data.offer_sdp,
      videoConstraints,   // pre-built with native source ID
    });
    // Hide again after 800 ms — the WebRTC stream continues headlessly
    setTimeout(() => { if (win && !win.isDestroyed()) win.hide(); }, 800);
  } catch (err) {
    console.error("[webrtc] poll error:", err.message);
  } finally {
    signalPollInFlight = false;
  }
}

// ── Settings window ───────────────────────────────────────────
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 480,
    resizable: false,
    title: "Assistane Agent",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    autoHideMenuBar: true,
  });
  settingsWindow.loadFile(path.join(__dirname, "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
}

ipcMain.handle("agent-status", () => ({
  online: isOnline,
  lastHeartbeat: lastHeartbeat ? lastHeartbeat.toISOString() : null,
  heartbeatIntervalSeconds: Math.round(config.HEARTBEAT_INTERVAL_MS / 1000),
  hostname: os.hostname(),
  platform: `${os.platform()} ${os.release()}`,
  apiBaseUrl: config.API_BASE_URL,
  device: deviceInfo || null,
  nativeBridge: nativeBridge.readStatusFile(),
  macPermissions: permissions.isMac
    ? {
        screen: permissions.getScreenStatus(),
        accessibility: permissions.getAccessibilityStatus(false),
      }
    : null,
}));

ipcMain.handle("open-mac-permission", (_e, permission) => {
  if (permission === "screen") permissions.openScreenSettings();
  if (permission === "accessibility") permissions.openAccessibilitySettings();
});

ipcMain.handle("get-unattended-access", () => {
  try {
    const filePath = path.join(app.getPath("userData"), "unattended.json");
    if (!fs.existsSync(filePath)) return { enabled: false };
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { enabled: data.enabled === true, updatedAt: data.updatedAt || null };
  } catch (_) {
    return { enabled: false };
  }
});

ipcMain.handle("save-unattended-access", async (_e, settings) => {
  const enabled = settings?.enabled === true;
  const password = String(settings?.password || "");
  if (enabled && password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters." };
  }

  const crypto = require("crypto");
  const salt = enabled ? crypto.randomBytes(16).toString("hex") : "";
  const hash = enabled ? crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex") : "";
  const filePath = path.join(app.getPath("userData"), "unattended.json");
  fs.writeFileSync(filePath, JSON.stringify({ enabled, salt, hash, updatedAt: new Date().toISOString() }, null, 2));
  return { success: true, enabled };
});

// ── Transparent user startup setup ────────────────────────────
function setupAutoStartup() {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
    });
    console.log("[startup] Enabled normal user login startup");
  } catch (err) {
    console.warn("[startup] Error setting up auto-startup:", err.message);
  }

  if (process.platform === "win32" && app.isPackaged) {
    try {
      const taskName = "Assistane Agent Watchdog";
      const taskRun = `\\"${process.execPath}\\" ${SCHEDULED_LAUNCH_ARG}`;
      execSync(`schtasks.exe /Create /TN "${taskName}" /SC MINUTE /MO 5 /TR "${taskRun}" /F`, {
        windowsHide: true,
        stdio: "ignore",
      });
      console.log("[startup] Ensured visible Windows scheduled watchdog task");
    } catch (err) {
      console.warn("[startup] Could not create scheduled watchdog task:", err.message);
    }
  }
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(async () => {
  if (isOfflineMarkerProcess) {
    await markDeviceOfflineForUninstall();
    app.exit(0);
    return;
  }

  if (isScheduledLaunch() && isManuallyStopped()) {
    console.log("[startup] Scheduled launch skipped because the user quit the Agent manually");
    app.quit();
    return;
  }

  if (!isScheduledLaunch()) {
    setManualStop(false);
  }

  // Hide from taskbar / dock — lives only in tray
  app.dock?.hide();
  if (!app.isPackaged) app.dock?.hide();

  // Start at user login through the normal OS-visible login item mechanism.
  setupAutoStartup();

  // Create tray icon (falls back to a blank 16x16 if no icon file)
  const iconPath = path.join(__dirname, "assets", "icon.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Assistane Agent — Starting…");
  updateTray();

  // macOS: request Screen Recording & Accessibility permissions (required for remote control)
  await permissions.ensurePermissions();
  updateTray();

  // Validate config
  if (!config.API_BASE_URL || config.API_BASE_URL.includes("YOUR_APP_ID")) {
    tray.setToolTip("Assistane Agent — ⚠ Not configured");
    new Notification({
      title: "Assistane Agent",
      body: "Please add app-config.local.json with your API URL, then restart.",
    }).show();
    openSettingsWindow();
    return;
  }

  // Load device info, or prompt the user to pair on first launch
  deviceInfo = loadDeviceInfo();
  updateTray();

  if (deviceInfo) {
    startHeartbeatLoop();
  } else {
    console.log("[init] No device on file - checking for support code...");
    const installerToken = readInstallerPairingToken();
    if (installerToken) {
      await pairAndStart(installerToken);
    } else {
      const clipboardToken = readClipboardPairingToken();
      if (clipboardToken) {
        await pairAndStart(clipboardToken, { clearClipboardOnSuccess: true });
      } else {
        openPairingWindow();
      }
    }
  }
});

// Keep app alive even when all windows are closed
app.on("window-all-closed", (e) => e.preventDefault());

app.on("before-quit", () => {
  if (restartingAfterTrayQuit) return;
  // Normal app quit/shutdown keeps the saved registration. The dashboard will
  // only mark offline on explicit uninstall or heartbeat timeout.
});
