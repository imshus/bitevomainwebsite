# Builds the BiteVo Android app (APK) on this PC, with Java 17, the Android SDK and Gradle's download cache
# kept in D:\Android (change the three paths below if they live elsewhere). Nothing is changed in Windows'
# settings: the paths apply only while this script runs. The APK is copied to mobile\BiteVo.apk.
#   npm run build:android            (from the mobile folder)
$ErrorActionPreference = 'Stop'
$tools = if ($env:BITEVO_ANDROID_TOOLS) { $env:BITEVO_ANDROID_TOOLS } else { 'D:\Android' }
$env:JAVA_HOME = (Get-ChildItem (Join-Path $tools 'jdk') -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $tools 'Sdk'
$env:GRADLE_USER_HOME = Join-Path $tools 'gradle-home'

$mobile = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $mobile 'android')
try {
  # Phones only (ARM); emulator builds (x86) are left out to halve the build time and the APK size.
  & .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --console=plain
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}
$apk = Join-Path $mobile 'android\app\build\outputs\apk\release\app-release.apk'
Copy-Item $apk (Join-Path $mobile 'BiteVo.apk') -Force
"APK ready: $(Join-Path $mobile 'BiteVo.apk') ($([math]::Round((Get-Item $apk).Length / 1MB, 1)) MB)"
