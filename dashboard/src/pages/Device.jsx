import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchDevice, fetchShadow } from "../api.js";
import { setFireAlarmActive } from "../fireAlarm.js";
import { deviceLabel, isOnline } from "../deviceUtils.js";

export default function Device() {
  const { deviceId } = useParams();
  const [data, setData] = useState(null);
  const [shadow, setShadow] = useState(null);
  const [error, setError] = useState("");
  const [chartRange, setChartRange] = useState("all");
  const [chartLimit, setChartLimit] = useState("120");
  const [visibleLines, setVisibleLines] = useState({
    temperature: true,
    humidity: true,
    air_quality: true
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [device, shadowData] = await Promise.all([fetchDevice(deviceId), fetchShadow(deviceId)]);
        if (alive) {
          setData(device);
          setShadow(shadowData.shadow);
          setError("");
        }
      } catch (err) {
        if (alive) setError(err.message || String(err));
      }
    }
    load();
    const interval = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [deviceId]);

  const chartData = useMemo(() => {
    const rangeMs = {
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000
    }[chartRange];
    const limit = chartLimit === "all" ? 0 : Number(chartLimit);
    const newest = (data?.readings || []).slice().sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    const now = Date.now();
    const ranged = rangeMs ? newest.filter((row) => now - Number(row.timestamp) <= rangeMs) : newest;
    const limited = limit ? ranged.slice(0, limit) : ranged;

    return limited.reverse().map((row) => ({
      ...row,
      time: new Date(Number(row.timestamp)).toLocaleTimeString()
    }));
  }, [chartLimit, chartRange, data]);

  function toggleLine(key) {
    setVisibleLines((current) => ({ ...current, [key]: !current[key] }));
  }

  const device = data?.device;
  const latest = data?.latest;
  const online = isOnline(device);   /* live recompute - reconnects flip immediately */
  const heading = deviceLabel(device || { device_id: deviceId });
  const fireDetected = Number(latest?.fire ?? device?.last_fire) === 1;
  const fullLocation = [
    device?.location?.place,
    device?.location?.landmark,
    device?.location?.district,
    device?.location?.state,
    device?.location?.country
  ].filter(Boolean).join(", ");

  useEffect(() => {
    setFireAlarmActive(fireDetected);
    return () => setFireAlarmActive(false);
  }, [fireDetected]);

  return (
    <section>
      <Link className="back-link" to="/">Back to devices</Link>
      <div className="page-head">
        <div>
          <span className="eyebrow">Location details</span>
          <h1>{heading}</h1>
        </div>
        <span className={`status ${online ? "online" : "offline"}`}>{online ? "Online" : "Offline"}</span>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="metric-row">
        <Metric label="Temperature" value={`${Number(latest?.temperature ?? 0).toFixed(1)} C`} />
        <Metric label="Humidity" value={`${Number(latest?.humidity ?? 0).toFixed(0)}%`} />
        <Metric label="Air quality" value={latest?.air_quality ?? "-"} />
        <Metric label="Fire" value={fireDetected ? "DETECTED" : "Clear"} tone={fireDetected ? "bad" : "good"} />
      </div>

      <div className="detail-grid public-detail-grid">
        <Panel title="Exact location">
          <Info label="Place" value={device?.location?.place} />
          <Info label="Landmark" value={device?.location?.landmark} />
          <Info label="District" value={device?.location?.district} />
          <Info label="State" value={device?.location?.state} />
          <Info label="Country" value={device?.location?.country} />
          <Info label="Full location" value={fullLocation} />
        </Panel>
        <Panel title="Current status">
          <Info label="Device" value={deviceId} />
          <Info label="Last seen" value={device?.last_seen ? new Date(Number(device.last_seen)).toLocaleString() : "-"} />
          <Info label="Fire" value={fireDetected ? "Detected" : "Clear"} />
          <Info label="Air quality" value={latest?.air_quality ?? device?.last_air_quality} />
          <Info label="Firmware" value={device?.firmware_version} />
        </Panel>
        <Panel title="Telemetry state">
          <Info label="Reported sample period" value={shadow?.state?.reported?.sample_period_ms ? `${shadow.state.reported.sample_period_ms} ms` : "-"} />
          <Info label="OTA state" value={shadow?.state?.reported?.ota_state || "idle"} />
        </Panel>
      </div>

      <div className="chart-panel">
        <div className="chart-panel-head">
          <h2>Live Sensor Values</h2>
          <span>{chartData.length} samples</span>
        </div>
        <div className="chart-toolbar" aria-label="Sensor chart filters">
          <label>
            Time range
            <select value={chartRange} onChange={(event) => setChartRange(event.target.value)}>
              <option value="15m">Last 15 minutes</option>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="all">All data</option>
            </select>
          </label>
          <label>
            Points
            <select value={chartLimit} onChange={(event) => setChartLimit(event.target.value)}>
              <option value="30">30</option>
              <option value="60">60</option>
              <option value="120">120</option>
              <option value="all">All</option>
            </select>
          </label>
          <div className="chart-toggles">
            <label className="chart-toggle">
              <input type="checkbox" checked={visibleLines.temperature} onChange={() => toggleLine("temperature")} />
              Temperature
            </label>
            <label className="chart-toggle">
              <input type="checkbox" checked={visibleLines.humidity} onChange={() => toggleLine("humidity")} />
              Humidity
            </label>
            <label className="chart-toggle">
              <input type="checkbox" checked={visibleLines.air_quality} onChange={() => toggleLine("air_quality")} />
              Air quality
            </label>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData}>
            <XAxis dataKey="time" minTickGap={28} />
            <YAxis />
            <Tooltip />
            {visibleLines.temperature && <Line type="monotone" dataKey="temperature" stroke="#ef4444" dot={false} />}
            {visibleLines.humidity && <Line type="monotone" dataKey="humidity" stroke="#3b82f6" dot={false} />}
            {visibleLines.air_quality && <Line type="monotone" dataKey="air_quality" stroke="#22c55e" dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, children }) {
  return <div className="panel"><h2>{title}</h2>{children}</div>;
}

function Info({ label, value }) {
  return <p className="info-line"><span>{label}</span><b>{value || "-"}</b></p>;
}
