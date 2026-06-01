# reset_thing.ps1
# ----------------------------------------------------------------
# Wipe a Thing (and its certificates) from AWS IoT so that the
# next Fleet Provisioning attempt can register it fresh.
#
# Use when the device's serial monitor shows:
#   FLEET_PROV: Fleet Provisioning rejected: "...AttributePayload conflicts..."
# i.e. you re-typed a location attribute and the existing Thing has
# the older value.
#
# Usage (from PowerShell):
#   .\scripts\reset_thing.ps1 -ThingName env_EC64
#   .\scripts\reset_thing.ps1 -ThingName env_EC64 -Region us-east-1
# ----------------------------------------------------------------

param(
  [Parameter(Mandatory = $true)] [string] $ThingName,
  [string] $Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

Write-Host "Resetting Thing '$ThingName' in $Region ..." -ForegroundColor Cyan

# 1) List every certificate currently attached to the Thing
$principals = aws iot list-thing-principals `
  --thing-name $ThingName `
  --region    $Region `
  --query     "principals" `
  --output    json | ConvertFrom-Json

if (-not $principals -or $principals.Count -eq 0) {
  Write-Host "   no principals attached"
} else {
  foreach ($p in $principals) {
    $certId = ($p -split "/")[-1]
    Write-Host "   detaching $p"
    aws iot detach-thing-principal `
      --thing-name $ThingName `
      --principal $p `
      --region $Region | Out-Null

    Write-Host "   deactivating + deleting certificate $certId"
    aws iot update-certificate `
      --certificate-id $certId `
      --new-status     INACTIVE `
      --region         $Region | Out-Null

    aws iot delete-certificate `
      --certificate-id $certId `
      --force-delete `
      --region $Region | Out-Null
  }
}

# 2) Delete the Thing itself
Write-Host "   deleting Thing $ThingName"
aws iot delete-thing `
  --thing-name $ThingName `
  --region $Region | Out-Null

Write-Host "Done. Power-cycle the ESP32 (or hold BOOT 5 s for full reset)." -ForegroundColor Green
