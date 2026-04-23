import { Fragment, useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import ChatWidget from "./Chatwidget";

type Page = "home" | "map" | "resources" | "about";

interface Shelter {
  name: string; address: string; city: string; state: string; zip: string;
  status: string; lat: number; lon: number;
  straightline_distance_miles?: number | null;
  handicap_accessible?: string | null;
  route?: any;
  flood_warnings?: { zone: string; risk: string; description?: string | null }[] | null;
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
        flood_warnings: s.flood_warnings ?? null,
      }));
  }
  return [];
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ page, setPage, isDark, toggleTheme }: {
  page: Page;
  setPage: (p: Page) => void;
  isDark: boolean;
  toggleTheme: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(p: Page) {
    setPage(p);
    setMenuOpen(false);
  }

  return (
    <>
      <nav style={ns.nav}>
        <div style={ns.brand}>
          <span style={{ color: "var(--accent)", fontSize: 20 }}>⚠</span>
          <span style={ns.brandName}>DisasterRoute CT</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div className="desktop-nav-links" style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(["home", "map", "resources", "about"] as Page[]).map((p) => (
              <button key={p} onClick={() => navigate(p)}
                style={{ ...ns.link, ...(page === p ? ns.linkActive : {}) }}>
                {p === "map" ? "Assistance" : p === "resources" ? "Resources" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <div
            onClick={toggleTheme}
            title="Toggle theme"
            style={{
              width: 80, height: 26,
              background: isDark ? "#2a2d3a" : "var(--accent)",
              borderRadius: 13,
              border: `1px solid ${isDark ? "#3a3d4a" : "#c82030"}`,
              position: "relative",
              cursor: "pointer",
              marginLeft: 8,
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <div style={{
              position: "absolute",
              top: 3,
              left: isDark ? 3 : undefined,
              right: isDark ? undefined : 3,
              width: 20, height: 20,
              background: "#fff",
              borderRadius: "50%",
              transition: "left 0.2s, right 0.2s",
            }} />
            <span style={{
              position: "absolute",
              top: "50%",
              transform: "translateY(-50%)",
              left: isDark ? undefined : 8,
              right: isDark ? 8 : undefined,
              fontSize: 10,
              fontWeight: 600,
              color: isDark ? "#7a7f94" : "#fff",
              display: "flex",
              alignItems: "center",
              gap: 3,
              whiteSpace: "nowrap" as const,
            }}>
              {isDark ? <>☀ Dark</> : <>🌙 Light</>}
            </span>
          </div>

          <button
            className="hamburger-btn"
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: "none", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", padding: "4px 8px", borderRadius: 6, marginLeft: 8, display: "none" }}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </nav>
      <div className={`mobile-nav-menu${menuOpen ? " open" : ""}`}>
        {(["home", "map", "resources", "about"] as Page[]).map((p) => (
          <button key={p} onClick={() => navigate(p)}
            style={{ ...ns.link, ...(page === p ? ns.linkActive : {}), width: "100%", textAlign: "left" as const }}>
            {p === "map" ? "Assistance" : p === "resources" ? "Resources" : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
    </>
  );
}
const ns: Record<string, React.CSSProperties> = {
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 56, background: "var(--bg-nav)", borderBottom: "1px solid var(--border-main)", position: "sticky", top: 0, zIndex: 1000 },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandName: { color: "var(--text-heading)", fontWeight: 700, fontSize: 16, letterSpacing: "0.02em" },
  link: { background: "none", border: "none", color: "var(--text-nav-link)", fontSize: 14, cursor: "pointer", padding: "6px 14px", borderRadius: 6, fontWeight: 500 },
  linkActive: { color: "var(--text-nav-active)", background: "var(--bg-input)" },
};

// ── Home Page ─────────────────────────────────────────────────────────────────
function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div style={hs.page}>
      <div style={hs.hero} className="home-hero">
        <div style={hs.alertBadge}>🔴 ACTIVE EMERGENCY TOOL</div>
        <h1 style={hs.h1}>Find Safety.<br />Find Shelter.<br />Find Your Route.</h1>
        <p style={hs.sub}>DisasterRoute CT uses real-time data and AI to guide Connecticut residents to the nearest open shelters during emergencies.</p>
        <button onClick={() => setPage("map")} style={hs.cta}>Get Assistance →</button>
      </div>
      <div className="home-cards" style={hs.cards}>
        {[
          {
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="#4a9eed"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
            title: "Interactive Shelter Map",
            desc: "See open shelters near you with status, distance, and accessibility info displayed on an interactive map."
          },
          {
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="#2a9d8f"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>,
            title: "AI Assistant",
            desc: "Ask questions in plain language. Our AI finds and explains your best options."
          },
          {
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="#f4a261"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-2 8H7v-2h4v2zm4-4H7v-2h8v2z"/></svg>,
            title: "Emergency Preparedness",
            desc: "Ask about what to pack, how to prepare, and what to do during specific disasters. Answered from official emergency guidance."
          },
          {
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="#e63946"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-5h2v2h-2zm0-8h2v6h-2z"/></svg>,
            title: "Flood Zone Awareness",
            desc: "Find out if you're in a FEMA flood zone and get shelter recommendations that account for local hazard risk."
          },
          {
            icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="#4a9eed"><path d="M21 3L3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z"/></svg>,
            title: "Evacuation Routing",
            desc: "See road-following routes from your location to nearby shelters, avoiding hazard areas."
          },
        ].map((c) => (
          <div key={c.title} style={hs.card}>
            <div style={{ marginBottom: 10 }}>{c.icon}</div>
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
  page: { maxWidth: 1100, margin: "0 auto", padding: "48px 20px 80px" },
  hero: { textAlign: "center", padding: "48px 0 40px" },
  alertBadge: { display: "inline-block", background: "rgba(230,57,70,0.15)", color: "var(--accent)", border: "1px solid rgba(230,57,70,0.3)", borderRadius: 999, padding: "4px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 24 },
  h1: { fontSize: 44, fontWeight: 800, lineHeight: 1.2, color: "var(--text-heading)", margin: "0 0 20px" },
  sub: { fontSize: 16, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 540, margin: "0 auto 32px" },
  cta: { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  cards: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 40 },
  card: { background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "20px 16px" },
  cardTitle: { fontWeight: 700, color: "var(--text-heading)", marginBottom: 6, fontSize: 14 },
  cardDesc: { fontSize: 13, color: "var(--text-card-desc)", lineHeight: 1.6 },
  notice: { background: "rgba(230,57,70,0.07)", border: "1px solid rgba(230,57,70,0.2)", borderRadius: 10, padding: "16px 20px", fontSize: 13, color: "var(--text-notice)", lineHeight: 1.6, textAlign: "center" as const },
};

type Coord = [number, number];
const markerColors = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#8338ec"];

function getCenter(data: any): Coord | null {
  const src = data?.user_location ?? data?.input_location;
  if (src?.lat == null || src?.lon == null) return null;
  return [src.lat, src.lon];
}

function getRoute(shelter: Shelter, userCoord?: Coord): Coord[] | null {
  const coords = shelter.route?.path_coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const pts = coords.filter((c: any) => Array.isArray(c) && c.length === 2).map((c: any) => [c[0], c[1]] as Coord);
  return userCoord ? [userCoord, ...pts] : pts;
}

// ── Full Map Modal ────────────────────────────────────────────────────────────
function FullMapModal({ center, shelters, onClose }: { center: Coord; shelters: Shelter[]; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="full-map-modal-overlay" style={modal.overlay} onClick={onClose}>
      <div className="full-map-modal-sheet" style={modal.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={modal.header}>
          <span style={{ color: "var(--accent)", fontSize: 16 }}>🗺</span>
          <span style={modal.title}>Shelter Map</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>{shelters.length} shelter{shelters.length !== 1 ? "s" : ""} found</span>
          <button onClick={onClose} style={modal.closeBtn}>✕</button>
        </div>
        <div style={modal.mapWrap}>
          <style>{`
            .modal-map .leaflet-container { background: #e8e0d8 !important; }
            .modal-map .leaflet-control-attribution { font-size: 9px !important; opacity: 0.4 !important; }
            .modal-map .leaflet-control-zoom a { background: var(--bg-input) !important; color: var(--text-primary) !important; border-color: var(--border-subtle) !important; }
            .modal-map .leaflet-control-zoom a:hover { background: var(--border-subtle) !important; }
          `}</style>
          <div className="modal-map" style={{ width: "100%", height: "100%" }}>
            <MapContainer center={center} zoom={12} style={{ width: "100%", height: "100%" }} scrollWheelZoom>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
              <Marker position={center} icon={L.divIcon({
                className: "",
                html: `<div style="background:#1a86e8;border:3px solid #fff;border-radius:50%;width:16px;height:16px;box-shadow:0 0 0 3px rgba(26,134,232,0.4)"></div>`,
                iconSize: [16, 16], iconAnchor: [8, 8],
              })}>
                <Popup><strong>📍 You are here</strong></Popup>
              </Marker>
              {shelters.map((s, idx) => {
                const pos: Coord = [s.lat, s.lon];
                const route = getRoute(s, center);
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
                      <Polyline positions={route} color={color}
                        weight={idx === 0 ? 5 : 3} opacity={idx === 0 ? 0.95 : 0.55}
                        dashArray={idx === 0 ? undefined : "8 6"} />
                    )}
                  </Fragment>
                );
              })}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

const modal: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  sheet: { background: "var(--bg-nav)", border: "1px solid var(--border-subtle)", borderRadius: 14, width: "100%", maxWidth: 900, height: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px var(--shadow-modal)" },
  header: { display: "flex", alignItems: "center", gap: 8, padding: "14px 18px", borderBottom: "1px solid var(--border-main)", flexShrink: 0 },
  title: { fontSize: 15, fontWeight: 700, color: "var(--text-heading)" },
  closeBtn: { marginLeft: "auto", background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: 6, color: "var(--text-muted)", fontSize: 13, padding: "4px 10px", cursor: "pointer" },
  mapWrap: { flex: 1, overflow: "hidden" },
};

// ── Assistance Page ───────────────────────────────────────────────────────────
function MapPage({ sharedRawData, startLocation, setStartLocation, onNewRawData }: {
  sharedRawData: any;
  startLocation: string;
  setStartLocation: (loc: string) => void;
  onNewRawData: (data: any) => void;
}) {
  const shelters = useMemo(() => getShelters(sharedRawData), [sharedRawData]);
  const center = useMemo(() => getCenter(sharedRawData), [sharedRawData]);
  const [showModal, setShowModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="map-page" style={ms.page}>
      {showModal && center && (
        <FullMapModal center={center} shelters={shelters} onClose={() => setShowModal(false)} />
      )}
      <div className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />
      <div className={`sidebar-drawer${sidebarOpen ? " open" : ""}`} style={ms.sidebar}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={ms.sideTitle}>Nearby Shelters</h2>
          <button
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", padding: "4px 6px", display: "none" }}
          >✕</button>
        </div>
        <label style={ms.label}>Your Location</label>
        <input
          value={startLocation}
          onChange={(e) => setStartLocation(e.target.value)}
          style={ms.input}
          placeholder="Enter your location..."
        />
        {shelters.length === 0 ? (
          <div style={ms.emptyState}>
            <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, lineHeight: 1.4 }}>📍</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-empty-title)", marginBottom: 4 }}>Get started</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>Ask the assistant about shelters, routes, or flood risk.</div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", lineHeight: 1.6, marginTop: 3, fontStyle: "italic" }}>Try:</div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", lineHeight: 1.8, marginTop: 3 }}>
                  <div>· "Find shelters near me"</div>
                  <div>· "Directions to closest shelter"</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={ms.shelterList}>
              {shelters.map((s, i) => (
                <div key={i} style={ms.shelterCard}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 3, background: markerColors[i % markerColors.length] }} />
                  <div>
                    <div style={ms.shelterName}>{s.name}</div>
                    <div style={ms.shelterMeta}>{s.address}, {s.city}</div>
                    <div style={ms.shelterMeta}>
                      <span style={{ color: s.status === "OPEN" ? "var(--accent-open)" : "var(--accent)" }}>{s.status}</span>
                      {s.straightline_distance_miles != null && ` · ${s.straightline_distance_miles} mi`}
                    </div>
                    {s.handicap_accessible && (
                      <div style={{ ...ms.shelterMeta, color: s.handicap_accessible === "Yes" ? "var(--accent-open)" : "var(--text-muted)" }}>
                        {s.handicap_accessible === "Yes" ? "✓ Wheelchair accessible" : "✗ Not accessible"}
                      </div>
                    )}
                    {s.flood_warnings && s.flood_warnings.length > 0 && (
                      <div style={{ ...ms.shelterMeta, color: s.flood_warnings[0].risk === "High" ? "#e63946" : s.flood_warnings[0].risk === "Moderate" ? "#f4a261" : "#7a7f94" }}>
                        ⚠ Flood zone: {s.flood_warnings[0].risk} ({s.flood_warnings[0].zone})
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {center && (
              <button onClick={() => { setShowModal(true); setSidebarOpen(false); }} style={ms.viewMapBtn}>
                🗺 View Full Map
              </button>
            )}
          </>
        )}
      </div>
      <div className="chat-panel-wrap" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        <button
          className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            display: "none",
            position: "absolute",
            top: 12, right: 12,
            zIndex: 10,
            background: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            color: "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 10px",
            cursor: "pointer",
            alignItems: "center",
            gap: 4,
          }}
        >
          ☰ Shelters
        </button>
        <ChatWidget startLocation={startLocation} onNewRawData={onNewRawData} />
      </div>
    </div>
  );
}

const ms: Record<string, React.CSSProperties> = {
  page: { display: "flex", position: "fixed", top: 56, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  sidebar: { width: 280, flexShrink: 0, background: "var(--bg-sidebar)", borderRight: "1px solid var(--border-main)", overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 10 },
  sideTitle: { color: "var(--text-heading)", fontSize: 16, fontWeight: 700, margin: "0 0 4px" },
  label: { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const },
  input: { background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "8px 10px", color: "var(--text-primary)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" as const },
  shelterList: { display: "flex", flexDirection: "column", gap: 8 },
  shelterCard: { display: "flex", alignItems: "flex-start", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px" },
  shelterName: { fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 },
  shelterMeta: { fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 },
  viewMapBtn: { background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "9px 12px", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%", textAlign: "center" as const, marginTop: 4 },
  emptyState: { padding: "14px 12px", background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 10, marginTop: 4 },
};

// ── About Page ────────────────────────────────────────────────────────────────
function AboutPage() {
  const team = [
    { name: "Suining He", role: "Faculty Advisor", icon: "🎓" },
    { name: "Magdalena Danielewicz", role: "Computer Science & Analytics", icon: "👩‍💻" },
    { name: "Manasvi Iyengar", role: "Computer Science & Economics", icon: "👩‍💻" },
    { name: "Connor Cybart", role: "Computer Science", icon: "👨‍💻" },
    { name: "Cameron Chrisanthopoulos", role: "Computer Science & Information Assurance", icon: "👨‍💻" },
    { name: "Ariana Lopez", role: "Data Science & Engineering", icon: "👩‍💻" },
  ];
  return (
    <div style={abouts.page}>
      <h2 style={abouts.h2}>About DisasterRoute CT</h2>
      <p style={abouts.p}>DisasterRoute CT is a disaster resilience platform built to help Connecticut residents navigate emergencies by locating nearby shelters, understanding hazard zones, and planning safe evacuation routes.</p>
      <h3 style={abouts.h3}>Meet the Team</h3>
      <div style={abouts.grid}>
        {team.map((m) => (
          <div key={m.name} style={abouts.card}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{m.icon}</div>
            <div style={abouts.cardTitle}>{m.name}</div>
            <div style={abouts.cardDesc}>{m.role}</div>
          </div>
        ))}
      </div>
      <div style={abouts.techStack}>
        <div style={abouts.stackLabel}>Tech Stack</div>
        <div style={abouts.tags}>
          {["React+Vite", "Azure", "TypeScript", "Leaflet", "CARTO", "FastAPI", "Python", "OpenAI", "Geopy"].map(t => (
            <span key={t} style={abouts.tag}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
const abouts: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: "0 auto", padding: "48px 20px 80px" },
  h2: { fontSize: 28, fontWeight: 800, color: "var(--text-heading)", marginBottom: 16 },
  h3: { fontSize: 18, fontWeight: 700, color: "var(--text-heading)", marginBottom: 16 },
  p: { fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 32 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 40 },
  card: { background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "20px" },
  cardTitle: { fontWeight: 700, color: "var(--text-heading)", marginBottom: 6, fontSize: 14 },
  cardDesc: { fontSize: 13, color: "var(--text-card-desc)", lineHeight: 1.6 },
  techStack: { background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "20px 24px" },
  stackLabel: { fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 12 },
  tags: { display: "flex", flexWrap: "wrap", gap: 8 },
  tag: { background: "var(--bg-tag)", border: "1px solid var(--border-subtle)", borderRadius: 999, padding: "4px 12px", fontSize: 12, color: "var(--text-tag)" },
};

// ── Resources Page ────────────────────────────────────────────────────────────
function ResourcesPage() {
  function getDomain(url: string) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  }
  function getFaviconUrl(url: string) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(url))}&sz=64`;
  }
  const resources: { title: string; url: string; note?: string }[] = [
    { title: "DESPP Resources for Individuals", url: "https://portal.ct.gov/demhs/emergency-management/resources-for-individuals/resources-for-individuals", note: "Official CT DEMHS hub for individual and family emergency preparedness, covering hazard preparedness tips, mitigation advice for homeowners, volunteering opportunities, accessibility resources, and links to the CT Ready personal preparedness guide." },
    { title: "Know Your Zone! Shoreline Evacuation Maps", url: "https://portal.ct.gov/demhs/emergency-management/resources-for-individuals/summer-weather-awareness/know-your-zone-evacuation-maps?language=en_US", note: "Official CT DEMHS shoreline evacuation maps for Connecticut's coastal areas." },
    { title: "CT Ready! Personal Preparedness Guide", url: "https://portal.ct.gov/dph/-/media/departments-and-agencies/dph/public-health-preparedness/prep-guide-2020/english-ct-ready-guide.pdf?rev=9854487064f140e083d6332de56c1c1c&hash=6AE2BF813546AA015A0965E20E446219", note: "Official CT Department of Public Health CT Ready! Personal Preparedness Guide." },
    { title: "DESPP Staying Informed", url: "https://portal.ct.gov/demhs/emergency-management/resources-for-individuals/staying-informed?language=en_US", note: "Official CT DEMHS hub for staying informed about emergency preparedness and disaster information." },
  ];
  return (
    <div style={resourcesS.page}>
      <h2 style={resourcesS.h2}>Connecticut Resources</h2>
      <p style={resourcesS.p}>Use these links for trusted emergency information, preparedness guidance, and official updates. In a real emergency, always follow instructions from local authorities.</p>
      <div style={resourcesS.list}>
        {resources.map((r) => (
          <div key={r.title} style={resourcesS.item}>
            <div style={resourcesS.row}>
              <img src={getFaviconUrl(r.url)} alt="" style={resourcesS.thumb} loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
              <div style={{ minWidth: 0 }}>
                <a href={r.url} target="_blank" rel="noreferrer" style={resourcesS.link}>{r.title}</a>
                <div style={resourcesS.meta}>{getDomain(r.url)}</div>
                {r.note && <div style={resourcesS.note}>{r.note}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
const resourcesS: Record<string, React.CSSProperties> = {
  page: { maxWidth: 820, margin: "0 auto", padding: "48px 20px 80px" },
  h2: { fontSize: 28, fontWeight: 800, color: "var(--text-heading)", marginBottom: 16 },
  p: { fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  item: { background: "var(--bg-card)", border: "1px solid var(--border-main)", borderRadius: 12, padding: "14px 16px" },
  row: { display: "flex", gap: 12, alignItems: "flex-start" },
  thumb: { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border-subtle)", background: "var(--bg-input)", flexShrink: 0 },
  link: { color: "var(--text-heading)", fontWeight: 700, textDecoration: "none", fontSize: 14 },
  meta: { marginTop: 4, fontSize: 11, color: "var(--text-muted)" },
  note: { marginTop: 6, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 },
};

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [sharedRawData, setSharedRawData] = useState<any>(null);
  const [startLocation, setStartLocation] = useState("Storrs, CT");
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8000/guess-location")
      .then(res => res.json())
      .then(data => { if (data?.location) setStartLocation(data.location); })
      .catch(() => {});
  }, []);

  function toggleTheme() {
    setIsDark(prev => {
      const next = !prev;
      document.documentElement.classList.toggle("light", !next);
      return next;
    });
  }

  function handleNewRawData(data: any) {
    setSharedRawData(data);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", color: "var(--text-primary)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Nav page={page} setPage={setPage} isDark={isDark} toggleTheme={toggleTheme} />
      {page === "home"      && <HomePage setPage={setPage} />}
      {page === "map"       && <MapPage sharedRawData={sharedRawData} startLocation={startLocation} setStartLocation={setStartLocation} onNewRawData={handleNewRawData} />}
      {page === "resources" && <ResourcesPage />}
      {page === "about"     && <AboutPage />}
    </div>
  );
}