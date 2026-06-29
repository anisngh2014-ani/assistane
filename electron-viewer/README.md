# RemotePilot Viewer App

A dedicated Electron application installed on the **controller's machine** (the technician/admin device). When the user clicks **Connect** on any dashboard device, the viewer app is launched automatically via the `assistane://` custom URL protocol.

## Architecture

```
Dashboard (web app)
    |
    | Click "Connect" on device
    |
    ↓
assistane://connect?device_id=xxx&device_name=yyy&...
    |
    | OS resolves protocol → launches:
    ↓
RemotePilot Viewer (Electron app, this folder)
    |
    | Creates WebRTC offer → pushes to backend DB
    |
    ↓
Target Device (electron-agent) polls every 1s
    |
    | Picks up offer → sends answer
    |
    ↓
P2P WebRTC connection established
(Full remote control: video stream, mouse, keyboard, clipboard, file transfer)
```

## Setup

```bash
cd electron-viewer
npm install
npm start          # Development
npm run build:win  # Build Windows installer
npm run build:mac  # Build macOS DMG
```

## Protocol Registration

The app registers `assistane://` as a system protocol on install. No manual configuration needed.

## Config

Copy `app-config.example.json` to `app-config.local.json` before building:

```json
{
  "apiBaseUrl": "https://base44.app/api/apps/YOUR_APP_ID/functions/deviceApi",
  "apiKey": ""
}
```

`app-config.local.json` is ignored by git. For GitHub Actions builds, set repository secrets `BASE44_DEVICE_API_URL` and `BASE44_DEVICE_API_KEY`.

At runtime, the viewer can also read `viewer-config.json` from the app data folder.

## Distribution

Build the installers and host them at:
- `/public/downloads/RemotePilot-Viewer-Setup.exe` (Windows)
- `/public/downloads/RemotePilot-Viewer.dmg` (macOS)

These are linked from the `/viewer-download` page in the dashboard.
