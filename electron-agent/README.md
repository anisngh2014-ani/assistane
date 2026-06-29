# Assistane Agent

Desktop Agent for registering a remote device, sending heartbeats, and serving native Viewer remote-control sessions.

## Setup

1. Set `BASE44_DEVICE_API_URL` to the deployed `deviceApi` function URL.
2. Set `BASE44_DEVICE_API_KEY` only if your deployed function requires it.
3. Build the installer with `npm run build:win` or `npm run build:mac`.

## Device Registration

The Agent uses support codes only.

1. Open Assistane dashboard.
2. Go to Add/Register Device.
3. Generate one support code.
4. Open Assistane Agent on the remote device.
5. Enter the 6-digit support code.
6. The Agent registers the device, consumes the code, and starts heartbeats.

No second registration code is shown to the user.

## Tray Menu

The tray menu intentionally contains only:

- Open Assistane Agent
- Join
- Settings
- Quit Assistane Agent

Heartbeat actions belong in the dashboard or Viewer, not the Agent tray menu.
