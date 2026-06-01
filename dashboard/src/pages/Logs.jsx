import { useEffect, useRef, useState } from "react";
import { connectTelemetry } from "../mqttClient.js";
import { fetchDevices } from "../api.js";

const MAX_LOGS = 500;
const FILTERS  = ["all", "info", "warn", "error"];

function lineFromTelemetry(topic, payload) {
  const id = payload.device_id || topic.split("/")[1] || "?";
  if (Number(payload.fire) === 1)
    return { level: "error", source: id, msg: "Fire detected" };
  if (Number(payload.air_quality) > 300)
    return { level: "warn", source: id, msg: `Air quality high (${payload.air_quality})` };
  return { level: "info", source: id,
           msg: `T=${Number(payload.temperature).toFixed(1)}°C H=${Number(payload.humidity).toFixed(0)}% AQ=${payload.air_quality}` };
}

export default function Logs() {
  const [logs,   setLogs]   = useState([]);
  const [filter, setFilter] = useState("all");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  function push(line) {
    if (pausedRef.current) return;
    setLogs(prev => [{ ...line, t: new Date().toLocaleTimeString() },
                     ...prev].slice(0, MAX_LOGS));
  }

  useEffect(() => {
    // Seed with a "device coming online" line for each device
    fetchDevices().then(d => {
      (d.devices || []).forEach(dev => {
        push({ level: "info", source: dev.device_id,
               msg: "Registered in dashboard" });
      });
    }).catch(() => {});

    const handle = connectTelemetry((topic, payload) => {
      push(lineFromTelemetry(topic, payload));
    });
    return () => handle.end?.(true);
  }, []);

  const visible = logs.filter(l => filter === "all" || l.level === filter);

  return (
    <section className="page page-logs">
      <header className="page-header">
        <div>
          <h1>System Logs</h1>
          <p className="page-sub">Live event log derived from MQTT telemetry.</p>
        </div>
        <div className="page-actions">
          <div className="seg">
            {FILTERS.map(k => (
              <button key={k}
                      className={filter === k ? "seg-on" : ""}
                      onClick={() => setFilter(k)}>{k}</button>
            ))}
          </div>
          <button className="ghost-btn" onClick={() => setPaused(p => !p)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="ghost-btn" onClick={() => setLogs([])}>Clear</button>
        </div>
      </header>

      <div className="card stream-card">
        {visible.length === 0 && <p className="empty">No log lines yet.</p>}
        {visible.map((l, i) => (
          <div key={i} className={`log-row log-${l.level}`}>
            <span className="muted">{l.t}</span>
            <span className={`log-badge log-badge-${l.level}`}>{l.level}</span>
            <span className="mono">{l.source}</span>
            <span>{l.msg}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
