import React from "react";
import ReactDOM from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import App        from "./App.jsx";
import Login      from "./pages/Login.jsx";
import Fleet      from "./pages/Fleet.jsx";
import Devices    from "./pages/Devices.jsx";
import Device     from "./pages/Device.jsx";
import Live       from "./pages/Live.jsx";
import MapView    from "./pages/MapView.jsx";
import Analytics  from "./pages/Analytics.jsx";
import Alerts     from "./pages/Alerts.jsx";
import Reports    from "./pages/Reports.jsx";
import Settings   from "./pages/Settings.jsx";
import Users      from "./pages/Users.jsx";
import Logs       from "./pages/Logs.jsx";

import { getSession } from "./auth.js";
import "./index.css";

function Protected({ children }) {
  return getSession() ? children : <Navigate to="/login" replace />;
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <Protected><App /></Protected>,
    children: [
      /* Overview: fleet KPI summary */
      { index: true,                element: <Fleet /> },

      /* Devices: clean list sorted by device_id */
      { path: "devices",            element: <Devices /> },
      { path: "devices/:deviceId",  element: <Device /> },

      /* Other primary pages */
      { path: "live",               element: <Live /> },
      { path: "map",                element: <MapView /> },
      { path: "analytics",          element: <Analytics /> },
      { path: "alerts",             element: <Alerts /> },
      { path: "reports",            element: <Reports /> },
      { path: "settings",           element: <Settings /> },
      { path: "users",              element: <Users /> },
      { path: "logs",               element: <Logs /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
