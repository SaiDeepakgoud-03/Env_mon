# restore_template.ps1
# ----------------------------------------------------------------
# Roll the provisioning template back to the most recent backup
# written by patch_template.ps1.
#
# Works on Windows PowerShell 5.1 (no -Raw) and PowerShell 7+.
#
# Usage:
#   .\scripts\restore_template.ps1
#   .\scripts\restore_template.ps1 -TemplateName envmon-dev-fleet
# ----------------------------------------------------------------

param(
  [string] $TemplateName = "envmon-dev-fleet",
  [string] $Region       = "us-east-1"
)

$ErrorActionPreference = "Stop"

$root      = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backupDir = Join-Path $root "template_backups"

if (-not (Test-Path $backupDir)) {
  Write-Error "No backup directory at $backupDir"
  exit 1
}

# Newest -original-*.json
$file = Get-ChildItem $backupDir -Filter "$TemplateName-original-*.json" |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $file) {
  Write-Error "No backup files matching $TemplateName-original-*.json"
  exit 1
}

Write-Host "Restoring from $($file.FullName)" -ForegroundColor Cyan

# Read whole file as one string  (PS5-safe equivalent of  Get-Content -Raw)
$body = [System.IO.File]::ReadAllText($file.FullName)

if ([string]::IsNullOrWhiteSpace($body)) {
  Write-Error "Backup file is empty - aborting"
  exit 1
}

aws iot create-provisioning-template-version `
  --template-name $TemplateName `
  --set-as-default `
  --template-body $body `
  --region $Region | Out-Null

Write-Host "Template rolled back to original." -ForegroundColor Green
