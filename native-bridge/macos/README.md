# macOS Native Bridge

macOS requires a different production path than Windows.

A future Assistane helper should use Apple's privileged helper model and be
signed/notarized with the main app. Even with a helper, macOS privacy controls
still limit lock-screen capture and input. Screen Recording and Accessibility
permissions remain user-approved system permissions.

## Production Requirements

- Signed and notarized app and helper.
- Privileged helper registered with SMAppService or the appropriate Apple helper
  mechanism for the supported macOS versions.
- Clear user-visible installation and uninstall behavior.
- No hidden persistence after uninstall.
- Session visibility and logging remain mandatory.

## Current Build

No macOS helper binary is included yet. The Electron Agent continues to use
Screen Recording and Accessibility permissions.
