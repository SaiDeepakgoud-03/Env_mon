import { useEffect, useRef, useState } from "react";
import { fetchDevices } from "../api.js";
import { connectTelemetry } from "../mqttClient.js";

const MAX_LOG = 200;

export default function Live() {
  const [status, setStatus] = useState("starting");
  const [lines,  setLines]  = useState([]);
  const [devices, setDevices] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    const handle = connectTelemetry((topic, payload) => {
      const t = new Date().toLocaleTimeString();
      const id = payload.device_id || topic.split("/")[1] || "?";
      const line = {
        t, id,
        temp: payload.temperature, hum: payload.humidity,
        aq: payload.air_quality, fire: payload.fire,
      };
      setLines(prev => [line, ...prev].slice(0, MAX_LOG));
    }, setStatus);
    return () => handle.end?.(true);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await fetchDevices();
        if (alive) setDevices(data.devices || []);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <section className="page page-live">
      <header className="page-header">
        <div>
          <h1>Live Monitor</h1>
          <p className="page-sub">Real-time MQTT telemetry stream from every device.</p>
        </div>
        <div className="page-actions">
          <span className={`status-chip status-${status}`}>● {status}</span>
        </div>
      </header>

      <div className="card live-device-card">
        <div className="live-device-head">
          <h2>Live Sensor Values</h2>
          <span>{devices.length} devices</span>
        </div>
        <div className="table-wrap">
          <table className="device-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Temperature</th>
                <th>Humidity</th>
                <th>Air Quality</th>
                <th>Fire</th>
                <th>Location</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr><td colSpan="8" className="empty">Waiting for cloud sensor data...</td></tr>
              ) : devices.map((device) => (
                <tr key={device.device_id} className={Number(device.last_fire) === 1 ? "live-fire-row" : ""}>
                  <td>
                    <strong>{device.display_name || device.device_id}</strong>
                    <small>{device.display_name ? device.device_id : ""}</small>
                  </td>
                  <td><span className={device.online ? "status-pill online" : "status-pill offline"}>{device.online ? "Online" : "Offline"}</span></td>
                  <td>{formatNumber(device.last_temperature, 1)} C</td>
                  <td>{formatNumber(device.last_humidity, 0)}%</td>
                  <td>{formatNumber(device.last_air_quality, 0)}</td>
                  <td>{Number(device.last_fire) === 1 ? "Fire detected" : "Clear"}</td>
                  <td>{formatLocation(device.location)}</td>
                  <td>{device.last_seen ? new Date(Number(device.last_seen)).toLocaleTimeString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card stream-card" ref={ref}>
        {lines.length === 0 && <p className="empty">Waiting for the first message…</p>}
        {lines.map((l, i) => (
          <div className={`stream-row ${l.fire ? "stream-fire" : ""}`} key={i}>
            <span className="muted">{l.t}</span>
            <span className="mono">{l.id}</span>
            <span>T <b>{Number(l.temp ?? 0).toFixed(1)}°C</b></span>
            <span>H <b>{Number(l.hum  ?? 0).toFixed(0)}%</b></span>
            <span>AQ <b>{l.aq ?? "—"}</b></span>
            <span>{Number(l.fire) === 1 ? "🔥 FIRE" : "ok"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatNumber(value, digits) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "-";
}

function formatLocation(location) {
  if (!location) return "-";
  return [location.place, location.landmark, location.district, location.state]
    .filter(Boolean)
    .join(", ") || "-";
}
