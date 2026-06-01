import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler, TimeScale,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Tooltip, Legend, Filler, TimeScale
);

/**
 * Generic real-time line chart.
 *   labels: array of x-axis labels (formatted timestamps)
 *   values: array of y values aligned with labels
 *   color:  primary stroke colour
 *   suffix: y-axis unit suffix
 *   stepped: render fire status as step lines
 */
export default function MetricChart({
  labels, values, color = "#60a5fa", suffix = "", stepped = false,
  yMin, yMax,
}) {
  const data = useMemo(() => ({
    labels,
    datasets: [{
      label: "value",
      data: values,
      borderColor: color,
      backgroundColor: color + "20",
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: stepped ? 0 : 0.3,
      fill: true,
      stepped: stepped ? "after" : false,
    }],
  }), [labels, values, color, stepped]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.parsed.y}${suffix}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#94a3b8", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        grid:  { color: "rgba(148,163,184,0.08)" },
      },
      y: {
        ticks: { color: "#94a3b8" },
        grid:  { color: "rgba(148,163,184,0.08)" },
        suggestedMin: yMin, suggestedMax: yMax,
      },
    },
  }), [suffix, yMin, yMax]);

  return <Line data={data} options={options} />;
}
