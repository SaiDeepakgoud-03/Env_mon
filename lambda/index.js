import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { IoTClient, CreateJobCommand } from "@aws-sdk/client-iot";
import { IoTDataPlaneClient, GetThingShadowCommand } from "@aws-sdk/client-iot-data-plane";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true }
});
const iot = new IoTClient({});
const iotData = new IoTDataPlaneClient({});

const TABLES = {
  devices: process.env.DEVICES_TABLE || "environment-monitor-dev-devices",
  locations: process.env.LOCATIONS_TABLE || "environment-monitor-dev-locations",
  status: process.env.STATUS_TABLE || "environment-monitor-dev-status",
  readings: process.env.READINGS_TABLE || "environment-monitor-dev-readings",
  ota: process.env.OTA_TABLE || "environment-monitor-dev-ota-logs"
};

const FIRMWARE_BUCKET = process.env.FIRMWARE_BUCKET || "";
const ACTIVE_WINDOW_MS = Number(process.env.ACTIVE_WINDOW_MS || 120000);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim());
const ALERT_LIMITS = {
  temperature_high: 40,
  humidity_low: 25,
  humidity_high: 80,
  air_quality_high: 100
};

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowedOrigin = CORS_ORIGINS.includes("*") || CORS_ORIGINS.includes(origin)
    ? origin || "*"
    : CORS_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Content-Type": "application/json"
  };
}

function response(event, statusCode, body) {
  return { statusCode, headers: corsHeaders(event), body: JSON.stringify(body) };
}

function bodyOf(event) {
  if (event.body == null && typeof event === "object") return event;
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
}

function routeOf(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "POST";
  const rawPath = event.rawPath || event.requestContext?.http?.path || event.path || "/sensor-data";
  const stage = event.requestContext?.stage;
  const stagePrefix = stage && stage !== "$default" ? `/${stage}` : "";
  const path = stagePrefix && rawPath.startsWith(`${stagePrefix}/`)
    ? rawPath.slice(stagePrefix.length)
    : rawPath;
  return { method: method.toUpperCase(), path };
}

function nowMs() {
  return Date.now();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function locationFrom(body) {
  return {
    place: body.place || body.location?.place || "",
    landmark: body.landmark || body.location?.landmark || "",
    district: body.district || body.location?.district || "",
    state: body.state || body.location?.state || "",
    country: body.country || body.location?.country || "",
    latitude: body.latitude ?? body.location?.latitude,
    longitude: body.longitude ?? body.location?.longitude,
    lat: body.latitude ?? body.location?.latitude,
    lng: body.longitude ?? body.location?.longitude
  };
}

async function upsertDevice(body) {
  const deviceId = String(body.device_id || body.DeviceId || "").trim();
  if (!deviceId) throw Object.assign(new Error("device_id required"), { statusCode: 400 });

  const ts = nowMs();
  const location = locationFrom(body);
  const devicePatch = {
    mac: body.mac,
    ip: body.ip,
    ssid: body.ssid,
    rssi: body.rssi == null ? undefined : number(body.rssi),
    firmware_version: body.firmware_version || body.fw_version,
    cert_status: body.cert_status || "ACTIVE",
    thing_name: body.thing_name || deviceId,
    last_seen: ts,
    updated_at: ts
  };

  const names = { "#fs": "first_seen" };
  const values = { ":fs": ts };
  const sets = ["#fs = if_not_exists(#fs, :fs)"];
  Object.entries(devicePatch).forEach(([key, value], index) => {
    if (value === undefined || value === null || value === "") return;
    names[`#k${index}`] = key;
    values[`:v${index}`] = value;
    sets.push(`#k${index} = :v${index}`);
  });

  await Promise.all([
    ddb.send(new UpdateCommand({
      TableName: TABLES.devices,
      Key: { device_id: deviceId },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })),
    ddb.send(new PutCommand({
      TableName: TABLES.locations,
      Item: { device_id: deviceId, ...location, updated_at: ts }
    })),
    ddb.send(new PutCommand({
      TableName: TABLES.status,
      Item: {
        device_id: deviceId,
        online: true,
        last_seen: ts,
        status: body.status || "registered",
        updated_at: ts
      }
    }))
  ]);

  return { ok: true, device_id: deviceId, registered_at: ts };
}

async function saveReading(body) {
  const deviceId = String(body.device_id || "").trim();
  if (!deviceId) throw Object.assign(new Error("device_id required"), { statusCode: 400 });

  const ts = number(body.timestamp, nowMs());
  const item = {
    device_id: deviceId,
    timestamp: ts,
    temperature: number(body.temperature),
    humidity: number(body.humidity),
    air_quality: number(body.air_quality),
    fire: number(body.fire),
    battery: body.battery == null ? undefined : number(body.battery),
    status: body.status || (number(body.fire) ? "alert" : "ok"),
    ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90
  };

  await Promise.all([
    ddb.send(new PutCommand({ TableName: TABLES.readings, Item: item })),
    ddb.send(new UpdateCommand({
      TableName: TABLES.devices,
      Key: { device_id: deviceId },
      UpdateExpression: "SET last_seen = :now, last_temperature = :t, last_humidity = :h, last_air_quality = :aq, last_fire = :f, last_battery = :b",
      ExpressionAttributeValues: {
        ":now": ts,
        ":t": item.temperature,
        ":h": item.humidity,
        ":aq": item.air_quality,
        ":f": item.fire,
        ":b": item.battery ?? null
      }
    })),
    ddb.send(new PutCommand({
      TableName: TABLES.status,
      Item: {
        device_id: deviceId,
        online: true,
        last_seen: ts,
        status: item.status,
        updated_at: nowMs()
      }
    }))
  ]);

  return { ok: true, device_id: deviceId, timestamp: ts };
}

async function readingsFor(deviceId, limit = 80) {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLES.readings,
    KeyConditionExpression: "device_id = :deviceId",
    ExpressionAttributeValues: { ":deviceId": deviceId },
    ScanIndexForward: false,
    Limit: Math.min(number(limit, 80), 500)
  }));
  return result.Items || [];
}

async function listDevices() {
  const devices = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: TABLES.devices,
      ExclusiveStartKey
    }));
    devices.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const locations = await ddb.send(new ScanCommand({ TableName: TABLES.locations }));
  const locById = new Map((locations.Items || []).map((item) => [item.device_id, item]));
  const cutoff = nowMs() - ACTIVE_WINDOW_MS;

  const normalized = devices.map((device) => {
    const online = number(device.last_seen, 0) >= cutoff;
    return {
      ...device,
      online,
      certificate_status: device.cert_status || "UNKNOWN",
      display_name: device.display_name || device.device_id,
      location: locById.get(device.device_id) || null
    };
  }).sort((a, b) => Number(b.last_seen || 0) - Number(a.last_seen || 0));

  return {
    ok: true,
    total: normalized.length,
    active: normalized.filter((d) => d.online).length,
    offline: normalized.filter((d) => !d.online).length,
    alerts: normalized.filter((d) => deviceAlerts(d).length > 0).length,
    devices: normalized,
    fetched_at: nowMs()
  };
}

function deviceAlerts(device) {
  const rows = [];
  const temperature = number(device.last_temperature, NaN);
  const humidity = number(device.last_humidity, NaN);
  const airQuality = number(device.last_air_quality, NaN);

  if (Number(device.last_fire) === 1) rows.push({ type: "fire", severity: "critical", title: "Fire detected", value: 1 });
  if (Number.isFinite(temperature) && temperature >= ALERT_LIMITS.temperature_high) rows.push({ type: "temperature", severity: "warning", title: "High temperature", value: temperature });
  if (Number.isFinite(humidity) && humidity <= ALERT_LIMITS.humidity_low) rows.push({ type: "humidity", severity: "warning", title: "Low humidity", value: humidity });
  if (Number.isFinite(humidity) && humidity >= ALERT_LIMITS.humidity_high) rows.push({ type: "humidity", severity: "warning", title: "High humidity", value: humidity });
  if (Number.isFinite(airQuality) && airQuality >= ALERT_LIMITS.air_quality_high) rows.push({ type: "air_quality", severity: "warning", title: "Poor air quality", value: airQuality });
  if (!device.online) rows.push({ type: "offline", severity: "warning", title: "Device offline", value: 0 });

  return rows;
}

async function renameDevice(deviceId, body) {
  const displayName = String(body.display_name || body.name || "").trim();
  if (!displayName) throw Object.assign(new Error("display_name required"), { statusCode: 400 });

  await ddb.send(new UpdateCommand({
    TableName: TABLES.devices,
    Key: { device_id: deviceId },
    UpdateExpression: "SET display_name = :name, updated_at = :now",
    ExpressionAttributeValues: {
      ":name": displayName,
      ":now": nowMs()
    }
  }));
  return { ok: true, device_id: deviceId, display_name: displayName };
}

async function deleteDevice(deviceId) {
  await Promise.all([
    ddb.send(new DeleteCommand({ TableName: TABLES.devices, Key: { device_id: deviceId } })),
    ddb.send(new DeleteCommand({ TableName: TABLES.locations, Key: { device_id: deviceId } })),
    ddb.send(new DeleteCommand({ TableName: TABLES.status, Key: { device_id: deviceId } }))
  ]);
  return { ok: true, device_id: deviceId, deleted: true };
}

async function getDevice(deviceId) {
  const [device, location, status, history, ota] = await Promise.all([
    ddb.send(new GetCommand({ TableName: TABLES.devices, Key: { device_id: deviceId } })),
    ddb.send(new GetCommand({ TableName: TABLES.locations, Key: { device_id: deviceId } })),
    ddb.send(new GetCommand({ TableName: TABLES.status, Key: { device_id: deviceId } })),
    readingsFor(deviceId, 120),
    ddb.send(new QueryCommand({
      TableName: TABLES.ota,
      KeyConditionExpression: "device_id = :deviceId",
      ExpressionAttributeValues: { ":deviceId": deviceId },
      ScanIndexForward: false,
      Limit: 20
    }))
  ]);

  if (!device.Item) throw Object.assign(new Error("device not found"), { statusCode: 404 });

  return {
    ok: true,
    device: {
      ...device.Item,
      online: number(device.Item.last_seen, 0) >= nowMs() - ACTIVE_WINDOW_MS,
      location: location.Item || null,
      status: status.Item || null
    },
    latest: history[0] || null,
    readings: history,
    ota: ota.Items || []
  };
}

async function analytics() {
  const fleet = await listDevices();
  const readings = await ddb.send(new ScanCommand({ TableName: TABLES.readings, Limit: 500 }));
  const rows = readings.Items || [];
  const avg = (key) => rows.length
    ? rows.reduce((sum, row) => sum + number(row[key]), 0) / rows.length
    : 0;

  return {
    ok: true,
    total: fleet.total,
    active: fleet.active,
    offline: fleet.offline,
    alerts: fleet.alerts,
    averages: {
      temperature: Number(avg("temperature").toFixed(2)),
      humidity: Number(avg("humidity").toFixed(2)),
      air_quality: Number(avg("air_quality").toFixed(2))
    }
  };
}

async function appDashboard() {
  const fleet = await listDevices();
  const devices = fleet.devices || [];
  const avg = (key) => {
    const values = devices
      .map((device) => number(device[key], NaN))
      .filter((value) => Number.isFinite(value) && value > 0);
    return values.length
      ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
      : 0;
  };
  const latest = devices[0] || null;
  const recent_alerts = devices
    .flatMap((device) => deviceAlerts(device).map((alert) => ({
      ...alert,
      device_id: device.device_id,
      display_name: device.display_name || device.device_id,
      location: device.location || null,
      last_seen: device.last_seen || null
    })))
    .sort((a, b) => Number(b.last_seen || 0) - Number(a.last_seen || 0))
    .slice(0, 20);

  return {
    ok: true,
    fetched_at: nowMs(),
    refresh_ms: 5000,
    summary: {
      total: fleet.total,
      online: fleet.active,
      offline: fleet.offline,
      alerts: fleet.alerts,
      averages: {
        temperature: avg("last_temperature"),
        humidity: avg("last_humidity"),
        air_quality: avg("last_air_quality")
      }
    },
    latest,
    devices,
    recent_alerts
  };
}

async function createOta(body) {
  const deviceId = String(body.device_id || "").trim();
  const version = String(body.version || "").trim();
  const firmwareKey = String(body.firmware_key || "").trim();
  if (!deviceId || !version || !firmwareKey) {
    throw Object.assign(new Error("device_id, version and firmware_key required"), { statusCode: 400 });
  }

  const jobId = `ota-${deviceId}-${version}-${randomUUID().slice(0, 8)}`.replace(/[^A-Za-z0-9_-]/g, "-");
  const document = {
    operation: "ota",
    firmware: {
      bucket: FIRMWARE_BUCKET,
      key: firmwareKey,
      version,
      url: body.firmware_url || `s3://${FIRMWARE_BUCKET}/${firmwareKey}`
    }
  };

  await iot.send(new CreateJobCommand({
    jobId,
    targets: [`arn:aws:iot:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID || "*"}:thing/${deviceId}`],
    document: JSON.stringify(document),
    description: `OTA ${version} for ${deviceId}`
  }));

  const item = {
    device_id: deviceId,
    version,
    job_id: jobId,
    firmware_key: firmwareKey,
    status: "QUEUED",
    created_at: nowMs()
  };
  await ddb.send(new PutCommand({ TableName: TABLES.ota, Item: item }));
  return { ok: true, ...item };
}

async function otaHistory(deviceId) {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLES.ota,
    KeyConditionExpression: "device_id = :deviceId",
    ExpressionAttributeValues: { ":deviceId": deviceId },
    ScanIndexForward: false,
    Limit: 50
  }));
  return { ok: true, ota: result.Items || [] };
}

async function shadowFor(deviceId) {
  const result = await iotData.send(new GetThingShadowCommand({ thingName: deviceId }));
  const payload = Buffer.from(result.payload).toString("utf8");
  return { ok: true, shadow: JSON.parse(payload) };
}

export async function handler(event) {
  const { method, path } = routeOf(event);
  console.log(JSON.stringify({ method, path, source: event.source || "http" }));

  try {
    if (method === "OPTIONS") return response(event, 200, { ok: true });

    if (event.source === "aws.iot" || path === "/sensor-data" && method === "POST") {
      return response(event, 200, await saveReading(bodyOf(event)));
    }

    if (method === "POST" && path === "/devices/register") {
      return response(event, 200, await upsertDevice(bodyOf(event)));
    }
    if (method === "GET" && path === "/devices") {
      return response(event, 200, await listDevices());
    }
    if (method === "GET" && path.startsWith("/devices/")) {
      return response(event, 200, await getDevice(decodeURIComponent(path.split("/")[2])));
    }
    if (method === "PATCH" && path.startsWith("/devices/")) {
      return response(event, 200, await renameDevice(decodeURIComponent(path.split("/")[2]), bodyOf(event)));
    }
    if (method === "DELETE" && path.startsWith("/devices/")) {
      return response(event, 200, await deleteDevice(decodeURIComponent(path.split("/")[2])));
    }
    if (method === "GET" && path === "/analytics") {
      return response(event, 200, await analytics());
    }
    if (method === "GET" && path === "/app/dashboard") {
      return response(event, 200, await appDashboard());
    }
    if (method === "POST" && path === "/ota") {
      return response(event, 200, await createOta(bodyOf(event)));
    }
    if (method === "GET" && path === "/ota") {
      return response(event, 200, await otaHistory(event.queryStringParameters?.device_id || ""));
    }
    if (method === "GET" && path.startsWith("/shadow/")) {
      return response(event, 200, await shadowFor(decodeURIComponent(path.split("/")[2])));
    }

    return response(event, 404, { ok: false, error: `No route for ${method} ${path}` });
  } catch (error) {
    console.error(error);
    return response(event, error.statusCode || 500, { ok: false, error: error.message || String(error) });
  }
}
