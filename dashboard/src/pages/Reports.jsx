import { useEffect, useState } from "react";
import { fetchDevices, fetchReadings } from "../api.js";

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Reports() {
  const [devices, setDevices] = useState([]);
  const [busy,    setBusy]    = useState(null);

  useEffect(() => {
    fetchDevices().then(d => setDevices(d.devices || [])).catch(() => {});
  }, []);

  async function exportFleet() {
    setBusy("fleet");
    try {
      const header = "device_id,online,ip,ssid,place,district,state,country,last_temperature,last_humidity,last_air_quality,last_fire,first_seen,last_seen";
      const rows = devices.map(d => [
        d.device_id,
        d.last_seen && Date.now() - d.last_seen < 15000,
        d.ip, d.ssid,
        d.location?.place, d.location?.district, d.location?.state, d.location?.country,
        d.last_temperature, d.last_humidity, d.last_air_quality, d.last_fire,
        d.first_seen ? new Date(d.first_seen).toISOString() : "",
        d.last_seen  ? new Date(d.last_seen).toISOString()  : "",
      ].map(csvEscape).join(","));
      download(`fleet-${new Date().toISOString().slice(0,10)}.csv`,
               [header, ...rows].join("\n"));
    } finally { setBusy(null); }
  }

  async function exportReadings(deviceId) {
    setBusy(deviceId);
    try {
      const r = await fetchReadings(deviceId, 500);
      const header = "timestamp,iso_time,temperature,humidity,air_quality,fire";
      const rows = (r.history || []).map(h => [
        h.timestamp,
        new Date(Number(h.timestamp)).toISOString(),
        h.temperature, h.humidity, h.air_quality, h.fire,
      ].map(csvEscape).join(","));
      download(`${deviceId}-readings.csv`, [header, ...rows].join("\n"));
    } finally { setBusy(null); }
  }

  return (
    <section className="page page-reports">
      <header className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="page-sub">Download CSV snapshots of the fleet or per-device history.</p>
        </div>
      </header>

      <div className="report-grid">
        <div className="card report-card">
          <h3>Fleet snapshot</h3>
          <p>One row per registered device with the latest telemetry and location.</p>
          <button className="primary-btn"
                  disabled={busy === "fleet"}
                  onClick={exportFleet}>
            {busy === "fleet" ? "Building…" : "Download fleet CSV"}
          </button>
        </div>

        <div className="card report-card">
          <h3>Per-device history</h3>
          <p>Up to 500 most-recent readings for the device you pick.</p>
          <select className="search" id="rep-dev" defaultValue="">
            <option value="" disabled>Pick a device…</option>
            {devices.slice().sort((a,b) =>
              String(a.device_id).localeCompare(String(b.device_id), undefined, {numeric:true}))
              .map(d => (
                <option key={d.device_id} value={d.device_id}>{d.device_id}</option>
            ))}
          </select>
          <button className="primary-btn" style={{marginTop: 10}}
                  disabled={!!busy}
                  onClick={() => {
                    const id = document.getElementById("rep-dev").value;
                    if (id) exportReadings(id);
                  }}>
            {busy && busy !== "fleet" ? "Building…" : "Download device CSV"}
          </button>
        </div>
      </div>
    </section>
  );
}
