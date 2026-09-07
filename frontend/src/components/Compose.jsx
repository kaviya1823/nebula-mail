import { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function Compose({ onCancel, onSuccess, draft, setDraft }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!draft.to.trim() || !draft.subject.trim() || !draft.body.trim()) {
      setError("Please fill out To, Subject, and Body fields.");
      return;
    }

    // Invalid email validation
    if (!draft.to.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    setSending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/emails/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(draft)
      });

      const data = await response.json();

      if (data.success) {
        setSending(false);
        if (onSuccess) onSuccess();
      } else {
        setError(data.error || "Failed to send email.");
        setSending(false);
      }
    } catch (err) {
      setError("Cannot connect to backend to send email.");
      setSending(false);
    }
  };

  return (
    <div className="compose-view">
      <div className="compose-header">
        <h2>{draft?.draftId ? "Edit Draft" : "New Message"}</h2>
      </div>

      {error && <div className="error compose-error">{error}</div>}

      <div className="compose-form">
        <div className="form-group">
          <label>To:</label>
          <input
            type="email"
            value={draft?.to || ""}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            placeholder="recipient@example.com"
            disabled={sending}
          />
        </div>

        <div className="form-group">
          <label>Subject:</label>
          <input
            type="text"
            value={draft?.subject || ""}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Subject"
            disabled={sending}
          />
        </div>

        <div className="form-group body-group">
          <textarea
            value={draft?.body || ""}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="Write your message here..."
            disabled={sending}
          />
        </div>

        <div className="compose-actions">
          <button className="send-btn" onClick={handleSend} disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </button>
          <button className="cancel-btn" onClick={onCancel} disabled={sending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default Compose;
