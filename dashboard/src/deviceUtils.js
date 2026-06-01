/*
 * deviceUtils.js
 *
 * Shared display + status helpers used by Fleet, Devices, Device and the
 * map. Keeping this in one file so we never disagree about what makes a
 * device "online" or how to print its name.
 */

/** How long a device may go silent before it counts as offline.
 *
 *  20 s gives a good UX:
 *    - Online appears INSTANTLY because Fleet.jsx's MQTT subscriber
 *      sets last_seen = Date.now() the moment any telemetry lands.
 *    - Offline appears within 20 s of an actual disconnect (after
 *      the device stops publishing), which matches what a user
 *      would expect from "unplug → it goes offline".
 *    - 20 s is still tolerant of 10 missed 2-second cycles, so
 *      ordinary network blips don't flap the indicator. */
export const ACTIVE_WINDOW_MS = 20_000;

/**
 * Compute online state from raw last_seen.  This deliberately ignores
 * any server-supplied `online` flag because that flag is stale the
 * moment the server returns it.  Always trust last_seen + the wall
 * clock on the dashboard.
 */
export function isOnline(device) {
  const t = Number(device?.last_seen || 0);
  return t > 0 && (Date.now() - t) < ACTIVE_WINDOW_MS;
}

/**
 * Friendly device label:  "<device_id>  —  <place>"
 * Falls back to just the device_id when no place is set yet.
 */
export function deviceLabel(device) {
  const id    = device?.device_id || "device";
  const place = device?.location?.place || device?.place || "";
  return place ? `${id}  —  ${place}` : id;
}

/**
 * Short location string suitable for cards / map popups.
 */
export function locationText(device) {
  const l = device?.location || device || {};
  return [l.place, l.landmark, l.district, l.state, l.country]
    .filter(Boolean).join(", ");
}

/** Human "12s ago" formatter. */
export function ago(ms) {
  if (!ms) return "never";
  const s = Math.max(1, Math.round((Date.now() - Number(ms)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/**
 * Pull latitude / longitude as numbers, accepting either flat or nested.
 * Returns null if neither is a finite number.
 */
export function geoOf(device) {
  const l = device?.location || {};
  const lat = Number(device?.latitude  ?? l.latitude);
  const lng = Number(device?.longitude ?? l.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}
