/* eslint-disable */
const { app, Tray, Menu, BrowserWindow, Notification, nativeImage, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const config = require("./config");
const permissions = require("./permissions");
const { execSync } = require("child_process");

// ── Prevent multiple instances ────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ── State ─────────────────────────────────────────────────────
let tray = null;
let settingsWindow = null;
let screenShareWindow = null;
let blackScreenWindow = null;
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

const SIGNAL_POLL_INTERVAL_MS = 7000;
const COMMAND_POLL_INTERVAL_MS = 30000;
const RATE_LIMIT_BACKOFF_MS = 30000;

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

function resetSavedDeviceAndPrompt() {
  clearDeviceInfo();
  openPairingWindow();
}

async function markDeviceOffline(reason = "agent_quit") {
  if (!deviceInfo?.registrationToken) return;
  try {
    await apiPost("device-offline", {
      registration_token: deviceInfo.registrationToken,
      reason,
    });
  } catch (err) {
    console.warn("[offline] Could not mark device offline:", err.message);
  }
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
    });

    if (status === 200 && data.success) {
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
        setManualStop(true);
        stopAgentLoops();
        await markDeviceOffline("agent_quit");
        if (screenShareWindow && !screenShareWindow.isDestroyed()) {
          screenShareWindow.webContents.send("stop-sharing");
          screenShareWindow.destroy();
        }
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
async function startHeartbeatLoop() {
  if (heartbeatTimer) return;
  await sendHeartbeat(); // immediate first heartbeat
  heartbeatTimer = setInterval(sendHeartbeat, config.HEARTBEAT_INTERVAL_MS);
  startSignalPolling();
}

async function pairAndStart(pairingToken = null) {
  if (!pairingToken) {
    openPairingWindow();
    return;
  }
  if (isPairing) return;
  isPairing = true;
  try {
    sendPairingWindowMessage("pairing-status", "Connecting...");
    deviceInfo = await registerDevice(pairingToken);
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
const { desktopCapturer, screen } = require("electron");
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

ipcMain.on("mouse-event", (_e, data) => {
  if (!robot) return;
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const absX = Math.round(data.x * width);
    const absY = Math.round(data.y * height);

    if (data.type === "move") {
      robot.moveMouse(absX, absY);
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
      // no-op for now — mouseClick handles press+release
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
function showBlackScreen(message) {
  if (blackScreenWindow && !blackScreenWindow.isDestroyed()) {
    blackScreenWindow.webContents.executeJavaScript(
      `document.getElementById('msg').textContent = ${JSON.stringify(message)};`
    );
    return;
  }
  const { width, height } = screen.getPrimaryDisplay().size;
  blackScreenWindow = new BrowserWindow({
    width, height, x: 0, y: 0,
    frame: false, fullscreen: true, alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;user-select:none;">
    <p id="msg" style="color:#fff;font-family:system-ui,sans-serif;font-size:22px;text-align:center;max-width:600px;padding:24px;">${message.replace(/</g,"&lt;")}</p>
  </body></html>`;
  blackScreenWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  blackScreenWindow.on("closed", () => { blackScreenWindow = null; });
}

function hideBlackScreen() {
  if (blackScreenWindow && !blackScreenWindow.isDestroyed()) {
    blackScreenWindow.destroy();
    blackScreenWindow = null;
  }
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
    if (data.black_screen) {
      showBlackScreen(data.message || "This device has been locked by the administrator.");
    } else {
      hideBlackScreen();
    }
  } catch (err) {
    console.error("[black-screen] poll error:", err.message);
  }
}

async function checkPendingCommand() {
  if (!deviceInfo?.registrationToken) return;
  try {
    const { status, data } = await apiGet("pending-command", `?registration_token=${encodeURIComponent(deviceInfo.registrationToken)}`);
    if (isRateLimited(status, data)) {
      commandBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      console.warn("[command] rate limited; backing off command polling for 30s");
      return;
    }
    let cmd = data.command || "";
    
    if (!cmd) return;
    if (cmd.startsWith("special-key:")) {
      cmd = cmd.slice("special-key:".length);
    }
    
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
    } else if (cmd === "lock") {
      console.log("[command] Locking screen...");
      if (platform === "win32") execSync("rundll32.exe user32.dll,LockWorkStation");
      else if (platform === "darwin") execSync("pmset displaysleepnow");
      else execSync("loginctl lock-session");
    } else if (cmd === "ctrl-alt-del") {
      console.log("[command] Sending Ctrl+Alt+Del...");
      if (platform === "win32") execSync("taskkill /IM explorer.exe /F && timeout /T 2 && start explorer.exe");
    } else if (cmd === "alt-tab") {
      console.log("[command] Sending Alt+Tab (simulated)...");
      if (robot) robot.keyTap("tab", ["alt"]);
    } else if (cmd === "win-d") {
      console.log("[command] Sending Win+D...");
      if (robot) robot.keyTap("d", ["command"]);
    } else if (cmd === "win-l") {
      console.log("[command] Sending Win+L...");
      if (robot) robot.keyTap("l", ["command"]);
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
    await checkBlackScreen();
    await checkPendingCommand();
  } catch (err) {
    console.error("[command] poll error:", err.message);
  } finally {
    commandPollInFlight = false;
  }
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
    console.log("[init] No device on file - prompting for support code...");
    const installerToken = readInstallerPairingToken();
    if (installerToken) {
      await pairAndStart(installerToken);
    } else {
      openPairingWindow();
    }
  }
});

// Keep app alive even when all windows are closed
app.on("window-all-closed", (e) => e.preventDefault());

app.on("before-quit", async () => {
  await markDeviceOffline("agent_quit");
});
