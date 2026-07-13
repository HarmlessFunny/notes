@echo off
setlocal

call npx vite build
if %errorlevel% neq 0 exit /b %errorlevel%

call npm run build:server
if %errorlevel% neq 0 exit /b %errorlevel%

call npx electron-builder
if %errorlevel% neq 0 exit /b %errorlevel%

:: wait for file handles to be released
timeout /t 2 /nobreak >nul

if exist "release\win-unpacked" (
  if exist "release\Notes-Windows-x64" rmdir /s /q "release\Notes-Windows-x64"
  move /y "release\win-unpacked" "release\Notes-Windows-x64"
)

:: clean up electron-builder temp files
if exist "release\builder-debug.yml" del /q "release\builder-debug.yml"
if exist "release\builder-effective-config.yaml" del /q "release\builder-effective-config.yaml"

echo Build complete: release\Notes-Windows-x64
