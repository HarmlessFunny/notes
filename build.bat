@echo off
cd /d "%~dp0"

echo ========================================
echo   Build Script
echo ========================================
echo.

echo [1/3] Building frontend (npm run build)...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed
    pause
    exit /b 1
)
echo [OK] Frontend built to backend\dist
echo.

echo [2/3] Building backend executable (PyInstaller)...
cd backend

pyinstaller --onefile --noconfirm --name backend --distpath ..\release --hidden-import nanoid --add-data "dist;dist" backend.py

if errorlevel 1 (
    echo [ERROR] PyInstaller build failed
    pause
    exit /b 1
)

rd /s /q build 2>nul
del backend.spec 2>nul

echo [OK] Executable output to release\backend.exe
echo.

echo [3/3] Copy .env to release (frontend is embedded in exe).

if exist "..\.env" (
    copy ..\.env ..\release\.env
    echo [OK] .env copied to release\env
) else (
    copy ..\.env.example ..\release\.env.example
    echo [OK] .env.example copied to release\env.example
)
cd ..
echo.

echo ========================================
echo   Build complete!
echo ========================================
echo.
echo Output: release\
echo   backend.exe        - backend executable (frontend embedded)
if exist "release\.env.example" (
    echo Deploy: put .env next to backend.exe with:
    echo   CHAT_API_KEY / CHAT_BASE_URL / CHAT_MODEL_NAME
)
echo.
echo   (database.json / assets\ / notes\ auto-created on first run)
echo.
pause
