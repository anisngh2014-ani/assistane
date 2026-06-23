; Install hook for Assistane Agent.
; Stores an optional support code and registers normal user-level startup.

!include "MUI2.nsh"

!macro customInstall

; Write support code from installer /token= command-line arg.
; The public download flow can pass /token=XXXX to prefill first-run pairing.
Var /GLOBAL PairingToken
${GetParameters} $R0
${GetOptions} $R0 "/token=" $PairingToken

StrCmp $PairingToken "" skip_token
  CreateDirectory "$APPDATA\Assistane Agent"
  FileOpen $0 "$APPDATA\Assistane Agent\pairing_token.txt" w
  FileWrite $0 $PairingToken
  FileClose $0
skip_token:

; Keep the agent available after reboot using a visible per-user startup entry.
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Assistane Agent" '"$INSTDIR\Assistane Agent.exe"'

; Add a visible Task Scheduler watchdog while installed. It restarts the Agent
; if it crashes, but the Agent will not restart after the user chooses Quit.
ExecWait 'schtasks.exe /Create /TN "Assistane Agent Watchdog" /SC MINUTE /MO 5 /TR "\"$INSTDIR\Assistane Agent.exe\" --scheduled" /F'

!macroend

!macro customUnInstall

DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Assistane Agent"
ExecWait 'schtasks.exe /Delete /TN "Assistane Agent Watchdog" /F'

!macroend
