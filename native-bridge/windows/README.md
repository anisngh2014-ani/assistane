# Windows Native Bridge

This folder contains the Windows Native Bridge helper:

`AssistaneNativeBridge.exe`

and the active-session helper:

`AssistaneSessionHelper.exe`

GitHub Actions builds the helper from `src/` before the Agent installer is
created. The executable is copied into:

`resources\native-bridge\windows\AssistaneNativeBridge.exe`

and registered as:

`AssistaneNativeBridge`

## Current Capabilities

- Starts as a visible Windows Service before the user opens the Agent.
- Auto-runs after reboot when installed by the Agent installer.
- Detects the active Windows console session.
- Launches `AssistaneSessionHelper.exe` inside the active user session when a
  logged-in session is available.
- Writes a local service heartbeat/status file to:
  `C:\ProgramData\Assistane\NativeBridge\status.json`
- Exposes a named pipe for the Electron Agent:
  `\\.\pipe\AssistaneNativeBridge`
- Monitors the Electron Agent process and asks the visible watchdog task to
  relaunch it if it crashes.
- Reports lock/unlock/session transition state so the Viewer can reconnect
  instead of freezing.

## Prepared Future Capabilities

These require signed native driver/helper work before production use:

- capture/control on the actual secure desktop/login screen
- driver-level capture path
- privileged input against elevated/admin applications
- deeper background file transfer service
- auto-update service with signed package verification

## Production Requirements

- Sign with an OV or EV code-signing certificate.
- Use a clear publisher name for SmartScreen reputation.
- Keep IPC authenticated to the Assistane Agent process.
- Stop and uninstall when Assistane Agent is uninstalled.
- Do not hide the service or persist after uninstall.
