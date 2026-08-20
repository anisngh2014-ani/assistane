; Uninstall hook for Assistane Agent.

!include "MUI2.nsh"

DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Assistane Agent"
