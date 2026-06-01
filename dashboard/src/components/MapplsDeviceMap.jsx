import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { geocodeAddress, getDeviceCoordinates, getMarkerApi, hasMapplsKey, loadMapplsSdk } from "../mappls.js";

function locationText(device) {
  return [
    device.location?.place,
    device.location?.landmark,
    device.location?.district,
    device.location?.state,
    device.location?.country
  ].filter(Boolean).join(", ");
}

function popupHtml(device, geocode) {
  const name = device.display_name || device.device_id;
  const status = device.online ? "Online" : "Offline";
  const address = geocode?.formattedAddress || locationText(device) || "Location not set";
  return `
    <div class="mappls-popup">
      <strong>${name}</strong>
      <span>${status}</span>
      <p>${address}</p>
      <small>${Number(device.last_temperature ?? 0).toFixed(1)} C / ${device.last_humidity ?? "-"}%</small>
    </div>
  `;
}

export default function MapplsDeviceMap({ devices }) {
  const mapId = useMemo(() => `mappls-${Math.random().toString(36).slice(2)}`, []);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [state, setState] = useState(hasMapplsKey() ? "loading" : "missing-key");
  const [message, setMessage] = useState("");
  const [resolved, setResolved] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function resolveDevices() {
      const next = await Promise.all(devices.map(async (device, index) => {
        const coords = getDeviceCoordinates(device);
        if (coords) return { device, coords, geocode: null, index };
        const address = locationText(device);
        const geocode = await geocodeAddress(address);
        return { device, coords: null, geocode, index };
      }));
      if (!cancelled) setResolved(next);
    }
    resolveDevices();
    return () => {
      cancelled = true;
    };
  }, [devices]);

  useEffect(() => {
    let cancelled = false;
    async function initMap() {
      if (!hasMapplsKey()) return;
      try {
        await loadMapplsSdk();
        if (cancelled || mapRef.current) return;
        const firstCoords = resolved.find((item) => item.coords)?.coords;
        mapRef.current = new window.mappls.Map(mapId, {
          center: firstCoords ? { lat: firstCoords.lat, lng: firstCoords.lng } : { lat: 17.385, lng: 78.4867 },
          zoom: firstCoords ? 12 : 5,
          zoomControl: true,
          location: true
        });
        setState("ready");
      } catch (err) {
        setMessage(`Mappls map could not load: ${err?.message || "unknown SDK error"}`);
        setState("failed");
      }
    }
    initMap();
    return () => {
      cancelled = true;
    };
  }, [mapId, resolved]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !resolved.length || state !== "ready") return;
    const markerApi = getMarkerApi();
    if (!markerApi) {
      setMessage("Map is loaded, but marker plugin is unavailable for this key.");
      return;
    }

    try {
      markerRef.current?.remove?.();
    } catch {
      // Mappls marker cleanup support differs between SDK builds.
    }

    const coordinateFeatures = resolved
      .filter((item) => item.coords)
      .map((item) => ({
        type: "Feature",
        properties: { htmlPopup: popupHtml(item.device, item.geocode) },
        geometry: { type: "Point", coordinates: [item.coords.lat, item.coords.lng] }
      }));
    const eLocItems = resolved.filter((item) => item.geocode?.eLoc);

    if (coordinateFeatures.length) {
      markerRef.current = markerApi.Marker({
        map,
        position: { type: "FeatureCollection", features: coordinateFeatures },
        icon_url: "https://apis.mappls.com/map_v3/1.png",
        fitbounds: true,
        clusters: false,
        fitboundOptions: { padding: 80, duration: 800 }
      });
    }

    if (eLocItems.length && markerApi.pinMarker) {
      markerApi.pinMarker({
        map,
        pin: eLocItems.map((item) => item.geocode.eLoc),
        popupHtml: eLocItems.map((item) => popupHtml(item.device, item.geocode)),
        fitbounds: !coordinateFeatures.length
      });
    }
    if (!coordinateFeatures.length && !eLocItems.length) {
      setMessage("Map loaded. Add latitude/longitude or a more complete address to place exact pins.");
    } else if (eLocItems.length && !markerApi.pinMarker) {
      setMessage("Map loaded. Exact address pins need the Mappls marker plugin enabled for this key.");
    } else {
      setMessage("");
    }
  }, [resolved, state]);

  if (state === "missing-key" || state === "failed") {
    return <FallbackMap devices={devices} message={message || "Mappls key is missing."} />;
  }

  return (
    <>
      <div id={mapId} className="mappls-canvas" aria-label="Exact Mappls device locations" />
      {state === "loading" && <div className="map-loading">Loading Mappls map...</div>}
      {message && <div className="map-note">{message}</div>}
    </>
  );
}

function FallbackMap({ devices, message }) {
  return (
    <>
      <div className="map-canvas" aria-label="Device location overview">
        {devices.map((device, index) => (
          <Link
            key={device.device_id}
            to={`/devices/${device.device_id}`}
            className={`map-pin ${device.online ? "online" : "offline"} ${Number(device.last_fire) === 1 ? "fire" : ""}`}
            style={{ left: `${18 + (index * 31) % 64}%`, top: `${24 + (index * 23) % 56}%` }}
            title={locationText(device) || device.device_id}
          />
        ))}
      </div>
      <div className="map-note">{message}</div>
    </>
  );
}
