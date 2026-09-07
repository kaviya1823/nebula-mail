require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { getInbox, getSent, getDrafts, getDraft, getEmail, getThread, searchEmails, sendEmail, markAsRead, getUnreadCount, setupWatch, getStoredHistoryId, updateHistoryId, listHistory } = require("./services/gmailService");

const app = express();

app.use(
    cors({
        origin: "http://localhost:5173"
    })
);

app.use(express.json());

const PORT = 5000;

// -----------------------------
// SQLite Database
// -----------------------------

const dbFolder = path.join(__dirname, "db");

if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder);
}

const db = new Database(
    path.join(dbFolder, "database.sqlite")
);

db.prepare(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        scope TEXT,
        token_type TEXT,
        expiry_date INTEGER
    )
`).run();

// -----------------------------
// Google OAuth
// -----------------------------

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify"
];

// -----------------------------
// Google Login
// -----------------------------

app.get("/auth/google", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent"
    });

    res.redirect(authUrl);
});

// -----------------------------
// Google OAuth Callback
// -----------------------------

app.get("/auth/google/callback", async (req, res) => {
    try {
        const { code } = req.query;

        const { tokens } = await oauth2Client.getToken(code);

        oauth2Client.setCredentials(tokens);

        // Save tokens in SQLite
        const saveToken = db.prepare(`
            INSERT OR REPLACE INTO oauth_tokens
            (id, access_token, refresh_token, scope, token_type, expiry_date)
            VALUES (1, ?, ?, ?, ?, ?)
        `);

        saveToken.run(
            tokens.access_token || null,
            tokens.refresh_token || null,
            tokens.scope || null,
            tokens.token_type || null,
            tokens.expiry_date || null
        );

        console.log("Google OAuth successful!");
        console.log("Gmail tokens saved to SQLite.");

        // Initialize Gmail push watch asynchronously
        setupWatch().catch(err => console.error("Error setting up watch after OAuth:", err));

        res.send(`
            <h1>Google Login Successful! ✅</h1>
            <p>Gmail has been connected to Nebula Mail.</p>
            <p>Your authorization has been saved.</p>
            <p>You can close this page.</p>
        `);

    } catch (error) {
        console.error("OAuth Error:", error);

        res.status(500).send("Google authentication failed.");
    }
});

// -----------------------------
// Gmail Inbox
// -----------------------------

app.get("/api/emails/inbox", async (req, res) => {
    try {
        const { pageToken, category } = req.query;
        const result = await getInbox(pageToken, category);

        res.json({
            success: true,
            emails: result.emails,
            nextPageToken: result.nextPageToken
        });

    } catch (error) {
        console.error("Inbox Error:", error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Sent
// -----------------------------

app.get("/api/emails/sent", async (req, res) => {
    try {
        const { pageToken } = req.query;
        const result = await getSent(pageToken);
        res.json({
            success: true,
            emails: result.emails,
            nextPageToken: result.nextPageToken
        });
    } catch (error) {
        console.error("Sent Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Drafts
// -----------------------------

app.get("/api/emails/drafts", async (req, res) => {
    try {
        const { pageToken } = req.query;
        const result = await getDrafts(pageToken);
        res.json({
            success: true,
            emails: result.emails,
            nextPageToken: result.nextPageToken
        });
    } catch (error) {
        console.error("Drafts Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get("/api/emails/drafts/:id", async (req, res) => {
    try {
        const draft = await getDraft(req.params.id);
        res.json({
            success: true,
            draft: draft
        });
    } catch (error) {
        console.error("Get Draft Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Unread Count
// -----------------------------

app.get("/api/emails/unread-count", async (req, res) => {
    try {
        const count = await getUnreadCount();
        res.json({
            success: true,
            count: count
        });
    } catch (error) {
        console.error("Unread Count Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Search
// -----------------------------

app.get("/api/emails/search", async (req, res) => {
    try {
        const { q, pageToken } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, error: "Missing query parameter 'q'" });
        }
        const result = await searchEmails(q, pageToken);
        res.json({
            success: true,
            emails: result.emails,
            nextPageToken: result.nextPageToken
        });
    } catch (error) {
        console.error("Search Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Get Email
// -----------------------------

app.get("/api/emails/:id", async (req, res) => {
    try {
        const email = await getEmail(req.params.id);
        res.json({
            success: true,
            email: email
        });
    } catch (error) {
        console.error("Get Email Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Get Thread
// -----------------------------

app.get("/api/threads/:id", async (req, res) => {
    try {
        const thread = await getThread(req.params.id);
        res.json({
            success: true,
            thread: thread
        });
    } catch (error) {
        console.error("Get Thread Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Send Email
// -----------------------------

app.post("/api/emails/send", async (req, res) => {
    try {
        const { to, subject, body, draftId, threadId, inReplyTo, references } = req.body;
        if (!to || !subject || !body) {
            return res.status(400).json({ success: false, error: "Missing to, subject, or body" });
        }
        const result = await sendEmail(to, subject, body, draftId, threadId, inReplyTo, references);
        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        console.error("Send Email Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Gmail Mark as Read
// -----------------------------

app.post("/api/emails/:id/read", async (req, res) => {
    try {
        const result = await markAsRead(req.params.id);
        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        console.error("Mark Read Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// -----------------------------
// Assistant LLM Endpoint (OpenRouter)
// -----------------------------

app.post("/api/assistant", async (req, res) => {
    try {
        const { messages, context } = req.body;
        
        if (!process.env.OPENROUTER_API_KEY) {
            return res.status(500).json({ type: "error", message: "Assistant is not configured. Missing API key." });
        }
        
        const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-lite-preview-02-05:free";
        
        const today = new Date().toISOString().split('T')[0];
        const systemPrompt = `You are the Nebula Mail AI Assistant. You control the user's mail application.
Your goal is to help the user manage their email.
You have access to tools that can change the UI, open emails, fetch data, compose emails, and reply to emails.
Current Application Context: ${JSON.stringify(context || {})}
Current Date for relative date calculations: ${today}

EXPLICIT TOOL SELECTION RULES:

1. OPEN EMAIL BY SENDER OR POSITION:
   - When user says "open the latest email from X", "open email from X", "open the most recent email from X", "navigate to the recent mail received from X", "navigate to the recent mail from X", "go to the recent mail from X", "show the recent mail from X", "open the recent mail received from X":
     * YOU MUST CALL openLatestEmail with query: "from:X".
   - When user says "open the 6th mail", "open the 2nd email", "open 3rd result", "open the fifth email", "open 10th mail":
     * YOU MUST CALL openEmailByPosition with position: N (where N is the integer 1, 2, 3, 5, 6, 10, etc.).
   - DO NOT make up email IDs or call searchEmails for positional requests.

2. SEARCH OR FILTER EMAILS (LIST VIEW):
   - When user says "show mails from X", "find emails from X", "show unread emails", "show emails from last N days":
   - YOU MUST CALL searchEmails.
   - CRITICAL DATE RULE: You MUST extract the EXACT number of days specified by the user!
     * "last 10 days" -> "newer_than:10d"
     * "last 7 days" -> "newer_than:7d"
     * "last 30 days" -> "newer_than:30d"
     * "unread emails from the last 10 days" -> "is:unread newer_than:10d"
     * "read emails from the last 10 days" -> "is:read newer_than:10d"
     * NEVER default to 30d if the user requested 10d or any other number!

3. REPLIES AND FORWARDS TO CURRENTLY OPEN EMAIL:
   - When user asks to "reply to this" or "reply to this email":
     * YOU MUST CALL replyToEmail with replyBody.
     * DO NOT SEARCH GMAIL. DO NOT CALL searchEmails.
   - When user asks to "forward this" or "forward this email to X":
     * YOU MUST CALL forwardEmail with recipient 'to' and optional 'extraNote'.
     * DO NOT SEARCH GMAIL. DO NOT CALL searchEmails.
   - CONTEXT SAFETY:
     * If user says "reply to this" or "forward this" but NO email is open (context.currentView is not 'detail' or context.currentEmail is null):
     * YOU MUST STILL CALL replyToEmail or forwardEmail. The action handler will report that no email is open. DO NOT guess or search for emails.

4. QUESTIONS ABOUT CURRENTLY OPEN EMAIL (SUMMARY, CONTENT, SENDER, SUBJECT, DATE):
   - When context.currentView is "detail" and context.currentEmail is present AND the user asks questions or for information about the open email (e.g., "What is this email about?", "Summarize this", "Who sent this?", "What is the subject?", "Show me the content", "Tell me about this mail", "Who is the sender?", "When was this sent?"):
     * YOU MUST ANSWER DIRECTLY using the information provided in context.currentEmail (from, to, subject, date, body).
     * Analyze the actual readable email content in context.currentEmail.body.
     * DO NOT describe the HTML representation, CSS, or MIME structure.
     * DO NOT say 'the email body contains HTML' or 'appears incomplete' unless body text is genuinely empty.
     * DO NOT CALL searchEmails. DO NOT CALL openLatestEmail. DO NOT SEARCH GMAIL.
     * Respond conversationally and directly with the concise summary requested.
   - If context.currentView is NOT "detail" or context.currentEmail is null (no email is open) and the user asks "What is this email about?", "Summarize this", or "Who sent this?":
     * State clearly that no email is currently open and ask the user to open an email first. DO NOT search Gmail or guess.

5. COMPOSE AND SEND:
   - Understand the user's intent, recipient email address, subject, and intended message content.
   - DO NOT literally copy raw command phrases like "compose mail to...", "as...", "send this", "with assistant", "please send", or "tell her that..." into the subject or body fields.
   - Generate a natural, complete, well-formatted email body expressing the user's intended message content.
   - Formulate a concise, clean, properly capitalized subject line.
   - Extract the valid recipient email address for the 'to' field.
   - "compose an email to X..." -> CALL fillCompose(to, subject, body).
   - "send an email to X..." -> CALL sendEmail(to, subject, body).
   - "send it" (after compose is filled) -> CALL sendEmail.

6. NAVIGATION:
   - "open inbox", "go to inbox" -> CALL openInbox
   - "open sent", "go to sent" -> CALL openSent
   - "open drafts", "go to drafts" -> CALL openDrafts
   - "open compose" -> CALL openCompose

7. RESPONSE FORMATTING FOR EMAIL LISTS:
   - When listing emails or summarizing search/inbox/sent results:
     * Never expose internal Gmail message IDs.
     * Never output raw Markdown tables (do not use '|' table syntax).
     * Do NOT use verbose field labels like '**ID:**', '**From:**', '**Subject:**', or '**Date:**'.
     * Present a clean, concise list using the format: "N. Subject — Sender/Recipient — Date" (e.g. "1. Re: sample 1 — KAVIYA N IT — Sep 7, 2026").`;

        const apiMessages = [
            { role: "system", content: systemPrompt },
            ...(messages || [])
        ];
        
        const tools = [
            {
                type: "function",
                function: {
                    name: "openInbox",
                    description: "Open the Inbox view",
                    parameters: { type: "object", properties: {}, additionalProperties: false }
                }
            },
            {
                type: "function",
                function: {
                    name: "openSent",
                    description: "Open the Sent view",
                    parameters: { type: "object", properties: {}, additionalProperties: false }
                }
            },
            {
                type: "function",
                function: {
                    name: "openDrafts",
                    description: "Open the Drafts view",
                    parameters: { type: "object", properties: {}, additionalProperties: false }
                }
            },
            {
                type: "function",
                function: {
                    name: "openCompose",
                    description: "Open the email compose view",
                    parameters: { type: "object", properties: {}, additionalProperties: false }
                }
            },
            {
                type: "function",
                function: {
                    name: "openEmail",
                    description: "Open a specific email by ID",
                    parameters: {
                        type: "object",
                        properties: {
                            emailId: { type: "string", description: "The ID of the email to open" }
                        },
                        required: ["emailId"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "openEmailByPosition",
                    description: "Open an email by its 1-indexed position in the currently displayed UI email list (e.g. position 1 = 1st email, position 6 = 6th email, position 10 = 10th email). Use when user says 'open the 6th mail', 'open the 2nd email', 'open 3rd result', 'open the fifth email'.",
                    parameters: {
                        type: "object",
                        properties: {
                            position: { type: "integer", description: "The 1-based index position of the email to open from the current UI list (1, 2, 3, etc.)" }
                        },
                        required: ["position"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "openLatestEmail",
                    description: "Search for emails matching a query and immediately open the single most recent matching email in Detail view. Use when user says 'open latest email from X', 'open email from X', 'open the most recent email from X', 'navigate to the recent mail received from X', 'navigate to the recent mail from X', 'go to the recent mail from X', 'show the recent mail from X'.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "Gmail search query, e.g. 'from:kaviya' or 'from:nishanth'" }
                        },
                        required: ["query"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "searchEmails",
                    description: "Search for emails using a Gmail search query. Use this to filter by date, sender, subject, or keywords. Examples: 'from:sarah', 'is:unread', 'newer_than:10d', 'is:unread newer_than:10d', 'newer_than:7d'. ALWAYS PRESERVE THE EXACT NUMBER OF DAYS SPECIFIED BY USER.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "The Gmail search query string" }
                        },
                        required: ["query"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "fillCompose",
                    description: "Open the compose view and fill the recipient, subject, and body.",
                    parameters: {
                        type: "object",
                        properties: {
                            to: { type: "string", description: "Recipient email address" },
                            subject: { type: "string", description: "Email subject" },
                            body: { type: "string", description: "Email body" }
                        },
                        required: ["to", "subject", "body"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "sendEmail",
                    description: "Send an email. Requires explicit user confirmation first.",
                    parameters: {
                        type: "object",
                        properties: {
                            to: { type: "string", description: "Recipient email address" },
                            subject: { type: "string", description: "Email subject" },
                            body: { type: "string", description: "Email body" }
                        },
                        required: ["to", "subject", "body"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "replyToEmail",
                    description: "Reply to the currently open email with the specified reply body. ONLY call this when context.currentView is 'detail' and context.currentEmail is present.",
                    parameters: {
                        type: "object",
                        properties: {
                            replyBody: { type: "string", description: "The text/content of the reply message requested by the user" }
                        },
                        required: ["replyBody"],
                        additionalProperties: false
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "forwardEmail",
                    description: "Forward the currently open email to a recipient.",
                    parameters: {
                        type: "object",
                        properties: {
                            to: { type: "string", description: "Recipient email address to forward to" },
                            extraNote: { type: "string", description: "Optional note to include above the forwarded message" }
                        },
                        required: ["to"],
                        additionalProperties: false
                    }
                }
            }
        ];
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: openRouterModel,
                messages: apiMessages,
                tools: tools,
                tool_choice: "auto"
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter API Error:", errorText);
            return res.status(502).json({ type: "error", message: "The assistant service is temporarily unavailable." });
        }
        
        const data = await response.json();
        const choice = data.choices && data.choices[0];
        
        if (!choice) {
            return res.status(500).json({ type: "error", message: "Received empty response from assistant." });
        }
        
        const message = choice.message;
        
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            let args = {};
            try {
                args = JSON.parse(toolCall.function.arguments || "{}");
            } catch (e) {
                // ignore
            }
            return res.json({
                type: "tool_call",
                tool: toolCall.function.name,
                arguments: args,
                tool_call_id: toolCall.id || (`call_${Date.now()}`)
            });
        }
        
        return res.json({
            type: "message",
            message: message.content || "I couldn't understand that."
        });
        
    } catch (error) {
        console.error("Assistant Endpoint Error:", error);
        res.status(500).json({ type: "error", message: "An internal error occurred." });
    }
});

// -----------------------------
// Real-Time Events (Server-Sent Events)
// -----------------------------

let sseClients = [];

app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Initial heartbeat
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`);

    sseClients.push(res);

    req.on("close", () => {
        sseClients = sseClients.filter(client => client !== res);
    });
});

function broadcastEvent(eventName, data) {
    sseClients.forEach(client => {
        try {
            client.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
            // client disconnected
        }
    });
}

// -----------------------------
// Gmail Watch Manual Setup Route
// -----------------------------

app.post("/api/gmail/watch", async (req, res) => {
    try {
        const result = await setupWatch();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -----------------------------
// Gmail Pub/Sub Webhook Route
// -----------------------------

app.post("/api/gmail/webhook", async (req, res) => {
    try {
        if (!req.body || !req.body.message || !req.body.message.data) {
            return res.status(400).send("Invalid Pub/Sub message body");
        }

        const encodedData = req.body.message.data;
        const decodedString = Buffer.from(encodedData, "base64").toString("utf-8");
        let pubSubData = {};
        try {
            pubSubData = JSON.parse(decodedString);
        } catch (e) {
            console.error("Failed to parse Pub/Sub data:", e.message);
            return res.status(400).send("Invalid JSON payload");
        }

        const { emailAddress, historyId: newHistoryId } = pubSubData;
        console.log(`Received Gmail Pub/Sub notification for ${emailAddress}, historyId: ${newHistoryId}`);

        const storedHistoryId = getStoredHistoryId();

        if (!storedHistoryId) {
            if (newHistoryId) updateHistoryId(newHistoryId);
            broadcastEvent("gmail:new-mail", { emailAddress, historyId: newHistoryId });
            return res.status(200).send("OK");
        }

        try {
            const historyData = await listHistory(storedHistoryId);
            if (historyData.historyId) {
                updateHistoryId(historyData.historyId);
            } else if (newHistoryId) {
                updateHistoryId(newHistoryId);
            }

            const hasHistoryRecords = historyData.history && historyData.history.length > 0;
            if (hasHistoryRecords || !historyData.history) {
                broadcastEvent("gmail:new-mail", { emailAddress, historyId: newHistoryId });
            }
        } catch (historyErr) {
            console.warn("History API query failed (historyId expired or invalid), updating historyId & refreshing:", historyErr.message);
            if (newHistoryId) updateHistoryId(newHistoryId);
            setupWatch().catch(err => console.error("Re-watch error:", err));
            broadcastEvent("gmail:new-mail", { emailAddress, historyId: newHistoryId });
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error("Error handling Pub/Sub webhook:", error);
        res.status(500).send("Webhook internal error");
    }
});

// -----------------------------
// Test Backend
// -----------------------------

app.get("/", (req, res) => {
    res.json({
        message: "Nebula Mail backend is running!"
    });
});

// -----------------------------
// Start Server
// -----------------------------

const server = app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
    
    // Attempt Gmail push watch setup on backend startup if tokens exist
    setTimeout(() => {
        setupWatch().catch(err => console.log("Startup watch setup status:", err.message));
    }, 2000);

    // Periodically renew watch every 24 hours
    setInterval(() => {
        setupWatch().catch(err => console.error("Watch periodic renewal error:", err.message));
    }, 24 * 60 * 60 * 1000);
});

server.on('error', (err) => {
    console.error('Server error:', err);
});