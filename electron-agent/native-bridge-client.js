/* eslint-disable */
const net = require("net");
const fs = require("fs");
const path = require("path");

const PIPE_PATH = "\\\\.\\pipe\\AssistaneNativeBridge";
const STATUS_PATH = path.join(process.env.ProgramData || "C:\\ProgramData", "Assistane", "NativeBridge", "status.json");

function callBridge(command, timeoutMs = 1200) {
  if (process.platform !== "win32") return Promise.resolve(null);

  return new Promise((resolve) => {
    const socket = net.createConnection(PIPE_PATH);
    let done = false;
    let buffer = "";
    const timer = setTimeout(() => finish(null), timeoutMs);

    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch (_) {}
      resolve(value);
    }

    socket.on("connect", () => socket.write(JSON.stringify({ command }) + "\n"));
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\n")) {
        try { finish(JSON.parse(buffer.trim())); }
        catch (_) { finish(null); }
      }
    });
    socket.on("error", () => finish(null));
    socket.on("end", () => {
      if (!done && buffer.trim()) {
        try { finish(JSON.parse(buffer.trim())); }
        catch (_) { finish(null); }
      } else {
        finish(null);
      }
    });
  });
}

function readStatusFile() {
  try {
    if (!fs.existsSync(STATUS_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf8"));
  } catch (_) {
    return null;
  }
}

async function getStatus() {
  const live = await callBridge("get_status");
  return live?.status || readStatusFile();
}

function notify(command) {
  callBridge(command).catch(() => {});
}

module.exports = { getStatus, notify, readStatusFile };
