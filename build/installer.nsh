!macro customInit
  ${If} ${Silent}
    ; Silent auto-updater installation: no UI
  ${Else}
    InitPluginsDir
    File /oname=$PLUGINSDIR\CatSetupProgress.exe "${PROJECT_DIR}\build\CatSetupProgress.exe"
    System::Call 'kernel32::GetCurrentProcessId() i .r0'
    Exec '"$PLUGINSDIR\CatSetupProgress.exe" $0'
  ${EndIf}
!macroend
