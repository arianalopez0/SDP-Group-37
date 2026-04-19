import { Fragment, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";

type Coord = [number, number];

interface Shelter {
  name: string; address: string; city: string; state: string; zip: string;
  status: string; lat: number; lon: number;
  straightline_distance_miles?: number | null;
  handicap_accessible?: string | null;
  route?: any;
}

interface TextMessage {
  role: "user" | "assistant";
  type?: "text";
  content: string;
  error?: string;
}

interface MapMessage {
  role: "assistant";
  type: "map";
  center: Coord;
  shelters: Shelter[];
}

type Message = TextMessage | MapMessage;

interface ChatWidgetProps {
  startLocation: string;
  onNewRawData?: (data: any) => void;
}

const markerColors = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#8338ec"];

function getCenter(data: any): Coord | null {
  const src = data?.user_location ?? data?.input_location;
  if (src?.lat == null || src?.lon == null) return null;
  return [src.lat, src.lon];
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
  const pts = coords
    .filter((c: any) => Array.isArray(c) && c.length === 2)
    .map((c: any) => [c[0], c[1]] as Coord);
  return userCoord ? [userCoord, ...pts] : pts;
}

// Small inline map rendered as a chat bubble
function InlineMap({ center, shelters }: { center: Coord; shelters: Shelter[] }) {
  return (
    <div style={styles.mapBubble}>
      <div style={styles.mapLabel}>
        <span style={{ color: "#e63946" }}>🗺</span>
        <span>{shelters.length} shelter{shelters.length !== 1 ? "s" : ""} near you</span>
      </div>
      <div style={styles.mapContainer}>
        <style>{`
          .leaflet-container { background: #e8e0d8 !important; border-radius: 10px; }
          .leaflet-control-attribution { font-size: 8px !important; opacity: 0.35 !important; }
          .leaflet-control-zoom a { background: #1e2130 !important; color: #e8e8e8 !important; border-color: #2a2d3a !important; }
          .leaflet-control-zoom a:hover { background: #2a2d3a !important; }
        `}</style>
        <MapContainer
          center={center}
          zoom={12}
          style={{ width: "100%", height: "100%", borderRadius: 10 }}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {/* User location dot */}
          <Marker
            position={center}
            icon={L.divIcon({
              className: "",
              html: `<div style="background:#1a86e8;border:3px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 3px rgba(26,134,232,0.35)"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            })}
          >
            <Popup><strong>📍 You are here</strong></Popup>
          </Marker>

          {shelters.map((s, idx) => {
            const pos: Coord = [s.lat, s.lon];
            const route = getRoute(s, center);
            const color = markerColors[idx % markerColors.length];
            return (
              <Fragment key={idx}>
                <Marker
                  position={pos}
                  icon={L.divIcon({
                    className: "",
                    html: `<div style="background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;width:16px;height:16px;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);display:block;text-align:center;font-size:8px;line-height:16px;color:#fff;font-weight:700">${idx + 1}</span></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 16],
                  })}
                >
                  <Popup>
                    <strong>{s.name}</strong><br />
                    {s.address}, {s.city}<br />
                    <span style={{ color: s.status === "OPEN" ? "#2a9d8f" : "#e63946" }}>{s.status}</span>
                    {s.straightline_distance_miles != null && <><br />{s.straightline_distance_miles} mi away</>}
                  </Popup>
                  <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
                    <span style={{ fontSize: 11 }}><strong>#{idx + 1}</strong> {s.name}</span>
                  </Tooltip>
                </Marker>
                {route && (
                  <Polyline
                    positions={route}
                    color={color}
                    weight={idx === 0 ? 4 : 2.5}
                    opacity={idx === 0 ? 0.9 : 0.5}
                    dashArray={idx === 0 ? undefined : "7 5"}
                  />
                )}
              </Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

export default function ChatWidget({ startLocation, onNewRawData }: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      type: "text",
      content: "Hi! I'm your disaster resilience assistant. Ask me about nearby shelters, flood risk, or evacuation routes.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const loadingMessages = ["Thinking...", "Analyzing your question...", "Pulling together a response...", "Almost there..."];
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) { setLoadingMsgIdx(0); return; }
    const interval = setInterval(() => {
      setLoadingMsgIdx(prev => (prev + 1) % loadingMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [loading]);

  function stopQuery() {
    abortRef.current?.abort();
    setLoading(false);
    setMessages(prev => [...prev, { role: "assistant", type: "text", content: "", error: "Query cancelled." }]);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", type: "text", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      abortRef.current = new AbortController();
      const res = await fetch("http://localhost:8000/run-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          start_location: startLocation,
          mode: "Shelters nearby",
          history: messages
            .filter((m): m is TextMessage => !m.type || m.type === "text")
            .map((m) => ({ role: m.role, content: (m as TextMessage).content })),
        }),
        signal: abortRef.current.signal,
      });

      const ct = res.headers.get("content-type");
      if (!ct?.includes("application/json")) {
        setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "", error: `Server error ${res.status}` }]);
        return;
      }

      const data = await res.json();
      if (data?.error) {
        setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "", error: `Backend error: ${data.error}` }]);
        return;
      }

      // Add text response
      const nextMessages: Message[] = [
        ...newMessages,
        { role: "assistant", type: "text", content: data.response ?? "" },
      ];

      // If there's shelter data, append an inline map message
      if (data.raw_data) {
        const center = getCenter(data.raw_data);
        const shelters = getShelters(data.raw_data);
        if (center && shelters.length > 0) {
          nextMessages.push({ role: "assistant", type: "map", center, shelters });
        }
        if (onNewRawData) onNewRawData(data.raw_data);
      }

      setMessages(nextMessages);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMessages((prev) => [...prev, { role: "assistant", type: "text", content: "", error: `Request failed: ${e?.message ?? String(e)}` }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <>
      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .chat-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #7a7f94; display: inline-block;
          animation: chatBounce 1.2s infinite ease-in-out;
        }
      `}</style>

      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.headerIcon}>⚠</span>
          <div>
            <div style={styles.headerTitle}>DisasterRoute Assistant</div>
            <div style={styles.headerSub}>Ask about shelters, routes, flood risk, or emergency preparedness</div>
          </div>
        </div>

        <div style={styles.messageList}>
          {messages.map((msg, i) => {
            // Inline map bubble
            if (msg.type === "map") {
              return (
                <div key={i} style={{ ...styles.assistantWrap }}>
                  <div style={styles.avatar}>⚠</div>
                  <InlineMap center={(msg as MapMessage).center} shelters={(msg as MapMessage).shelters} />
                </div>
              );
            }

            // Regular text bubble
            const textMsg = msg as TextMessage;
            return (
              <div key={i} style={textMsg.role === "user" ? styles.userWrap : styles.assistantWrap}>
                {textMsg.role === "assistant" && <div style={styles.avatar}>⚠</div>}
                <div style={textMsg.role === "user" ? styles.userBubble : styles.assistantBubble}>
                  {textMsg.error
                    ? <span style={styles.errorText}>{textMsg.error}</span>
                    : <ReactMarkdown>{textMsg.content}</ReactMarkdown>
                  }
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={styles.assistantWrap}>
              <div style={styles.avatar}>⚠</div>
              <div style={styles.assistantBubble}>
                <div style={styles.dotsWrap}>
                  <span className="chat-dot" style={{ animationDelay: "0s" }} />
                  <span className="chat-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="chat-dot" style={{ animationDelay: "0.4s" }} />
                </div>
                <div style={{ fontSize: 11, color: "#4a4f62", marginTop: 6, fontStyle: "italic" }}>
                  {loadingMessages[loadingMsgIdx]}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={styles.inputArea}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about shelters or routes..."
            rows={2}
            style={styles.textarea}
          />
          {loading ? (
            <button onClick={stopQuery} style={{ ...styles.sendBtn, background: "#2a2d3a", fontSize: 14 }}>■</button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              style={{ ...styles.sendBtn, opacity: !input.trim() ? 0.45 : 1 }}
            >
              ➤
            </button>
          )}
        </div>
        <div style={styles.hint}>Enter to send · Shift+Enter for new line</div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: { display: "flex", flexDirection: "column", height: "100%", background: "#0a0c14" },
  header: { display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "#0d0f17", borderBottom: "1px solid #1e2130", flexShrink: 0 },
  headerIcon: { fontSize: 20, color: "#e63946" },
  headerTitle: { fontSize: 14, fontWeight: 700, color: "#fff" },
  headerSub: { fontSize: 11, color: "#7a7f94" },
  messageList: { flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 },
  userWrap: { display: "flex", justifyContent: "flex-end", width: "100%" },
  assistantWrap: { display: "flex", alignItems: "flex-start", gap: 6, width: "100%" },
  avatar: { width: 24, height: 24, borderRadius: "50%", background: "#e63946", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 2 },
  userBubble: { background: "#1e3a5f", borderRadius: "14px 14px 4px 14px", padding: "10px 14px", maxWidth: "60%", fontSize: 13, lineHeight: 1.5, color: "#ddeeff" },
  assistantBubble: { background: "#1e2130", border: "1px solid #2a2d3a", borderRadius: "14px 14px 14px 4px", padding: "10px 14px", maxWidth: "75%", fontSize: 13, lineHeight: 1.5, color: "#e8e8e8" },
  errorText: { color: "#e63946", fontSize: 12 },
  dotsWrap: { display: "flex", gap: 4, alignItems: "center", padding: "4px 2px" },
  inputArea: { display: "flex", gap: 6, padding: "10px 12px 6px", borderTop: "1px solid #1e2130", background: "#0d0f17", flexShrink: 0 },
  textarea: { flex: 1, background: "#1e2130", border: "1px solid #2a2d3a", borderRadius: 8, padding: "6px 10px", color: "#e8e8e8", fontSize: 13, resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit" },
  sendBtn: { background: "#e63946", color: "#fff", border: "none", borderRadius: 8, width: 36, fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  hint: { padding: "2px 12px 8px", fontSize: 10, color: "#4a4f62", background: "#0d0f17" },
  // Map bubble styles
  mapBubble: { background: "#13161f", border: "1px solid #2a2d3a", borderRadius: "14px 14px 14px 4px", padding: "10px", maxWidth: "82%", width: "82%" },
  mapLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9aa0b8", fontWeight: 600, marginBottom: 8 },
  mapContainer: { width: "100%", height: 240, borderRadius: 10, overflow: "hidden" },
};