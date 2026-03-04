import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: string;
}

interface ChatWidgetProps {
  startLocation: string;
  onNewRawData?: (data: any) => void;
}

export default function ChatWidget({ startLocation, onNewRawData }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your disaster resilience assistant. Ask me about nearby shelters, flood risk, or evacuation routes.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, open, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/run-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          start_location: startLocation,
          mode: "Shelters nearby",
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const ct = res.headers.get("content-type");
      if (!ct?.includes("application/json")) {
        setMessages((prev) => [...prev, { role: "assistant", content: "", error: `Server error ${res.status}` }]);
        return;
      }

      const data = await res.json();
      if (data?.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: "", error: `Backend error: ${data.error}` }]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.response ?? "" }]);

      // If the response includes shelter data, bubble it up to the map
      if (data.raw_data && onNewRawData) {
        onNewRawData(data.raw_data);
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: "", error: `Request failed: ${e?.message ?? String(e)}` }]);
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

      <div style={styles.wrapper}>
        <div style={{
          ...styles.panel,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transform: open ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
        }}>
          <div style={styles.panelHeader}>
            <div style={styles.panelHeaderLeft}>
              <span style={styles.panelIcon}>⚠</span>
              <div>
                <div style={styles.panelTitle}>DisasterRoute Assistant</div>
                <div style={styles.panelSub}>Powered by DisasterRoute CT</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={styles.closeBtn}>✕</button>
          </div>

          <div style={styles.messageList}>
            {messages.map((msg, i) => (
              <div key={i} style={msg.role === "user" ? styles.userWrap : styles.assistantWrap}>
                {msg.role === "assistant" && <div style={styles.avatar}>⚠</div>}
                <div style={msg.role === "user" ? styles.userBubble : styles.assistantBubble}>
                  {msg.error
                    ? <span style={styles.errorText}>{msg.error}</span>
                    : <ReactMarkdown>{msg.content}</ReactMarkdown>
                  }
                </div>
              </div>
            ))}

            {loading && (
              <div style={styles.assistantWrap}>
                <div style={styles.avatar}>⚠</div>
                <div style={styles.assistantBubble}>
                  <div style={styles.dotsWrap}>
                    <span className="chat-dot" style={{ animationDelay: "0s" }} />
                    <span className="chat-dot" style={{ animationDelay: "0.2s" }} />
                    <span className="chat-dot" style={{ animationDelay: "0.4s" }} />
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
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.45 : 1 }}
            >
              ➤
            </button>
          </div>
          <div style={styles.hint}>Enter to send · Shift+Enter for new line</div>
        </div>

        <button onClick={() => setOpen((o) => !o)} style={styles.bubble}>
          {open ? "✕" : "💬"}
        </button>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 },
  panel: { width: 360, height: 500, background: "#13161f", border: "1px solid #2a2d3a", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.45)", transition: "opacity 0.2s ease, transform 0.2s ease", overflow: "hidden" },
  panelHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#161922", borderBottom: "1px solid #2a2d3a", flexShrink: 0 },
  panelHeaderLeft: { display: "flex", alignItems: "center", gap: 10 },
  panelIcon: { fontSize: 20, color: "#e63946" },
  panelTitle: { fontSize: 14, fontWeight: 700, color: "#fff" },
  panelSub: { fontSize: 11, color: "#7a7f94" },
  closeBtn: { background: "none", border: "none", color: "#7a7f94", fontSize: 16, cursor: "pointer", padding: 4, lineHeight: 1 },
  messageList: { flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 },
  userWrap: { display: "flex", justifyContent: "flex-end" },
  assistantWrap: { display: "flex", alignItems: "flex-start", gap: 6 },
  avatar: { width: 24, height: 24, borderRadius: "50%", background: "#e63946", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 2 },
  userBubble: { background: "#1e3a5f", borderRadius: "14px 14px 4px 14px", padding: "8px 12px", maxWidth: 240, fontSize: 13, lineHeight: 1.5, color: "#ddeeff" },
  assistantBubble: { background: "#1e2130", border: "1px solid #2a2d3a", borderRadius: "14px 14px 14px 4px", padding: "8px 12px", maxWidth: 260, fontSize: 13, lineHeight: 1.5, color: "#e8e8e8" },
  errorText: { color: "#e63946", fontSize: 12 },
  dotsWrap: { display: "flex", gap: 4, alignItems: "center", padding: "4px 2px" },
  inputArea: { display: "flex", gap: 6, padding: "10px 12px 6px", borderTop: "1px solid #2a2d3a" },
  textarea: { flex: 1, background: "#1e2130", border: "1px solid #2a2d3a", borderRadius: 8, padding: "6px 10px", color: "#e8e8e8", fontSize: 13, resize: "none", outline: "none", lineHeight: 1.5, fontFamily: "inherit" },
  sendBtn: { background: "#e63946", color: "#fff", border: "none", borderRadius: 8, width: 36, fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  hint: { padding: "2px 12px 8px", fontSize: 10, color: "#4a4f62" },
  bubble: { width: 52, height: 52, borderRadius: "50%", background: "#e63946", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 20px rgba(230,57,70,0.5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "transform 0.15s ease" },
};