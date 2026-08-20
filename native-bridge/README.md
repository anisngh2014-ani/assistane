# Assistane Native Bridge

This folder is the prepared home for a future signed native helper.

The current Assistane Agent remains the main app. The Native Bridge is optional
and is not installed unless a real platform helper binary is present. This keeps
the current build safe, visible, and uninstallable while leaving a clean path for
features that Electron cannot reliably perform by itself.

## Why This Exists

Some remote-support features require operating-system level integration:

- capturing or recovering around secure lock-screen transitions
- privileged input integration
- signed display or capture driver integration
- service-level lifecycle coordination

Electron cannot fully provide those capabilities alone. A production helper must
be written natively, signed, reviewed, and installed transparently.

## Folder Layout

- `windows/` - Windows service/helper scaffold.
- `macos/` - macOS privileged helper notes and signing requirements.
- `service-contract.json` - Message and capability contract between the Agent
  and a future Native Bridge.

## Safety Rules

- The bridge must be visible in installed programs/services.
- The bridge must stop and uninstall when Assistane Agent is uninstalled.
- The bridge must not keep remote access alive after uninstall.
- Remote sessions must remain visible to the remote user and logged.
- Any driver/helper must be code-signed before production use.

## Current Behavior

The Electron Agent installer copies this folder into the application resources.
On Windows, GitHub Actions builds:

`native-bridge\windows\AssistaneNativeBridge.exe`

The Agent installer then copies it to:

`resources\native-bridge\windows\AssistaneNativeBridge.exe`

and installs it as the visible Windows Service:

`AssistaneNativeBridge`
