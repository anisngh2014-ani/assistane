#!/bin/bash
# macOS post-install script for Assistane Agent
# Called by the DMG installer after the app is copied to /Applications.
# The download URL passes ?token=XXXX which the web page stores in localStorage,
# and the Connect page writes it into the DMG filename as Assistane-Agent-TOKEN.dmg.
# This script extracts it from the $PAIRING_TOKEN env var set by the launcher shim.

SUPPORT_DIR="$HOME/Library/Application Support/Assistane Agent"
TOKEN_FILE="$SUPPORT_DIR/pairing_token.txt"

mkdir -p "$SUPPORT_DIR"

# If PAIRING_TOKEN env var is set (passed by download/launcher), write it
if [ -n "$PAIRING_TOKEN" ]; then
  echo -n "$PAIRING_TOKEN" > "$TOKEN_FILE"
  echo "[postinstall] Pairing token saved."
else
  echo "[postinstall] No PAIRING_TOKEN env var — user will enter token manually."
fi

# Auto-launch the app
open -a "Assistane Agent" 2>/dev/null || true