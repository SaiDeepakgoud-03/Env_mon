# AWS Deployment Guide

## Prerequisites

Install AWS CLI, Terraform, Node.js and ESP-IDF. Then configure credentials:

```powershell
aws configure
aws sts get-caller-identity
```

Get your AWS IoT endpoint:

```powershell
aws iot describe-endpoint --endpoint-type iot:Data-ATS
```

## Deploy Backend

```powershell
cd backend/terraform
terraform init
terraform apply -var="aws_region=us-east-1" -var="iot_endpoint_address=<your-iot-endpoint>"
```

Terraform creates:

- DynamoDB tables for devices, locations, status, readings and OTA logs
- Private S3 bucket for firmware
- Lambda API backend
- API Gateway HTTP API
- IoT policy
- Fleet Provisioning template
- IoT Rule for `env/+/telemetry`
- IAM roles and permissions

## Fleet Provisioning Claim Certificate

Fleet Provisioning by claim still needs one manufacturing claim certificate that is flashed into devices or injected at manufacturing time. This is not a device identity certificate. It can only call provisioning APIs.

Create it once:

```powershell
aws iot create-keys-and-certificate --set-as-active --certificate-pem-outfile claim.pem.crt --public-key-outfile claim.public.key --private-key-outfile claim.private.key
```

Attach a claim policy that permits:

- `iot:Connect`
- `iot:Publish` and `iot:Receive` on `$aws/certificates/create/*`
- `iot:Publish` and `iot:Receive` on `$aws/provisioning-templates/<template-name>/provision/*`

Flash `claim.pem.crt`, `claim.private.key`, and `AmazonRootCA1.pem` into the firmware image. The ESP32 receives its permanent certificate from Fleet Provisioning and stores it in NVS.

## Dashboard Environment

Create `dashboard/.env.local`:

```env
VITE_API_BASE=https://xxxxx.execute-api.us-east-1.amazonaws.com/prod
VITE_AWS_REGION=us-east-1
VITE_IOT_ENDPOINT=wss://xxxxx-ats.iot.us-east-1.amazonaws.com/mqtt
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxx
```

Then run:

```powershell
cd dashboard
npm install
npm run dev
```

## Firmware

```powershell
idf.py set-target esp32
idf.py build
idf.py -p COM5 flash monitor
```

Hold BOOT for more than five seconds during reset to erase Wi-Fi and device metadata.
