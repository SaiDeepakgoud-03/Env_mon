import { useEffect, useState } from "react";

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

  useEffect(() => { setSaved(false); }, [cfg]);

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setCfg({ ...defaults });
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
