# Builds the BiteVo Android app on this PC:
#   npm run build:android            the APK, to install on phones directly       -> mobile\BiteVo.apk
#   npm run build:android -- aab     the app bundle, to upload to the Play Store  -> mobile\BiteVo.aab
# It uses Java and the Android SDK from JAVA_HOME and ANDROID_HOME (as Android Studio sets them up), or from
# BITEVO_ANDROID_TOOLS (default D:\Android) holding jdk\<version>, Sdk and gradle-home, when that folder exists.
# Nothing is changed in Windows' settings: the paths apply only while this script runs.
# Release builds are signed with the Play Store upload key when this PC has it (mobile/README.md), otherwise
# with the debug key (fine for the APK, refused by the Play Store).
param([ValidateSet('apk', 'aab')][string]$Kind = 'apk')
$ErrorActionPreference = 'Stop'

$tools = if ($env:BITEVO_ANDROID_TOOLS) { $env:BITEVO_ANDROID_TOOLS } else { 'D:\Android' }
# (Test-Path on the plain string: Join-Path fails when the drive itself doesn't exist.)
if (Test-Path "$tools\Sdk") {
  $env:JAVA_HOME = (Get-ChildItem "$tools\jdk" -Directory | Select-Object -First 1).FullName
  $env:ANDROID_HOME = "$tools\Sdk"
  $env:GRADLE_USER_HOME = "$tools\gradle-home"
} else {
  if (-not $env:JAVA_HOME) {
    $studioJava = 'C:\Program Files\Android\Android Studio\jbr'
    if (Test-Path $studioJava) { $env:JAVA_HOME = $studioJava } else { throw 'Java not found: set JAVA_HOME (Android Studio''s jbr folder works).' }
  }
  if (-not $env:ANDROID_HOME) {
    $studioSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (Test-Path $studioSdk) { $env:ANDROID_HOME = $studioSdk } else { throw 'Android SDK not found: set ANDROID_HOME.' }
  }
}

$mobile = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $mobile 'android')
try {
  if ($Kind -eq 'aab') {
    # Every phone type, including x86_64 (Chromebooks and emulators): the Play Store hands each phone only its part.
    & .\gradlew.bat bundleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64' --console=plain
  } else {
    # Phones only (ARM); emulator builds (x86) are left out to halve the build time and the APK size.
    & .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' --console=plain
  }
  if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }
} finally {
  Pop-Location
}

if ($Kind -eq 'aab') {
  $out = Join-Path $mobile 'android\app\build\outputs\bundle\release\app-release.aab'
  $copy = Join-Path $mobile 'BiteVo.aab'
} else {
  $out = Join-Path $mobile 'android\app\build\outputs\apk\release\app-release.apk'
  $copy = Join-Path $mobile 'BiteVo.apk'
}
Copy-Item $out $copy -Force
"$($Kind.ToUpper()) ready: $copy ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
