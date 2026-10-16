@echo off
title Vocab Master
cd /d "%~dp0"
set "TOOL_URL=http://localhost:8787/"

echo Checking if the tool server is already running...

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%TOOL_URL%' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if %ERRORLEVEL%==0 (
  echo Server already running at %TOOL_URL%
  start "" "%TOOL_URL%"
  goto :done
)

echo Starting server on port 8787...
if not exist "node_modules\docx" (
  echo Installing dependencies ^(first run only^)...
  call npm install
)
start "Vocab Master Proxy" /min cmd /c "node proxy.js & pause"
timeout /t 2 /nobreak >nul

powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '%TOOL_URL%' -UseBasicParsing -TimeoutSec 5; exit 0 } catch { exit 1 }"
if %ERRORLEVEL%==0 (
  start "" "%TOOL_URL%"
  echo Opened %TOOL_URL%
) else (
  echo Could not reach the server. Check the "Vocab Master Proxy" window for errors.
  echo You can also run manually: node proxy.js
)

:done
echo.
echo Tool URL: %TOOL_URL%
echo Keep the proxy running while using AI generation.
pause
