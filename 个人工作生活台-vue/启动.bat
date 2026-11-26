@echo off
setlocal
cd /d "%~dp0"
title personal-os launcher

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20 or newer first.
  pause
  exit /b 1
)

netstat -ano | findstr ":8787" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo Server is already running at http://127.0.0.1:8787
  start "" http://127.0.0.1:8787
  exit /b 0
)

if not exist "node_modules" (
  echo First run: installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo Building the app, please wait...
  call npm run build:express
  if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

echo Starting optional QQ music service...
if exist "%~dp0..\qq-api\node_modules\@yakult-green-tea\qq-music-api\dist\src\app.js" (
  netstat -ano | findstr ":3200" | findstr "LISTENING" >nul
  if errorlevel 1 (
    if not exist "%~dp0..\qq-api\data" mkdir "%~dp0..\qq-api\data"
    if not exist "%~dp0..\qq-api\data\session-secret.txt" (
      node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(48).toString('base64'))" "%~dp0..\qq-api\data\session-secret.txt"
    )
    set /p QQ_SESSION_SECRET=<"%~dp0..\qq-api\data\session-secret.txt"
    set "QQ_AUTH_SESSION_PATH=%~dp0..\qq-api\data\qq-session.bin"
    start "qq-music-api" /D "%~dp0..\qq-api" cmd /k "node node_modules\@yakult-green-tea\qq-music-api\dist\src\app.js"
  ) else (
    echo Music service already running at http://127.0.0.1:3200
  )
) else (
  echo [INFO] QQ music API not installed; music page will show "not connected".
)

echo Starting server in a new window...
start "personal-os server" cmd /k "node server\index.mjs"

echo Waiting for the server to respond...
powershell -NoProfile -Command "$i=0; while($i -lt 40){ try{ if((Invoke-WebRequest 'http://127.0.0.1:8787/api/ping' -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200){ exit 0 } }catch{}; $i+=1; Start-Sleep -Milliseconds 300 }; exit 1"

if errorlevel 1 (
  echo [ERROR] Server did not respond. Check the "personal-os server" window.
  pause
  exit /b 1
)

start "" http://127.0.0.1:8787
echo Opened in browser. Keep the server window open while using the app.
timeout /t 2 >nul
exit /b 0
