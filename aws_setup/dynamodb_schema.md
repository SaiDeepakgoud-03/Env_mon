# DynamoDB schema — fleet edition

Two tables now: one for *readings* (time-series, keyed by device + ts),
one for *devices* (single row per ESP32, updated on every heartbeat).

---

## Table 1 — `EnvironmentReadings`

Time-series of sensor readings. One row per cycle per device.

| Attribute    | Type   | Role             | Example                       |
| ------------ | ------ | ---------------- | ----------------------------- |
| `device_id`  | String | Partition key    | `esp32-env-A1B2C3`            |
| `timestamp`  | Number | Sort key (ms)    | `1748275200123`               |
| `temperature`| Number | Reading          | `27.30`                       |
| `humidity`   | Number | Reading          | `61.20`                       |
| `air_quality`| Number | 0-500            | `182`                         |
| `fire`       | Number | 0 / 1            | `0`                           |
| `ttl`        | Number | epoch s, 30 days | `1750950912`                  |

Access patterns:

- **"Latest N readings for one device"** — `Query` with
  `KeyConditionExpression: device_id = :d`, `ScanIndexForward: false`,
  `Limit: 60`. Single-digit-ms p50.
- **"Live tail across all devices"** — handled at the IoT-Core layer via
  the `environment/data` topic, not DynamoDB.

---

## Table 2 — `EnvironmentDevices`

Fleet registry. One row per device, last_seen-driven online/offline.

| Attribute          | Type   | Role                                    | Example               |
| ------------------ | ------ | --------------------------------------- | --------------------- |
| `device_id`        | String | Partition key                           | `esp32-env-A1B2C3`    |
| `mac`              | String | Hardware MAC address                    | `30:AE:A4:A1:B2:C3`   |
| `ip`               | String | Last reported LAN IP                    | `192.168.1.42`        |
| `ssid`             | String | Wi-Fi SSID the device is on             | `Kanna`               |
| `rssi`             | Number | Most recent signal strength (dBm)       | `-58`                 |
| `fw_version`       | String | Firmware version reported               | `1.1.0-fleet`         |
| `location`         | String | Optional human-readable location        | `Factory 1, Floor 3`  |
| `first_seen`       | Number | Epoch ms of first registration          | `1748100000000`       |
| `last_seen`        | Number | Epoch ms of last contact                | `1748275299123`       |
| `last_temperature` | Number | Cached for the fleet view               | `27.3`                |
| `last_humidity`    | Number | Cached for the fleet view               | `61.2`                |
| `last_air_quality` | Number | Cached for the fleet view               | `182`                 |
| `last_fire`        | Number | Cached for the fleet view               | `0`                   |

**Online definition**: `last_seen` within `ACTIVE_WINDOW_MS`
(default 30 000 ms). At 2 s sample rate that's 15 missed cycles
before a device flips to offline — generous enough for transient
Wi-Fi blips.

---

## One-time create (PowerShell)

```powershell
aws dynamodb create-table `
  --table-name EnvironmentReadings `
  --attribute-definitions AttributeName=device_id,AttributeType=S AttributeName=timestamp,AttributeType=N `
  --key-schema AttributeName=device_id,KeyType=HASH AttributeName=timestamp,KeyType=RANGE `
  --billing-mode PAY_PER_REQUEST `
  --region us-east-1

aws dynamodb update-time-to-live `
  --table-name EnvironmentReadings `
  --time-to-live-specification "Enabled=true, AttributeName=ttl" `
  --region us-east-1

aws dynamodb create-table `
  --table-name EnvironmentDevices `
  --attribute-definitions AttributeName=device_id,AttributeType=S `
  --key-schema AttributeName=device_id,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region us-east-1
```

## IAM policy for the Lambda role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:077463315120:table/EnvironmentReadings",
        "arn:aws:dynamodb:us-east-1:077463315120:table/EnvironmentDevices"
      ]
    }
  ]
}
```

## Scaling notes

- Pay-per-request handles up to 40 000 writes/s per table burst — well
  beyond 1 000 devices × every 2 s = 500 wps.
- For multi-region: enable **Global Tables** on both tables in your
  failover region.
- For >10 000 devices the fleet `Scan` becomes the bottleneck. Add a
  GSI on a fixed shard attribute (e.g. `"all" = "ALL"`) and `Query`
  that GSI instead of scanning.
