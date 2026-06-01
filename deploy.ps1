# deploy.ps1
# ---------------------------------------------------------------
# End-to-end AWS deployment for the Environment Monitor.
# Run from PowerShell after `aws configure`.
#
#   .\deploy.ps1                  # full deploy (idempotent)
#   .\deploy.ps1 -SkipTables      # skip table creation
#   .\deploy.ps1 -SkipRoutes      # skip API Gateway route creation
#
# All resources land in $Region (default us-east-1).
# ---------------------------------------------------------------

param(
  [string] $Region        = "us-east-1",
  [string] $LambdaName    = "envmon_api",
  [string] $ApiId         = "tzh11a7qtc",        # your existing API
  [string] $StageName     = "prod",
  [string] $DevicesTable  = "EnvDevices",
  [string] $ReadingsTable = "EnvReadings",
  [switch] $SkipTables,
  [switch] $SkipRoutes
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Push-Location $root
try {

  $account = (aws sts get-caller-identity --query Account --output text).Trim()
  Write-Host "AWS account : $account"
  Write-Host "Region      : $Region"
  Write-Host "Lambda      : $LambdaName"
  Write-Host "API id      : $ApiId"
  Write-Host ""

  # -----------------------------------------------------------------
  # 1) DynamoDB tables
  # -----------------------------------------------------------------
  if (-not $SkipTables) {
    Write-Host "==> Ensuring DynamoDB tables..."
    foreach ($t in @(
      @{ name = $DevicesTable;  attrs = "AttributeName=device_id,AttributeType=S";
         keys  = "AttributeName=device_id,KeyType=HASH" },
      @{ name = $ReadingsTable; attrs = "AttributeName=device_id,AttributeType=S AttributeName=timestamp,AttributeType=N";
         keys  = "AttributeName=device_id,KeyType=HASH AttributeName=timestamp,KeyType=RANGE" }
    )) {
      $exists = $false
      try { aws dynamodb describe-table --table-name $t.name --region $Region --output text 2>$null | Out-Null; $exists = $true } catch {}
      if ($exists) {
        Write-Host "   exists   - $($t.name)"
      } else {
        Write-Host "   creating - $($t.name)"
        $attrArgs = $t.attrs -split ' '
        $keyArgs  = $t.keys  -split ' '
        aws dynamodb create-table `
          --table-name $t.name `
          --attribute-definitions @attrArgs `
          --key-schema @keyArgs `
          --billing-mode PAY_PER_REQUEST `
          --region $Region | Out-Null
      }
    }

    aws dynamodb update-time-to-live `
      --table-name $ReadingsTable `
      --time-to-live-specification "Enabled=true, AttributeName=ttl" `
      --region $Region 2>$null | Out-Null
  }

  # -----------------------------------------------------------------
  # 2) Lambda execution role
  # -----------------------------------------------------------------
  $roleName = "${LambdaName}-role"
  $trust = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

  Write-Host "==> Ensuring Lambda IAM role..."
  $roleArn = $null
  try {
    $roleArn = (aws iam get-role --role-name $roleName --query Role.Arn --output text 2>$null).Trim()
    Write-Host "   exists   - $roleName"
  } catch {
    $trust | Out-File -Encoding ASCII trust.json
    $roleArn = (aws iam create-role `
      --role-name $roleName `
      --assume-role-policy-document file://trust.json `
      --query Role.Arn --output text).Trim()
    Write-Host "   created  - $roleName"
    Start-Sleep -Seconds 8
  } finally {
    Remove-Item trust.json -ErrorAction SilentlyContinue
  }

  aws iam attach-role-policy `
    --role-name $roleName `
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>$null | Out-Null

  # Inline policy for DynamoDB
  $ddbPolicy = @"
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:GetItem","dynamodb:Query","dynamodb:Scan"],
    "Resource": [
      "arn:aws:dynamodb:${Region}:${account}:table/${DevicesTable}",
      "arn:aws:dynamodb:${Region}:${account}:table/${ReadingsTable}"
    ]
  }]
}
"@
  $ddbPolicy | Out-File -Encoding ASCII ddb-policy.json
  aws iam put-role-policy `
    --role-name $roleName `
    --policy-name EnvMonDynamo `
    --policy-document file://ddb-policy.json | Out-Null
  Remove-Item ddb-policy.json -ErrorAction SilentlyContinue
  Write-Host "   policy attached"

  # -----------------------------------------------------------------
  # 3) Lambda code
  # -----------------------------------------------------------------
  Write-Host "==> Packaging Lambda..."
  Push-Location lambda
  if (Test-Path envmon_api.zip) { Remove-Item envmon_api.zip }
  Compress-Archive -Path index.mjs -DestinationPath envmon_api.zip -Force
  Pop-Location

  Write-Host "==> Deploying Lambda..."
  $exists = $false
  try { aws lambda get-function --function-name $LambdaName --region $Region --output text 2>$null | Out-Null; $exists = $true } catch {}

  $envVars = "Variables={DEVICES_TABLE=$DevicesTable,READINGS_TABLE=$ReadingsTable,ACTIVE_WINDOW_MS=30000,MAX_HISTORY=60,TTL_DAYS=30}"

  if ($exists) {
    aws lambda update-function-code `
      --function-name $LambdaName `
      --zip-file fileb://lambda/envmon_api.zip `
      --region $Region | Out-Null

    # Wait for update to finish before configuration update
    do {
      Start-Sleep -Seconds 2
      $status = (aws lambda get-function-configuration --function-name $LambdaName --region $Region --query LastUpdateStatus --output text).Trim()
    } while ($status -eq "InProgress")

    aws lambda update-function-configuration `
      --function-name $LambdaName `
      --handler index.handler `
      --runtime nodejs20.x `
      --timeout 10 `
      --environment $envVars `
      --region $Region | Out-Null
    Write-Host "   updated  - $LambdaName"
  } else {
    aws lambda create-function `
      --function-name $LambdaName `
      --runtime nodejs20.x `
      --role $roleArn `
      --handler index.handler `
      --zip-file fileb://lambda/envmon_api.zip `
      --timeout 10 `
      --environment $envVars `
      --region $Region | Out-Null
    Write-Host "   created  - $LambdaName"
  }
  $lambdaArn = "arn:aws:lambda:${Region}:${account}:function:${LambdaName}"

  # -----------------------------------------------------------------
  # 4) API Gateway routes (HTTP API v2)
  # -----------------------------------------------------------------
  if (-not $SkipRoutes) {
    Write-Host "==> Wiring API Gateway routes..."

    # Ensure ONE Lambda integration for this Lambda
    $existing = aws apigatewayv2 get-integrations --api-id $ApiId --region $Region --output json | ConvertFrom-Json
    $integ = $existing.Items | Where-Object { $_.IntegrationUri -eq $lambdaArn -or $_.IntegrationUri -like "*:function:$LambdaName" } | Select-Object -First 1
    if (-not $integ) {
      $integ = (aws apigatewayv2 create-integration `
        --api-id $ApiId `
        --integration-type AWS_PROXY `
        --integration-uri $lambdaArn `
        --payload-format-version 2.0 `
        --region $Region --output json) | ConvertFrom-Json
      Write-Host "   integration created - $($integ.IntegrationId)"
    } else {
      Write-Host "   integration reused - $($integ.IntegrationId)"
    }
    $integId = $integ.IntegrationId

    # Grant API Gateway permission to invoke
    try {
      aws lambda add-permission `
        --function-name $LambdaName `
        --statement-id "apigw-${ApiId}" `
        --action lambda:InvokeFunction `
        --principal apigateway.amazonaws.com `
        --source-arn "arn:aws:execute-api:${Region}:${account}:${ApiId}/*/*" `
        --region $Region 2>$null | Out-Null
    } catch {}

    $routes = @(
      "POST /sensor-data",
      "POST /devices/register",
      "GET /devices",
      "GET /devices/{device_id}"
    )

    $existingRoutes = aws apigatewayv2 get-routes --api-id $ApiId --region $Region --output json | ConvertFrom-Json
    foreach ($key in $routes) {
      $r = $existingRoutes.Items | Where-Object { $_.RouteKey -eq $key } | Select-Object -First 1
      if ($r) {
        aws apigatewayv2 update-route --api-id $ApiId --route-id $r.RouteId --target "integrations/$integId" --region $Region | Out-Null
        Write-Host "   route updated - $key"
      } else {
        aws apigatewayv2 create-route --api-id $ApiId --route-key $key --target "integrations/$integId" --region $Region | Out-Null
        Write-Host "   route created - $key"
      }
    }

    # CORS - allow the dashboard to call from any origin
    Write-Host "==> Configuring CORS..."
    aws apigatewayv2 update-api `
      --api-id $ApiId `
      --cors-configuration "AllowOrigins=*,AllowMethods=GET,POST,OPTIONS,AllowHeaders=Content-Type,Authorization,MaxAge=300" `
      --region $Region | Out-Null

    # Deploy
    Write-Host "==> Deploying stage $StageName..."
    aws apigatewayv2 create-deployment --api-id $ApiId --stage-name $StageName --region $Region | Out-Null
  }

  Write-Host ""
  Write-Host "================================================================"
  Write-Host "  Deploy complete."
  Write-Host "  Base URL : https://${ApiId}.execute-api.${Region}.amazonaws.com/${StageName}"
  Write-Host "================================================================"
  Write-Host ""
  Write-Host "  Smoke tests:"
  Write-Host "  curl.exe `"https://${ApiId}.execute-api.${Region}.amazonaws.com/${StageName}/devices`""
  Write-Host ""
  Write-Host "  POST a dummy device:"
  Write-Host "  curl.exe -X POST -H `"Content-Type: application/json`" ``"
  Write-Host "    -d '{\""device_id\"":\""env_TEST\"",\""mac\"":\""AA:BB:CC:DD:EE:FF\"",\""ip\"":\""1.2.3.4\"",\""ssid\"":\""x\"",\""rssi\"":-50,\""fw_version\"":\""1.0\"",\""place\"":\""X\"",\""district\"":\""Y\"",\""state\"":\""Z\"",\""country\"":\""India\""}' ``"
  Write-Host "    `"https://${ApiId}.execute-api.${Region}.amazonaws.com/${StageName}/devices/register`""

} finally {
  Pop-Location
}
