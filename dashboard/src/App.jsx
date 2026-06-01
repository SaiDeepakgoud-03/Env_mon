import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "./auth.js";

/* Each nav entry: [path, label, icon-key].
   Important: every "to" must be DIFFERENT, otherwise NavLink
   activates multiple items at once. */
const nav = [
  ["/",          "Overview",      "overview"],
  ["/devices",   "Devices",       "devices"],
  ["/live",      "Live Monitor",  "pulse"],
  ["/map",       "Map View",      "map"],
  ["/analytics", "Analytics",     "analytics"],
  ["/alerts",    "Alerts",        "alerts"],
  ["/reports",   "Reports",       "reports"],
  ["/settings",  "Settings",      "settings"],
  ["/users",     "Users",         "users"],
  ["/logs",      "Logs",          "logs"],
];

export default function App() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem("envmon.theme") || "dark");

  useEffect(() => {
    localStorage.setItem("envmon.theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function signOut() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" />
          <div>
            <strong>EnviroMonitor</strong>
            <small>IoT Environment System</small>
          </div>
        </div>

        <nav>
          {nav.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              /* `end` is critical: only the root path needs an exact
                 match so it doesn't light up on every sub-route. */
              end={to === "/"}
            >
              <Icon name={icon} />
              {label}
              {label === "Alerts" && <b className="nav-badge">!</b>}
            </NavLink>
          ))}
        </nav>

        <div className="system-info">
          <div><strong>System Info</strong><span className="mini-online">Online</span></div>
          <p><span>Version</span><b>v2.1.0</b></p>
        </div>
        <button
          className="theme-button"
          onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "Light Theme" : "Dark Theme"}
        </button>
        <button className="ghost-button" onClick={signOut}>Logout</button>
      </aside>

      <main className="main-surface">
        <Outlet />
      </main>
    </div>
  );
}

function Icon({ name }) {
  const paths = {
    overview:  "M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Zm10 0h6v-4h-6v4Z",
    devices:   "M7 4h10a2 2 0 0 1 2 2v10H5V6a2 2 0 0 1 2-2Zm-3 15h16M8 19v-3m8 3v-3",
    analytics: "M4 19V5m0 14h16M8 16v-5m5 5V8m5 8v-9",
    alerts:    "M12 3 2.8 19h18.4L12 3Zm0 5v5m0 3h.01",
    pulse:     "M3 12h4l2-6 4 12 2-6h6",
    map:       "M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6Zm5-2v14m6-12v14",
    reports:   "M6 3h9l3 3v15H6V3Zm8 0v4h4M9 12h6M9 16h6",
    settings:  "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M3 12h3m12 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
    users:     "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6m2 15a5 5 0 0 0-4-4.9",
    logs:      "M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h4",
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
