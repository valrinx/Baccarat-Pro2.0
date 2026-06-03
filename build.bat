@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ======================================
echo Baccarat Pro 2.0 - Build and Verify
echo ======================================
echo.

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    exit /b 1
  )
) else (
  echo Dependencies already installed.
)

echo.
echo Running self-check...
node tests\selfcheck.js
if errorlevel 1 (
  echo.
  echo [ERROR] Self-check failed.
  exit /b 1
)

echo.
echo Verifying backend startup...
powershell -NoProfile -Command "Start-Process -FilePath 'node.exe' -ArgumentList 'backend\\server.js' -WorkingDirectory (Get-Location) -WindowStyle Minimized"
timeout /t 3 >nul

echo.
echo Build complete.
echo Open http://localhost:3000 in your browser.
exit /b 0
