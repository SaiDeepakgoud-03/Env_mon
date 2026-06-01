# Environment Monitor API

Base URL is the Terraform output `api_base_url`.

## Devices

- `GET /devices` returns fleet devices, location, status, certificate state and latest sensor summary.
- `GET /devices/{device_id}` returns one device with recent readings, OTA history and shadow state when available.
- `POST /devices/register` is called by the ESP32 after Wi-Fi comes up and after Fleet Provisioning succeeds.

Example registration body:

```json
{
  "device_id": "esp32-env-A1B2C3",
  "mac": "AA:BB:CC:DD:EE:FF",
  "ip": "192.168.1.44",
  "ssid": "FactoryWiFi",
  "firmware_version": "2.0.0",
  "cert_status": "ACTIVE",
  "location": {
    "place": "Boiler room",
    "landmark": "Gate B",
    "district": "Hyderabad",
    "state": "Telangana",
    "country": "India"
  }
}
```

## Telemetry

- MQTT topic: `env/{device_id}/telemetry`
- HTTP fallback: `POST /sensor-data`

Payload:

```json
{
  "device_id": "esp32-env-A1B2C3",
  "temperature": 27.4,
  "humidity": 61.2,
  "air_quality": 182,
  "fire": 0,
  "battery": 92,
  "status": "ok"
}
```

## OTA

- `POST /ota` creates a firmware update job.
- `GET /ota?device_id=esp32-env-A1B2C3` returns OTA history.
- Firmware is stored in the private S3 firmware bucket.
- Device listens on AWS IoT Jobs topics and reports progress to `env/{device_id}/status`.

## Analytics

- `GET /analytics` returns fleet counts, online/offline totals, alert count and recent averages.

## Shadows

- Device shadow update: `$aws/things/{thingName}/shadow/update`
- API view: `GET /shadow/{device_id}`
