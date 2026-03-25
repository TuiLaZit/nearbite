param(
  [Parameter(Mandatory=$false)]
  [string]$ApiBaseUrl,
  [Parameter(Mandatory=$false)]
  [switch]$RecreateAndroid
)

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  Write-Error "Flutter SDK was not found in PATH. Install Flutter first, then run: flutter doctor"
  exit 1
}

flutter --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Error "Flutter command is not healthy. Run: flutter doctor"
  exit 1
}

if ($RecreateAndroid -and (Test-Path -Path ".\\android")) {
  Remove-Item -Recurse -Force ".\\android"
}

if (-not (Test-Path -Path ".\\android")) {
  flutter create . --platforms=android --android-language java
}

if (-not (Test-Path -Path ".\\.env")) {
  Copy-Item ".\\.env.example" ".\\.env"
  Write-Host "Created .env from .env.example. Please edit .env and set API_BASE_URL to your Railway domain."
}

flutter pub get

if ($ApiBaseUrl) {
  flutter run --dart-define=API_BASE_URL=$ApiBaseUrl
} else {
  flutter run
}
