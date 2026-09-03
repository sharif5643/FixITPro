@echo off
:: FixITPro Agent - Add to Windows Startup
:: Run this once after installing the agent

set AGENT_PATH=%~dp0FixITPro-Agent.exe
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT=%STARTUP_DIR%\FixITPro-Agent.lnk

echo Installing FixITPro Agent to Windows Startup...

:: Create shortcut using PowerShell
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $sc = $ws.CreateShortcut('%SHORTCUT%'); ^
   $sc.TargetPath = '%AGENT_PATH%'; ^
   $sc.WorkingDirectory = '%~dp0'; ^
   $sc.Description = 'FixITPro Cash Drawer Agent'; ^
   $sc.Save()"

if exist "%SHORTCUT%" (
  echo [OK] Agent will start automatically with Windows.
  echo Starting agent now...
  start "" "%AGENT_PATH%"
) else (
  echo [ERROR] Could not create shortcut. Please run as Administrator.
)
pause
