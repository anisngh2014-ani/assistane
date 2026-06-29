# Building Assistane Agent & Viewer

## Prerequisites

### Windows
- Node.js 20 LTS: https://nodejs.org
- Python 3.11: https://python.org
- Visual Studio Build Tools 2019/2022 with "Desktop development with C++" workload
  → https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

### macOS
- Node.js 20 LTS: https://nodejs.org
- Xcode Command Line Tools: `xcode-select --install`

---

## Build Agent (.exe / .dmg)

Before building, copy `app-config.example.json` to `app-config.local.json` inside `electron-agent` and fill in your private API URL/key.

```bash
cd electron-agent
npm install
npm run rebuild        # rebuilds robotjs for your Electron version
npm run build:win      # → dist/Assistane Agent Setup.exe
npm run build:mac      # → dist/Assistane Agent-1.0.0.dmg
```

## Build Viewer (.exe / .dmg)

Before building, copy `app-config.example.json` to `app-config.local.json` inside `electron-viewer` and fill in the same private API URL/key.

```bash
cd electron-viewer
npm install
npm run build:win      # → dist/Assistane Viewer Setup.exe
npm run build:mac      # → dist/Assistane Viewer-1.0.0.dmg
```

Output files are in the `dist/` folder inside each project directory.

---

## Build via GitHub Actions (recommended)

Push a git tag to trigger an automated cross-platform build and GitHub Release:

```bash
# Agent
git tag agent-v1.0.0
git push origin agent-v1.0.0

# Viewer
git tag viewer-v1.0.0
git push origin viewer-v1.0.0
```

The workflows produce `.exe` and `.dmg` files attached to the GitHub Release.
You can also trigger them manually from the Actions tab using "Run workflow".

Add these GitHub repository secrets before running the workflows:

- `BASE44_DEVICE_API_URL`
- `BASE44_DEVICE_API_KEY`

---

## Distributing

1. Upload the `.exe` / `.dmg` files to your dashboard's **Viewer Download** page.
2. Users on Windows install the `.exe`; macOS users mount the `.dmg`.
3. The Agent asks for the **Support Code** from the dashboard on first launch.
4. The Viewer launches automatically when you click **Connect** on any online device.
