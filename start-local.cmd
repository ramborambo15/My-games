@echo off
set "NODE_EXE=C:\Users\jhale\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo Could not find the bundled Node.js runtime.
  echo Try playing from your GitHub Pages website instead.
  pause
  exit /b 1
)

cd /d "%~dp0"
echo Starting Voxel Realm...
echo.
echo Keep this window open while you play.
echo Open this in your browser:
echo http://127.0.0.1:8091/
echo.
start "" "http://127.0.0.1:8091/"
"%NODE_EXE%" server.js
pause
