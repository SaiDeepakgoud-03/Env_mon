# Industrial Environment Monitoring System

End-to-end industrial IoT onboarding and management system for ESP32 environment-monitor devices. It includes captive-portal onboarding, AWS IoT Fleet Provisioning, MQTT/TLS telemetry, Lambda + DynamoDB APIs, OTA job orchestration and a localhost React dashboard.

## What Is Included

- ESP32 SoftAP + captive portal setup form
- NVS storage for Wi-Fi, device ID, location and certificate material
- AWS IoT Core Fleet Provisioning templates and policy
- Lambda API for device registry, telemetry, analytics, shadows and OTA jobs
- DynamoDB schemas for devices, locations, status, readings and OTA logs
- S3 firmware bucket
- Cognito user pool for dashboard authentication
- React + Vite dashboard with protected routes, live fleet table, map view, device details, alerts, analytics and OTA pages

## Quick Start

### Dashboard

```powershell
cd dashboard
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The dashboard uses local mock data unless `VITE_API_BASE` is configured.

### AWS Backend

```powershell
aws configure
aws iot describe-endpoint --endpoint-type iot:Data-ATS
cd backend/terraform
terraform init
terraform apply -var="aws_region=us-east-1" -var="iot_endpoint_address=<endpoint>"
```

### ESP32 Firmware

```powershell
idf.py set-target esp32
idf.py build
idf.py -p COM5 flash monitor
```

On first boot the ESP32 starts a hotspot named `EnvMon-Setup-XXXX`. Connect to it, fill the captive portal form, and the device stores Wi-Fi and location metadata in NVS.

## Important Production Step

Fleet Provisioning by claim requires a restricted manufacturing claim certificate. Replace `main/claim.pem.crt` and `main/claim.private.pem.key` with real claim credentials before flashing real devices.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [AWS deployment](docs/AWS_DEPLOYMENT.md)
- [Build and flash](docs/BUILD_AND_FLASH.md)
- [Debugging](docs/DEBUGGING.md)
