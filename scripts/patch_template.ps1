# patch_template.ps1
# ----------------------------------------------------------------
# Add OverrideSettings to the existing Fleet Provisioning template
# so attribute re-edits stop failing with
# "AttributePayload conflicts with AttributePayload in Template".
#
# This patches what is already deployed - it does NOT replace your
# template structure, which is the part that was failing validation.
#
# Usage:
#   .\scripts\patch_template.ps1
#   .\scripts\patch_template.ps1 -TemplateName envmon-dev-fleet
# ----------------------------------------------------------------

param(
  [string] $TemplateName = "envmon-dev-fleet",
  [string] $Region       = "us-east-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Reading existing template '$TemplateName' ..." -ForegroundColor Cyan

# 1) Pull the current template body
$current = aws iot describe-provisioning-template `
  --template-name $TemplateName `
  --region $Region `
  --output json | ConvertFrom-Json

if (-not $current.templateBody) {
  Write-Error "Template body was empty - is the name correct?"
  exit 1
}

# templateBody is a JSON string; parse it
$body = $current.templateBody | ConvertFrom-Json

if (-not $body.Resources.thing) {
  Write-Error "Template has no 'thing' resource. Expected resource name 'thing' under Resources."
  exit 1
}

# 2) Inject / overwrite OverrideSettings on the Thing resource
$override = @{
  AttributePayload = "MERGE"
  ThingGroups      = "DO_NOTHING"
}

$body.Resources.thing | Add-Member `
  -NotePropertyName OverrideSettings `
  -NotePropertyValue $override `
  -Force

# 3) Serialize back to compact JSON (AWS expects a JSON STRING for templateBody)
$newBody = $body | ConvertTo-Json -Depth 30 -Compress

Write-Host "Patched body (preview):" -ForegroundColor Yellow
Write-Host $newBody.Substring(0, [Math]::Min(400, $newBody.Length))
Write-Host "..."
Write-Host ""

# 4) Save a backup copy so you can audit / diff later
$backupDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) `
                       "template_backups"
New-Item -Type Directory -Force -Path $backupDir | Out-Null
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
Set-Content -Encoding ASCII `
  -Path (Join-Path $backupDir "${TemplateName}-original-${ts}.json") `
  -Value $current.templateBody
Set-Content -Encoding ASCII `
  -Path (Join-Path $backupDir "${TemplateName}-patched-${ts}.json") `
  -Value $newBody
Write-Host "Backups written under $backupDir" -ForegroundColor DarkGray
Write-Host ""

# 5) Upload the patched body as a new version, set as default
Write-Host "Uploading new version ..." -ForegroundColor Cyan
aws iot create-provisioning-template-version `
  --template-name $TemplateName `
  --set-as-default `
  --template-body $newBody `
  --region $Region | Out-Null

Write-Host "Done. The next provisioning attempt with any spelling change will succeed." `
          -ForegroundColor Green
