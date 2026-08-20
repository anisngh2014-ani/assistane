/* eslint-disable */
/**
 * capture.js — Platform-native screen capture source selection
 *
 * Windows: uses Desktop Duplication API indirectly via Electron's
 *   desktopCapturer + chromeMediaSource pipeline (Chromium's
 *   DesktopCapturerSource backed by DXGI Desktop Duplication).
 *
 * macOS 12.3+: uses ScreenCaptureKit via Electron's desktopCapturer
 *   (Chromium switched to SCK in Electron 28+ on macOS 13+).
 *   For older macOS it falls back to CGWindowListCreateImage.
 *
 * The returned `sourceId` is passed to the renderer process which
 * calls getUserMedia({ video: { mandatory: { chromeMediaSource: "desktop",
 * chromeMediaSourceId: sourceId } } }) — this is the correct bridge
 * between the main-process desktopCapturer and the renderer's WebRTC track.
 *
 * Capture constraints per platform:
 *   Windows: maxFrameRate 30, maxWidth 3840 — DXGI handles GPU-direct copy
 *   macOS:   maxFrameRate 60, maxWidth 3840 — SCK zero-copy IOSurface path
 */

const { desktopCapturer, screen } = require("electron");
const os = require("os");

const IS_WINDOWS = os.platform() === "win32";
const IS_MAC     = os.platform() === "darwin";

/**
 * Returns the best available screen source ID for the primary display.
 * Prefers displays over individual windows.
 *
 * @returns {Promise<{ sourceId: string, width: number, height: number, frameRate: number }>}
 */
async function getPrimaryScreenSource() {
  // Get primary display dimensions so we can request a matching thumbnail
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  // desktopCapturer in the main process enumerates OS-level capture sources.
  // On Windows this invokes the DXGI Desktop Duplication enumerator.
  // On macOS 13+ Electron uses ScreenCaptureKit; on older versions it uses
  // CGWindowListCreateImage / AVFoundation.
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    // Fetch a small thumbnail just for source identification — not used for streaming
    thumbnailSize: { width: 32, height: 32 },
    fetchWindowIcons: false,
  });

  if (!sources.length) throw new Error("No screen capture source found");

  // Prefer "Entire Screen" on macOS / "Screen 1" on Windows; fall back to first
  const preferred = sources.find(
    (s) => s.name === "Entire Screen" || s.name === "Screen 1" || s.name.toLowerCase().includes("screen")
  ) || sources[0];

  // Platform-tuned constraints
  const frameRate = IS_MAC ? 60 : 30;

  console.log(
    `[capture] platform=${os.platform()} source="${preferred.name}" id=${preferred.id} ` +
    `resolution=${width}x${height} fps=${frameRate}`
  );

  return { sourceId: preferred.id, width, height, frameRate };
}

/**
 * Returns getUserMedia video constraints for the given source.
 * These are passed to the renderer which calls navigator.mediaDevices.getUserMedia().
 *
 * The chromeMediaSource="desktop" + chromeMediaSourceId pipeline:
 *   - Windows: Chromium uses DesktopCapturerSource → DXGIOutputDuplicator
 *              (Desktop Duplication API, GPU-accelerated)
 *   - macOS:   Chromium uses DesktopCapturerSource → ScreenCaptureKitDesktopCapturer
 *              (ScreenCaptureKit, zero-copy IOSurface → CVPixelBuffer → WebRTC frame)
 *
 * @param {string} sourceId
 * @param {number} width
 * @param {number} height
 * @param {number} frameRate
 * @returns {object} MediaStreamConstraints video object
 */
function buildVideoConstraints(sourceId, width, height, frameRate) {
  return {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        // Cap at native resolution; browser will downscale if needed
        maxWidth: Math.min(width, 3840),
        maxHeight: Math.min(height, 2160),
        minWidth: 640,
        minHeight: 480,
        maxFrameRate: frameRate,
        minFrameRate: 5,
      },
    },
  };
}

module.exports = { getPrimaryScreenSource, buildVideoConstraints };