import { Fragment, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";

type Coord = [number, number];

const USE_MOCK = false;

function getCenter(data: any): Coord | null {
  const a = data?.user_location;
  const b = data?.input_location;
  const lat = a?.lat ?? b?.lat;
  const lon = a?.lon ?? b?.lon;
  if (typeof lat === "number" && typeof lon === "number") return [lat, lon];
  return null;
}

function getShelters(data: any) {
  if (Array.isArray(data?.shelters)) {
    return data.shelters.map((s: any) => ({
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
      zip: s.zip,
      status: s.status,
      lat: s.location?.lat,
      lon: s.location?.lon,
      distance: s.route?.distance?.display ?? null,
      handicap: null,
      path: s.route?.path_coordinates ?? null,
    }));
  }

  if (Array.isArray(data?.nearest_shelters)) {
    return data.nearest_shelters.map((s: any) => ({
      name: s.name,
      address: s.address,
      city: s.city,
      state: s.state,
      zip: s.zip,
      status: s.status,
      lat: s.lat,
      lon: s.lon,
      distance: s.straightline_distance_miles != null
        ? `${s.straightline_distance_miles} mi`
        : null,
      handicap: s.handicap_accessible ?? null,
      path: null,
    }));
  }

  return [];
}

export default function App() {
  const [query, setQuery] = useState("");
  const [startLocation, setStartLocation] = useState("Storrs, CT");
  const [mode, setMode] = useState("Shelters nearby");
  const [response, setResponse] = useState<string>("");
  const [rawData, setRawData] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function runQuery() {
    if (!query.trim()) {
      alert("Please type a question first.");
      return;
    }

    setError("");
    setResponse("");
    setRawData(null);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/run-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, start_location: startLocation, mode }),
      });

      // Guard against non-JSON responses (e.g. 500 HTML error pages from uvicorn)
      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        setError(`Server error ${res.status}: received non-JSON response`);
        return;
      }

      const data = await res.json();

      if (data?.error) {
        setError(`Backend error: ${data.error}`);
        return;
      }

      setResponse(data.response ?? "");
      setRawData(data.raw_data ?? null);
    } catch (e: any) {
      setError(`Request failed: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const center = useMemo(() => getCenter(rawData), [rawData]);
  const shelters = useMemo(() => getShelters(rawData), [rawData]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Disaster Routing Assistant (React MVP)</h1>

      <p style={{ maxWidth: 900 }}>
        Connected to FastAPI backend at localhost:8000.
      </p>

      <h3>Ask a question</h3>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g., Find nearby shelters in Storrs, CT that are not in high flood risk zones."
        rows={4}
        style={{ width: "100%", padding: 10 }}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6 }}>Start location</div>
          <input
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          />
        </div>
        <div style={{ width: 240 }}>
          <div style={{ marginBottom: 6 }}>Mode</div>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ width: "100%", padding: 10 }}
          >
            <option>Shelters nearby</option>
            <option>Safe route</option>
            <option>General question</option>
          </select>
        </div>
      </div>

      <button
        onClick={runQuery}
        disabled={loading}
        style={{ marginTop: 12, padding: "10px 14px" }}
      >
        {loading ? "Running..." : "Run query"}
      </button>

      {error && (
        <div style={{ marginTop: 12, padding: 12, background: "#ffe5e5" }}>
          <b>{error}</b>
        </div>
      )}

      {/* Warn if map center couldn't be determined from response */}
      {rawData && !center && (
        <div style={{ marginTop: 12, padding: 12, background: "#fff3cd" }}>
          Warning: could not determine map center — check that raw_data contains{" "}
          <code>input_location</code> or <code>user_location</code> with lat/lon.
        </div>
      )}

      {response && (
        <>
          <h2 style={{ marginTop: 16 }}>Response</h2>
          <div style={{ whiteSpace: "pre-wrap" }}>{response}</div>
        </>
      )}

      {center && shelters.length > 0 && (
        <>
          <h2 style={{ marginTop: 16 }}>Map View</h2>
          <div style={{ height: 650 }}>
            <MapContainer center={center} zoom={13} style={{ height: "100%" }}>
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={center}>
                <Popup>Your Location</Popup>
              </Marker>

              {shelters.slice(0, 5).map((s: any, idx: number) => {
                if (s.lat == null || s.lon == null) return null;
                const pos: Coord = [s.lat, s.lon];
                return (
                  <Fragment key={idx}>
                    <Marker position={pos}>
                      <Popup>
                        <div>
                          <b>{s.name}</b>
                          <br />
                          {s.address}
                          <br />
                          {s.city}, {s.state} {s.zip}
                          <br />
                          Status: {s.status}
                          {s.distance && <><br />Distance: {s.distance}</>}
                          {s.handicap && <><br />Handicap Accessible: {s.handicap}</>}
                        </div>
                      </Popup>
                    </Marker>
                    {Array.isArray(s.path) && s.path.length > 1 && (
                      <Polyline positions={s.path} />
                    )}
                  </Fragment>
                );
              })}
            </MapContainer>
          </div>
        </>
      )}

      {rawData && (
        <details style={{ marginTop: 16 }}>
          <summary>Technical Details</summary>
          <pre style={{ overflowX: "auto" }}>{JSON.stringify(rawData, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
