const MAPPLS_KEY = import.meta.env.VITE_MAPPLS_KEY || "";
const SDK_ID = "mappls-web-sdk";
const PLUGIN_ID = "mappls-web-sdk-plugins";
const geocodeCache = new Map();

function loadScript(id, src) {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Unable to load ${id}`));
    document.head.appendChild(script);
  });
}

function waitForMappls(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.mappls?.Map) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Mappls SDK loaded, but mappls.Map was not available"));
      }
    }, 100);
  });
}

async function loadFirstWorkingMapSdk() {
  const sources = [
    `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${MAPPLS_KEY}&layer=vector`,
    `https://apis.mappls.com/advancedmaps/api/${MAPPLS_KEY}/map_sdk?layer=vector&v=3.0`
  ];

  for (let index = 0; index < sources.length; index += 1) {
    try {
      await loadScript(`${SDK_ID}-${index}`, sources[index]);
      await waitForMappls();
      return;
    } catch (err) {
      // Try the next supported Mappls SDK URL shape.
    }
  }
  throw new Error("Mappls SDK did not initialize");
}

export function hasMapplsKey() {
  return Boolean(MAPPLS_KEY);
}

export async function loadMapplsSdk() {
  if (!MAPPLS_KEY) throw new Error("Mappls key is missing");
  await loadFirstWorkingMapSdk();
  try {
    await loadScript(PLUGIN_ID, `https://apis.mappls.com/advancedmaps/api/${MAPPLS_KEY}/map_sdk_plugins?v=3.0`);
  } catch {
    // The base map is still useful if marker plugins are not enabled for the key.
  }
  if (!window.mappls?.Map) throw new Error("Mappls SDK did not initialize");
  return window.mappls;
}

export async function geocodeAddress(address) {
  const cleanAddress = String(address || "").trim();
  if (!MAPPLS_KEY || !cleanAddress) return null;
  if (geocodeCache.has(cleanAddress)) return geocodeCache.get(cleanAddress);

  const url = new URL("https://search.mappls.com/search/address/geocode");
  url.searchParams.set("address", cleanAddress);
  url.searchParams.set("itemCount", "1");
  url.searchParams.set("access_token", MAPPLS_KEY);

  const result = fetch(url)
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      const raw = Array.isArray(data?.copResults) ? data.copResults[0] : data?.copResults;
      if (!raw) return null;
      return {
        eLoc: raw.eLoc || raw.eloc,
        formattedAddress: raw.formattedAddress || cleanAddress,
        confidenceScore: raw.confidenceScore,
        geocodeLevel: raw.geocodeLevel
      };
    })
    .catch(() => null);

  geocodeCache.set(cleanAddress, result);
  return result;
}

export function getDeviceCoordinates(device) {
  const location = device?.location || {};
  const lat = Number(location.latitude ?? location.lat ?? device?.latitude ?? device?.lat);
  const lng = Number(location.longitude ?? location.lng ?? device?.longitude ?? device?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function getMarkerApi() {
  if (!window.mappls) return null;
  return typeof window.mappls === "function" ? new window.mappls() : window.mappls;
}
