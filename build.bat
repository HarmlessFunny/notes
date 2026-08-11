@echo off
cd /d "%~dp0"

rem Usage: build.bat [win|android|all] [--force]
rem   --force  always rebuild frontend even if sources unchanged
set TARGET=
set FORCE=0
for %%a in (%*) do (
    if /i "%%a"=="--force" (
        set FORCE=1
    ) else if not defined TARGET (
        set TARGET=%%a
    )
)
if not defined TARGET set TARGET=all
if not "%TARGET%"=="win" if not "%TARGET%"=="android" if not "%TARGET%"=="all" (
    echo [ERROR] Unknown target "%TARGET%". Use: win, android, all
    if not "%GITHUB_ACTIONS%"=="true" pause
    exit /b 1
)

rem Enable sccache if installed (cross-target artifact cache)
where sccache >nul 2>nul
if %errorlevel%==0 (
    set RUSTC_WRAPPER=sccache
    set SCCACHE_CACHE_SIZE=20G
    echo [INFO] sccache enabled
) else (
    echo [INFO] sccache not found, using plain incremental build
)

set RELEASE_DIR=release
if not exist %RELEASE_DIR% mkdir %RELEASE_DIR%

echo ========================================
echo   Build Script (Tauri 2)  -  target: %TARGET%
echo ========================================
echo.

set STEPS=2
if "%TARGET%"=="all" set STEPS=3

rem Skip frontend build if dist is newer than all sources (unless --force)
if "%FORCE%"=="1" goto frontend_build
powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; $src = Get-ChildItem -Recurse -File src,index.html,vite.config.ts,package.json,package-lock.json | Measure-Object LastWriteTime -Maximum; $dist = Get-ChildItem -Recurse -File dist | Measure-Object LastWriteTime -Maximum; if ($dist.Count -gt 0 -and $src.Maximum -le $dist.Maximum) { exit 0 } else { exit 1 }"
if errorlevel 1 goto frontend_build
echo [SKIP] Frontend unchanged, skipping npm run build (use --force to rebuild)
goto frontend_skip

:frontend_build
echo [1/%STEPS%] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    if not "%GITHUB_ACTIONS%"=="true" pause
    exit /b 1
)
echo [OK] Frontend built

:frontend_skip
echo.

if not "%TARGET%"=="android" (
    echo [2/%STEPS%] Building Windows exe...
    call npm run tauri -- build
    if errorlevel 1 (
        echo [ERROR] Windows build failed
        if not "%GITHUB_ACTIONS%"=="true" pause
        exit /b 1
    )
    copy /Y src-tauri\target\release\notes.exe %RELEASE_DIR%\Notes-Windows-x64.exe
    echo [OK] Windows exe -^> %RELEASE_DIR%\Notes-Windows-x64.exe
    echo.
)

if not "%TARGET%"=="win" (
    echo [3/%STEPS%] Building Android APK...
    if not exist src-tauri\keystore.jks (
        echo [INFO] Generating keystore...
        keytool -genkey -v -keystore src-tauri\keystore.jks -alias notes -keyalg RSA -keysize 2048 -validity 10000 -storepass notes123 -keypass notes123 -dname "CN=Notes, OU=Dev, O=Notes, L=City, ST=State, C=CN"
    ) else (
        echo [OK] Keystore already exists, skipping generation
    )
    call npm run tauri -- android build --target aarch64
    if errorlevel 1 (
        echo [ERROR] Android build failed
        if not "%GITHUB_ACTIONS%"=="true" pause
        exit /b 1
    )
    if exist src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk (
        copy /Y src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk %RELEASE_DIR%\Notes-Android-arm64-v8a.apk
    ) else (
        echo [WARN] Signed APK not found, copying unsigned APK instead
        copy /Y src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk %RELEASE_DIR%\Notes-Android-arm64-v8a.apk
    )
    echo [OK] Android APK -^> %RELEASE_DIR%\Notes-Android-arm64-v8a.apk
    echo.
)

echo ========================================
echo   Build complete!
echo ========================================
echo.
echo Output: %RELEASE_DIR%\
echo   Notes-Windows-x64.exe           - Windows executable
echo   Notes-Android-arm64-v8a.apk     - Android APK
echo.
if not "%GITHUB_ACTIONS%"=="true" pause
