# Building Assistane Agent & Viewer

## Prerequisites

### Windows
- Node.js 20 LTS: https://nodejs.org
- Python 3.11: https://python.org
- Visual Studio Build Tools 2019/2022 with "Desktop development with C++" workload

### macOS
- Node.js 20 LTS: https://nodejs.org
- Xcode Command Line Tools: `xcode-select --install`

## API config

The production API is `https://api.assistane.com`.

Before local desktop builds, copy `app-config.example.json` to `app-config.local.json` in each Electron folder and add the private API key if your AWS API requires it. Do not commit `app-config.local.json`.

For GitHub Actions builds, set this repository secret:

- `ASSISTANE_API_KEY`

## AWS download publishing

The dashboard downloads installers from these stable URLs:

- `https://downloads.assistane.com/agent/windows/Assistane.Agent.Setup.exe`
- `https://downloads.assistane.com/agent/macos/Assistane.Agent.dmg`
- `https://downloads.assistane.com/viewer/windows/Assistane.Viewer.Setup.exe`
- `https://downloads.assistane.com/viewer/macos/Assistane.Viewer.dmg`

GitHub Actions can publish directly to the Assistane AWS downloads bucket. Set these repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `ASSISTANE_API_KEY`
- `ASSISTANE_DOWNLOADS_DISTRIBUTION_ID` only after the downloads CloudFront distribution is created

The workflows use region `us-east-1` and bucket `assistane-remote-prod-downloadsbucket-mszqgdqc3ygb`.

## Build Agent (.exe / .dmg)

```bash
cd electron-agent
npm install
npm run rebuild
npm run build:win
npm run build:mac
```

Expected output:

- `electron-agent/dist/Assistane.Agent.Setup.exe`
- `electron-agent/dist/Assistane.Agent.dmg`

## Build Viewer (.exe / .dmg)

```bash
cd electron-viewer
npm install
npm run build:win -- --publish never
npm run build:mac -- --publish never
```

Expected output:

- `electron-viewer/dist/Assistane.Viewer.Setup.exe`
- `electron-viewer/dist/Assistane.Viewer.dmg`

## Code signing

No code signing certificate is configured. Windows SmartScreen will show Unknown Publisher, and macOS Gatekeeper/notarization warnings may appear until proper signing certificates are added.