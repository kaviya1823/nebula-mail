import { useEffect, useState, useCallback, useRef } from "react";
import "./App.css";
import EmailDetail from "./components/EmailDetail";
import EmailList from "./components/EmailList";
import Compose from "./components/Compose";
import AssistantEmailPreview from "./components/AssistantEmailPreview";
import { actionRegistry } from "./assistant/assistantActions";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("nebula-theme") || "light");
  
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("nebula-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "light" ? "dark" : "light");

  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);

  const [currentView, setCurrentView] = useState("inbox");
  const [currentEmailId, setCurrentEmailId] = useState(null);
  const [currentEmail, setCurrentEmail] = useState(null);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [previousView, setPreviousView] = useState("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("primary");
  const [loadedViewKey, setLoadedViewKey] = useState("");
  const [moreSidebarExpanded, setMoreSidebarExpanded] = useState(false);
  
  const [composeDraft, setComposeDraft] = useState({ to: "", subject: "", body: "" });
  const [pendingSend, setPendingSend] = useState(false);

  // Assistant state
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);

  // Maintain refs to current state for the assistant context & fetch tracking
  const stateRef = useRef({ currentView, currentEmailId, currentEmail, previousView, composeDraft });
  const emailsRef = useRef(emails);
  const currentFetchIdRef = useRef(0);

  useEffect(() => {
    stateRef.current = { currentView, currentEmailId, currentEmail, previousView, composeDraft };
  }, [currentView, currentEmailId, currentEmail, previousView, composeDraft]);

  useEffect(() => {
    emailsRef.current = emails;
  }, [emails]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/unread-count`);
      const data = await res.json();
      if (data.success) setUnreadCount(data.count);
    } catch (err) {
      console.error("Failed to fetch unread count", err);
    }
  }, []);

  const fetchEmails = useCallback(async (view, pageToken = null, isBackground = false, category = null) => {
    if (view !== "inbox" && view !== "sent" && view !== "drafts") return;
    
    const requestId = ++currentFetchIdRef.current;
    
    if (!isBackground) {
      setLoading(true);
      if (!pageToken) {
        setError("");
        setEmails([]);
      }
    }
    
    try {
      let url = `${API_BASE_URL}/api/emails/${view}`;
      const catToUse = category || activeCategory;
      if (view === "inbox" && catToUse && catToUse !== "primary") {
        url += `?category=${encodeURIComponent(catToUse)}`;
        if (pageToken) url += `&pageToken=${pageToken}`;
      } else if (pageToken) {
        url += `?pageToken=${pageToken}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();

      if (requestId !== currentFetchIdRef.current) return;
      
      if (data.success) {
        if (pageToken) {
          setEmails(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newItems = data.emails.filter(e => !existingIds.has(e.id));
            return [...prev, ...newItems];
          });
        } else {
          setEmails(data.emails);
          setLoadedViewKey(view === "inbox" ? `${view}:${catToUse}` : view);
        }
        setNextPageToken(data.nextPageToken || null);
      } else {
        if (!isBackground) {
          setError(data.error || "Failed to load emails");
        }
      }
    } catch (err) {
      if (requestId !== currentFetchIdRef.current) return;
      if (!isBackground) {
        setError("Cannot connect to backend");
      }
    } finally {
      if (requestId === currentFetchIdRef.current) {
        if (!isBackground) {
          setLoading(false);
        }
        if (view === "inbox") fetchUnreadCount();
      }
    }
  }, [fetchUnreadCount, activeCategory]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Real-time Push Notification Sync via Server-Sent Events (SSE)
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/events`);

    eventSource.addEventListener("gmail:new-mail", () => {
      console.log("Real-time Gmail push notification received!");
      if (stateRef.current.currentView === "inbox") {
        fetchEmails("inbox", null, true);
      }
      fetchUnreadCount();
    });

    eventSource.onerror = (err) => {
      console.warn("SSE event connection error:", err);
    };

    return () => {
      eventSource.close();
    };
  }, [fetchEmails, fetchUnreadCount]);

  const animateFillCompose = useCallback((targetTo, targetSubject, targetBody, extraFields = {}) => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView("compose");
    
    setComposeDraft({ to: "", subject: "", body: "", ...extraFields });

    return new Promise((resolve) => {
      let currentTo = "";
      let currentSubject = "";
      let currentBody = "";
      
      const charDelay = 20;

      let toIdx = 0;
      const typeToInterval = setInterval(() => {
        if (toIdx < targetTo.length) {
          currentTo += targetTo[toIdx];
          toIdx++;
          setComposeDraft({ to: currentTo, subject: "", body: "", ...extraFields });
        } else {
          clearInterval(typeToInterval);
          
          let subIdx = 0;
          const typeSubInterval = setInterval(() => {
            if (subIdx < targetSubject.length) {
              currentSubject += targetSubject[subIdx];
              subIdx++;
              setComposeDraft({ to: targetTo, subject: currentSubject, body: "", ...extraFields });
            } else {
              clearInterval(typeSubInterval);
              
              let bodyIdx = 0;
              const typeBodyInterval = setInterval(() => {
                if (bodyIdx < targetBody.length) {
                  const chunkSize = targetBody.length > 200 ? 5 : targetBody.length > 100 ? 3 : 1;
                  const nextChars = targetBody.slice(bodyIdx, bodyIdx + chunkSize);
                  currentBody += nextChars;
                  bodyIdx += chunkSize;
                  setComposeDraft({ to: targetTo, subject: targetSubject, body: currentBody, ...extraFields });
                } else {
                  clearInterval(typeBodyInterval);
                  setComposeDraft({ to: targetTo, subject: targetSubject, body: targetBody, ...extraFields });
                  resolve();
                }
              }, charDelay);
            }
          }, charDelay);
        }
      }, charDelay);
    });
  }, []);

  const searchEmailsAction = useCallback(async (query, pageToken = null) => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView("search");
    setSearchQuery(query);
    setSearchInput(query);
    
    setLoading(true);
    if (!pageToken) {
      setError("");
      setEmails([]);
      setNextPageToken(null);
    }
    
    try {
      let url = `${API_BASE_URL}/api/emails/search?q=${encodeURIComponent(query)}`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        if (pageToken) {
          setEmails(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newItems = data.emails.filter(e => !existingIds.has(e.id));
            return [...prev, ...newItems];
          });
        } else {
          setEmails(data.emails);
          setLoadedViewKey(`search:${query}`);
        }
        setNextPageToken(data.nextPageToken || null);
        return data.emails;
      } else {
        if (!pageToken) {
          setError(data.error || "Search failed");
        }
        return [];
      }
    } catch (err) {
      if (!pageToken) {
        setError("Cannot connect to backend");
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!nextPageToken) return;
    if (currentView === "search" && searchQuery) {
      searchEmailsAction(searchQuery, nextPageToken);
    } else if (currentView === "inbox" || currentView === "sent" || currentView === "drafts") {
      fetchEmails(currentView, nextPageToken);
    }
  }, [nextPageToken, currentView, searchQuery, fetchEmails, searchEmailsAction]);

  useEffect(() => {
    if (currentView === "inbox" || currentView === "sent" || currentView === "drafts") {
      const expectedKey = currentView === "inbox" ? `${currentView}:${activeCategory}` : currentView;
      if (loadedViewKey !== expectedKey) {
        fetchEmails(currentView);
      }
    }
  }, [currentView, activeCategory, loadedViewKey, fetchEmails]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      searchEmailsAction(searchInput);
    }
  };

  // Navigation handlers
  const openInbox = useCallback(() => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setSearchQuery("");
    setCurrentView("inbox");
  }, []);

  const openSent = useCallback(() => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setSearchQuery("");
    setCurrentView("sent");
  }, []);

  const openDrafts = useCallback(() => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setSearchQuery("");
    setCurrentView("drafts");
  }, []);

  const openDraft = useCallback(async (id) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/emails/drafts/${id}`);
      const data = await res.json();
      if (data.success && data.draft) {
        setComposeDraft({
          draftId: data.draft.draftId,
          to: data.draft.to || "",
          subject: data.draft.subject || "",
          body: data.draft.body || ""
        });
        setCurrentEmailId(null);
        setCurrentEmail(null);
        setCurrentView("compose");
      }
    } catch (e) {
      console.error("Error opening draft:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const openCompose = useCallback(() => {
    setComposeDraft({ to: "", subject: "", body: "" });
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView("compose");
  }, []);

  const fillCompose = useCallback((to, subject, body, extraFields = {}) => {
    animateFillCompose(to, subject, body, extraFields);
  }, [animateFillCompose]);

  const showCompose = useCallback(() => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView("compose");
  }, []);

  const handleEmailLoaded = useCallback((emailData) => {
    setCurrentEmail(emailData);
  }, []);

  const openEmail = useCallback((id) => {
    if (stateRef.current.currentView === "detail" && stateRef.current.currentEmailId === id && stateRef.current.currentEmail) {
      return;
    }
    setCurrentEmailId(id);
    setCurrentEmail(null);
    setPreviousView(stateRef.current.currentView);
    setCurrentView("detail");
  }, []);

  const goBack = useCallback(() => {
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView(stateRef.current.previousView || "inbox");
  }, []);

  const cancelCompose = useCallback(() => {
    openInbox();
  }, [openInbox]);
  
  const handleComposeSuccess = useCallback(() => {
    openSent();
  }, [openSent]);

  const handleManualReply = useCallback((emailToReply) => {
    if (!emailToReply) return;
    const rawSender = emailToReply.from || "";
    const emailMatch = rawSender.match(/<([^>]+)>/);
    const recipient = emailMatch ? emailMatch[1] : rawSender.trim();
    
    const subject = (emailToReply.subject || "").trim();
    const replySubject = subject.toLowerCase().startsWith("re:")
      ? subject
      : `Re: ${subject}`;

    const origMsgId = emailToReply.messageId || "";
    const origRefs = emailToReply.references || "";
    const replyRefs = origMsgId 
      ? (origRefs ? `${origRefs} ${origMsgId}` : origMsgId)
      : origRefs;

    setComposeDraft({
      to: recipient,
      subject: replySubject,
      body: "",
      threadId: emailToReply.threadId || null,
      inReplyTo: origMsgId || null,
      references: replyRefs || null
    });
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView("compose");
  }, []);

  const handleManualForward = useCallback((emailToForward) => {
    if (!emailToForward) return;
    const subject = (emailToForward.subject || "").trim();
    const fwdSubject = subject.toLowerCase().startsWith("fwd:")
      ? subject
      : `Fwd: ${subject}`;

    const bodyText = emailToForward.body
      ? emailToForward.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : (emailToForward.snippet || "");

    const fwdBody = `\n\n---------- Forwarded message ---------\nFrom: ${emailToForward.from || ""}\nDate: ${emailToForward.date || ""}\nSubject: ${subject}\nTo: ${emailToForward.to || ""}\n\n${bodyText}`;

    setComposeDraft({
      to: "",
      subject: fwdSubject,
      body: fwdBody
    });
    setCurrentEmailId(null);
    setCurrentEmail(null);
    setCurrentView("compose");
  }, []);

  // Register actions with the assistant registry
  useEffect(() => {
    actionRegistry.registerAction("openInbox", async () => {
      openInbox();
      return { success: true };
    });
    
    actionRegistry.registerAction("openSent", async () => {
      openSent();
      return { success: true };
    });

    actionRegistry.registerAction("openDrafts", async () => {
      openDrafts();
      return { success: true };
    });

    actionRegistry.registerAction("openCompose", async () => {
      openCompose();
      return { success: true };
    });

    actionRegistry.registerAction("openEmail", async ({ emailId }) => {
      if (!emailId || typeof emailId !== "string") {
        return { success: false, error: "Invalid or missing emailId parameter" };
      }
      openEmail(emailId);
      let fullEmail = null;
      try {
        const detailRes = await fetch(`${API_BASE_URL}/api/emails/${emailId}`);
        const detailData = await detailRes.json();
        if (detailData.success && detailData.email) {
          setCurrentEmail(detailData.email);
          fullEmail = {
            id: detailData.email.id || emailId,
            from: detailData.email.from || "",
            to: detailData.email.to || "",
            subject: detailData.email.subject || "",
            date: detailData.email.date || "",
            body: detailData.email.body || detailData.email.snippet || ""
          };
        }
      } catch (e) {
        console.error("Error fetching detail for email in openEmail action:", e);
      }
      return { success: true, action: "openEmail", emailId, email: fullEmail };
    });

    actionRegistry.registerAction("openLatestEmail", async ({ query }) => {
      if (!query || typeof query !== "string") {
        return { success: false, error: "Invalid or missing query parameter" };
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/emails/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (data.success && data.emails && data.emails.length > 0) {
          const latestEmail = data.emails[0];
          openEmail(latestEmail.id);
          
          let fullEmail = {
            id: latestEmail.id,
            from: latestEmail.from || "",
            to: latestEmail.to || "",
            subject: latestEmail.subject || "",
            date: latestEmail.date || "",
            body: latestEmail.body || latestEmail.snippet || ""
          };

          try {
            const detailRes = await fetch(`${API_BASE_URL}/api/emails/${latestEmail.id}`);
            const detailData = await detailRes.json();
            if (detailData.success && detailData.email) {
              setCurrentEmail(detailData.email);
              fullEmail = {
                id: detailData.email.id || latestEmail.id,
                from: detailData.email.from || "",
                to: detailData.email.to || "",
                subject: detailData.email.subject || "",
                date: detailData.email.date || "",
                body: detailData.email.body || detailData.email.snippet || ""
              };
            }
          } catch (e) {
            console.error("Error fetching detail for latest email:", e);
          }
          return {
            success: true,
            action: "openLatestEmail",
            email: fullEmail,
            emailId: latestEmail.id,
            subject: latestEmail.subject,
            from: latestEmail.from
          };
        } else {
          return { success: false, error: `No matching emails found for "${query}".` };
        }
      } catch (err) {
        return { success: false, error: "Cannot connect to backend" };
      }
    });

    actionRegistry.registerAction("searchEmails", async ({ query }) => {
      if (!query || typeof query !== "string") {
        return { success: false, error: "Invalid or missing query parameter" };
      }
      const searchRes = await searchEmailsAction(query);
      const emailList = Array.isArray(searchRes) ? searchRes : [];
      return { success: true, count: emailList.length, emails: emailList };
    });

    actionRegistry.registerAction("fillCompose", async ({ to, subject, body }) => {
      await animateFillCompose(to || "", subject || "", body || "");
      return { success: true };
    });

    actionRegistry.registerAction("sendEmail", async (args) => {
      if (args && (args.to || args.subject || args.body)) {
        await animateFillCompose(args.to || "", args.subject || "", args.body || "");
      } else {
        showCompose();
      }
      
      await new Promise(resolve => setTimeout(resolve, 600));
      
      setPendingSend(true);
      return { success: true, pendingConfirmation: true, message: "Your email is ready to review. Would you like me to send it?" };
    });

    actionRegistry.registerAction("replyToEmail", async ({ replyBody }) => {
      const currentState = stateRef.current;
      const curEmail = currentState.currentEmail;
      
      if (currentState.currentView !== "detail" || !curEmail) {
        return { 
          success: false, 
          error: "No email is currently open. Please open an email first before asking to reply." 
        };
      }

      const originalSender = curEmail.from || "";
      const emailMatch = originalSender.match(/<([^>]+)>/);
      const recipient = emailMatch ? emailMatch[1] : originalSender.trim();
      
      const originalSubject = (curEmail.subject || "").trim();
      const replySubject = originalSubject.toLowerCase().startsWith("re:") 
        ? originalSubject 
        : `Re: ${originalSubject}`;
        
      const bodyText = replyBody || "";

      const origMsgId = curEmail.messageId || "";
      const origRefs = curEmail.references || "";
      const replyRefs = origMsgId 
        ? (origRefs ? `${origRefs} ${origMsgId}` : origMsgId)
        : origRefs;

      fillCompose(recipient, replySubject, bodyText, {
        threadId: curEmail.threadId || null,
        inReplyTo: origMsgId || null,
        references: replyRefs || null
      });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setPendingSend(true);
      return { 
        success: true, 
        pendingConfirmation: true, 
        message: `I've prepared a reply to ${recipient}. Would you like me to send it?` 
      };
    });

    actionRegistry.registerAction("forwardEmail", async ({ to, extraNote }) => {
      const currentState = stateRef.current;
      const curEmail = currentState.currentEmail;
      
      if (currentState.currentView !== "detail" || !curEmail) {
        return { 
          success: false, 
          error: "No email is currently open. Please open an email first before asking to forward." 
        };
      }

      const recipient = (to || "").trim();
      const originalSubject = (curEmail.subject || "").trim();
      const fwdSubject = originalSubject.toLowerCase().startsWith("fwd:") 
        ? originalSubject 
        : `Fwd: ${originalSubject}`;
        
      const bodyContent = curEmail.body
        ? curEmail.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
        : curEmail.snippet || "";

      const fwdHeader = (extraNote ? extraNote.trim() + "\n\n" : "") +
        `---------- Forwarded message ---------\n` +
        `From: ${curEmail.from || ""}\n` +
        `Date: ${curEmail.date || ""}\n` +
        `Subject: ${originalSubject}\n` +
        `To: ${curEmail.to || ""}\n\n` +
        `${bodyContent}`;

      fillCompose(recipient, fwdSubject, fwdHeader);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setPendingSend(true);
      return { 
        success: true, 
        pendingConfirmation: true, 
        message: `I've prepared a forwarded message to ${recipient || "the recipient"}. Would you like me to send it?` 
      };
    });

    actionRegistry.registerAction("openEmailByPosition", async ({ position }) => {
      const pos = parseInt(position, 10);
      if (isNaN(pos) || pos < 1) {
        return { success: false, error: "Invalid position specified." };
      }
      const currentList = emailsRef.current || [];
      if (!currentList || currentList.length === 0) {
        return { success: false, error: "No emails are currently loaded in the list." };
      }
      if (pos > currentList.length) {
        return { success: false, error: `Position ${pos} is outside the currently loaded list of ${currentList.length} emails.` };
      }

      const targetEmail = currentList[pos - 1];
      openEmail(targetEmail.id);

      let fullEmail = {
        id: targetEmail.id,
        from: targetEmail.from || "",
        to: targetEmail.to || "",
        subject: targetEmail.subject || "",
        date: targetEmail.date || "",
        body: targetEmail.body || targetEmail.snippet || ""
      };

      try {
        const detailRes = await fetch(`${API_BASE_URL}/api/emails/${targetEmail.id}`);
        const detailData = await detailRes.json();
        if (detailData.success && detailData.email) {
          setCurrentEmail(detailData.email);
          fullEmail = {
            id: detailData.email.id || targetEmail.id,
            from: detailData.email.from || "",
            to: detailData.email.to || "",
            subject: detailData.email.subject || "",
            date: detailData.email.date || "",
            body: detailData.email.body || detailData.email.snippet || ""
          };
        }
      } catch (e) {
        console.error("Error fetching detail for positional email:", e);
      }

      return {
        success: true,
        action: "openEmailByPosition",
        position: pos,
        email: fullEmail,
        emailId: targetEmail.id,
        subject: targetEmail.subject,
        from: targetEmail.from
      };
    });

    actionRegistry.registerContextGetter(() => {
      const state = stateRef.current;
      const listMeta = (emailsRef.current || []).slice(0, 20).map((e, idx) => ({
        position: idx + 1,
        id: e.id,
        sender: e.from || "",
        subject: e.subject || "",
        date: e.date || ""
      }));

      if (state.currentView === "detail" && state.currentEmail) {
        const bodyContent = state.currentEmail.body
          ? state.currentEmail.body.slice(0, 2000)
          : state.currentEmail.snippet || "";

        return {
          currentView: state.currentView,
          currentEmailId: state.currentEmailId,
          currentEmail: {
            id: state.currentEmail.id || state.currentEmailId,
            from: state.currentEmail.from || "",
            to: state.currentEmail.to || "",
            subject: state.currentEmail.subject || "",
            date: state.currentEmail.date || "",
            body: bodyContent
          },
          currentEmailList: listMeta
        };
      }
      return {
        currentView: state.currentView,
        currentEmailId: state.currentEmailId || null,
        currentEmail: null,
        currentEmailList: listMeta
      };
    });
  }, [openInbox, openSent, openDrafts, openCompose, openEmail, searchEmailsAction, fillCompose, showCompose]);

  const cleanAssistantResponseText = (text) => {
    if (!text || typeof text !== "string") return text;
    let cleaned = text;

    if (cleaned.includes("|")) {
      const lines = cleaned.split("\n");
      const formattedLines = [];
      for (let line of lines) {
        const trimmed = line.trim();
        if (/^\|[\s\-:|]+\|$/.test(trimmed) || /^\|\s*ID\s*\|/i.test(trimmed)) {
          continue;
        }
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
          if (cells.length >= 3) {
            let idOrNum = cells[0];
            let col1 = cells[1] || "";
            let col2 = cells[2] || "";
            let col3 = cells[3] || "";
            let numPrefix = /^\d+$/.test(idOrNum) ? `${idOrNum}. ` : "";
            line = `${numPrefix}${col2} — ${col1}${col3 ? ` — ${col3}` : ""}`;
          } else {
            continue;
          }
        }
        formattedLines.push(line);
      }
      cleaned = formattedLines.join("\n");
    }

    const lines = cleaned.split("\n");
    const resultLines = lines.map(line => {
      let trimmed = line.trim();
      trimmed = trimmed.replace(/(?:\*\*ID:\*\*|ID:)\s*[a-f0-9]{5,}\s*/gi, "");

      const patternA = /^(\d+\.)?\s*\*\*From:\*\*\s*(.*?)\s*\*\*Subject:\*\*\s*(.*?)\s*\*\*Date:\*\*\s*(.*)$/i;
      const matchA = trimmed.match(patternA);
      if (matchA) {
        const num = matchA[1] ? `${matchA[1]} ` : "";
        const sender = matchA[2].trim();
        const subject = matchA[3].trim();
        const date = matchA[4].trim();
        return `${num}${subject} — ${sender} — ${date}`;
      }

      const patternB = /^(\d+\.)?\s*\*\*Subject:\*\*\s*(.*?)\s*\*\*From:\*\*\s*(.*?)\s*\*\*Date:\*\*\s*(.*)$/i;
      const matchB = trimmed.match(patternB);
      if (matchB) {
        const num = matchB[1] ? `${matchB[1]} ` : "";
        const subject = matchB[2].trim();
        const sender = matchB[3].trim();
        const date = matchB[4].trim();
        return `${num}${subject} — ${sender} — ${date}`;
      }

      trimmed = trimmed.replace(/\*\*ID:\*\*\s*/gi, "")
                       .replace(/\*\*From:\*\*\s*/gi, "")
                       .replace(/\*\*Subject:\*\*\s*/gi, "")
                       .replace(/\*\*Date:\*\*\s*/gi, "");

      return trimmed;
    });

    return resultLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  const handleAssistantSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage = { role: "user", content: inputValue };
    const initialMessages = [...messages, userMessage];
    setMessages(initialMessages);
    setInputValue("");
    setIsAssistantLoading(true);

    let apiMessages = [...initialMessages];
    let keepLooping = true;
    let stepCount = 0;
    const maxSteps = 5;
    let turnEmail = null;
    let turnEmails = null;

    try {
      while (keepLooping && stepCount < maxSteps) {
        stepCount++;

        const response = await fetch(`${API_BASE_URL}/api/assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            context: actionRegistry.getCurrentContext()
          })
        });

        const data = await response.json();

        if (data.type === "tool_call") {
          let statusMessage = "Working on it...";
          if (data.tool === "fillCompose") statusMessage = "Preparing your draft...";
          if (data.tool === "replyToEmail") statusMessage = "Preparing your reply...";
          if (data.tool === "forwardEmail") statusMessage = "Preparing your forwarded email...";
          if (data.tool === "sendEmail") statusMessage = "Preparing your email...";
          if (data.tool === "searchEmails") statusMessage = "Searching your emails...";
          if (data.tool === "openLatestEmail" || data.tool === "openEmailByPosition" || data.tool === "openEmail") statusMessage = "Opening email...";
          if (data.tool === "openInbox" || data.tool === "openSent" || data.tool === "openDrafts" || data.tool === "openCompose") statusMessage = "Navigating...";
          
          setMessages(prev => [...prev.filter(m => !m.content.startsWith("*")), { role: "assistant", content: `*${statusMessage}*` }]);
          
          const result = await actionRegistry.execute(data.tool, data.arguments);
          
          if (result && result.email) {
            turnEmail = result.email;
          }
          if (result && result.emails && Array.isArray(result.emails) && result.emails.length > 0) {
            turnEmails = result.emails;
          }

          const callId = data.tool_call_id || `call_${Date.now()}_${stepCount}`;

          apiMessages.push({
            role: "assistant",
            tool_calls: [
              {
                id: callId,
                type: "function",
                function: {
                  name: data.tool,
                  arguments: JSON.stringify(data.arguments || {})
                }
              }
            ]
          });

          let toolResultForLLM = result;
          if (data.tool === "searchEmails") {
            toolResultForLLM = {
              success: result.success,
              count: result.count,
              note: "Matching emails are already automatically rendered as rich cards in the UI. Provide a short concise natural response stating how many emails were found. Do NOT list or format emails in a markdown table or text list."
            };
          }

          apiMessages.push({
            role: "tool",
            tool_call_id: callId,
            name: data.tool,
            content: JSON.stringify(toolResultForLLM)
          });

          if (result.success) {
            if (result.pendingConfirmation) {
              setMessages(prev => [
                ...prev.filter(m => !m.content.startsWith("*")), 
                { 
                  role: "assistant", 
                  content: cleanAssistantResponseText(result.message),
                  email: turnEmail,
                  emails: turnEmails
                }
              ]);
              keepLooping = false;
            }
          } else {
            setMessages(prev => [...prev.filter(m => !m.content.startsWith("*")), { role: "assistant", content: `Sorry, I couldn't do that: ${result.error}` }]);
            keepLooping = false;
          }
        } else if (data.type === "message") {
          let cleanMessage = cleanAssistantResponseText(data.message);

          setMessages(prev => [
            ...prev.filter(m => !m.content.startsWith("*")), 
            { 
              role: "assistant", 
              content: cleanMessage || data.message,
              email: turnEmail,
              emails: turnEmails
            }
          ]);
          keepLooping = false;
        } else if (data.type === "error") {
          setMessages(prev => [...prev.filter(m => !m.content.startsWith("*")), { role: "assistant", content: `⚠️ Error: ${data.message}` }]);
          keepLooping = false;
        } else {
          keepLooping = false;
        }
      }
    } catch (error) {
      console.error("Error in handleAssistantSend:", error);
      setMessages(prev => [...prev.filter(m => !m.content.startsWith("*")), { role: "assistant", content: "⚠️ Could not connect to the assistant service." }]);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const confirmSend = async () => {
    setPendingSend(false);
    
    if (!composeDraft.to.includes("@")) {
      setMessages(prev => [...prev, { role: "assistant", content: `Failed to send: Please enter a valid email address.` }]);
      return;
    }

    setMessages(prev => [...prev, { role: "assistant", content: "Sending email..." }]);
    setIsAssistantLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(composeDraft)
      });
      const data = await response.json();
      if (data.success) {
        setMessages(prev => [...prev, { role: "assistant", content: "Email sent successfully." }]);
        setComposeDraft({ to: "", subject: "", body: "" });
        openSent();
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Failed to send: ${data.error}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Failed to send email: Network Error` }]);
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const cancelSend = () => {
    setPendingSend(false);
    setMessages(prev => [...prev, { role: "assistant", content: "Sending cancelled." }]);
  };

  return (
    <div className="app">
      {/* Expanded Gmail-inspired Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>✉ Nebula Mail</h1>
        </div>

        <button 
          className="compose-button"
          onClick={openCompose}
        >
          ✏️ Compose
        </button>

        <button 
          className={`nav ${currentView === "inbox" ? "active" : ""}`}
          onClick={openInbox}
        >
          <div className="nav-left">
            <span>📥</span> <span>Inbox</span>
          </div>
          {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
        </button>

        <button 
          className={`nav ${currentView === "search" && searchQuery === "is:starred" ? "active" : ""}`}
          onClick={() => searchEmailsAction("is:starred")}
        >
          <div className="nav-left">
            <span>⭐</span> <span>Starred</span>
          </div>
        </button>

        <button 
          className={`nav ${currentView === "search" && searchQuery === "label:snoozed" ? "active" : ""}`}
          onClick={() => searchEmailsAction("label:snoozed")}
        >
          <div className="nav-left">
            <span>⏰</span> <span>Snoozed</span>
          </div>
        </button>

        <button 
          className={`nav ${currentView === "sent" ? "active" : ""}`}
          onClick={openSent}
        >
          <div className="nav-left">
            <span>📤</span> <span>Sent</span>
          </div>
        </button>

        <button 
          className={`nav ${currentView === "drafts" ? "active" : ""}`}
          onClick={openDrafts}
        >
          <div className="nav-left">
            <span>📄</span> <span>Drafts</span>
          </div>
        </button>

        <button 
          className={`nav ${currentView === "search" && searchQuery === "category:purchases" ? "active" : ""}`}
          onClick={() => searchEmailsAction("category:purchases")}
        >
          <div className="nav-left">
            <span>🏷️</span> <span>Purchases</span>
          </div>
        </button>

        {/* More / Less Toggle */}
        <button 
          className="nav more-toggle"
          onClick={() => setMoreSidebarExpanded(!moreSidebarExpanded)}
        >
          <div className="nav-left">
            <span>{moreSidebarExpanded ? "▲" : "▼"}</span> 
            <span>{moreSidebarExpanded ? "Less" : "More"}</span>
          </div>
        </button>

        {/* Expanded Navigation Items */}
        {moreSidebarExpanded && (
          <div className="expanded-sidebar-section">
            <button 
              className={`nav ${currentView === "search" && searchQuery === "is:important" ? "active" : ""}`}
              onClick={() => searchEmailsAction("is:important")}
            >
              <div className="nav-left">
                <span>🏷️</span> <span>Important</span>
              </div>
            </button>

            <button 
              className={`nav ${currentView === "search" && searchQuery === "label:scheduled" ? "active" : ""}`}
              onClick={() => searchEmailsAction("label:scheduled")}
            >
              <div className="nav-left">
                <span>📅</span> <span>Scheduled</span>
              </div>
            </button>

            <button 
              className={`nav ${currentView === "search" && searchQuery === "in:all" ? "active" : ""}`}
              onClick={() => searchEmailsAction("in:all")}
            >
              <div className="nav-left">
                <span>📬</span> <span>All Mail</span>
              </div>
            </button>

            <button 
              className={`nav ${currentView === "search" && searchQuery === "in:spam" ? "active" : ""}`}
              onClick={() => searchEmailsAction("in:spam")}
            >
              <div className="nav-left">
                <span>⚠️</span> <span>Spam</span>
              </div>
            </button>

            <button 
              className={`nav ${currentView === "search" && searchQuery === "in:trash" ? "active" : ""}`}
              onClick={() => searchEmailsAction("in:trash")}
            >
              <div className="nav-left">
                <span>🗑️</span> <span>Trash</span>
              </div>
            </button>

            <div className="sidebar-divider" />

            <button className="nav placeholder-nav" title="Manage subscriptions">
              <div className="nav-left">
                <span>🔔</span> <span>Manage subscriptions</span>
              </div>
            </button>

            <button className="nav placeholder-nav" title="Manage labels">
              <div className="nav-left">
                <span>🏷️</span> <span>Manage labels</span>
              </div>
            </button>

            <button className="nav placeholder-nav" title="Create new label">
              <div className="nav-left">
                <span>➕</span> <span>Create new label</span>
              </div>
            </button>
          </div>
        )}
      </aside>

      {/* Main area */}
      <main className="main">
        <div className="toolbar">
          <div className="toolbar-left">
            {(currentView === "inbox" || currentView === "sent" || currentView === "drafts" || currentView === "search") && (
              <form onSubmit={handleSearchSubmit} className="search-box">
                <span className="search-icon">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search mail..." 
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button type="submit" title="Search">
                  🔎
                </button>
              </form>
            )}
          </div>
          <div className="toolbar-right">
            <button
              className="toolbar-btn"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              className="toolbar-btn"
              onClick={() => {
                if (currentView === "search" && searchQuery) {
                  searchEmailsAction(searchQuery);
                } else if (currentView === "inbox" || currentView === "sent" || currentView === "drafts") {
                  fetchEmails(currentView);
                }
              }}
              title="Refresh"
              aria-label="Refresh"
            >
              ↻
            </button>
            <button 
              className={`toolbar-btn ${assistantOpen ? "active" : ""}`} 
              onClick={() => setAssistantOpen(!assistantOpen)}
              title="AI Assistant"
              aria-label="Toggle AI Assistant"
            >
              🤖
            </button>
          </div>
        </div>

        <div className="content-area">
          {currentView === "detail" && currentEmailId && (
            <EmailDetail 
              emailId={currentEmailId} 
              onBack={goBack} 
              onMessageRead={fetchUnreadCount}
              onEmailLoaded={handleEmailLoaded}
              onReply={handleManualReply}
              onForward={handleManualForward}
            />
          )}
          
          {currentView === "compose" && (
            <Compose 
              onCancel={cancelCompose}
              onSuccess={handleComposeSuccess}
              draft={composeDraft}
              setDraft={setComposeDraft}
            />
          )}

          {(currentView === "inbox" || currentView === "sent" || currentView === "drafts" || currentView === "search") && (
            <EmailList 
              emails={emails}
              loading={loading}
              error={error}
              emptyMessage={
                currentView === "sent" ? "No sent emails found." : 
                currentView === "drafts" ? "No saved drafts." : 
                "No emails found."
              }
              onEmailClick={(id) => currentView === "drafts" ? openDraft(id) : openEmail(id)}
              hasMore={!!nextPageToken}
              onLoadMore={loadMore}
              isSent={currentView === "sent"}
              isDraft={currentView === "drafts"}
              currentView={currentView}
              activeCategory={activeCategory}
              onSelectCategory={(cat) => {
                setActiveCategory(cat);
              }}
              searchQuery={searchQuery}
              onClearSearch={openInbox}
              onApplyFilter={(q) => searchEmailsAction(q)}
              onRefresh={() => {
                if (currentView === "search" && searchQuery) {
                  searchEmailsAction(searchQuery);
                } else if (currentView === "inbox" || currentView === "sent" || currentView === "drafts") {
                  fetchEmails(currentView);
                }
              }}
            />
          )}
        </div>
      </main>

      {/* Assistant Drawer */}
      {assistantOpen && (
        <aside className="assistant">
          <div className="assistant-header">
            <h2>🤖 AI Assistant</h2>
            <button className="toolbar-btn" onClick={() => setAssistantOpen(false)} aria-label="Close Assistant">✕</button>
          </div>
          <div className="assistant-messages">
          {messages.length === 0 ? (
            <div className="assistant-box">
              <p>Hello! I can help you manage your emails.</p>
              <p className="example">Try: "show mails from nishanth" or "show unread emails"</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} style={{ 
                padding: "12px", 
                borderRadius: "12px", 
                background: msg.role === "user" ? "var(--accent-color)" : "var(--assistant-bg)",
                color: msg.role === "user" ? "var(--accent-text)" : "var(--text-primary)",
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "90%",
                wordWrap: "break-word",
                fontSize: "14px"
              }}>
                <strong>{msg.role === "user" ? "You" : "AI"}:</strong> {msg.content}

                {msg.role === "assistant" && msg.emails && msg.emails.length > 0 && (
                  <div className="assistant-email-cards-list">
                    {msg.emails.slice(0, 3).map((emailItem, eIdx) => (
                      <AssistantEmailPreview 
                        key={emailItem.id || eIdx} 
                        email={emailItem} 
                        onOpenEmail={openEmail} 
                      />
                    ))}
                  </div>
                )}

                {msg.role === "assistant" && (!msg.emails || msg.emails.length === 0) && msg.email && (
                  <AssistantEmailPreview 
                    email={msg.email} 
                    onOpenEmail={openEmail} 
                  />
                )}
              </div>
            ))
          )}
          {isAssistantLoading && (
            <div style={{ padding: "10px", color: "var(--text-muted)" }}>
              <em>Working on it...</em>
            </div>
          )}
          {pendingSend && (
            <div className="assistant-box" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <p style={{ margin: 0 }}>Ready to send this email to <strong>{composeDraft.to || "..."}</strong>. Send it?</p>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={confirmSend} style={{ flex: 1, background: "var(--accent-color)", color: "var(--accent-text)", border: "none", padding: "10px", borderRadius: "20px", cursor: "pointer", fontWeight: "bold" }}>Send</button>
                <button onClick={cancelSend} style={{ flex: 1, background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)", padding: "10px", borderRadius: "20px", cursor: "pointer", fontWeight: "bold" }}>Cancel</button>
              </div>
            </div>
          )}
          </div>

          <div className="assistant-input">
            <input
              type="text"
              placeholder="Ask your assistant..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAssistantSend()}
              disabled={isAssistantLoading}
            />
            <button 
              onClick={handleAssistantSend} 
              disabled={isAssistantLoading}
              title="Send"
            >
              ➤
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;