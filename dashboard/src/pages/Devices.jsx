import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDevices } from "../api.js";
import { ACTIVE_WINDOW_MS, ago, deviceLabel, isOnline, locationText }
  from "../deviceUtils.js";

const REFRESH_MS = 2000;

/* Natural / serial sort:  env_0001 < env_0002 < env_0010 < env_0100 */
const cmpIds = (a, b) =>
  String(a.device_id || "").localeCompare(
    String(b.device_id || ""), undefined, { numeric: true, sensitivity: "base" });

export default function Devices() {
  const [fleet,  setFleet]  = useState({ devices: [] });
  const [error,  setError]  = useState("");
  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState("all");
  /* tick forces a re-render once a second so isOnline() flips when
     last_seen ages out, without waiting for the next fetch.       */
  const [, setTick] = useState(0);

  async function load() {
    try { setFleet(await fetchDevices()); setError(""); }
    catch (e) { setError(e.message || String(e)); }
  }
  useEffect(() => {
    load();
    const poll = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const rows = useMemo(() => {
    const all = (fleet.devices || []).map(d => ({ ...d, online: isOnline(d) }));
    return all
      .filter(d => filter === "online"  ? d.online
                : filter === "offline" ? !d.online : true)
      .filter(d => {
        if (!query) return true;
        const hay = `${d.device_id} ${d.mac} ${d.ssid} ${locationText(d)}`.toLowerCase();
        return hay.includes(query.toLowerCase());
      })
      .sort(cmpIds);
  }, [fleet, query, filter]);

  const allDevices  = (fleet.devices || []).map(d => ({ ...d, online: isOnline(d) }));
  const onlineCount  = allDevices.filter(d => d.online).length;
  const offlineCount = allDevices.length - onlineCount;

  return (
    <section className="page page-devices">
      <header className="page-header">
        <div>
          <h1>Devices</h1>
          <p className="page-sub">
            {allDevices.length} total
            &nbsp;·&nbsp; <span style={{ color: "#22c55e" }}>{onlineCount} online</span>
            &nbsp;·&nbsp; <span style={{ color: "#ef4444" }}>{offlineCount} offline</span>
            &nbsp;·&nbsp; sorted by device ID · refresh every {REFRESH_MS / 1000}s
          </p>
        </div>
        <div className="page-actions">
          <input
            className="search"
            placeholder="Search ID, place, district, MAC…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="seg">
            {["all", "online", "offline"].map(k => (
              <button key={k}
                      className={filter === k ? "seg-on" : ""}
                      onClick={() => setFilter(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="banner banner-err">● {error}</div>}

      <div className="card table-card">
        <table className="device-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Device</th>
              <th>Status</th>
              <th>Location</th>
              <th>IP</th>
              <th>Wi-Fi</th>
              <th>Temp</th>
              <th>Hum</th>
              <th>AQ</th>
              <th>Last seen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="11" className="empty">No devices match the filter.</td></tr>
            )}
            {rows.map((d, i) => (
              <tr key={d.device_id} className={d.online ? "" : "dim"}>
                <td className="muted">{i + 1}</td>
                <td className="mono">
                  <Link to={`/devices/${encodeURIComponent(d.device_id)}`}>
                    {deviceLabel(d)}
                  </Link>
                </td>
                <td>
                  <span className={`dot ${d.online ? "dot-on" : "dot-off"}`} />
                  {d.online ? "Online" : "Offline"}
                </td>
                <td>{locationText(d) || "—"}</td>
                <td className="mono">{d.ip || "—"}</td>
                <td>{d.ssid || "—"}</td>
                <td>{d.last_temperature != null ? `${Number(d.last_temperature).toFixed(1)} °C` : "—"}</td>
                <td>{d.last_humidity    != null ? `${Number(d.last_humidity).toFixed(0)} %`    : "—"}</td>
                <td>{d.last_air_quality ?? "—"}</td>
                <td className="muted">{ago(d.last_seen)}</td>
                <td>
                  <Link to={`/devices/${encodeURIComponent(d.device_id)}`}
                        className="row-cta">View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
