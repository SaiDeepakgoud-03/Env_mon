# Industrial IoT Architecture

## Folder Structure

```text
environment_monitor/
  backend/
    iot/
    terraform/
  dashboard/
    src/pages/
  lambda/
  main/
  docs/
```

## Provisioning Flow

1. ESP32 boots and initializes NVS.
2. If Wi-Fi config is missing, it starts SoftAP + captive portal.
3. User enters Device ID, Wi-Fi SSID/password and location metadata.
4. Device stores config in NVS and reboots.
5. Device connects to Wi-Fi.
6. If no permanent certificate exists, it uses the claim certificate to start Fleet Provisioning.
7. AWS IoT creates the Thing, activates the permanent certificate and attaches the IoT policy.
8. Device stores the permanent certificate and key in NVS.
9. Device registers metadata through API Gateway/Lambda.
10. Device publishes telemetry and shadow updates over MQTT/TLS.

## MQTT Topics

```text
env/{device_id}/telemetry
env/{device_id}/status
env/{device_id}/alerts
env/{device_id}/ota
$aws/things/{device_id}/shadow/update
$aws/things/{device_id}/shadow/update/delta
$aws/things/{device_id}/jobs/notify-next
$aws/things/{device_id}/jobs/start-next/accepted
```

## DynamoDB Schemas

Devices: PK `device_id`; metadata, certificate status, firmware, network and last-seen fields.

Locations: PK `device_id`; place, landmark, district, state and country.

Status: PK `device_id`; online state, status and timestamps.

Readings: PK `device_id`, SK `timestamp`; sensor readings, battery, status and TTL.

OTA Logs: PK `device_id`, SK `version`; job id, firmware key, status and timestamps.

## Security Best Practices

- Use Fleet Provisioning by claim; never pre-create per-device certificates manually.
- Keep the claim certificate policy limited to provisioning topics only.
- Store permanent device identity in encrypted NVS for production boards.
- Scope IoT policy permissions to `${iot:Connection.Thing.ThingName}`.
- Require Cognito authentication for dashboard users.
- Keep firmware S3 bucket private and use signed URLs or IoT Jobs documents.
- Enable DynamoDB point-in-time recovery for registry and telemetry tables.
- Rotate claim certificates and revoke manufacturing claim certificates after each batch.

## Production Note

`main/claim.pem.crt` and `main/claim.private.pem.key` are placeholders. Replace them with a restricted manufacturing claim certificate before flashing real devices.
