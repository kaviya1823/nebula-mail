const { google } = require("googleapis");
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
    path.join(__dirname, "..", "db", "database.sqlite")
);

db.prepare(`
    CREATE TABLE IF NOT EXISTS gmail_watch_state (
        id INTEGER PRIMARY KEY,
        history_id TEXT,
        expiration INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).run();

function getGmailClient() {
    const token = db
        .prepare("SELECT * FROM oauth_tokens WHERE id = 1")
        .get();

    if (!token) {
        throw new Error("Gmail is not connected. Please login with Google first.");
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expiry_date: token.expiry_date
    });

    oauth2Client.on("tokens", (tokens) => {
        if (tokens.access_token) {
            const updateStmt = db.prepare(`
                UPDATE oauth_tokens
                SET access_token = ?, expiry_date = COALESCE(?, expiry_date)
                WHERE id = 1
            `);
            updateStmt.run(tokens.access_token, tokens.expiry_date || null);
        }
    });

    return google.gmail({
        version: "v1",
        auth: oauth2Client
    });
}

async function getInbox(pageToken = null, category = null) {
    const gmail = getGmailClient();

    const params = {
        userId: "me",
        maxResults: 20,
        pageToken: pageToken || undefined
    };

    if (category && category !== "primary") {
        params.q = `in:inbox category:${category}`;
    } else {
        params.labelIds = ["INBOX"];
    }

    const response = await gmail.users.messages.list(params);

    const messages = response.data.messages || [];

    const emails = [];

    for (const message of messages) {
        const email = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"]
        });

        const headers = email.data.payload.headers || [];

        const getHeader = (name) => {
            const header = headers.find(
                h => h.name.toLowerCase() === name.toLowerCase()
            );

            return header ? header.value : "";
        };

        emails.push({
            id: email.data.id,
            threadId: email.data.threadId,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: email.data.snippet || "",
            unread: (email.data.labelIds || []).includes("UNREAD")
        });
    }

    return { emails, nextPageToken: response.data.nextPageToken || null };
}

async function getSent(pageToken = null) {
    const gmail = getGmailClient();

    const response = await gmail.users.messages.list({
        userId: "me",
        q: "in:sent",
        maxResults: 20,
        pageToken: pageToken || undefined
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (const message of messages) {
        const email = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"]
        });

        const headers = email.data.payload.headers || [];

        const getHeader = (name) => {
            const header = headers.find(
                h => h.name.toLowerCase() === name.toLowerCase()
            );
            return header ? header.value : "";
        };

        emails.push({
            id: email.data.id,
            threadId: email.data.threadId,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: email.data.snippet || "",
            unread: (email.data.labelIds || []).includes("UNREAD")
        });
    }

    return { emails, nextPageToken: response.data.nextPageToken || null };
}

async function getDrafts(pageToken = null) {
    const gmail = getGmailClient();

    const response = await gmail.users.drafts.list({
        userId: "me",
        maxResults: 20,
        pageToken: pageToken || undefined
    });

    const drafts = response.data.drafts || [];
    const emails = [];

    for (const draftItem of drafts) {
        try {
            const draft = await gmail.users.drafts.get({
                userId: "me",
                id: draftItem.id,
                format: "metadata",
                metadataHeaders: ["From", "To", "Subject", "Date"]
            });

            const message = draft.data.message || {};
            const headers = message.payload ? message.payload.headers || [] : [];
            const getHeader = (name) => {
                const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
                return header ? header.value : "";
            };

            emails.push({
                id: draft.data.id,
                messageId: message.id,
                threadId: message.threadId,
                from: getHeader("From"),
                to: getHeader("To") || "(No recipient)",
                subject: getHeader("Subject") || "(Draft)",
                date: getHeader("Date"),
                snippet: message.snippet || "",
                isDraft: true
            });
        } catch (err) {
            console.error("Failed to fetch draft details:", err.message);
        }
    }

    return { emails, nextPageToken: response.data.nextPageToken || null };
}

function decodeBase64Url(data) {
    if (!data) return "";
    try {
        const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(base64, "base64").toString("utf-8");
    } catch (e) {
        console.error("Error decoding base64url:", e);
        return "";
    }
}

function htmlToReadableText(html) {
    if (!html) return "";
    let text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<template[^>]*>[\s\S]*?<\/template>/gi, "")
        .replace(/<br\s*[\/]?>/gi, "\n")
        .replace(/<\/(p|div|tr|h1|h2|h3|h4|h5|h6|li)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, "/");

    return text
        .split("\n")
        .map(line => line.replace(/\s+/g, " ").trim())
        .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
        .join("\n")
        .trim();
}

function extractBodiesFromPayload(payload) {
    if (!payload) return { body: "", htmlBody: "" };

    let plainText = "";
    let htmlText = "";

    function traverse(part) {
        if (!part) return;

        const mimeType = (part.mimeType || "").toLowerCase();

        if (part.body && part.body.data) {
            const decoded = decodeBase64Url(part.body.data);
            if (mimeType === "text/plain" && !plainText) {
                plainText = decoded;
            } else if (mimeType === "text/html" && !htmlText) {
                htmlText = decoded;
            }
        }

        if (part.parts && Array.isArray(part.parts)) {
            for (const child of part.parts) {
                traverse(child);
            }
        }
    }

    traverse(payload);

    let readableBody = plainText;
    if (!readableBody && htmlText) {
        readableBody = htmlToReadableText(htmlText);
    }

    return {
        body: readableBody || "",
        htmlBody: htmlText || ""
    };
}

function extractBodyFromPayload(payload) {
    const { body } = extractBodiesFromPayload(payload);
    return body;
}

async function getDraft(id) {
    const gmail = getGmailClient();
    const draft = await gmail.users.drafts.get({
        userId: "me",
        id: id,
        format: "full"
    });

    const message = draft.data.message || {};
    const headers = message.payload ? message.payload.headers || [] : [];
    const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : "";
    };

    const { body, htmlBody } = message.payload ? extractBodiesFromPayload(message.payload) : { body: "", htmlBody: "" };

    return {
        draftId: draft.data.id,
        id: message.id,
        to: getHeader("To"),
        subject: getHeader("Subject"),
        body: body,
        htmlBody: htmlBody
    };
}

async function getEmail(id) {
    const gmail = getGmailClient();
    const response = await gmail.users.messages.get({
        userId: "me",
        id: id,
        format: "full"
    });

    const headers = response.data.payload.headers || [];
    const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : "";
    };

    const { body, htmlBody } = extractBodiesFromPayload(response.data.payload);

    return {
        id: response.data.id,
        threadId: response.data.threadId,
        messageId: getHeader("Message-ID"),
        references: getHeader("References"),
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: response.data.snippet || "",
        body: body,
        htmlBody: htmlBody,
        unread: (response.data.labelIds || []).includes("UNREAD")
    };
}

async function getThread(threadId) {
    const gmail = getGmailClient();
    const response = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full"
    });

    const messages = response.data.messages || [];
    const parsedMessages = messages.map(msg => {
        const headers = msg.payload ? msg.payload.headers || [] : [];
        const getHeader = (name) => {
            const h = headers.find(item => item.name.toLowerCase() === name.toLowerCase());
            return h ? h.value : "";
        };

        const { body, htmlBody } = extractBodiesFromPayload(msg.payload);

        return {
            id: msg.id,
            threadId: msg.threadId || threadId,
            messageId: getHeader("Message-ID"),
            references: getHeader("References"),
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: msg.snippet || "",
            body: body,
            htmlBody: htmlBody,
            unread: (msg.labelIds || []).includes("UNREAD")
        };
    });

    return {
        id: response.data.id || threadId,
        historyId: response.data.historyId,
        messages: parsedMessages
    };
}

async function searchEmails(query, pageToken = null) {
    const gmail = getGmailClient();

    const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 20,
        pageToken: pageToken || undefined
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (const message of messages) {
        const email = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"]
        });

        const headers = email.data.payload.headers || [];

        const getHeader = (name) => {
            const header = headers.find(
                h => h.name.toLowerCase() === name.toLowerCase()
            );
            return header ? header.value : "";
        };

        emails.push({
            id: email.data.id,
            threadId: email.data.threadId,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: email.data.snippet || "",
            unread: (email.data.labelIds || []).includes("UNREAD")
        });
    }

    return { emails, nextPageToken: response.data.nextPageToken || null };
}

async function sendEmail(to, subject, body, draftId = null, threadId = null, inReplyTo = null, references = null) {
    const gmail = getGmailClient();
    const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit'
    ];

    if (inReplyTo) {
        headers.push(`In-Reply-To: ${inReplyTo}`);
    }
    if (references) {
        headers.push(`References: ${references}`);
    }

    const str = [
        ...headers,
        '',
        body
    ].join('\r\n');
    
    const encodedMail = Buffer.from(str).toString("base64").replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const requestBody = {
        raw: encodedMail
    };
    if (threadId) {
        requestBody.threadId = threadId;
    }

    const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: requestBody
    });

    if (draftId) {
        try {
            await gmail.users.drafts.delete({
                userId: "me",
                id: draftId
            });
        } catch (err) {
            console.warn("Could not delete draft after sending:", err.message);
        }
    }

    return response.data;
}

async function markAsRead(id) {
    const gmail = getGmailClient();
    const response = await gmail.users.messages.modify({
        userId: "me",
        id: id,
        requestBody: {
            removeLabelIds: ["UNREAD"]
        }
    });
    return response.data;
}

async function getUnreadCount() {
    const gmail = getGmailClient();
    try {
        let pageToken = null;
        let total = 0;
        do {
            const res = await gmail.users.threads.list({
                userId: "me",
                q: "in:inbox is:unread category:primary",
                maxResults: 500,
                pageToken: pageToken || undefined
            });
            const threads = res.data.threads || [];
            total += threads.length;
            pageToken = res.data.nextPageToken;
        } while (pageToken);
        return total;
    } catch (e) {
        console.error("Error fetching INBOX unread count:", e.message);
        return 0;
    }
}

async function setupWatch() {
    if (!process.env.GMAIL_PUBSUB_TOPIC) {
        console.log("GMAIL_PUBSUB_TOPIC is not configured. Gmail push watch skipped.");
        return { success: false, reason: "GMAIL_PUBSUB_TOPIC not set" };
    }

    try {
        const gmail = getGmailClient();
        const res = await gmail.users.watch({
            userId: "me",
            requestBody: {
                topicName: process.env.GMAIL_PUBSUB_TOPIC,
                labelIds: ["INBOX"]
            }
        });

        const { historyId, expiration } = res.data;

        const saveWatch = db.prepare(`
            INSERT OR REPLACE INTO gmail_watch_state (id, history_id, expiration, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
        `);
        saveWatch.run(String(historyId), Number(expiration));

        console.log(`Gmail watch setup successfully. historyId: ${historyId}, expiration: ${expiration}`);
        return { success: true, historyId, expiration };
    } catch (error) {
        console.error("Failed to setup Gmail watch:", error.message);
        return { success: false, error: error.message };
    }
}

function getStoredHistoryId() {
    const row = db.prepare("SELECT history_id FROM gmail_watch_state WHERE id = 1").get();
    return row ? row.history_id : null;
}

function updateHistoryId(historyId) {
    if (!historyId) return;
    const saveWatch = db.prepare(`
        INSERT INTO gmail_watch_state (id, history_id, updated_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET history_id = excluded.history_id, updated_at = CURRENT_TIMESTAMP
    `);
    saveWatch.run(String(historyId));
}

async function listHistory(startHistoryId) {
    const gmail = getGmailClient();
    try {
        const res = await gmail.users.history.list({
            userId: "me",
            startHistoryId: String(startHistoryId),
            historyTypes: ["messageAdded", "labelAdded", "labelRemoved"]
        });
        return res.data;
    } catch (error) {
        console.error("Error listing Gmail history:", error.message);
        throw error;
    }
}

module.exports = {
    getInbox,
    getSent,
    getDrafts,
    getDraft,
    getEmail,
    getThread,
    searchEmails,
    sendEmail,
    markAsRead,
    getUnreadCount,
    setupWatch,
    getStoredHistoryId,
    updateHistoryId,
    listHistory,
    extractBodyFromPayload,
    extractBodiesFromPayload,
    htmlToReadableText
};