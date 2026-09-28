#!/usr/bin/env bash
# Linux 构建脚本，对应 build.bat。产物输出到 release/。
#
# 用法: ./build.sh [--force] [--android]
#   --force    即使前端源码没变化也重新构建前端
#   --android  额外构建 Android APK（需要 Android SDK/NDK + Java 17）
set -euo pipefail

cd "$(dirname "$0")"

FORCE=0
BUILD_ANDROID=0
for arg in "$@"; do
    case "$arg" in
        --force)   FORCE=1 ;;
        --android) BUILD_ANDROID=1 ;;
        -h|--help)
            sed -n '2,6p' "$0"
            exit 0
            ;;
        *)
            echo "[ERROR] 未知参数 \"$arg\"。用法: ./build.sh [--force] [--android]" >&2
            exit 1
            ;;
    esac
done

RELEASE_DIR=release
mkdir -p "$RELEASE_DIR"

# 产物名需与前端更新检查的命名保持一致（见 src/utils/update.ts）
case "$(uname -m)" in
    aarch64|arm64) ARTIFACT_NAME=Notes-Linux-aarch64 ;;
    *)             ARTIFACT_NAME=Notes-Linux-x86_64 ;;
esac

echo "========================================"
echo "  Build Script (Tauri 2)  -  target: linux"
echo "========================================"
echo

needs_frontend_build() {
    [ "$FORCE" -eq 1 ] && return 0
    [ -d dist ] || return 0
    # 任一源文件比 dist 新就需要重新构建
    local newer
    newer=$(find src index.html vite.config.ts package.json package-lock.json \
        -type f -newer dist/index.html -print -quit 2>/dev/null || true)
    [ -n "$newer" ]
}

if needs_frontend_build; then
    echo "[1/2] Building frontend..."
    npm run build
    echo "[OK] Frontend built"
else
    echo "[SKIP] Frontend unchanged (use --force to rebuild)"
fi
echo

echo "[2/2] Building Linux binary..."
npx tauri build --no-bundle
cp -f src-tauri/target/release/notes "$RELEASE_DIR/$ARTIFACT_NAME"
chmod +x "$RELEASE_DIR/$ARTIFACT_NAME"
echo "[OK] Linux binary -> $RELEASE_DIR/$ARTIFACT_NAME"
echo

if [ "$BUILD_ANDROID" -eq 1 ]; then
    echo "[+] Building Android APK..."
    if [ ! -f src-tauri/keystore.jks ]; then
        echo "[INFO] Generating keystore..."
        keytool -genkey -v -keystore src-tauri/keystore.jks -alias notes \
            -keyalg RSA -keysize 2048 -validity 10000 \
            -storepass notes123 -keypass notes123 \
            -dname "CN=Notes, OU=Dev, O=Notes, L=City, ST=State, C=CN"
    else
        echo "[OK] Keystore already exists, skipping generation"
    fi
    npx tauri android build --target aarch64
    apk_dir=src-tauri/gen/android/app/build/outputs/apk/universal/release
    if [ -f "$apk_dir/app-universal-release.apk" ]; then
        cp -f "$apk_dir/app-universal-release.apk" "$RELEASE_DIR/Notes-Android-arm64-v8a.apk"
    else
        echo "[WARN] 未找到已签名 APK，改用未签名 APK"
        cp -f "$apk_dir/app-universal-release-unsigned.apk" "$RELEASE_DIR/Notes-Android-arm64-v8a.apk"
    fi
    echo "[OK] Android APK -> $RELEASE_DIR/Notes-Android-arm64-v8a.apk"
    echo
fi

echo "========================================"
echo "  Build complete!"
echo "========================================"
echo
echo "Output: $RELEASE_DIR/"
echo "  $ARTIFACT_NAME              - Linux executable"
if [ "$BUILD_ANDROID" -eq 1 ]; then
    echo "  Notes-Android-arm64-v8a.apk     - Android APK"
fi
