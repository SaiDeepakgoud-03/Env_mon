# Deployment

Use [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) for the current Terraform-based deployment.

Current production topics and APIs:

- MQTT telemetry: `env/{device_id}/telemetry`
- MQTT alerts: `env/{device_id}/alerts`
- Device shadow: `$aws/things/{device_id}/shadow/update`
- Registration API: `POST /devices/register`
- Telemetry fallback API: `POST /sensor-data`
- Dashboard API: `GET /devices`, `GET /devices/{device_id}`, `GET /analytics`
- OTA API: `POST /ota`
