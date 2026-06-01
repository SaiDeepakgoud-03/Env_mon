$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$BuildTools = Join-Path $Sdk "build-tools\34.0.0"
$AndroidJar = Join-Path $Sdk "platforms\android-34\android.jar"
$Out = Join-Path $Root "manual_build"
$ResOut = Join-Path $Out "compiled_res"
$Gen = Join-Path $Out "gen"
$Classes = Join-Path $Out "classes"
$Dex = Join-Path $Out "dex"
$Unsigned = Join-Path $Out "EnvMonSetup-unsigned.apk"
$Dexed = Join-Path $Out "EnvMonSetup-dexed.apk"
$Aligned = Join-Path $Out "EnvMonSetup-aligned.apk"
$Final = Join-Path $Root "EnvMonDashboard.apk"
$Keystore = Join-Path $Out "debug.keystore"
$JdkBin = "C:\Program Files\Java\jdk-22\bin"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-22"

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force $ResOut, $Gen, $Classes, $Dex | Out-Null

& (Join-Path $BuildTools "aapt2.exe") compile --dir (Join-Path $Root "app\src\main\res") -o $ResOut
& (Join-Path $BuildTools "aapt2.exe") link `
  -I $AndroidJar `
  --manifest (Join-Path $Root "app\src\main\AndroidManifest.xml") `
  --java $Gen `
  --min-sdk-version 23 `
  --target-sdk-version 34 `
  --version-code 1 `
  --version-name 1.0 `
  -o $Unsigned `
  (Get-ChildItem -Path $ResOut -Filter *.flat -Recurse | Select-Object -ExpandProperty FullName)

$Sources = @(
  (Get-ChildItem -Path (Join-Path $Root "app\src\main\java") -Filter *.java -Recurse | Select-Object -ExpandProperty FullName)
  (Get-ChildItem -Path $Gen -Filter *.java -Recurse | Select-Object -ExpandProperty FullName)
)

& (Join-Path $JdkBin "javac.exe") -encoding UTF-8 --release 8 -classpath $AndroidJar -d $Classes $Sources
& (Join-Path $BuildTools "d8.bat") --lib $AndroidJar --output $Dex (Get-ChildItem -Path $Classes -Filter *.class -Recurse | Select-Object -ExpandProperty FullName)
if (!(Test-Path (Join-Path $Dex "classes.dex"))) { throw "D8 did not create classes.dex" }

Copy-Item $Unsigned $Dexed
& (Join-Path $JdkBin "jar.exe") uf $Dexed -C $Dex classes.dex
& (Join-Path $BuildTools "zipalign.exe") -f -p 4 $Dexed $Aligned

& (Join-Path $JdkBin "keytool.exe") -genkeypair `
  -keystore $Keystore `
  -storepass android `
  -keypass android `
  -alias envmon `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -dname "CN=EnvMon Debug,O=EnvMon,C=IN"

& (Join-Path $BuildTools "apksigner.bat") sign `
  --ks $Keystore `
  --ks-pass pass:android `
  --key-pass pass:android `
  --out $Final `
  $Aligned

& (Join-Path $BuildTools "apksigner.bat") verify $Final
Write-Host "APK created: $Final"
