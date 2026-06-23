/* eslint-disable */
const fs = require("fs");
const path = require("path");

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

function loadFileConfig() {
  const candidates = [
    path.join(__dirname, "app-config.local.json"),
    path.join(__dirname, "app-config-local.json"),
    path.join(__dirname, "app-config.json"),
    process.resourcesPath ? path.join(process.resourcesPath, "app-config.local.json") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app-config-local.json") : null,
    process.resourcesPath ? path.join(process.resourcesPath, "app-config.json") : null,
  ];

  return candidates.reduce((merged, candidate) => {
    return { ...merged, ...readJson(candidate) };
  }, {});
}

const fileConfig = loadFileConfig();

function normalizeApiBaseUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return url
    .replace("https://api.base44.com/api/apps/", "https://base44.app/api/apps/")
    .replace("https://api.base44.com/apps/", "https://base44.app/api/apps/")
    .replace("https://base44.app/apps/", "https://base44.app/api/apps/");
}

module.exports = {
  API_BASE_URL: normalizeApiBaseUrl(
    process.env.ASSISTANE_API_BASE_URL ||
    fileConfig.API_BASE_URL ||
    fileConfig.apiBaseUrl ||
    ""
  ),

  API_KEY:
    process.env.ASSISTANE_API_KEY ||
    fileConfig.API_KEY ||
    fileConfig.apiKey ||
    "",

  HEARTBEAT_INTERVAL_MS:
    Number(process.env.ASSISTANE_HEARTBEAT_INTERVAL_MS) ||
    Number(fileConfig.HEARTBEAT_INTERVAL_MS || fileConfig.heartbeatIntervalMs) ||
    30000,
};
