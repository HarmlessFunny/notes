$sourceKeystore = "src-tauri/keystore.jks"
$targetKeystore = "src-tauri/gen/android/app/keystore.jks"
$gradleFile = "src-tauri/gen/android/app/build.gradle.kts"

if (-not (Test-Path $sourceKeystore)) {
    Write-Host "[signing] src-tauri/keystore.jks not found, skipping APK signing"
    exit 0
}

Copy-Item $sourceKeystore $targetKeystore -Force
Write-Host "[signing] Copied keystore to gen/android/app/"

$content = [System.IO.File]::ReadAllText((Resolve-Path $gradleFile))

if ($content -match "signingConfigs\s*\{") {
    Write-Host "[signing] Signing config already present, skipping"
    exit 0
}

$pattern1 = [regex]::Escape("    buildTypes {")
$insert1 = "    signingConfigs {
        create(""release"") {
            storeFile = file(""keystore.jks"")
            storePassword = ""123456""
            keyAlias = ""notes""
            keyPassword = ""123456""
        }
    }

    buildTypes {"
$content = $content -replace $pattern1, $insert1

$pattern2 = [regex]::Escape('        getByName("release") {')
$insert2 = '        getByName("release") {
            signingConfig = signingConfigs.getByName("release")'
$content = $content -replace $pattern2, $insert2

[System.IO.File]::WriteAllText((Resolve-Path $gradleFile), $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "[signing] Android signing config applied"
