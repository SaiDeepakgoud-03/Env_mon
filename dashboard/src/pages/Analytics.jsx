import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchAnalytics } from "../api.js";

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchAnalytics().then(setData);
  }, []);

  const rows = [
    { name: "Online", value: data?.active || 0 },
    { name: "Offline", value: data?.offline || 0 },
    { name: "Alerts", value: data?.alerts || 0 }
  ];
  const fmt = (value, suffix = "") => Number.isFinite(Number(value))
    ? `${Number(value).toFixed(2)}${suffix}`
    : "-";

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Environment intelligence</span>
          <h1>Analytics</h1>
        </div>
      </div>
      <div className="metric-row">
        <Metric label="Avg temp" value={fmt(data?.averages?.temperature, " C")} />
        <Metric label="Avg humidity" value={fmt(data?.averages?.humidity, "%")} />
        <Metric label="Avg AQ" value={fmt(data?.averages?.air_quality)} />
      </div>
      <div className="chart-panel">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={rows}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={28} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
