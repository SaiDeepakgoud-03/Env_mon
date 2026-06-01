import { useEffect, useMemo, useState } from "react";
import MapplsDeviceMap from "../components/MapplsDeviceMap.jsx";
import { fetchDevices } from "../api.js";
import { setFireAlarmActive } from "../fireAlarm.js";
import { connectTelemetry } from "../mqttClient.js";
import { ACTIVE_WINDOW_MS as SHARED_ACTIVE_WINDOW_MS, isOnline as sharedIsOnline }
  from "../deviceUtils.js";

/* Centralised in deviceUtils so every page agrees. 60 s gives the
 * device enough rope to survive a slow TLS handshake or a missed POST
 * cycle without flapping offline -> online -> offline in the UI. */
const ACTIVE_WINDOW_MS = SHARED_ACTIVE_WINDOW_MS;

function ago(ms) {
  if (!ms) return "never";
  const seconds = Math.max(1, Math.round((Date.now() - Number(ms)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function average(devices, key) {
  const values = devices
    .map((device) => Number(device[key]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default function Fleet() {
  const [fleet, setFleet] = useState({ devices: [] });
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setFleet(await fetchDevices());
      setError("");
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 2000);
    const mqtt = connectTelemetry((topic, payload) => {
      const deviceId = payload.device_id || topic.split("/")[1];
      setFleet((current) => ({
        ...current,
        devices: (current.devices || []).map((device) => device.device_id === deviceId
          ? {
              ...device,
              online: true,
              last_seen: Date.now(),
              last_temperature: payload.temperature ?? device.last_temperature,
              last_humidity: payload.humidity ?? device.last_humidity,
              last_air_quality: payload.air_quality ?? device.last_air_quality,
              last_fire: payload.fire ?? device.last_fire,
              last_battery: payload.battery ?? device.last_battery
            }
          : device)
      }));
    });
    return () => {
      clearInterval(interval);
      mqtt.end?.(true);
    };
  }, []);

  const devices = useMemo(() => (fleet.devices || [])
    .filter((device) => {
      const text = `${device.device_id} ${device.mac} ${device.ssid} ${device.location?.place} ${device.location?.district}`.toLowerCase();
      return text.includes(query.toLowerCase());
    }), [fleet.devices, query]);
  const displayDevices = useMemo(() => devices.map((device) => ({
    ...device,
    online: Number(device.last_seen || 0) >= Date.now() - ACTIVE_WINDOW_MS
  })), [devices]);
  const visibleDevices = useMemo(() => displayDevices
    .filter((device) => filter === "all" || (filter === "online" ? device.online : !device.online)),
    [displayDevices, filter]);
  const onlineDevices = displayDevices.filter((device) => device.online);
  const offlineDevices = displayDevices.filter((device) => !device.online);
  const fireAlerts = displayDevices.filter((device) => Number(device.last_fire) === 1).length;
  const avgTemp = average(displayDevices, "last_temperature");
  const avgHumidity = average(displayDevices, "last_humidity");
  const avgAq = average(displayDevices, "last_air_quality");
  /* "stale" = silent for more than 2x the active window (here, 2 min). */
  const staleCount = displayDevices.filter((device) =>
    Date.now() - Number(device.last_seen || 0) > ACTIVE_WINDOW_MS * 2).length;

  useEffect(() => {
    setFireAlarmActive(fireAlerts > 0);
    return () => setFireAlarmActive(false);
  }, [fireAlerts]);

  return (
    <section className="dashboard-overview">
      <div className="page-head dashboard-topbar">
        <div>
          <span className="page-icon" aria-hidden="true"><DashIcon name="camera" /></span>
          <span className="eyebrow">Dashboard Overview</span>
          <h1>Environment Monitor</h1>
        </div>
        <div className="topbar-actions">
          <span className="connection"><b /> System Status: {offlineDevices.length ? "Attention Needed" : "All Systems Operational"}</span>
          <input placeholder="Search devices, locations..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="metric-row overview-metrics">
        <Metric label="Total Devices" value={displayDevices.length} accent="blue" icon="router" detail={`${displayDevices.length ? "+ " : ""}${displayDevices.length} registered`} />
        <Metric label="Online Devices" value={onlineDevices.length} accent="green" icon="wifi" detail={`${displayDevices.length ? Math.round((onlineDevices.length / displayDevices.length) * 100) : 0}% active`} />
        <Metric label="Alerts" value={fireAlerts + staleCount} accent="amber" icon="warning" detail={`${fireAlerts} fire, ${staleCount} stale`} />
        <Metric label="Avg Air Quality" value={Math.round(avgAq)} accent="purple" icon="wind" detail={avgAq < 100 ? "Good" : "Needs attention"} />
        <Metric label="Temperature" value={`${avgTemp.toFixed(1)} C`} accent="teal" icon="thermometer" detail="Average" />
        <Metric label="Humidity" value={`${avgHumidity.toFixed(1)}%`} accent="cyan" icon="drop" detail="Average" />
      </div>

      <div className="toolbar">
        {[
          ["all", "grid"],
          ["online", "wifi"],
          ["offline", "power"]
        ].map(([item, icon]) => (
          <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}><DashIcon name={icon} />{item}</button>
        ))}
      </div>

      <div className="overview-grid">
        <LivePanel devices={displayDevices} avgTemp={avgTemp} avgHumidity={avgHumidity} avgAq={avgAq} fireAlerts={fireAlerts} />
        <MapPanel devices={visibleDevices} />
        <AirQualityPanel value={avgAq} devices={displayDevices} />
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function Metric({ label, value, accent = "blue", icon = "grid", detail = "" }) {
  return (
    <div className={`metric metric-${accent}`}>
      <DashIcon name={icon} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function MapPanel({ devices }) {
  return (
    <aside className="map-panel console-panel">
      <div className="panel-head"><h2>Device Map View</h2><span className="live-dot">Live</span></div>
      <MapplsDeviceMap devices={devices} />
      <div className="map-legend">
        <span><DashIcon name="wifi" />Online ({devices.filter((d) => d.online).length})</span>
        <span><DashIcon name="warning" />Warning ({devices.filter((d) => Number(d.last_air_quality || 0) > 100).length})</span>
        <span><DashIcon name="power" />Offline ({devices.filter((d) => !d.online).length})</span>
      </div>
    </aside>
  );
}

function LivePanel({ devices, avgTemp, avgHumidity, avgAq, fireAlerts }) {
  return (
    <section className="console-panel live-panel">
      <div className="panel-head">
        <h2>Live Environmental Data</h2>
        <span className="live-dot">Live</span>
      </div>
      <div className="mini-metrics">
        <MiniMetric label="Temperature" value={`${avgTemp.toFixed(1)} C`} tone="red" icon="thermometer" />
        <MiniMetric label="Humidity" value={`${avgHumidity.toFixed(1)}%`} tone="blue" icon="drop" />
        <MiniMetric label="Air Quality" value={Math.round(Number(avgAq || 0))} tone="green" icon="wind" />
        <MiniMetric label="Fire Status" value={fireAlerts ? "Detected" : "All Clear"} tone="safe" icon="shield" />
      </div>
      <TrendChart />
    </section>
  );
}

function MiniMetric({ label, value, tone, icon }) {
  return <div className={`mini-metric ${tone}`}><DashIcon name={icon} /><span>{label}</span><strong>{value}</strong></div>;
}

function TrendChart() {
  return (
    <svg className="trend-chart" viewBox="0 0 680 190" role="img" aria-label="Live sensor trend">
      {[0, 1, 2, 3, 4].map((line) => <path key={line} d={`M30 ${30 + line * 34}H650`} />)}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((line) => <path key={`v${line}`} d={`M${40 + line * 86} 24V170`} />)}
      <polyline className="trend-red" points="35,112 90,104 145,89 200,98 255,77 310,83 365,70 420,83 475,78 530,92 585,88 640,106" />
      <polyline className="trend-blue" points="35,132 90,126 145,124 200,116 255,122 310,113 365,118 420,108 475,117 530,126 585,119 640,127" />
      <polyline className="trend-green" points="35,150 90,143 145,145 200,137 255,140 310,146 365,138 420,142 475,136 530,139 585,135 640,142" />
    </svg>
  );
}

function AirQualityPanel({ value, devices }) {
  const safe = devices.filter((d) => Number(d.last_air_quality || 0) <= 50).length;
  const moderate = devices.filter((d) => Number(d.last_air_quality || 0) > 50 && Number(d.last_air_quality || 0) <= 100).length;
  const warning = devices.filter((d) => Number(d.last_air_quality || 0) > 100).length;
  const rotation = Math.min(180, Math.max(0, Number(value || 0) / 250 * 180));
  return (
    <section className="console-panel gauge-panel">
      <div className="panel-head"><h2>Air Quality</h2><span>MQ135 Index</span></div>
      <div className="gauge" style={{ "--gauge-rotation": `${rotation}deg` }}>
        <strong>{Math.round(value)}</strong>
        <span>{value <= 100 ? "Good" : "Warning"}</span>
      </div>
      <div className="quality-list">
        <p><DashIcon name="shield" />Good<span>{safe} Devices</span></p>
        <p><DashIcon name="wind" />Moderate<span>{moderate} Devices</span></p>
        <p><DashIcon name="warning" />Unhealthy<span>{warning} Devices</span></p>
      </div>
    </section>
  );
}

function DashIcon({ name }) {
  const paths = {
    camera: "M7 7h2l1-2h4l1 2h2a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    router: "M5 14h14v5H5v-5Zm3 2h.01M16 16h.01M9 10a5 5 0 0 1 6 0M6 7a9 9 0 0 1 12 0",
    wifi: "M4 9a12 12 0 0 1 16 0M7 12a7 7 0 0 1 10 0M10 15a3 3 0 0 1 4 0M12 19h.01",
    warning: "M12 3 2.8 19h18.4L12 3Zm0 5v5m0 3h.01",
    wind: "M4 8h10a3 3 0 1 0-3-3M4 13h15a3 3 0 1 1-3 3M4 18h7",
    thermometer: "M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z",
    drop: "M12 3s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12Z",
    grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
    power: "M12 3v9m5.7-5.7a8 8 0 1 1-11.4 0",
    shield: "M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Zm-3 9 2 2 4-5",
    clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v5l3 2"
  };
  return (
    <svg className="dash-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
