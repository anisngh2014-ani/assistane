/* eslint-disable */
/**
 * Assistane Viewer — Electron App
 * Installed on the CONTROLLER's machine.
 * Launched via: assistane://connect?device_id=...&token=...&device_name=...
 */

const {
  app, BrowserWindow, ipcMain, screen,
  nativeImage, Notification, Tray, Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");

// ── Single instance ───────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ── State ────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let pendingConnectUrl = null;

const CONFIG_PATH = path.join(app.getPath("userData"), "viewer-config.json");

function readJson(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (err) {
    console.warn(`[config] Could not read ${filePath}:`, err.message);
  }
  return {};
}

function loadConfig() {
  const fileConfig = [
    path.join(__dirname, "app-config.local.json"),
    path.join(__dirname, "app-config-local.json"),
    path.join(__dirname, "app-config.json"),
    process.resourcesPath ? path.join(process.resourcesPath, "app-config.local.json") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app-config-local.json") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app-config.json") : null,
    CONFIG_PATH,
  ].reduce((merged, candidate) => ({ ...merged, ...readJson(candidate) }), {});

  const normalizeApiBaseUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return "";
    return url
      .replace("https://api.base44.com/api/apps/", "https://base44.app/api/apps/")
      .replace("https://api.base44.com/apps/", "https://base44.app/api/apps/")
      .replace("https://base44.app/apps/", "https://base44.app/api/apps/");
  };

  return {
    apiBaseUrl: normalizeApiBaseUrl(
      process.env.ASSISTANE_API_BASE_URL ||
      fileConfig.apiBaseUrl ||
      fileConfig.API_BASE_URL ||
      ""
    ),
    apiKey:
      process.env.ASSISTANE_API_KEY ||
      fileConfig.apiKey ||
      fileConfig.API_KEY ||
      "",
  };
}

const config = loadConfig();

// ── Protocol registration ─────────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("assistane", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("assistane");
}

// ── Parse connect URL ─────────────────────────────────────────
function parseConnectUrl(url) {
  try {
    // assistane://connect?device_id=xxx&device_name=yyy&os=Windows&os_version=...&ram_gb=...&storage_gb=...&brand_name=...
    const parsed = new URL(url);
    if (parsed.hostname !== "connect") return null;
    return {
      device_id: parsed.searchParams.get("device_id"),
      device_name: decodeURIComponent(parsed.searchParams.get("device_name") || "Remote Device"),
      os: parsed.searchParams.get("os") || "Windows",
      ip: parsed.searchParams.get("ip") || "",
      auth_token: parsed.searchParams.get("auth_token") || "",
      os_version: parsed.searchParams.get("os_version") || "",
      ram_gb: parsed.searchParams.get("ram_gb") || "0",
      storage_gb: parsed.searchParams.get("storage_gb") || "0",
      brand_name: parsed.searchParams.get("brand_name") || "",
    };
  } catch (_) { return null; }
}

// ── Create/focus main viewer window ──────────────────────────
function createViewerWindow(connectParams) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    if (connectParams) mainWindow.webContents.send("connect-device", connectParams);
    return mainWindow;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    minWidth: 900,
    minHeight: 600,
    title: "Assistane Viewer",
    backgroundColor: "#050508",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    icon: path.join(__dirname, "assets", "icon.png"),
  });

  mainWindow.loadFile(path.join(__dirname, "viewer.html"));

  mainWindow.webContents.once("did-finish-load", () => {
    if (connectParams) mainWindow.webContents.send("connect-device", connectParams);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => { mainWindow = null; });
  return mainWindow;
}

// ── Handle second-instance (Windows/Linux deep links) ─────────
app.on("second-instance", (_event, argv) => {
  const url = argv.find(a => a.startsWith("assistane://"));
  if (url) {
    const params = parseConnectUrl(url);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      if (params) mainWindow.webContents.send("connect-device", params);
    } else {
      createViewerWindow(params);
    }
  } else if (mainWindow) {
    mainWindow.focus();
  }
});

// ── Handle macOS open-url event ───────────────────────────────
app.on("open-url", (event, url) => {
  event.preventDefault();
  const params = parseConnectUrl(url);
  if (app.isReady()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      if (params) mainWindow.webContents.send("connect-device", params);
    } else {
      createViewerWindow(params);
    }
  } else {
    pendingConnectUrl = url;
  }
});

// ── IPC ───────────────────────────────────────────────────────
ipcMain.handle("get-config", () => config);
ipcMain.on("toggle-fullscreen", () => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()); });
ipcMain.on("viewer-ready", () => {
  if (pendingConnectUrl) {
    const params = parseConnectUrl(pendingConnectUrl);
    pendingConnectUrl = null;
    if (params && mainWindow) mainWindow.webContents.send("connect-device", params);
  }
});
ipcMain.on("show-notification", (_e, { title, body }) => { new Notification({ title, body }).show(); });

// ── App ready ─────────────────────────────────────────────────
app.whenReady().then(() => {
  const url = process.argv.find(a => a.startsWith("assistane://"));
  const connectParams = url ? parseConnectUrl(url) : (pendingConnectUrl ? parseConnectUrl(pendingConnectUrl) : null);
  if (pendingConnectUrl) pendingConnectUrl = null;

  createViewerWindow(connectParams);

  const iconPath = path.join(__dirname, "assets", "icon.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip("Assistane Viewer");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Assistane Viewer", click: () => { if (mainWindow) mainWindow.focus(); else createViewerWindow(null); } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("double-click", () => { if (mainWindow) mainWindow.focus(); else createViewerWindow(null); });
});

app.on("window-all-closed", (e) => e.preventDefault());
app.on("activate", () => { if (!mainWindow || mainWindow.isDestroyed()) createViewerWindow(null); else mainWindow.focus(); });
