/* eslint-disable */
// ─────────────────────────────────────────────────────────────
// macOS Permissions — Screen Recording & Accessibility
// Required by macOS for remote control / screen sharing.
// These APIs are no-ops on Windows/Linux (return "granted").
// ─────────────────────────────────────────────────────────────

const { systemPreferences, shell, dialog } = require("electron");
const os = require("os");

const isMac = os.platform() === "darwin";

// ── Screen Recording ──────────────────────────────────────────
// Status: "not-determined" | "granted" | "denied" | "restricted"
function getScreenStatus() {
  if (!isMac) return "granted";
  return systemPreferences.getMediaAccessStatus("screen");
}

// Triggers the macOS prompt the first time, then opens System Settings
function openScreenSettings() {
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
  );
}

// ── Accessibility ─────────────────────────────────────────────
// prompt=true shows the system dialog the first time it's requested
function getAccessibilityStatus(prompt = false) {
  if (!isMac) return true;
  return systemPreferences.isTrustedAccessibilityClient(prompt);
}

function openAccessibilitySettings() {
  shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
  );
}

// ── Combined check used at startup ────────────────────────────
function getAllStatuses() {
  return {
    isMac,
    screen: getScreenStatus(),
    accessibility: getAccessibilityStatus(false),
  };
}

// Prompts the user and opens the relevant settings panes for any
// permission that isn't granted. Returns true if everything is granted.
async function ensurePermissions() {
  if (!isMac) return true;

  const screen = getScreenStatus();
  const accessibility = getAccessibilityStatus(false);

  const missing = [];
  if (screen !== "granted") missing.push("Screen Recording");
  if (!accessibility) missing.push("Accessibility");

  if (missing.length === 0) return true;

  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "RemotePilot Agent — Permissions Required",
    message: "macOS requires extra permissions for remote control",
    detail:
      `The following permissions are not yet granted:\n\n• ${missing.join(
        "\n• "
      )}\n\nClick "Open Settings" to grant them. After enabling, you may need to restart the agent.`,
    buttons: ["Open Settings", "Later"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    // Trigger the native accessibility prompt, then open the panes
    if (!accessibility) {
      getAccessibilityStatus(true);
      openAccessibilitySettings();
    }
    if (screen !== "granted") {
      openScreenSettings();
    }
  }

  return false;
}

module.exports = {
  isMac,
  getScreenStatus,
  getAccessibilityStatus,
  getAllStatuses,
  ensurePermissions,
  openScreenSettings,
  openAccessibilitySettings,
};