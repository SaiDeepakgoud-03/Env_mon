import { Link } from "react-router-dom";
import StatusPill from "./StatusPill.jsx";
import { deviceLabel, isOnline, locationText } from "../deviceUtils.js";

function fmt(n, d = 1) {
  return n == null || Number.isNaN(Number(n)) ? "—" : Number(n).toFixed(d);
}

export default function DeviceCard({ d }) {
  /* Always recompute online from last_seen so the card flips back to
     green within ~2 s of a reconnect, regardless of any stale server flag. */
  const online = isOnline(d);
  const place  = d.location?.place || "";
  const where  = locationText(d);

  return (
    <Link to={`/devices/${encodeURIComponent(d.device_id)}`} className="device-card">
      <div className="device-card__head">
        <div>
          <span className="device-card__id">{d.device_id}</span>
          {place && <span className="device-card__place">{place}</span>}
        </div>
        <StatusPill online={online} />
      </div>

      {where && <p className="device-card__where">{where}</p>}

      <div className="device-card__meta">
        <div><b>IP</b><br />{d.ip || "—"}</div>
        <div><b>SSID</b><br />{d.ssid || "—"}</div>
        <div><b>RSSI</b><br />{d.rssi != null ? `${d.rssi} dBm` : "—"}</div>
        <div><b>FW</b><br />{d.fw_version || d.firmware_version || "—"}</div>
      </div>

      <div className="device-card__metrics">
        <div className="metric-mini">
          <span className="metric-mini__v">{fmt(d.last_temperature, 1)}</span>
          <span className="metric-mini__l">Temp °C</span>
        </div>
        <div className="metric-mini">
          <span className="metric-mini__v">{fmt(d.last_humidity, 0)}</span>
          <span className="metric-mini__l">Hum %</span>
        </div>
        <div className="metric-mini">
          <span className="metric-mini__v">{d.last_air_quality ?? "—"}</span>
          <span className="metric-mini__l">Air Q.</span>
        </div>
        <div className={`metric-mini ${d.last_fire ? "fire" : ""}`}>
          <span className="metric-mini__v">{d.last_fire ? "🔥" : "—"}</span>
          <span className="metric-mini__l">Fire</span>
        </div>
      </div>
    </Link>
  );
}
