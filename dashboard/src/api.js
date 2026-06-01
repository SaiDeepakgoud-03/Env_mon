/*
 * api.js
 * ------
 * Thin client for the live API Gateway endpoint.
 *
 * The dashboard talks ONLY to the real backend - no mocks. The base
 * URL comes from VITE_API_BASE (.env.local).
 *
 * Endpoints used:
 *   GET    /devices                      list every registered device
 *   GET    /devices/{device_id}          one device + recent readings
 *   POST   /devices/register             (used by the ESP32, also valid
 *                                         from here if you want to test)
 *   POST   /sensor-data                  (used by the ESP32)
 *
 * Authentication: if a JWT lives in localStorage under "envmon_id_token"
 * we attach it as a Bearer header (for Cognito if you wire it later).
 */

import axios from "axios";

export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://tzh11a7qtc.execute-api.us-east-1.amazonaws.com/prod";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 12000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("envmon_id_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* -------- Devices -------- */

/** GET /devices -> { ok, total, active, offline, devices: [...] } */
export async function fetchDevices() {
  const res = await client.get("/devices");
  return res.data;
}

/** GET /devices/{id} -> { ok, device, latest, readings: [...] } */
export async function fetchDevice(deviceId) {
  const res = await client.get(`/devices/${encodeURIComponent(deviceId)}`);
  return res.data;
}

/** GET /app/dashboard -> one cloud payload for app/dashboard clients */
export async function fetchAppDashboard() {
  const res = await client.get("/app/dashboard");
  return res.data;
}

export async function deleteDevice(deviceId) {
  const res = await client.delete(`/devices/${encodeURIComponent(deviceId)}`);
  return res.data;
}

/** Convenience alias used by some pages. */
export async function fetchReadings(deviceId, limit = 60) {
  const res = await client.get(`/devices/${encodeURIComponent(deviceId)}`, {
    params: { limit },
  });
  return res.data;
}

/* -------- Analytics (computed client-side from fetchDevices) --------
 *
 * The dashboard used to call GET /analytics, but the same numbers can be
 * derived from the device list - one less route to maintain in AWS.    */
export async function fetchAnalytics() {
  const data = await fetchDevices();
  const devices = data.devices || [];
  const active   = devices.filter((d) => d.online).length;
  const offline  = devices.length - active;
  const alerts   = devices.filter((d) => Number(d.last_fire) === 1).length;
  const avg = (key) => {
    const xs = devices.map((d) => Number(d[key])).filter((n) => Number.isFinite(n) && n > 0);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  return {
    ok: true,
    total:   devices.length,
    active, offline, alerts,
    averages: {
      temperature: avg("last_temperature"),
      humidity:    avg("last_humidity"),
      air_quality: avg("last_air_quality"),
    },
  };
}

/* -------- Shadow stub --------
 *
 * Phase A no longer surfaces shadow state in the UI. Return an empty
 * object so existing imports keep compiling. Safe to delete callers. */
export async function fetchShadow(/* deviceId */) {
  return { ok: true, shadow: { state: { reported: {}, desired: {} } } };
}
