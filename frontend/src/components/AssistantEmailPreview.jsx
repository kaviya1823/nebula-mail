import React from "react";

/**
 * Formats a raw date string into a compact readable date for the narrow assistant panel
 * (e.g., "Sep 5, 2026").
 */
function formatDateCompact(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  } catch (e) {
    // Ignore date parse errors
  }
  // Fallback: strip timezone off raw RFC string
  return dateStr.replace(/([+-]\d{4}|\([A-Z]+\))/g, "").trim().slice(0, 16);
}

/**
 * Safely strips HTML tags, <style> and <script> contents, decodes HTML entities,
 * and normalizes whitespace into clean, human-readable plain text.
 */
function cleanTextPreview(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;

  // 1. Remove <style>...</style> blocks completely
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // 2. Remove <script>...</script> blocks completely
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, " ");

  // 3. Remove all other HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  // 4. Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"');

  // 5. Normalize excessive whitespace while preserving single spaces
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Renders a compact, Gmail-like rich preview card for an email inside the assistant panel.
 * 
 * Props:
 *  - email: object containing { id, from, to, subject, date, body, snippet }
 *  - onOpenEmail: function(id) to trigger email opening in the main UI view
 */
export default function AssistantEmailPreview({ email, onOpenEmail }) {
  if (!email) return null;

  // Sender extraction (support from, sender, fromName, fromEmail)
  const rawSender = email.from || email.sender || email.fromName || email.fromEmail;
  const senderDisplay = (rawSender && typeof rawSender === "string" && rawSender.trim()) 
    ? rawSender.trim() 
    : "Unknown sender";

  // Recipient extraction
  const rawRecipient = email.to || email.recipient;
  const recipientDisplay = (rawRecipient && typeof rawRecipient === "string" && rawRecipient.trim()) 
    ? rawRecipient.trim() 
    : null;

  // Subject extraction
  const rawSubject = email.subject;
  const subjectDisplay = (rawSubject && typeof rawSubject === "string" && rawSubject.trim()) 
    ? rawSubject.trim() 
    : "(No subject)";

  // Compact Date extraction
  const dateDisplay = formatDateCompact(email.date);

  // Clean body preview extraction
  const rawBody = email.readableBody || email.snippet || email.body || "";
  const cleanBody = cleanTextPreview(rawBody);

  const previewText = cleanBody.length > 140
    ? cleanBody.substring(0, 140) + "..."
    : cleanBody;

  return (
    <div className="assistant-email-card">
      <div className="assistant-email-card-header">
        <div className="assistant-email-card-sender" title={senderDisplay}>
          <span className="card-label">From:</span> {senderDisplay}
        </div>
        {dateDisplay && (
          <div className="assistant-email-card-date">{dateDisplay}</div>
        )}
      </div>

      {recipientDisplay && (
        <div className="assistant-email-card-recipient" title={recipientDisplay}>
          <span className="card-label">To:</span> {recipientDisplay}
        </div>
      )}

      <div className="assistant-email-card-subject" title={subjectDisplay}>
        <span className="card-label">Subject:</span> {subjectDisplay}
      </div>

      {previewText && (
        <div className="assistant-email-card-body">
          {previewText}
        </div>
      )}

      {email.id && onOpenEmail && (
        <div className="assistant-email-card-actions">
          <button
            type="button"
            className="assistant-email-card-open-btn"
            onClick={() => onOpenEmail(email.id)}
          >
            Open Email
          </button>
        </div>
      )}
    </div>
  );
}
