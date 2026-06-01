import { useEffect, useState } from "react";
import MapplsDeviceMap from "../components/MapplsDeviceMap.jsx";
import { fetchDevices } from "../api.js";

export default function MapView() {
  const [fleet, setFleet] = useState({ devices: [] });

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const d = await fetchDevices(); if (alive) setFleet(d); }
      catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <section className="page page-map">
      <header className="page-header">
        <div>
          <h1>Map View</h1>
          <p className="page-sub">
            Every registered device, located by its provisioning address.
            Showing {fleet.devices?.length ?? 0} markers.
          </p>
        </div>
      </header>

      <div className="card map-card">
        <MapplsDeviceMap devices={fleet.devices || []} />
      </div>
    </section>
  );
}
