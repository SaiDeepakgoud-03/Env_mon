export default function StatusPill({ online, label }) {
  const klass = online === true  ? "pill--ok"
              : online === false ? "pill--err"
              :                    "pill--idle";
  const text = label ?? (online ? "Online" : online === false ? "Offline" : "—");
  return (
    <span className={`pill ${klass}`}>
      <span className="pill__dot" />
      {text}
    </span>
  );
}
