import { useState } from "react";

export default function SentinelChat() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!message.trim()) return;

    const userMessage = { role: "user", content: message };
    setChat((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/sphinx/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: message }),
      });

      const data = await response.json();

      setChat((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    } catch (error) {
      setChat((prev) => [
        ...prev,
        { role: "assistant", content: "Error contacting Sentinel." },
      ]);
    }

    setMessage("");
    setLoading(false);
  };

  return (
    <>
      {/* Floating Button */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          backgroundColor: "#1e3a8a",
          color: "white",
          padding: "12px 16px",
          borderRadius: "50%",
          cursor: "pointer",
          fontSize: "20px",
          zIndex: 1000,
        }}
      >
        🛰️
      </div>

      {/* Chat Window */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            right: "20px",
            width: "320px",
            height: "420px",
            backgroundColor: "white",
            borderRadius: "10px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "#1e3a8a",
              color: "white",
              padding: "10px",
              borderTopLeftRadius: "10px",
              borderTopRightRadius: "10px",
              fontWeight: "bold",
            }}
          >
            Sentinel AI
          </div>

          <div
            style={{
              flex: 1,
              padding: "10px",
              overflowY: "auto",
              fontSize: "14px",
            }}
          >
            {chat.map((msg, index) => (
              <div
                key={index}
                style={{
                  marginBottom: "8px",
                  textAlign: msg.role === "user" ? "right" : "left",
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    borderRadius: "8px",
                    backgroundColor:
                      msg.role === "user" ? "#e5e7eb" : "#dbeafe",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && <div>Sentinel analyzing...</div>}
          </div>

          <div style={{ display: "flex", padding: "8px" }}>
            <input
              style={{ flex: 1, padding: "6px" }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about funding gaps..."
            />
            <button
              onClick={sendMessage}
              style={{
                marginLeft: "6px",
                padding: "6px 10px",
                backgroundColor: "#1e3a8a",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}