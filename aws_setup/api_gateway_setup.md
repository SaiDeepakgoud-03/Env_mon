# API Gateway setup — `/prod` (HTTP API v2)

Base URL: `https://srb2rp6ww8.execute-api.us-east-1.amazonaws.com/prod`

| Method | Path        | Lambda           | Purpose                                |
| ------ | ----------- | ---------------- | -------------------------------------- |
| POST   | `/data`     | `environment_api` | Write one sensor reading (ESP32 + IoT Rule) |
| GET    | `/data`     | `environment_api` | Latest N readings for one device       |
| POST   | `/devices`  | `environment_api` | Register / heartbeat a device          |
| GET    | `/devices`  | `environment_api` | List all devices (fleet view)          |

CORS: `Access-Control-Allow-Origin: *`, methods `GET,POST,OPTIONS`,
headers `content-type`.

## Add the two new routes (console)

For each missing route:

1. API Gateway → `environment-api` → **Routes** → **Create**.
2. Method `POST` (or `GET`) → Resource path `/devices`.
3. After creation, click the new route → **Attach integration** →
   **Create and attach an integration** →
   - Integration type: **Lambda function**
   - Lambda: `environment_api`
   - Payload format: **2.0**
   - Tick **Grant API Gateway permission to invoke your Lambda function**
4. Repeat for `GET /devices`.
5. Top-right orange **Deploy** → stage `prod`.

## CLI alternative

```powershell
$apiId   = "srb2rp6ww8"
$region  = "us-east-1"
$lambda  = "arn:aws:lambda:us-east-1:077463315120:function:environment_api"

# Get the integration id (the same Lambda integration that /data uses)
$integ = aws apigatewayv2 get-integrations --api-id $apiId --region $region --query "Items[?IntegrationUri=='$lambda'].IntegrationId | [0]" --output text

# Create routes
aws apigatewayv2 create-route --api-id $apiId --route-key "POST /devices" --target "integrations/$integ" --region $region
aws apigatewayv2 create-route --api-id $apiId --route-key "GET /devices"  --target "integrations/$integ" --region $region

# Re-deploy (auto-deploy stage handles it if enabled; otherwise:)
aws apigatewayv2 create-deployment --api-id $apiId --stage-name prod --region $region
```

## Smoke tests

```powershell
# Register a device (what the ESP32 does on boot)
curl.exe -i -X POST -H "Content-Type: application/json" `
  -d "{\"device_id\":\"esp32-env-TEST01\",\"mac\":\"AA:BB:CC:DD:EE:FF\",\"ip\":\"192.168.1.99\",\"ssid\":\"TestWifi\",\"rssi\":-45,\"fw_version\":\"1.1.0-fleet\"}" `
  "https://srb2rp6ww8.execute-api.us-east-1.amazonaws.com/prod/devices"

# Fleet listing
curl.exe "https://srb2rp6ww8.execute-api.us-east-1.amazonaws.com/prod/devices"

# Write a reading for that device
curl.exe -i -X POST -H "Content-Type: application/json" `
  -d "{\"device_id\":\"esp32-env-TEST01\",\"temperature\":25.5,\"humidity\":60,\"air_quality\":120,\"fire\":0}" `
  "https://srb2rp6ww8.execute-api.us-east-1.amazonaws.com/prod/data"

# History for that device
curl.exe "https://srb2rp6ww8.execute-api.us-east-1.amazonaws.com/prod/data?device_id=esp32-env-TEST01&limit=10"
```
