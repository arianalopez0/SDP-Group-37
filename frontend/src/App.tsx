import { Fragment, useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import ChatWidget from "./ChatWidget";
import ReactMarkdown from "react-markdown";

type Coord = [number, number];
type Page = "home" | "map" | "about";

function getCenter(data: any): Coord | null {
  const src = data?.user_location ?? data?.input_location;
  if (src?.lat == null || src?.lon == null) return null;
  return [src.lat, src.lon];
}

interface Shelter {
  name: string; address: string; city: string; state: string; zip: string;
  status: string; lat: number; lon: number;
  straightline_distance_miles?: number | null;
  handicap_accessible?: string | null;
  route?: any;
}

function getShelters(data: any): Shelter[] {
  if (!data) return [];
  if (Array.isArray(data.nearest_shelters)) {
    return data.nearest_shelters.filter((s: any) => s.lat != null && s.lon != null);
  }
  if (Array.isArray(data.shelters)) {
    return data.shelters
      .filter((s: any) => s.location?.lat != null && s.location?.lon != null)
      .map((s: any) => ({
        name: s.name, address: s.address, city: s.city,
        state: s.state, zip: s.zip, status: s.status,
        lat: s.location.lat, lon: s.location.lon,
        straightline_distance_miles: s.straightline_distance_miles ?? null,
        handicap_accessible: s.handicap_accessible ?? null,
        route: s.route ?? null,
      }));
  }
  return [];
}

function getRoute(shelter: Shelter, userCoord?: Coord): Coord[] | null {
  const coords = shelter.route?.path_coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const pts = coords.filter((c: any) => Array.isArray(c) && c.length === 2).map((c: any) => [c[0], c[1]] as Coord);
  return userCoord ? [userCoord, ...pts] : pts;
}

function MapRecenter({ center }: { center: Coord }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center]);
  return null;
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <nav style={ns.nav}>
      <div style={ns.brand}>
        <span style={{ color: "#e63946", fontSize: 20 }}>⚠</span>
        <span style={ns.brandName}>DisasterRoute CT</span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {(["home", "map", "about"] as Page[]).map((p) => (
          <button key={p} onClick={() => setPage(p)}
            style={{ ...ns.link, ...(page === p ? ns.linkActive : {}) }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
    </nav>
  );
}
const ns: Record<string, React.CSSProperties> = {
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, background: "#0d0f17", borderBottom: "1px solid #1e2130", position: "sticky", top: 0, zIndex: 1000 },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandName: { color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "0.02em" },
  link: { background: "none", border: "none", color: "#9aa0b8", fontSize: 14, cursor: "pointer", padding: "6px 14px", borderRadius: 6, fontWeight: 500 },
  linkActive: { color: "#fff", background: "#1e2130" },
};

// ── Home Page ─────────────────────────────────────────────────────────────────
function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div style={hs.page}>
      <div style={hs.hero}>
        <div style={hs.alertBadge}>🔴 ACTIVE EMERGENCY TOOL</div>
        <h1 style={hs.h1}>Find Safety.<br />Find Shelter.<br />Find Your Route.</h1>
        <p style={hs.sub}>DisasterRoute CT uses real-time data and AI to guide Connecticut residents to the nearest open shelters during emergencies.</p>
        <button onClick={() => setPage("map")} style={hs.cta}>Open Shelter Finder →</button>
      </div>
      <div style={hs.cards}>
        {[
          { icon: "🗺", title: "Live Shelter Map", desc: "See open shelters near you with real-time status and distances." },
          { icon: "🤖", title: "AI Assistant", desc: "Ask questions in plain language — our AI finds and explains your best options." },
          { icon: "♿", title: "Accessibility Info", desc: "Filter shelters by handicap accessibility so everyone can find the right spot." },
          { icon: "🚗", title: "Route Planning", desc: "Get turn-by-turn routing that avoids flood zones and hazard areas." },
        ].map((c) => (
          <div key={c.title} style={hs.card}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
            <div style={hs.cardTitle}>{c.title}</div>
            <div style={hs.cardDesc}>{c.desc}</div>
          </div>
        ))}
      </div>
      <div style={hs.notice}>
        <strong>⚠ This tool is for demonstration and research purposes.</strong> Always follow official emergency broadcasts and local authority guidance during a real disaster.
      </div>
    </div>
  );
}
const hs: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px" },
  hero: { textAlign: "center", padding: "60px 0 48px" },
  alertBadge: { display: "inline-block", background: "rgba(230,57,70,0.15)", color: "#e63946", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 999, padding: "4px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 24 },
  h1: { fontSize: 44, fontWeight: 800, lineHeight: 1.2, color: "#fff", margin: "0 0 20px" },
  sub: { fontSize: 16, color: "#9aa0b8", lineHeight: 1.7, maxWidth: 540, margin: "0 auto 32px" },
  cta: { background: "#e63946", color: "#fff", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 },
  card: { background: "#13161f", border: "1px solid #1e2130", borderRadius: 12, padding: "24px 20px" },
  cardTitle: { fontWeight: 700, color: "#fff", marginBottom: 6, fontSize: 14 },
  cardDesc: { fontSize: 13, color: "#7a7f94", lineHeight: 1.6 },
  notice: { background: "rgba(230,57,70,0.07)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "#c0c8e0", lineHeight: 1.6 },
};

// ── Map Page ──────────────────────────────────────────────────────────────────
function MapPage({ sharedRawData, mapFlash }: { sharedRawData: any; mapFlash: boolean }) {
  const [query, setQuery] = useState("");
  const [startLocation, setStartLocation] = useState("Storrs, CT");
  const [rawData, setRawData] = useState<any>(null);
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const activeData = sharedRawData ?? rawData;
  const center = useMemo(() => getCenter(activeData) ?? [41.8111, -72.2484] as Coord, [activeData]);
  const shelters = useMemo(() => getShelters(activeData), [activeData]);
  const markerColors = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#8338ec"];

  function useMyLocation() {
    if (!navigator.geolocation) { setGeoError("Geolocation not supported by your browser."); return; }
    setGeoLoading(true); setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setStartLocation(`${pos.coords.latitude},${pos.coords.longitude}`); setGeoLoading(false); },
      () => { setGeoError("Could not get location. Check browser permissions."); setGeoLoading(false); }
    );
  }

  async function handleSubmit() {
    if (!query.trim()) return;
    setLoading(true); setError(""); setResponse(""); setRawData(null);
    try {
      const res = await fetch("http://localhost:8000/run-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, start_location: startLocation, mode: "Shelters nearby" }),
      });
      const ct = res.headers.get("content-type");
      if (!ct?.includes("application/json")) { setError(`Server error ${res.status}`); return; }
      const data = await res.json();
      if (data?.error) { setError(`Backend error: ${data.error}`); return; }
      setRawData(data.raw_data ?? null);
      setResponse(data.response ?? "");
    } catch (e: any) {
      setError(`Request failed: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={ms.page}>
      {/* Sidebar */}
      <div style={ms.sidebar}>
        <h2 style={ms.sideTitle}>Shelter Finder</h2>
        <label style={ms.label}>Your Location</label>
        <input value={startLocation} onChange={e => setStartLocation(e.target.value)} style={ms.input} placeholder="e.g. 123 Main St, Storrs, CT" />
        <label style={ms.label}>Query</label>
        <textarea value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="e.g. What are the closest shelters?" rows={3} style={ms.textarea} />
        <button onClick={handleSubmit} disabled={loading || !query.trim()}
          style={{ ...ms.btn, opacity: loading || !query.trim() ? 0.5 : 1 }}>
          {loading ? "Searching…" : "Find Shelters"}
        </button>

        {error && <div style={ms.errorBox}>{error}</div>}
        {response && (
          <div style={ms.responseBox}>
            <div style={ms.responseLabel}>AI Response</div>
            <div style={ms.responseText} className="response-md">
              <ReactMarkdown>{response}</ReactMarkdown>
            </div>
          </div>
        )}
        {shelters.length > 0 && (
          <div style={ms.shelterList}>
            <div style={ms.responseLabel}>Shelters ({shelters.length})</div>
            {shelters.map((s, i) => (
              <div key={i} style={ms.shelterCard}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 3, background: markerColors[i % markerColors.length] }} />
                <div>
                  <div style={ms.shelterName}>{s.name}</div>
                  <div style={ms.shelterMeta}>{s.address}, {s.city}</div>
                  <div style={ms.shelterMeta}>
                    <span style={{ color: s.status === "OPEN" ? "#2a9d8f" : "#e63946" }}>{s.status}</span>
                    {s.straightline_distance_miles != null && ` · ${s.straightline_distance_miles} mi`}
                  </div>
                  {s.handicap_accessible && (
                    <div style={{ ...ms.shelterMeta, color: s.handicap_accessible === "Yes" ? "#2a9d8f" : "#7a7f94" }}>
                      {s.handicap_accessible === "Yes" ? "✓ Wheelchair accessible" : "✗ Not accessible"}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {activeData && !getCenter(activeData) && (
          <div style={{ color: "#f4a261", fontSize: 12, marginTop: 8 }}>⚠ Could not determine map center from response.</div>
        )}
      </div>

      {/* Map */}
      <div style={ms.mapWrap} className={mapFlash ? "map-flash" : ""}>
        <style>{`
          @keyframes flashPulse {
            0%   { box-shadow: 0 0 0 0 rgba(26,86,219,0.7); }
            50%  { box-shadow: 0 0 0 16px rgba(26,86,219,0); }
            100% { box-shadow: 0 0 0 0 rgba(26,86,219,0); }
          }
          .map-flash { animation: flashPulse 0.9s ease; }
          .leaflet-container { background: #1a1d2e !important; }
          .leaflet-control-attribution { font-size: 9px !important; opacity: 0.4 !important; }
          .leaflet-control-attribution:hover { opacity: 1 !important; }
          .response-md p { margin: 0 0 6px; }
          .response-md ul, .response-md ol { margin: 4px 0; padding-left: 18px; }
          .response-md li { margin: 2px 0; }
          .response-md strong { color: #fff; }
        `}</style>
        <MapContainer center={center as Coord} zoom={13} style={{ width: "100%", height: "100%" }}>
          <MapRecenter center={center as Coord} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {activeData && (
            <Marker position={center as Coord} icon={L.divIcon({
              className: "",
              html: `<div style="background:#1a86e8;border:3px solid #fff;border-radius:50%;width:16px;height:16px;box-shadow:0 0 0 3px rgba(26,134,232,0.4)"></div>`,
              iconSize: [16, 16], iconAnchor: [8, 8],
            })}>
              <Popup><strong>📍 You are here</strong></Popup>
              <Tooltip permanent direction="top" offset={[0, -10]} opacity={1}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>📍 You are here</span>
              </Tooltip>
            </Marker>
          )}
          {shelters.map((s, idx) => {
            const pos: Coord = [s.lat, s.lon];
            const route = getRoute(s, center as Coord);
            const color = markerColors[idx % markerColors.length];
            return (
              <Fragment key={idx}>
                <Marker position={pos} icon={L.divIcon({
                  className: "",
                  html: `<div style="background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;width:18px;height:18px;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);display:block;text-align:center;font-size:9px;line-height:18px;color:#fff;font-weight:700">${idx + 1}</span></div>`,
                  iconSize: [18, 18], iconAnchor: [9, 18],
                })}>
                  <Popup>
                    <strong>{s.name}</strong><br />
                    {s.address}, {s.city}, {s.state} {s.zip}<br />
                    Status: {s.status}
                    {s.straightline_distance_miles != null && <><br />{s.straightline_distance_miles} mi away</>}
                    {s.handicap_accessible === "Yes" && <><br />✓ Wheelchair accessible</>}
                    {s.handicap_accessible === "No" && <><br />✗ Not wheelchair accessible</>}
                  </Popup>
                  <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
                    <span style={{ fontSize: 11 }}><strong>#{idx + 1}</strong> {s.name} · {s.straightline_distance_miles} mi</span>
                  </Tooltip>
                </Marker>
                {route && (
                  <Polyline
                    positions={route}
                    color={color}
                    weight={idx === 0 ? 5 : 3}
                    opacity={idx === 0 ? 0.95 : 0.55}
                    dashArray={idx === 0 ? undefined : "8 6"}
                  />
                )}
              </Fragment>
            );
          })}
        </MapContainer>
        {shelters.length === 0 && (
          <div style={ms.mapPlaceholder}>
            <div style={ms.mapPlaceholderText}>Enter a query to find shelters</div>
          </div>
        )}
      </div>
    </div>
  );
}

const ms: Record<string, React.CSSProperties> = {
  page: { display: "flex", position: "fixed", top: 56, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  sidebar: { width: 320, flexShrink: 0, background: "#0d0f17", borderRight: "1px solid #1e2130", overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 10 },
  sideTitle: { color: "#fff", fontSize: 16, fontWeight: 700, margin: "0 0 4px" },
  label: { fontSize: 11, color: "#7a7f94", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
  input: { background: "#13161f", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e8e8e8", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" },
  geoBtn: { background: "none", border: "1px solid #2a2d3a", borderRadius: 8, padding: "7px 10px", color: "#9aa0b8", fontSize: 12, cursor: "pointer", width: "100%", textAlign: "left" },
  textarea: { background: "#13161f", border: "1px solid #2a2d3a", borderRadius: 8, padding: "8px 10px", color: "#e8e8e8", fontSize: 13, outline: "none", resize: "none", width: "100%", minHeight: 72, boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5 },
  btn: { background: "#e63946", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" },
  errorBox: { background: "rgba(230,57,70,0.1)", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 8, padding: "10px 12px", color: "#e63946", fontSize: 12 },
  responseBox: { background: "#13161f", border: "1px solid #2a2d3a", borderRadius: 8, padding: "12px" },
  responseLabel: { fontSize: 10, color: "#7a7f94", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 },
  responseText: { margin: 0, fontSize: 13, color: "#c8cfe0", lineHeight: 1.5 },
  shelterList: { display: "flex", flexDirection: "column", gap: 8 },
  shelterCard: { display: "flex", alignItems: "flex-start", gap: 8, background: "#13161f", border: "1px solid #2a2d3a", borderRadius: 8, padding: "10px" },
  shelterName: { fontSize: 12, fontWeight: 700, color: "#e8e8e8", marginBottom: 2 },
  shelterMeta: { fontSize: 11, color: "#7a7f94", lineHeight: 1.5 },
  mapWrap: { flex: 1, position: "relative", overflow: "hidden", height: "100%" },
  mapPlaceholder: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 500 },
  mapPlaceholderText: { background: "rgba(13,15,23,0.7)", color: "#4a4f62", fontSize: 13, padding: "8px 16px", borderRadius: 8, border: "1px solid #1e2130" },
};

// ── About Page ────────────────────────────────────────────────────────────────
function AboutPage() {
  const team = [
    { name: "Suining He", role: "Faculty Advisor", icon: "🎓" },
    { name: "Magdalena Danielewicz", role: "Research Assistant", icon: "🔬" },
    { name: "Manasvi Iyengar", role: "Student", icon: "👩‍💻" },
    { name: "Connor Cybart", role: "Student", icon: "👨‍💻" },
    { name: "Cameron Chrisanthopoulos", role: "Student", icon: "👨‍💻" },
    { name: "Ariana Lopez", role: "Student", icon: "👩‍💻" },
  ];
  return (
    <div style={as.page}>
      <h2 style={as.h2}>About DisasterRoute CT</h2>
      <p style={as.p}>DisasterRoute CT is a Senior Design project built to help Connecticut residents navigate emergencies by locating nearby shelters, understanding hazard zones, and planning safe evacuation routes.</p>
      <h3 style={as.h3}>Meet the Team</h3>
      <div style={as.grid}>
        {team.map((m) => (
          <div key={m.name} style={as.card}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{m.icon}</div>
            <div style={as.cardTitle}>{m.name}</div>
            <div style={as.cardDesc}>{m.role}</div>
          </div>
        ))}
      </div>
      <div style={as.techStack}>
        <div style={as.stackLabel}>Tech Stack</div>
        <div style={as.tags}>
          {["React + Vite", "TypeScript", "Leaflet", "FastAPI", "Python", "Llama 3.1", "DeepInfra", "Geopy"].map(t => (
            <span key={t} style={as.tag}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
const as: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: "0 auto", padding: "48px 24px 80px" },
  h2: { fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 16 },
  h3: { fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16 },
  p: { fontSize: 15, color: "#9aa0b8", lineHeight: 1.8, marginBottom: 32 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 40 },
  card: { background: "#13161f", border: "1px solid #1e2130", borderRadius: 12, padding: "20px" },
  cardTitle: { fontWeight: 700, color: "#fff", marginBottom: 6, fontSize: 14 },
  cardDesc: { fontSize: 13, color: "#7a7f94", lineHeight: 1.6 },
  techStack: { background: "#13161f", border: "1px solid #1e2130", borderRadius: 12, padding: "20px 24px" },
  stackLabel: { fontSize: 11, color: "#7a7f94", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 },
  tags: { display: "flex", flexWrap: "wrap", gap: 8 },
  tag: { background: "#1e2130", border: "1px solid #2a2d3a", borderRadius: 999, padding: "4px 12px", fontSize: 12, color: "#c8cfe0" },
};

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [sharedRawData, setSharedRawData] = useState<any>(null);
  const [mapFlash, setMapFlash] = useState(false);
  const [startLocation] = useState("Storrs, CT");

  function handleNewRawData(data: any) {
    setSharedRawData(data);
    setMapFlash(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setMapFlash(true)));
    setTimeout(() => setMapFlash(false), 900);
    setPage("map");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c14", color: "#e8e8e8", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Nav page={page} setPage={setPage} />
      {page === "home"  && <HomePage setPage={setPage} />}
      {page === "map"   && <MapPage sharedRawData={sharedRawData} mapFlash={mapFlash} />}
      {page === "about" && <AboutPage />}
      <ChatWidget startLocation={startLocation} onNewRawData={handleNewRawData} />
    </div>
  );
}