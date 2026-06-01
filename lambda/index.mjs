/*
 * index.mjs - Environment Monitor backend
 *
 * Single Node.js Lambda behind one HTTP API. Handles every route the
 * ESP32 firmware writes to AND every route the React dashboard reads.
 *
 * ROUTES
 *
 *   POST  /devices/register      Device boot heartbeat (ESP32)
 *                                  body: { device_id, mac, ip, ssid,
 *                                          rssi, fw_version,
 *                                          place, landmark, district,
 *                                          state, country }
 *
 *   POST  /sensor-data           Single telemetry reading (ESP32)
 *                                  body: { device_id, temperature,
 *                                          humidity, air_quality, fire }
 *
 *   GET   /devices               Fleet list  (dashboard)
 *                                  -> { ok, total, active, offline,
 *                                       devices: [...] }
 *
 *   GET   /devices/{device_id}   Single device + recent readings
 *                                  ?limit=60
 *                                  -> { ok, device, latest,
 *                                       readings: [...] }
 *
 *   OPTIONS *                    CORS preflight
 *
 * TABLES
 *
 *   EnvDevices    PK device_id (S)
 *   EnvReadings   PK device_id (S), SK timestamp (N)
 *
 * "online" = last_seen within ACTIVE_WINDOW_MS (default 30 s).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const DEVICES_TABLE    = process.env.DEVICES_TABLE    || "EnvDevices";
const READINGS_TABLE   = process.env.READINGS_TABLE   || "EnvReadings";
const MAX_HISTORY      = parseInt(process.env.MAX_HISTORY      || "60",    10);
const TTL_DAYS         = parseInt(process.env.TTL_DAYS         || "30",    10);
const ACTIVE_WINDOW_MS = parseInt(process.env.ACTIVE_WINDOW_MS || "30000", 10);

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true },
});

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type":                 "application/json",
};

const reply = (statusCode, body) => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

const nowMs = () => Date.now();
const toNum = (v, def = 0) => {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* ------------------------------------------------------------------ */
/*  Routing helpers (HTTP API v2)                                      */
/* ------------------------------------------------------------------ */

function methodOf(event) {
  return (event.requestContext?.http?.method
       || event.httpMethod
       || "POST").toUpperCase();
}

function pathOf(event) {
  return event.rawPath
      || event.requestContext?.http?.path
      || event.path
      || "/";
}

function bodyOf(event) {
  if (event && event.body === undefined &&
      ("temperature" in event || "device_id" in event)) {
    return event;
  }
  let raw = event?.body;
  if (raw == null) return {};
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf-8");
  if (typeof raw === "string") {
    if (!raw.trim()) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw || {};
}

/* ------------------------------------------------------------------ */
/*  Device registry helpers                                            */
/* ------------------------------------------------------------------ */

async function touchDevice(deviceId, extras = {}) {
  const names  = { "#ls": "last_seen", "#fs": "first_seen" };
  const values = { ":ls": nowMs(), ":fs": nowMs() };
  const sets   = ["#ls = :ls", "#fs = if_not_exists(#fs, :fs)"];

  let i = 0;
  for (const [k, v] of Object.entries(extras)) {
    if (v === undefined || v === null) continue;
    const nk = `#k${i}`;
    const vk = `:v${i}`;
    names[nk]  = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    i++;
  }

  await ddb.send(new UpdateCommand({
    TableName: DEVICES_TABLE,
    Key: { device_id: deviceId },
    UpdateExpression: "SET " + sets.join(", "),
    ExpressionAttributeNames:  names,
    ExpressionAttributeValues: values,
  }));
}

/* ------------------------------------------------------------------ */
/*  POST /sensor-data                                                  */
/* ------------------------------------------------------------------ */

async function postSensorData(event) {
  const body = bodyOf(event);
  const deviceId = String(body.device_id || "").trim();
  if (!deviceId) return reply(400, { ok: false, error: "device_id required" });

  const ts = toNum(body.timestamp, nowMs());
  const item = {
    device_id:   deviceId,
    timestamp:   ts,
    temperature: toNum(body.temperature),
    humidity:    toNum(body.humidity),
    air_quality: toNum(body.air_quality),
    fire:        toNum(body.fire),
    ttl:         Math.floor(Date.now() / 1000) + TTL_DAYS * 86400,
  };

  await Promise.all([
    ddb.send(new PutCommand({ TableName: READINGS_TABLE, Item: item })),
    touchDevice(deviceId, {
      last_temperature: item.temperature,
      last_humidity:    item.humidity,
      last_air_quality: item.air_quality,
      last_fire:        item.fire,
    }),
  ]);

  return reply(200, { ok: true, device_id: deviceId, timestamp: ts });
}

/* ------------------------------------------------------------------ */
/*  POST /devices/register                                             */
/* ------------------------------------------------------------------ */

async function postDevicesRegister(event) {
  const body = bodyOf(event);
  const deviceId = String(body.device_id || "").trim();
  if (!deviceId) return reply(400, { ok: false, error: "device_id required" });

  // Location attributes can come either flat or under "location" object
  const loc       = body.location || {};
  const place     = body.place    ?? loc.place    ?? null;
  const landmark  = body.landmark ?? loc.landmark ?? null;
  const district  = body.district ?? loc.district ?? null;
  const state     = body.state    ?? loc.state    ?? null;
  const country   = body.country  ?? loc.country  ?? null;
  const latitude  = body.latitude  != null ? toNum(body.latitude,  NaN)
                  : loc.latitude   != null ? toNum(loc.latitude,   NaN) : NaN;
  const longitude = body.longitude != null ? toNum(body.longitude, NaN)
                  : loc.longitude  != null ? toNum(loc.longitude,  NaN) : NaN;

  await touchDevice(deviceId, {
    mac:        body.mac        || null,
    ip:         body.ip         || null,
    ssid:       body.ssid       || null,
    rssi:       body.rssi       != null ? toNum(body.rssi) : null,
    fw_version: body.fw_version || null,
    place, landmark, district, state, country,
    latitude:   Number.isFinite(latitude)  ? latitude  : null,
    longitude:  Number.isFinite(longitude) ? longitude : null,
  });

  return reply(200, { ok: true, device_id: deviceId, registered_at: nowMs() });
}

/* ------------------------------------------------------------------ */
/*  GET /devices                                                       */
/* ------------------------------------------------------------------ */

function shapeDevice(d) {
  return {
    device_id:        d.device_id,
    mac:              d.mac        || null,
    ip:               d.ip         || null,
    ssid:             d.ssid       || null,
    rssi:             d.rssi       ?? null,
    fw_version:       d.fw_version || null,
    firmware_version: d.fw_version || null,           // dashboard alias
    first_seen:       d.first_seen || null,
    last_seen:        d.last_seen  || null,
    last_temperature: d.last_temperature ?? null,
    last_humidity:    d.last_humidity    ?? null,
    last_air_quality: d.last_air_quality ?? null,
    last_fire:        d.last_fire        ?? 0,
    online:           (d.last_seen || 0) >= nowMs() - ACTIVE_WINDOW_MS,
    latitude:  d.latitude  ?? null,
    longitude: d.longitude ?? null,
    location: {
      place:     d.place     || null,
      landmark:  d.landmark  || null,
      district:  d.district  || null,
      state:     d.state     || null,
      country:   d.country   || null,
      latitude:  d.latitude  ?? null,
      longitude: d.longitude ?? null,
    },
  };
}

async function getDevices() {
  const items = [];
  let lastKey;
  do {
    const r = await ddb.send(new ScanCommand({
      TableName: DEVICES_TABLE,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);

  const devices = items.map(shapeDevice).sort((a, b) =>
    String(a.device_id || "").localeCompare(
      String(b.device_id || ""), undefined, { numeric: true })
  );

  const active  = devices.filter((d) => d.online).length;
  const offline = devices.length - active;
  const alerts  = devices.filter((d) => Number(d.last_fire) === 1).length;

  return reply(200, {
    ok: true,
    total: devices.length,
    active, offline, alerts,
    devices,
    fetched_at: nowMs(),
  });
}

/* ------------------------------------------------------------------ */
/*  GET /devices/{device_id}                                           */
/* ------------------------------------------------------------------ */

async function getDevice(event) {
  const deviceId = decodeURIComponent(
    event.pathParameters?.device_id ||
    pathOf(event).split("/").pop() || "");
  if (!deviceId) return reply(400, { ok: false, error: "device_id required" });

  const limit = Math.min(
    toNum(event.queryStringParameters?.limit, MAX_HISTORY) || MAX_HISTORY,
    500);

  /* Pull the device record and history in parallel */
  const [devRes, readRes] = await Promise.all([
    ddb.send(new ScanCommand({
      TableName: DEVICES_TABLE,
      FilterExpression: "device_id = :d",
      ExpressionAttributeValues: { ":d": deviceId },
      Limit: 1,
    })),
    ddb.send(new QueryCommand({
      TableName: READINGS_TABLE,
      KeyConditionExpression: "device_id = :d",
      ExpressionAttributeValues: { ":d": deviceId },
      ScanIndexForward: false,
      Limit: limit,
    })),
  ]);

  const deviceItem = (devRes.Items || [])[0];
  const readings   = readRes.Items || [];

  return reply(200, {
    ok:       true,
    device:   deviceItem ? shapeDevice(deviceItem) : null,
    latest:   readings[0] || null,
    readings,                // dashboard expects array
    history:  readings,      // alias used by some pages
    count:    readings.length,
  });
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

export const handler = async (event) => {
  const method = methodOf(event);
  const path   = pathOf(event);
  console.log("Route:", method, path);

  try {
    if (method === "OPTIONS")              return reply(200, { ok: true });

    if (method === "POST" && path.endsWith("/sensor-data"))
                                            return await postSensorData(event);
    if (method === "POST" && path.endsWith("/devices/register"))
                                            return await postDevicesRegister(event);

    if (method === "GET"  && path.endsWith("/devices"))
                                            return await getDevices();
    if (method === "GET"  && /\/devices\/[^/]+$/.test(path))
                                            return await getDevice(event);

    return reply(404, { ok: false, error: `route ${method} ${path} not found` });
  } catch (err) {
    console.error(err);
    return reply(500, { ok: false, error: err.message || String(err) });
  }
};
