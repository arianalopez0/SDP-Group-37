import { useMemo, useState } from "react";
import mockRaw from "./mock_raw_data.json";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";

type Coord = [number, number];

const USE_MOCK = true;

export default function App() {
  const [query, setQuery] = useState("");
  const [startLocation, setStartLocation] = useState("Storrs, CT");
  const [mode, setMode] = useState("Shelters nearby");

  const [response, setResponse] = useState<string>("");
  const [rawData, setRawData] = useState<any>(null);

  async function runQuery() {
    if (!query.trim()) {
      alert("Please type a question first.");
      return;
    }

    if (USE_MOCK) {
      setResponse("Mock response using real Streamlit schema.");
      setRawData(mockRaw);
      return;
    }

    // Future backend call
    const res = await fetch("http://localhost:8000/run-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        start_location: startLocation,
        mode
      })
    });

    const data = await res.json();
    setResponse(data.response);
    setRawData(data.raw_data);
  }

  // ---- Flexible schema support ----

  function getCenter(data: any): Coord | null {
    const a = data?.user_location;
    const b = data?.input_location;

    const lat = a?.lat ?? b?.lat;
    const lon = a?.lon ?? b?.lon;

    if (typeof lat === "number" && typeof lon === "number") {
      return [lat, lon];
    }

    return null;
  }

  function getShelters(data: any) {
    // Old schema
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
        distance: s.route?.distance?.display,
        path: s.route?.path_coordinates ?? null
      }));
    }

    // New schema (your current Streamlit output)
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
        distance: s.straightline_distance_miles
          ? `${s.straightline_distance_miles} mi`
          : null,
        handicap: s.handicap_accessible,
        path: null
      }));
    }

    return [];
  }

  const center = useMemo(() => getCenter(rawData), [rawData]);
  const shelters = useMemo(() => getShelters(rawData), [rawData]);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Disaster Routing Assistant (React MVP)</h1>

      <p style={{ maxWidth: 900 }}>
        Mock mode using real Streamlit schema. Ready to swap to backend API.
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

      <button onClick={runQuery} style={{ marginTop: 12, padding: "10px 14px" }}>
        Run query
      </button>

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

              {/* User location marker */}
              <Marker position={center}>
                <Popup>Your Location</Popup>
              </Marker>

              {/* Shelter markers */}
              {shelters.slice(0, 5).map((s: any, idx: number) => {
                if (!s.lat || !s.lon) return null;

                const pos: Coord = [s.lat, s.lon];

                return (
                  <div key={idx}>
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
                          <br />
                          {s.distance ? `Distance: ${s.distance}` : null}
                          <br />
                          {s.handicap
                            ? `Handicap Accessible: ${s.handicap}`
                            : null}
                        </div>
                      </Popup>
                    </Marker>

                    {Array.isArray(s.path) && s.path.length > 1 && (
                      <Polyline positions={s.path} />
                    )}
                  </div>
                );
              })}
            </MapContainer>
          </div>
        </>
      )}

      {rawData && (
        <details style={{ marginTop: 16 }}>
          <summary>Technical Details</summary>
          <pre style={{ overflowX: "auto" }}>
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
