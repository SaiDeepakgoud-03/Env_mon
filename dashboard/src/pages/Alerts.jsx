import { useEffect, useState } from "react";
import { fetchDevices } from "../api.js";

export default function Alerts() {
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    let alive = true;
    const tick = () => fetchDevices().then((data) => {
      if (alive) setDevices(data.devices || []);
    }).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const alerts = devices.flatMap((device) => deviceAlerts(device).map((alert) => ({ ...alert, device })));

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Operations</span>
          <h1>Alerts</h1>
        </div>
      </div>
      <div className="table-panel">
        <table>
          <thead><tr><th>Device</th><th>Alert</th><th>Location</th><th>Last seen</th></tr></thead>
          <tbody>
            {alerts.map(({ device, title, value, type }) => (
              <tr key={`${device.device_id}-${type}-${title}`}>
                <td>{device.display_name || device.device_id}<small>{device.display_name ? device.device_id : ""}</small></td>
                <td>{alertText(title, value, type, device)}</td>
                <td>{formatLocation(device.location)}</td>
                <td>{device.last_seen ? new Date(Number(device.last_seen)).toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!alerts.length && <p className="muted">No active alerts.</p>}
      </div>
    </section>
  );
}

function deviceAlerts(device) {
  const alerts = [];
  const temperature = Number(device.last_temperature);
  const humidity = Number(device.last_humidity);
  const airQuality = Number(device.last_air_quality);
  if (!device.online) alerts.push({ type: "offline", title: "Device offline" });
  if (Number(device.last_fire) === 1) alerts.push({ type: "fire", title: "Fire detected" });
  if (Number.isFinite(temperature) && temperature >= 40) alerts.push({ type: "temperature", title: "High temperature", value: temperature });
  if (Number.isFinite(humidity) && humidity <= 25) alerts.push({ type: "humidity", title: "Low humidity", value: humidity });
  if (Number.isFinite(humidity) && humidity >= 80) alerts.push({ type: "humidity", title: "High humidity", value: humidity });
  if (Number.isFinite(airQuality) && airQuality >= 100) alerts.push({ type: "air_quality", title: "Poor air quality", value: airQuality });
  return alerts;
}

function alertText(title, value, type, device) {
  if (type === "fire") return `Fire detected from ${formatLocation(device.location)}`;
  if (type === "temperature") return `${title} (${Number(value).toFixed(1)} C)`;
  if (type === "humidity") return `${title} (${Number(value).toFixed(0)}%)`;
  if (type === "air_quality") return `${title} (${Number(value).toFixed(0)} AQI)`;
  return title;
}

function formatLocation(location) {
  if (!location) return "-";
  return [
    location.place,
    location.landmark,
    location.district,
    location.state,
    location.country
  ].filter(Boolean).join(", ") || "-";
}
