import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDevices } from "../api.js";
import { ago, deviceLabel, isOnline, locationText } from "../deviceUtils.js";

const REFRESH_MS = 2000;

const cmpIds = (a, b) =>
  String(a.device_id || "").localeCompare(
    String(b.device_id || ""), undefined, { numeric: true, sensitivity: "base" });

export default function Devices() {
  const [fleet, setFleet] = useState({ devices: [] });
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [, setTick] = useState(0);

  async function load() {
    try {
      setFleet(await fetchDevices());
      setError("");
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setTick((value) => value + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const rows = useMemo(() => {
    const all = (fleet.devices || []).map((device) => ({ ...device, online: isOnline(device) }));
    return all
      .filter((device) => filter === "online" ? device.online : filter === "offline" ? !device.online : true)
      .filter((device) => {
        if (!query) return true;
        const hay = `${device.device_id} ${device.mac} ${device.ssid} ${locationText(device)}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
      .sort(cmpIds);
  }, [fleet, query, filter]);

  const allDevices = (fleet.devices || []).map((device) => ({ ...device, online: isOnline(device) }));
  const onlineCount = allDevices.filter((device) => device.online).length;
  const offlineCount = allDevices.length - onlineCount;

  return (
    <section className="page page-devices">
      <header className="page-header">
        <div>
          <h1>Devices</h1>
          <p className="page-sub">
            {allDevices.length} total · <span className="text-good">{onlineCount} online</span> ·{" "}
            <span className="text-bad">{offlineCount} offline</span> · sorted by device ID · refresh every {REFRESH_MS / 1000}s
          </p>
        </div>
        <div className="page-actions">
          <input
            className="search"
            placeholder="Search ID, place, district, MAC..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="seg">
            {["all", "online", "offline"].map((key) => (
              <button
                key={key}
                className={filter === key ? "seg-on" : ""}
                onClick={() => setFilter(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="banner banner-err">Error: {error}</div>}

      <div className="card table-card">
        <table className="device-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Device</th>
              <th>Status</th>
              <th>Location</th>
              <th>Temp</th>
              <th>Hum</th>
              <th>AQ</th>
              <th>Last seen</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="9" className="empty">No devices match the filter.</td></tr>
            )}
            {rows.map((device, index) => (
              <tr key={device.device_id} className={device.online ? "" : "dim"}>
                <td className="muted">{index + 1}</td>
                <td className="mono">
                  <Link to={`/devices/${encodeURIComponent(device.device_id)}`}>
                    {deviceLabel(device)}
                  </Link>
                </td>
                <td>
                  <span className={`dot ${device.online ? "dot-on" : "dot-off"}`} />
                  {device.online ? "Online" : "Offline"}
                </td>
                <td>{locationText(device) || "-"}</td>
                <td>{device.last_temperature != null ? `${Number(device.last_temperature).toFixed(1)} C` : "-"}</td>
                <td>{device.last_humidity != null ? `${Number(device.last_humidity).toFixed(0)} %` : "-"}</td>
                <td>{device.last_air_quality ?? "-"}</td>
                <td className="muted">{ago(device.last_seen)}</td>
                <td>
                  <Link to={`/devices/${encodeURIComponent(device.device_id)}`} className="row-cta">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
