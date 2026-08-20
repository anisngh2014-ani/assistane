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

; Optional Native Bridge service. This only runs when a real signed helper is
; packaged at resources\native-bridge\windows\AssistaneNativeBridge.exe.
IfFileExists "$INSTDIR\resources\native-bridge\windows\AssistaneNativeBridge.exe" 0 skip_native_bridge_service
  ExecWait 'sc.exe create "AssistaneNativeBridge" binPath= "\"$INSTDIR\resources\native-bridge\windows\AssistaneNativeBridge.exe\" --service" DisplayName= "Assistane Native Bridge" start= auto'
  ExecWait 'sc.exe description "AssistaneNativeBridge" "Assistane visible native helper for signed remote-support capture/input integration."'
  ExecWait 'sc.exe failure "AssistaneNativeBridge" reset= 86400 actions= restart/60000/restart/60000/""/60000'
  ExecWait 'sc.exe start "AssistaneNativeBridge"'
skip_native_bridge_service:

!macroend

!macro customUnInstall

; Mark the registered device offline before removing the Agent. This updates
; both owner and user dashboards immediately when the remote user uninstalls.
IfFileExists "$INSTDIR\Assistane Agent.exe" 0 skip_uninstall_offline
  ExecWait '"$INSTDIR\Assistane Agent.exe" --mark-offline-and-exit'
  Sleep 1500
skip_uninstall_offline:

; Stop any still-running Agent process so it cannot send another heartbeat
; after the uninstall offline signal has been sent.
ExecWait 'taskkill.exe /IM "Assistane Agent.exe" /T /F'

; Remove saved registration files so reinstall requires a fresh support code.
Delete "$APPDATA\Assistane Agent\device.json"
Delete "$APPDATA\Assistane Agent\pairing_token.txt"
Delete "$APPDATA\Assistane Agent\manual-stop.json"

DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Assistane Agent"
ExecWait 'schtasks.exe /Delete /TN "Assistane Agent Watchdog" /F'
ExecWait 'sc.exe stop "AssistaneNativeBridge"'
ExecWait 'sc.exe delete "AssistaneNativeBridge"'

!macroend
