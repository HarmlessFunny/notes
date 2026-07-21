@echo off
cd /d "%~dp0"

set RELEASE_DIR=release
if not exist %RELEASE_DIR% mkdir %RELEASE_DIR%

echo ========================================
echo   Build Script (Tauri 2)
echo ========================================
echo.

echo [1/3] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)
echo [OK] Frontend built
echo.

echo [2/3] Building Windows exe...
call npx tauri build
if errorlevel 1 (
    echo [ERROR] Windows build failed
    pause
    exit /b 1
)
copy /Y src-tauri\target\release\notes.exe %RELEASE_DIR%\Notes-Windows-x64.exe
echo [OK] Windows exe -^> %RELEASE_DIR%\Notes-Windows-x64.exe
echo.

echo [3/3] Building Android APK...
echo [3/3] Step: Regenerating Android project to match current identifier...
if exist src-tauri\gen\android rmdir /s /q src-tauri\gen\android
call npx tauri android init
if errorlevel 1 (
    echo [ERROR] Android project init failed
    pause
    exit /b 1
)
echo [OK] Android project regenerated
echo [3/3] Step: Generating keystore...
keytool -genkey -v -keystore src-tauri\gen\android\app\keystore.jks -alias notes -keyalg RSA -keysize 2048 -validity 10000 -storepass notes123 -keypass notes123 -dname "CN=Notes, OU=Dev, O=Notes, L=City, ST=State, C=CN"
echo [OK] Keystore generated
set TAURI_ANDROID_KEYSTORE_PATH=%CD%\src-tauri\gen\android\app\keystore.jks
set TAURI_ANDROID_KEYSTORE_PASSWORD=notes123
set TAURI_ANDROID_KEY_ALIAS=notes
set TAURI_ANDROID_KEY_PASSWORD=notes123
call npx tauri android build --target aarch64
if errorlevel 1 (
    echo [ERROR] Android build failed
    pause
    exit /b 1
)

set "APK_DIR=src-tauri\gen\android\app\build\outputs\apk\universal\release"

rem 如果产出是 unsigned，用 apksigner 补签
if exist "%APK_DIR%\app-universal-release-unsigned.apk" (
    echo [3/3] Step: Signing APK...
    set "APKSIGNER="
    if not "%ANDROID_HOME%"=="" (
        for /f "tokens=*" %%i in ('dir /b /ad /o-n "%ANDROID_HOME%\build-tools" 2^>nul') do (
            if not defined APKSIGNER if exist "%ANDROID_HOME%\build-tools\%%i\apksigner.bat" set "APKSIGNER=%ANDROID_HOME%\build-tools\%%i\apksigner.bat"
        )
    )
    if "%APKSIGNER%"=="" set "APKSIGNER=apksigner"
    "%APKSIGNER%" sign --ks src-tauri\gen\android\app\keystore.jks --ks-pass pass:notes123 --key-pass pass:notes123 --in-place "%APK_DIR%\app-universal-release-unsigned.apk"
    if errorlevel 1 (
        echo [ERROR] APK signing failed
        pause
        exit /b 1
    )
    echo [OK] APK signed
)

if exist "%APK_DIR%\app-universal-release-unsigned.apk" (
    copy /Y "%APK_DIR%\app-universal-release-unsigned.apk" %RELEASE_DIR%\Notes-Android-arm64-v8a.apk
) else if exist "%APK_DIR%\app-universal-release.apk" (
    copy /Y "%APK_DIR%\app-universal-release.apk" %RELEASE_DIR%\Notes-Android-arm64-v8a.apk
)
echo [OK] Android APK -^> %RELEASE_DIR%\Notes-Android-arm64-v8a.apk
echo.

echo ========================================
echo   Build complete!
echo ========================================
echo.
echo Output: %RELEASE_DIR%\
echo   Notes-Windows-x64.exe           - Windows executable
echo   Notes-Android-arm64-v8a.apk     - Android APK
echo.
pause
