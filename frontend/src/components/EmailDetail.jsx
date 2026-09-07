import { useState, useEffect, useRef } from "react";

function HtmlEmailViewer({ htmlContent }) {
  const iframeRef = useRef(null);
  const [iframeHeight, setIframeHeight] = useState("400px");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const cleanDoc = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <base target="_blank">
          <style>
            body {
              margin: 0;
              padding: 16px;
              font-family: Arial, Helvetica, sans-serif;
              color: #202124;
              background-color: #ffffff;
              overflow-x: auto;
              word-wrap: break-word;
            }
            img {
              max-width: 100%;
              height: auto;
            }
            table {
              max-width: 100%;
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `;

    iframe.srcdoc = cleanDoc;

    const updateHeight = () => {
      try {
        if (iframe.contentWindow && iframe.contentWindow.document.body) {
          const contentHeight = iframe.contentWindow.document.body.scrollHeight;
          if (contentHeight > 0) {
            setIframeHeight(`${Math.max(contentHeight + 30, 300)}px`);
          }
        }
      } catch (e) {
        // Ignore cross-origin measurement errors
      }
    };

    iframe.addEventListener("load", updateHeight);
    const timer = setTimeout(updateHeight, 300);

    return () => {
      iframe.removeEventListener("load", updateHeight);
      clearTimeout(timer);
    };
  }, [htmlContent]);

  return (
    <div className="html-email-container">
      <iframe
        ref={iframeRef}
        title="Email Content"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        style={{
          width: "100%",
          height: iframeHeight,
          border: "none",
          borderRadius: "8px",
          background: "#ffffff",
          display: "block"
        }}
      />
    </div>
  );
}

function EmailDetail({ emailId, onBack, onMessageRead, onEmailLoaded, onReply, onForward }) {
  const [email, setEmail] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [expandedIds, setExpandedIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");
    setEmail(null);
    setThreadMessages([]);
    setExpandedIds({});

    fetch(`http://localhost:5000/api/emails/${emailId}`)
      .then((response) => response.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.email) {
          const loadedEmail = data.email;
          setEmail(loadedEmail);
          if (onEmailLoaded) onEmailLoaded(loadedEmail);

          if (loadedEmail.unread) {
            fetch(`http://localhost:5000/api/emails/${emailId}/read`, { method: "POST" })
              .then(() => {
                if (isMounted && onMessageRead) onMessageRead();
              })
              .catch(err => console.error(err));
          }

          const threadId = loadedEmail.threadId;
          if (threadId) {
            fetch(`http://localhost:5000/api/threads/${threadId}`)
              .then(res => res.json())
              .then(threadData => {
                if (!isMounted) return;
                if (threadData.success && threadData.thread && Array.isArray(threadData.thread.messages) && threadData.thread.messages.length > 0) {
                  const msgs = threadData.thread.messages;
                  setThreadMessages(msgs);

                  // Default: expand the newest message (or the target email if found)
                  const newestMsg = msgs[msgs.length - 1];
                  const initialExpanded = {};
                  initialExpanded[newestMsg.id || emailId] = true;
                  setExpandedIds(initialExpanded);

                  // Update parent AI context to the newest/active message
                  if (onEmailLoaded) onEmailLoaded(newestMsg);
                } else {
                  setThreadMessages([loadedEmail]);
                  setExpandedIds({ [loadedEmail.id || emailId]: true });
                }
              })
              .catch(err => {
                console.error("Error fetching thread:", err);
                if (isMounted) {
                  setThreadMessages([loadedEmail]);
                  setExpandedIds({ [loadedEmail.id || emailId]: true });
                }
              });
          } else {
            setThreadMessages([loadedEmail]);
            setExpandedIds({ [loadedEmail.id || emailId]: true });
          }
        } else {
          setError(data.error || "Failed to load this email.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Cannot connect to backend");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [emailId]);

  const toggleExpand = (msg) => {
    const id = msg.id;
    setExpandedIds(prev => {
      const nextState = { ...prev, [id]: !prev[id] };
      if (!prev[id] && onEmailLoaded) {
        onEmailLoaded(msg);
      }
      return nextState;
    });
  };

  if (loading) {
    return (
      <div className="email-detail">
        <button className="back-button" onClick={onBack}>← Back</button>
        <div className="message">Loading conversation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="email-detail">
        <button className="back-button" onClick={onBack}>← Back</button>
        <div className="error">{error}</div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="email-detail">
        <button className="back-button" onClick={onBack}>← Back</button>
        <div className="message">No message body available.</div>
      </div>
    );
  }

  const messagesToRender = threadMessages.length > 0 ? threadMessages : [email];
  const mainSubject = (email && email.subject) || (messagesToRender[0] && messagesToRender[0].subject) || "(No subject)";

  return (
    <div className="email-detail">
      <button className="back-button" onClick={onBack}>← Back</button>

      <div className="email-detail-header-subject">
        <h2>{mainSubject}</h2>
        {messagesToRender.length > 1 && (
          <span className="thread-badge">{messagesToRender.length} messages</span>
        )}
      </div>

      <div className="thread-container">
        {messagesToRender.map((msg, idx) => {
          const isExpanded = !!expandedIds[msg.id];
          return (
            <div key={msg.id || idx} className={`thread-message-card ${isExpanded ? "expanded" : "collapsed"}`}>
              <div className="thread-message-header" onClick={() => toggleExpand(msg)}>
                <div className="thread-header-left">
                  <span className="thread-sender"><strong>{msg.from || "Unknown sender"}</strong></span>
                  {!isExpanded && (
                    <span className="thread-snippet-preview"> - {msg.snippet || ""}</span>
                  )}
                  {isExpanded && msg.to && (
                    <span className="thread-recipient"> to {msg.to}</span>
                  )}
                </div>
                <div className="thread-header-right">
                  <span className="thread-date">{msg.date || ""}</span>
                  <span className="thread-toggle-icon">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="thread-message-body-container">
                  <div className="email-body">
                    {msg.htmlBody && msg.htmlBody.trim().length > 0 ? (
                      <HtmlEmailViewer htmlContent={msg.htmlBody} />
                    ) : msg.body ? (
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                    ) : (
                      <div className="message">No message body available.</div>
                    )}
                  </div>

                  <div className="email-detail-actions">
                    <button 
                      className="email-action-btn reply-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onReply) onReply(msg);
                      }}
                    >
                      ↩ Reply
                    </button>
                    <button 
                      className="email-action-btn forward-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onForward) onForward(msg);
                      }}
                    >
                      ↪ Forward
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default EmailDetail;
