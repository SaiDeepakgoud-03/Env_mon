import { useEffect, useState } from "react";
import { deleteDevice, fetchDevices } from "../api";

const STORAGE_KEY = "envmon.settings.v1";

const defaults = {
  refreshSec:      2,
  activeWindowSec: 15,
  fireSound:       true,
  fireFlash:       true,
  units:           "metric",
  density:         "comfortable",
};

function load() {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
  catch { return { ...defaults }; }
}

export default function Settings() {
  const [cfg,  setCfg]  = useState(load());
  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deviceMsg, setDeviceMsg] = useState("");

  useEffect(() => { setSaved(false); }, [cfg]);
  useEffect(() => { loadDevices(); }, []);

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const data = await fetchDevices();
      setDevices(data.devices || []);
    } catch {
      setDeviceMsg("Could not load devices.");
    } finally {
      setLoadingDevices(false);
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setCfg({ ...defaults });
  }
  async function removeDevice(device) {
    const id = device.device_id;
    if (!id || !confirm(`Delete device ${device.display_name || id}?`)) return;
    setDeviceMsg(`Deleting ${id}...`);
    try {
      await deleteDevice(id);
      setDevices((items) => items.filter((item) => item.device_id !== id));
      setDeviceMsg(`Deleted ${id}.`);
    } catch {
      setDeviceMsg(`Delete failed for ${id}.`);
    }
  }

  return (
    <section className="page page-settings">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Local preferences stored in this browser.</p>
        </div>
      </header>

      <div className="card form-card">
        <Row label="Refresh interval">
          <input type="number" min="1" max="60"
                 value={cfg.refreshSec}
                 onChange={e => setCfg({ ...cfg, refreshSec: +e.target.value })} />
          <span className="hint">seconds</span>
        </Row>

        <Row label="Active window">
          <input type="number" min="5" max="600"
                 value={cfg.activeWindowSec}
                 onChange={e => setCfg({ ...cfg, activeWindowSec: +e.target.value })} />
          <span className="hint">device is "offline" if quiet for this many seconds</span>
        </Row>

        <Row label="Fire alarm sound">
          <Toggle on={cfg.fireSound}
                  onChange={v => setCfg({ ...cfg, fireSound: v })} />
        </Row>

        <Row label="Fire alarm flash">
          <Toggle on={cfg.fireFlash}
                  onChange={v => setCfg({ ...cfg, fireFlash: v })} />
        </Row>

        <Row label="Units">
          <select value={cfg.units}
                  onChange={e => setCfg({ ...cfg, units: e.target.value })}>
            <option value="metric">Metric (°C, m)</option>
            <option value="imperial">Imperial (°F, ft)</option>
          </select>
        </Row>

        <Row label="Density">
          <select value={cfg.density}
                  onChange={e => setCfg({ ...cfg, density: e.target.value })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </Row>

        <div className="form-actions">
          <button className="primary-btn" onClick={save}>
            {saved ? "Saved ✓" : "Save settings"}
          </button>
          <button className="ghost-btn" onClick={reset}>Reset to defaults</button>
        </div>
      </div>

      <div className="card form-card">
        <div className="settings-section-head">
          <div>
            <h2>Device Cleanup</h2>
            <p className="page-sub">Remove devices from the dashboard database.</p>
          </div>
          <button className="ghost-btn" onClick={loadDevices}>Refresh</button>
        </div>

        {deviceMsg && <p className="hint">{deviceMsg}</p>}
        <div className="table-wrap">
          <table className="device-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Location</th>
                <th>Last seen</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {loadingDevices ? (
                <tr><td colSpan="5" className="empty">Loading devices...</td></tr>
              ) : devices.length === 0 ? (
                <tr><td colSpan="5" className="empty">No devices found.</td></tr>
              ) : devices.map((device) => (
                <tr key={device.device_id}>
                  <td>
                    <strong>{device.display_name || device.device_id}</strong>
                    <small>{device.display_name ? device.device_id : ""}</small>
                  </td>
                  <td><span className={device.online ? "status-pill online" : "status-pill offline"}>{device.online ? "Online" : "Offline"}</span></td>
                  <td>{[device.location?.place, device.location?.district, device.location?.state].filter(Boolean).join(", ") || "-"}</td>
                  <td>{device.last_seen ? new Date(Number(device.last_seen)).toLocaleString() : "-"}</td>
                  <td>
                    <button className="danger-btn" onClick={() => removeDevice(device)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="form-row">
      <label>{label}</label>
      <div className="form-control">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button type="button"
            onClick={() => onChange(!on)}
            className={`toggle ${on ? "toggle-on" : ""}`}>
      <span />
    </button>
  );
}
