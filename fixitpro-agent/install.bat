@echo off
setlocal

echo ============================================
echo  FixITPro Agent - Installation
echo ============================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Please run this file as Administrator.
    echo Right-click install.bat and choose "Run as administrator"
    pause
    exit /b 1
)

set "EXE_DIR=%~dp0"
set "EXE_PATH=%EXE_DIR%FixITPro-Agent.exe"
set "CERT_DIR=%APPDATA%\FixITPro-Agent"
set "CERT_FILE=%CERT_DIR%\localhost.crt"

:: Step 1: Generate certificate by running the agent briefly
echo [1/3] Generating certificate...
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"

:: Run the agent to generate cert, then kill it
start "" /B "%EXE_PATH%"
timeout /t 3 /nobreak >nul
taskkill /IM FixITPro-Agent.exe /F >nul 2>&1

if not exist "%CERT_FILE%" (
    echo [ERROR] Certificate not found at: %CERT_FILE%
    echo Make sure FixITPro-Agent.exe is in the same folder as install.bat
    pause
    exit /b 1
)

:: Step 2: Import certificate to Windows Trusted Root
echo [2/3] Installing certificate to Windows Trust Store...
powershell -NoProfile -Command "Import-Certificate -FilePath '%CERT_FILE%' -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null; Write-Host 'Certificate installed.'"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install certificate.
    pause
    exit /b 1
)

:: Step 3: Add to Windows Startup (current user)
echo [3/3] Setting up auto-start at Windows login...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\FixITPro-Agent.lnk"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%SHORTCUT%'); ^
   $s.TargetPath = '%EXE_PATH%'; ^
   $s.WorkingDirectory = '%EXE_DIR%'; ^
   $s.WindowStyle = 7; ^
   $s.Description = 'FixITPro Cash Drawer Agent'; ^
   $s.Save()"

echo.
echo ============================================
echo  Installation complete!
echo ============================================
echo.
echo The agent will start automatically when Windows starts.
echo Starting agent now...
echo.
start "" /B "%EXE_PATH%"
timeout /t 2 /nobreak >nul
echo Agent is running. You can now use the cash drawer from FixITPro.
echo.
pause
