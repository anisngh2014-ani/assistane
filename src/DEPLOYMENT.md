# ðŸš€ Assistane â€” Full Deployment & Setup Guide

This is your complete step-by-step guide to make everything fully functional:
- **Dashboard** (owner + admin web app) on your main domain
- **Agent download portal** (for target devices) on a separate clean domain
- **Electron Agent** (target device â€” the machine being controlled)
- **Electron Viewer App** (controller device â€” the technician's machine)
- **WebRTC signaling** connecting everything together

---

## ðŸ—º Architecture at a Glance

```
your-company.com          â†’  Owner/Admin Dashboard (this Base44 app)
connect.your-company.com  â†’  Target user downloads the Agent here
                               (enters unique support code â†’ gets paired)

Technician's PC           â†’  Installs Assistane Viewer (electron-viewer/)
Target User's PC          â†’  Installs Assistane Agent  (electron-agent/)

All communication goes through Base44 backend (WebRTC signaling + REST API)
WebRTC video/control is P2P directly between Viewer â†” Agent
```

---

## STEP 1 â€” Publish the Dashboard (Main Domain)

### 1A. Publish via Base44

1. In your Base44 builder, click **Publish** (top-right)
2. The app is live at `https://your-app-id.base44.app`
3. Go to **Settings â†’ Custom Domain**
4. Add your domain: `app.your-company.com` (or `assistane.your-company.com`)
5. Base44 gives you a CNAME record like:
   ```
   CNAME  app  â†’  cname.base44.app
   ```
6. Add that CNAME in your DNS provider (GoDaddy / Cloudflare / Namecheap / Route53)
7. Wait 5â€“30 minutes for DNS propagation
8. HTTPS is automatic (Base44 handles Let's Encrypt)

âœ… Your dashboard is now live at `https://app.your-company.com`

---

## STEP 2 â€” Set Up the Agent Download Portal (Separate Domain)

Target users need a clean URL where they enter their code and download the agent.
The `/connect` page is already public â€” no login required.

### Option A â€” Same domain, different path (easiest, works immediately)
Share links like:
```
https://app.your-company.com/connect?code=123456
```

### Option B â€” Separate subdomain (professional look)
Example: `connect.your-company.com` â†’ redirects to your main app's `/connect`

**Using Cloudflare (free):**
1. Add domain to Cloudflare
2. Create a **Redirect Rule**:
   - Match: `connect.your-company.com/*`
   - Redirect to: `https://app.your-company.com/connect`
   - Status: 301 Permanent

**Using Nginx (if you have a VPS):**
```nginx
server {
    listen 443 ssl;
    server_name connect.your-company.com;
    return 301 https://app.your-company.com/connect$request_uri;
}
```

âœ… Target users visit: `connect.your-company.com?code=123456`

---

## STEP 3 â€” Build & Host the Assistane Agent

The **Agent** is installed on the target device (the machine being remotely controlled).

### 3A. Config is already pre-filled
`electron-agent/config.js` already has your correct API URL and key. No changes needed.

### 3B. Build the Agent

```bash
cd electron-agent
npm install
npm run build:win    # â†’ dist/Assistane-Agent-Setup.exe
npm run build:mac    # â†’ dist/Assistane-Agent.dmg
```

### 3C. Host the Agent Installers

Upload the built `.exe` / `.dmg` to a public file host:
- **Google Drive** â†’ right-click â†’ Share â†’ "Anyone with the link" â†’ get direct download link
- **Dropbox** â†’ share â†’ change `?dl=0` to `?dl=1` in URL for direct download
- **AWS S3 / Cloudflare R2** â†’ upload, make public, use the direct URL
- **Your VPS** â†’ `scp dist/Assistane-Agent-Setup.exe user@your-server:/var/www/files/`

### 3D. Update Download Links

Open `pages/Connect.jsx` and update these two lines with your hosted file URLs:
```js
const winUrl = "https://files.your-company.com/Assistane-Agent-Setup.exe";
const macUrl = "https://files.your-company.com/Assistane-Agent.dmg";
```

The support code is shown on the connect page and pasted into the agent on first launch. A static `.exe` or `.dmg` download will not receive URL query parameters.

---

## STEP 4 â€” Build & Distribute the Assistane Viewer App

The **Viewer App** is installed on **your machine** (the technician/admin controlling devices).

### 4A. Config is already pre-filled
`electron-viewer/main.js` loadConfig() already has your correct API URL and key.

### 4B. Build the Viewer

```bash
cd electron-viewer
npm install
npm run build:win    # â†’ dist/Assistane-Viewer-Setup.exe
npm run build:mac    # â†’ dist/Assistane-Viewer.dmg
```

### 4C. Host the Viewer Installers

Same as agent. Then update the download links in `pages/ViewerDownload.jsx`:
```
href="/downloads/Assistane-Viewer-Setup.exe"   â†’  your hosted URL
href="/downloads/Assistane-Viewer.dmg"         â†’  your hosted URL
```

### 4D. Install on YOUR Machine
Run the installer on your machine. It registers the `assistane://` protocol automatically.
After installing, clicking **Connect** on any dashboard device will launch the Viewer App.

---

## STEP 5 â€” End-to-End Workflow (How Everything Connects)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                      FULL FLOW                                   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                   â”‚
â”‚  1. YOU (Admin) log in to app.your-company.com                   â”‚
â”‚  2. Go to Register Device â†’ Support Codes â†’ Generate Code        â”‚
â”‚     â†’ A unique 6-digit code is created                           â”‚
â”‚                                                                   â”‚
â”‚  3. Share link with target user:                                  â”‚
â”‚     connect.your-company.com?code=123456                          â”‚
â”‚                                                                   â”‚
│     → Agent opens visibly for pairing, then remains in tray       │
â”‚     â†’ Downloads & installs the Agent on their PC                 â”‚
â”‚     â†’ Agent starts silently in system tray                       â”‚
â”‚     â†’ Agent sends heartbeat â†’ device appears ONLINE in dashboard â”‚
â”‚                                                                   â”‚
â”‚  5. You (with Assistane Viewer installed on your PC):             â”‚
â”‚     â†’ Click "Connect" on the device in dashboard                 â”‚
â”‚     â†’ Browser fires assistane://connect?device_id=...            â”‚
â”‚     â†’ Assistane Viewer launches automatically                    â”‚
â”‚     â†’ WebRTC offer created â†’ pushed to Base44 backend            â”‚
â”‚                                                                   â”‚
â”‚  6. Agent polls backend every 1 second                            â”‚
â”‚     â†’ Picks up the offer â†’ sends WebRTC answer                   â”‚
â”‚     â†’ P2P video/control channel established                      â”‚
â”‚                                                                   â”‚
â”‚  7. Full remote session:                                          â”‚
â”‚     â†’ Live screen video (P2P, very low latency)                  â”‚
â”‚     â†’ Mouse & keyboard control                                    â”‚
â”‚     â†’ Clipboard sync, file transfer, chat                        â”‚
â”‚     â†’ Reboot, lock, Ctrl+Alt+Del, etc.                           â”‚
â”‚                                                                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## STEP 6 â€” DNS Summary (What Records to Create)

| Record | Type | Name | Value |
|--------|------|------|-------|
| Main dashboard | CNAME | `app` | `cname.base44.app` |
| Agent portal redirect | CNAME | `connect` | `cname.base44.app` OR redirect to app domain |
| File downloads (optional) | A/CNAME | `files` | Your VPS IP or CDN endpoint |

> Enable Cloudflare orange cloud proxy for HTTPS + DDoS protection on all records.

---

## STEP 7 â€” First-Time Setup Checklist

```
Dashboard (Base44)
[ ] App published at base44.app URL (click Publish button)
[ ] Custom domain CNAME added in DNS provider
[ ] Custom domain configured in Base44 Settings â†’ Custom Domain
[ ] HTTPS working: open https://app.your-company.com in browser
[ ] Log in as admin â†’ verify /owner dashboard works

Assistane Agent (Target Device)
[ ] electron-agent/config.js has correct values (already pre-filled âœ“)
[ ] npm install && npm run build:win  (or build:mac)
[ ] Built installer uploaded to file host
[ ] Download links in pages/Connect.jsx updated to your hosted URLs
[ ] Test: Install agent on a test PC â†’ device appears ONLINE in dashboard within 30s

Assistane Viewer (Your Machine)
[ ] electron-viewer has correct config (already pre-filled âœ“)
[ ] npm install && npm run build:win  (or build:mac)
[ ] Install viewer on YOUR machine
[ ] Test: Click Connect on online device â†’ Assistane Viewer launches

End-to-End
[ ] Generate support code from dashboard (Register Device â†’ Support Codes)
[ ] Share connect link with test device user
[ ] Agent installs â†’ device goes ONLINE in dashboard
[ ] Click Connect â†’ viewer opens â†’ P2P session established
[ ] Test: mouse move, keyboard input, file drop, clipboard paste
```

---

## STEP 8 â€” Troubleshooting

### Device stays Offline
- Is the Agent running? Check system tray (Windows taskbar) / menu bar (macOS)
- Open Agent tray â†’ Settings/Logs â†’ check the API URL is correct
- Firewall must allow **HTTPS (port 443) outbound** on the target device

### Assistane Viewer doesn't launch when clicking Connect
- Not installed yet â€” dashboard falls back to in-browser viewer (expected behavior)
- Install from `/viewer-download` page in the dashboard
- Windows: Settings â†’ Apps â†’ Default Apps â†’ verify `assistane://` is registered to Assistane Viewer
- macOS: Run the DMG and open the app once to register the protocol

### WebRTC connection fails (black screen / no video)
- Both devices need **outbound UDP** (STUN uses UDP 3478). Check firewall.
- Behind strict corporate firewall â†’ add a TURN relay server:
  ```js
  // Add to RTC_CONFIG in electron-viewer/viewer.html
  { urls: "turn:your-turn-server.com:3478", username: "user", credential: "pass" }
  ```
  Free options: **Metered.ca** (free tier) or self-host **coturn**

### Support Code says "Invalid or expired"
- Codes expire after 24 hours â€” generate a new one
- Codes are single-use â€” if already used, generate a new one
- Make sure the user is entering only the 6 digits (no spaces)

---

## API Config Reference

| Item | Value |
|------|-------|
| API Base URL | Store in GitHub Secret `BASE44_DEVICE_API_URL` |
| API Key | Store in GitHub Secret `BASE44_DEVICE_API_KEY` if your Base44 endpoint requires it |
| Protocol (Viewer) | `assistane://` |
| Agent Product Name | `Assistane Agent` |
| Viewer Product Name | `Assistane Viewer` |

For local builds, copy `electron-agent/app-config.example.json` and `electron-viewer/app-config.example.json` to `app-config.local.json` in each app folder, then fill in your private values. `app-config.local.json` is ignored by git.

---

## Security Before Going Live

1. **Rotate the API Key** in Base44 Settings, update GitHub Secret `BASE44_DEVICE_API_KEY`, then rebuild both desktop apps
2. **HTTPS Only** â€” Base44 custom domains enforce HTTPS automatically âœ“
3. **Support codes** expire in 24h and are single-use âœ“
4. **Admin endpoints** all require `user.role === 'admin'` âœ“
5. **Each user sees only their own devices** âœ“
