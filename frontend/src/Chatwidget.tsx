/**
 * ChatWidget.tsx — Conversational chat interface for DisasterRoute CT
 *
 * Responsibilities:
 *  - Renders the full-page chat UI (message list + input bar)
 *  - POSTs user queries to the FastAPI backend at /run-query
 *  - Parses backend responses into text and map message types
 *  - Renders an inline Leaflet map (InlineMap) when shelter data is returned
 *  - Lifts raw backend data upward via onNewRawData for the sidebar in App/MapPage
 *  - Supports query cancellation via AbortController
 *
 * Message types:
 *  - TextMessage : regular assistant/user chat bubbles (rendered with ReactMarkdown)
 *  - MapMessage  : inline Leaflet map bubble auto-injected after shelter results
 */

import { Fragment, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";

// ── Types ─────────────────────────────────────────────────────────────────────

/** [latitude, longitude] tuple used by Leaflet. */
type Coord = [number, number];

/**
 * A single shelter as returned in backend raw_data.
 * Two possible shapes are normalised by getShelters() — see that function.
 */
interface Shelter {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;        // "OPEN" | "CLOSED" | etc.
  lat: number;
  lon: number;
  straightline_distance_miles?: number | null;
  handicap_accessible?: string | null; // "Yes" | "No" | null
  route?: any;           // Routing agent payload — see getRoute()
}

/** A plain text message from either the user or the assistant. */
interface TextMessage {
  role: "user" | "assistant";
  type?: "text";
  content: string;
  error?: string; // Set on network/backend errors; replaces content in the bubble
}

/**
 * A synthetic assistant message that renders an inline Leaflet map.
 * Injected into the message list automatically when shelter data is present
 * in the backend response.
 */
interface MapMessage {
  role: "assistant";
  type: "map";
  center: Coord;
  shelters: Shelter[];
}

/** Union of all message types rendered in the message list. */
type Message = TextMessage | MapMessage;

/** Props accepted by the ChatWidget component. */
interface ChatWidgetProps {
  /** Human-readable location string passed to /run-query as start_location. */
  startLocation: string;
  /** Called with raw_data from the backend response so App/MapPage can update the sidebar. */
  onNewRawData?: (data: any) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Cycling colour palette — one colour per shelter marker/route. */
const markerColors = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#8338ec"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simple chat bubble icon used in the header and assistant avatar. */
const ChatIcon = ({ size, color }: { size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
  </svg>
);

/**
 * Extract the user's coordinates from the backend raw_data response.
 *
 * The backend may return the position under either key depending on which agent
 * handled the query:
 *  - user_location  (orchestration / shelter-lookup agent)
 *  - input_location (routing agent)
 *
 * Returns null if neither key is present or the coords are missing.
 */
function getCenter(data: any): Coord | null {
  const src = data?.user_location ?? data?.input_location;
  if (src?.lat == null || src?.lon == null) return null;
  return [src.lat, src.lon];
}

/**
 * Normalise shelter data from two possible backend response shapes:
 *
 *  Shape A — orchestration / "closest shelters" path:
 *    { nearest_shelters: [{ lat, lon, name, ... }] }
 *
 *  Shape B — routing agent path:
 *    { shelters: [{ location: { lat, lon }, name, ... }] }
 *
 * Filters out any entries that lack valid lat/lon before returning.
 */
function getShelters(data: any): Shelter[] {
  if (!data) return [];

  // Shape A — flat lat/lon on each object
  if (Array.isArray(data.nearest_shelters)) {
    return data.nearest_shelters.filter((s: any) => s.lat != null && s.lon != null);
  }

  // Shape B — lat/lon nested under shelter.location
  if (Array.isArray(data.shelters)) {
    return data.shelters
      .filter((s: any) => s.location?.lat != null && s.location?.lon != null)
      .map((s: any) => ({
        name: s.name,
        address: s.address,
        city: s.city,
        state: s.state,
        zip: s.zip,
        status: s.status,
        lat: s.location.lat,
        lon: s.location.lon,
        straightline_distance_miles: s.straightline_distance_miles ?? null,
        handicap_accessible: s.handicap_accessible ?? null,
        route: s.route ?? null,
      }));
  }

  return [];
}

/**
 * Build a Leaflet polyline path from a shelter's routing agent payload.
 *
 * The routing agent stores route waypoints in shelter.route.path_coordinates
 * as an array of [lat, lon] pairs. We prepend the user's position so the
 * rendered line starts at their location.
 *
 * IMPORTANT: An earlier bug in llm.py caused the routing agent to send a
 * coordinate *count* integer instead of the actual array. The Array.isArray
 * guard below protects against that regression.
 *
 * Returns null if the shelter has no valid route data.
 */
function getRoute(shelter: Shelter, userCoord?: Coord): Coord[] | null {
  const coords = shelter.route?.path_coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;

  const pts = coords
    .filter((c: any) => Array.isArray(c) && c.length === 2)
    .map((c: any) => [c[0], c[1]] as Coord);

  return userCoord ? [userCoord, ...pts] : pts;
}

// ── Responsive hook ───────────────────────────────────────────────────────────

/**
 * Returns true when the viewport width is ≤ 768 px.
 * Updates reactively on window resize.
 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ── InlineMap ─────────────────────────────────────────────────────────────────

/**
 * Compact Leaflet map rendered as an assistant chat bubble.
 * Automatically injected into the message list whenever the backend
 * returns shelter data with a valid center coordinate.
 *
 * Features:
 *  - Blue dot for the user's position
 *  - Numbered teardrop markers for each shelter (colour-coded)
 *  - Dashed polyline routes where available (solid + thicker for shelter #0)
 */
function InlineMap({ center, shelters }: { center: Coord; shelters: Shelter[] }) {
  const isMobile = useIsMobile();

  return (
    <div style={{ ...styles.mapBubble, width: isMobile ? "95%" : "82%", maxWidth: isMobile ? "95%" : "82%" }}>
      <div style={styles.mapLabel}>
        <span style={{ color: "var(--accent)" }}>🗺</span>
        <span>{shelters.length} shelter{shelters.length !== 1 ? "s" : ""} near you</span>
      </div>

      <div style={{ ...styles.mapContainer, height: isMobile ? 200 : 240 }}>
        {/* Leaflet theme overrides scoped to this inline map instance */}
        <style>{`
          .inline-map .leaflet-container { background: #e8e0d8 !important; border-radius: 10px; }
          .inline-map .leaflet-control-attribution { font-size: 8px !important; opacity: 0.35 !important; }
          .inline-map .leaflet-control-zoom a { background: var(--bg-input) !important; color: var(--text-primary) !important; border-color: var(--border-subtle) !important; }
          .inline-map .leaflet-control-zoom a:hover { background: var(--border-subtle) !important; }
        `}</style>

        <div className="inline-map" style={{ width: "100%", height: "100%" }}>
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

            {/* Blue pulsing dot — user's position */}
            <Marker position={center} icon={L.divIcon({
              className: "",
              html: `<div style="background:#1a86e8;border:3px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 3px rgba(26,134,232,0.35)"></div>`,
              iconSize: [14, 14], iconAnchor: [7, 7],
            })}>
              <Popup><strong>📍 You are here</strong></Popup>
            </Marker>

            {/* Shelter markers + optional route polylines */}
            {shelters.map((s, idx) => {
              const pos: Coord = [s.lat, s.lon];
              const route = getRoute(s, center);
              const color = markerColors[idx % markerColors.length];

              return (
                <Fragment key={idx}>
                  {/* Teardrop marker rotated -45° with index number inside */}
                  <Marker position={pos} icon={L.divIcon({
                    className: "",
                    html: `<div style="background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;width:16px;height:16px;transform:rotate(-45deg);box-shadow:0 2px 5px rgba(0,0,0,0.4)"><span style="transform:rotate(45deg);display:block;text-align:center;font-size:8px;line-height:16px;color:#fff;font-weight:700">${idx + 1}</span></div>`,
                    iconSize: [16, 16], iconAnchor: [8, 16],
                  })}>
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

                  {/* Route polyline — solid & thick for closest shelter, dashed for others */}
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
    </div>
  );
}

// ── ChatWidget ────────────────────────────────────────────────────────────────

/**
 * Main chat component. Handles the full send → receive → render cycle.
 *
 * State:
 *  messages       — ordered list of TextMessage and MapMessage objects
 *  input          — current textarea value
 *  loading        — true while awaiting a backend response
 *  loadingMsgIdx  — cycles through loading hint strings every 4 s
 *
 * Refs:
 *  bottomRef  — scrolled into view after each message update
 *  inputRef   — focused after each response to keep keyboard active
 *  abortRef   — holds the current AbortController for in-flight requests
 */
export default function ChatWidget({ startLocation, onNewRawData }: ChatWidgetProps) {
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      type: "text",
      content: "Hi! I'm your disaster resilience assistant. Ask me about nearby shelters, flood risk, evacuation routes, or emergency preparedness.",
    },
  ]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  /** Rotating hints shown in the loading bubble while waiting for a response. */
  const loadingMessages = [
    "Thinking...",
    "Analyzing your question...",
    "Pulling together a response...",
    "Almost there...",
  ];

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  /**
   * AbortController ref — replaced on each new request.
   * Calling abortRef.current.abort() cancels the in-flight fetch
   * and triggers the AbortError catch branch in sendMessage().
   */
  const abortRef = useRef<AbortController | null>(null);

  // Scroll to bottom and refocus input after any message or loading state change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [messages, loading]);

  // Cycle through loading hint strings every 4 s while a request is in flight
  useEffect(() => {
    if (!loading) { setLoadingMsgIdx(0); return; }
    const interval = setInterval(() => {
      setLoadingMsgIdx((prev) => (prev + 1) % loadingMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [loading]);

  /**
   * Cancel the current in-flight request.
   * Aborts the fetch, resets loading state, and appends a cancellation notice.
   */
  function stopQuery() {
    abortRef.current?.abort();
    setLoading(false);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", type: "text", content: "", error: "Query cancelled." },
    ]);
  }

  /**
   * Send the current input to the backend and process the response.
   *
   * Request body sent to POST /run-query:
   *  - query          : the user's message text
   *  - start_location : passed in from App via props (GPS / IP detected)
   *  - mode           : fixed to "Shelters nearby" (backend uses this for routing)
   *  - history        : prior TextMessage turns only — MapMessage bubbles are
   *                     excluded because the backend expects plain text history,
   *                     not frontend-only map objects
   *
   * Response handling:
   *  1. Append assistant text bubble from data.response
   *  2. If data.raw_data contains a valid center + shelters, append a MapMessage
   *  3. Call onNewRawData(data.raw_data) to update the App sidebar
   */
  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    // Optimistically append the user's message
    const newMessages: Message[] = [...messages, { role: "user", type: "text", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Create a fresh AbortController for this request
      abortRef.current = new AbortController();

      const res = await fetch("http://localhost:8000/run-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          start_location: startLocation,
          mode: "Shelters nearby",
          // Filter to TextMessage only — MapMessage is a frontend-only type
          history: messages
            .filter((m): m is TextMessage => !m.type || m.type === "text")
            .map((m) => ({ role: m.role, content: (m as TextMessage).content })),
        }),
        signal: abortRef.current.signal,
      });

      // Guard against non-JSON responses (e.g. 502 from Azure, unhandled 500s)
      const ct = res.headers.get("content-type");
      if (!ct?.includes("application/json")) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "text", content: "", error: `Server error ${res.status}` },
        ]);
        return;
      }

      const data = await res.json();

      // Backend-level error (e.g. agent orchestration failure)
      if (data?.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "text", content: "", error: `Backend error: ${data.error}` },
        ]);
        return;
      }

      // Build the next message list starting with the assistant text reply
      const nextMessages: Message[] = [
        ...newMessages,
        { role: "assistant", type: "text", content: data.response ?? "" },
      ];

      // If the response includes shelter data, inject an inline map bubble
      if (data.raw_data) {
        const center   = getCenter(data.raw_data);
        const shelters = getShelters(data.raw_data);
        if (center && shelters.length > 0) {
          nextMessages.push({ role: "assistant", type: "map", center, shelters });
        }
        // Lift raw data to App so the sidebar can render shelter cards
        onNewRawData?.(data.raw_data);
      }

      setMessages(nextMessages);
    } catch (e: any) {
      // AbortError is expected when the user clicks the stop button — ignore silently
      if (e?.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", type: "text", content: "", error: `Request failed: ${e?.message ?? String(e)}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  /** Submit on Enter; Shift+Enter inserts a newline. */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  }

  // Max widths for bubbles — tighter on mobile to avoid overflowing narrow screens
  const userBubbleMax = isMobile ? "85%" : "75%";
  const asstBubbleMax = isMobile ? "90%" : "88%";

  // Show the empty hero state when only the initial greeting exists
  const isInitial = messages.length === 1 && messages[0].role === "assistant" && !loading;

  return (
    <>
      {/* Bouncing dot animation for the loading indicator */}
      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .chat-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--text-muted); display: inline-block;
          animation: chatBounce 1.2s infinite ease-in-out;
        }
      `}</style>

      <div style={styles.panel}>
        {/* ── Header ── */}
        <div style={styles.header}>
          <ChatIcon size={28} color="#2a9d8f" />
          <div>
            <div style={styles.headerTitle}>DisasterRoute Assistant</div>
            {!isMobile && (
              <div style={styles.headerSub}>Ask about shelters, routes, flood risk, or emergency preparedness</div>
            )}
          </div>
        </div>

        {/* ── Message list ── */}
        <div style={styles.messageList}>
          {isInitial ? (
            /* Empty / hero state — shown before the first query */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 20, padding: "60px 20px" }}>
              <span style={{ fontSize: 64, color: "var(--accent)" }}>⚠</span>
              <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text-heading)" }}>How can I help you?</div>
              <div style={{ fontSize: 17, color: "var(--text-muted)", textAlign: "center", maxWidth: 500, lineHeight: 1.6 }}>
                Ask about nearby shelters, evacuation routes, flood risk, or emergency preparedness.
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                /* ── Map bubble ── */
                if (msg.type === "map") {
                  return (
                    <div key={i} style={styles.assistantWrap}>
                      <div style={styles.avatar}><ChatIcon size={13} color="#fff" /></div>
                      <InlineMap center={(msg as MapMessage).center} shelters={(msg as MapMessage).shelters} />
                    </div>
                  );
                }

                /* ── Text bubble (user or assistant) ── */
                const textMsg = msg as TextMessage;
                return (
                  <div key={i} style={textMsg.role === "user" ? styles.userWrap : styles.assistantWrap}>
                    {textMsg.role === "assistant" && (
                      <div style={styles.avatar}><ChatIcon size={13} color="#fff" /></div>
                    )}
                    <div style={{
                      ...(textMsg.role === "user" ? styles.userBubble : styles.assistantBubble),
                      maxWidth: textMsg.role === "user" ? userBubbleMax : asstBubbleMax,
                    }}>
                      {/* Show error text in accent colour, or render Markdown for normal content */}
                      {textMsg.error
                        ? <span style={styles.errorText}>{textMsg.error}</span>
                        : <ReactMarkdown>{textMsg.content}</ReactMarkdown>
                      }
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Loading bubble ── */}
          {loading && (
            <div style={styles.assistantWrap}>
              <div style={styles.avatar}><ChatIcon size={13} color="#fff" /></div>
              <div style={{ ...styles.assistantBubble, maxWidth: asstBubbleMax }}>
                {/* Three bouncing dots */}
                <div style={styles.dotsWrap}>
                  <span className="chat-dot" style={{ animationDelay: "0s" }} />
                  <span className="chat-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="chat-dot" style={{ animationDelay: "0.4s" }} />
                </div>
                {/* Rotating hint text below the dots */}
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6, fontStyle: "italic" }}>
                  {loadingMessages[loadingMsgIdx]}
                </div>
              </div>
            </div>
          )}

          {/* Invisible scroll anchor — scrolled into view after each update */}
          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <div style={styles.inputArea}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about shelters or routes..."
            rows={isMobile ? 1 : 3}
            style={styles.textarea}
          />
          {/* Stop button replaces send button while a request is in flight */}
          {loading ? (
            <button onClick={stopQuery} style={{ ...styles.sendBtn, background: "var(--bg-input)", fontSize: 14 }}>■</button>
          ) : (
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              style={{ ...styles.sendBtn, opacity: !input.trim() ? 0.45 : 1 }}
            >
              ➤
            </button>
          )}
        </div>

        {/* Keyboard hint — desktop only */}
        {!isMobile && <div style={styles.hint}>Enter to send · Shift+Enter for new line</div>}
      </div>
    </>
  );
}

// ── Style tokens ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel:          { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-page)" },
  header:         { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--bg-nav)", borderBottom: "1px solid var(--border-main)", flexShrink: 0 },
  headerIcon:     { fontSize: 20, color: "var(--accent)" },
  headerTitle:    { fontSize: 18, fontWeight: 700, color: "var(--text-heading)" },
  headerSub:      { fontSize: 15, color: "var(--text-muted)" },
  messageList:    { flex: 1, overflowY: "auto", padding: "20px 20px", display: "flex", flexDirection: "column", gap: 14 },
  userWrap:       { display: "flex", justifyContent: "flex-end", width: "100%" },
  assistantWrap:  { display: "flex", alignItems: "flex-start", gap: 6, width: "100%" },
  avatar:         { width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 },
  userBubble:     { background: "var(--bg-bubble-user)", border: "1px solid var(--border-bubble-user)", borderRadius: "14px 14px 4px 14px", padding: "10px 14px", maxWidth: "60%", fontSize: 15, lineHeight: 1.5, color: "var(--text-user-bubble)" },
  assistantBubble:{ background: "var(--bg-bubble-asst)", border: "1px solid var(--border-bubble-asst)", borderRadius: "14px 14px 14px 4px", padding: "10px 14px", maxWidth: "75%", fontSize: 15, lineHeight: 1.5, color: "var(--text-primary)" },
  errorText:      { color: "var(--accent)", fontSize: 12 },
  dotsWrap:       { display: "flex", gap: 4, alignItems: "center", padding: "4px 2px" },
  inputArea:      { display: "flex", gap: 6, padding: "12px 16px 10px", borderTop: "1px solid var(--border-main)", background: "var(--bg-nav)", flexShrink: 0 },
  textarea:       { flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "10px 14px", color: "var(--text-primary)", fontSize: 16, resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit" },
  sendBtn:        { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, width: 44, fontSize: 18, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  hint:           { padding: "2px 12px 8px", fontSize: 10, color: "var(--text-faint)", background: "var(--bg-nav)" },
  mapBubble:      { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "14px 14px 14px 4px", padding: "10px", maxWidth: "82%", width: "82%" },
  mapLabel:       { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-map-label)", fontWeight: 600, marginBottom: 8 },
  mapContainer:   { width: "100%", height: 240, borderRadius: 10, overflow: "hidden" },
};
