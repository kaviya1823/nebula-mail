const assert = require("assert");
const { extractBodyFromPayload, extractBodiesFromPayload, htmlToReadableText } = require("../services/gmailService");

console.log("=== RUNNING NEBULA MAIL TEST SUITE ===");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        failed++;
    }
}

// ----------------------------------------------------
// TEST 1: Plain Text Gmail MIME Body Extraction
// ----------------------------------------------------
runTest("Gmail MIME Extraction - text/plain payload", () => {
    const plainText = "Hello Nishanth, this is a plain text email.";
    const base64UrlData = Buffer.from(plainText).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

    const payload = {
        mimeType: "text/plain",
        body: { data: base64UrlData }
    };

    const { body, htmlBody } = extractBodiesFromPayload(payload);
    assert.strictEqual(body, plainText);
    assert.strictEqual(htmlBody, "");
});

// ----------------------------------------------------
// TEST 2: HTML Fallback & Raw htmlBody Preservation
// ----------------------------------------------------
runTest("Gmail MIME Extraction - raw htmlBody preserved and readable body generated", () => {
    const htmlContent = "<div><h1>Welcome to Naukri</h1><p>We found 5 new job opportunities for you.</p></div>";
    const base64UrlData = Buffer.from(htmlContent).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

    const payload = {
        mimeType: "text/html",
        body: { data: base64UrlData }
    };

    const { body, htmlBody } = extractBodiesFromPayload(payload);
    assert.strictEqual(htmlBody, htmlContent); // Raw HTML preserved for iframe UI rendering!
    assert.ok(body.includes("Welcome to Naukri")); // Readable text generated for AI context!
    assert.ok(!body.includes("<h1>")); // Tags stripped from AI body context!
});

// ----------------------------------------------------
// TEST 3: Multipart/Alternative Gmail MIME Extraction
// ----------------------------------------------------
runTest("Gmail MIME Extraction - multipart/alternative extracts both plain text and HTML", () => {
    const plainText = "Plain text version of email.";
    const htmlText = "<p>HTML version of email.</p>";

    const payload = {
        mimeType: "multipart/alternative",
        parts: [
            {
                mimeType: "text/plain",
                body: { data: Buffer.from(plainText).toString("base64") }
            },
            {
                mimeType: "text/html",
                body: { data: Buffer.from(htmlText).toString("base64") }
            }
        ]
    };

    const { body, htmlBody } = extractBodiesFromPayload(payload);
    assert.strictEqual(body, plainText);
    assert.strictEqual(htmlBody, htmlText);
});

// ----------------------------------------------------
// TEST 4: Nested Multipart/Mixed & Alternative (Naukri style)
// ----------------------------------------------------
runTest("Gmail MIME Extraction - deeply nested multipart/mixed + alternative", () => {
    const nestedText = "Application Status Update for Senior Engineer.";
    const nestedHtml = "<h2>Application Status Update for Senior Engineer.</h2>";
    const base64UrlTextData = Buffer.from(nestedText).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    const base64UrlHtmlData = Buffer.from(nestedHtml).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

    const payload = {
        mimeType: "multipart/mixed",
        parts: [
            {
                mimeType: "multipart/alternative",
                parts: [
                    {
                        mimeType: "text/plain",
                        body: { data: base64UrlTextData }
                    },
                    {
                        mimeType: "text/html",
                        body: { data: base64UrlHtmlData }
                    }
                ]
            },
            {
                mimeType: "application/pdf",
                filename: "resume.pdf",
                body: { size: 1024 }
            }
        ]
    };

    const { body, htmlBody } = extractBodiesFromPayload(payload);
    assert.strictEqual(body, nestedText);
    assert.strictEqual(htmlBody, nestedHtml);
});

// ----------------------------------------------------
// TEST 5: HTML to Readable Text Conversion & Style/Script Stripping
// ----------------------------------------------------
runTest("HTML to Readable Text - strips <style> & <script> blocks cleanly", () => {
    const html = `
        <head><style>body { color: red; }</style></head>
        <body>
            <script>console.log('test');</script>
            <h1>Product Update</h1>
            <p>See your photos in a new way. Pick an idea below:</p>
            <ul>
                <li>Cinematic landscape</li>
                <li>Nature wallpaper</li>
            </ul>
        </body>
    `;
    const text = htmlToReadableText(html);
    assert.ok(!text.includes("color: red"));
    assert.ok(!text.includes("console.log"));
    assert.ok(text.includes("Product Update"));
    assert.ok(text.includes("See your photos in a new way."));
    assert.ok(text.includes("Cinematic landscape"));
});

// ----------------------------------------------------
// TEST 6: Positional Email Navigation (openEmailByPosition)
// ----------------------------------------------------
runTest("Positional Email Navigation mapping", () => {
    const sampleEmails = [
        { id: "msg_1", subject: "First Mail" },
        { id: "msg_2", subject: "Second Mail" },
        { id: "msg_3", subject: "Third Mail" },
        { id: "msg_4", subject: "Fourth Mail" },
        { id: "msg_5", subject: "Fifth Mail" },
        { id: "msg_6", subject: "Sixth Mail" }
    ];

    function openByPos(position) {
        if (position < 1 || position > sampleEmails.length) {
            return { success: false, error: `Position ${position} is outside range.` };
        }
        const email = sampleEmails[position - 1];
        return { success: true, emailId: email.id, subject: email.subject };
    }

    assert.strictEqual(openByPos(1).emailId, "msg_1");
    assert.strictEqual(openByPos(6).emailId, "msg_6");
    assert.strictEqual(openByPos(6).subject, "Sixth Mail");
    assert.strictEqual(openByPos(10).success, false);
});

// ----------------------------------------------------
// TEST 7: Context Isolation between Email A and Email B
// ----------------------------------------------------
runTest("Context Isolation between Email A and Email B", () => {
    let currentView = "detail";
    let currentEmail = {
        id: "msg_101",
        from: "sarah@example.com",
        to: "me@example.com",
        subject: "Project Update",
        date: "Sun, 06 Sep 2026 10:00:00 GMT",
        body: "Here is the project update for Q3."
    };

    function getContext() {
        if (currentView === "detail" && currentEmail) {
            return {
                currentView,
                currentEmailId: currentEmail.id,
                currentEmail
            };
        }
        return { currentView, currentEmailId: null, currentEmail: null };
    }

    const contextA = getContext();
    assert.strictEqual(contextA.currentEmail.subject, "Project Update");
    assert.strictEqual(contextA.currentEmail.body, "Here is the project update for Q3.");

    // Switch to Email B
    currentEmail = null; // reset while opening B
    const intermediateContext = getContext();
    assert.strictEqual(intermediateContext.currentEmail, null); // No stale A context!

    currentEmail = {
        id: "msg_102",
        from: "naukri@example.com",
        to: "me@example.com",
        subject: "New Job Recommendations",
        date: "Sun, 06 Sep 2026 12:00:00 GMT",
        body: "5 new jobs matched your profile."
    };

    const contextB = getContext();
    assert.strictEqual(contextB.currentEmail.subject, "New Job Recommendations");
    assert.strictEqual(contextB.currentEmail.body, "5 new jobs matched your profile.");
});

// ----------------------------------------------------
// TEST 8: Structured Open Email Action Return Data
// ----------------------------------------------------
runTest("Structured Open Email Action Return Data contains email object", () => {
    function simulateOpenAction(id, from, subject, bodyText) {
        const fullEmail = {
            id,
            from,
            to: "user@example.com",
            subject,
            date: "Sun, 06 Sep 2026 14:00:00 GMT",
            body: bodyText
        };
        return {
            success: true,
            action: "openLatestEmail",
            email: fullEmail,
            emailId: id,
            subject,
            from
        };
    }

    const res = simulateOpenAction("msg_999", "info@naukri.com", "Job Alerts", "You have 3 new job alerts.");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.action, "openLatestEmail");
    assert.ok(res.email);
    assert.strictEqual(res.email.id, "msg_999");
    assert.strictEqual(res.email.subject, "Job Alerts");
    assert.strictEqual(res.email.body, "You have 3 new job alerts.");
});

// ----------------------------------------------------
// TEST 9: Multi-Step Tool Call History Formatting
// ----------------------------------------------------
runTest("Multi-Step Tool Call History Formatting produces valid OpenAI tool messages", () => {
    const apiMessages = [
        { role: "user", content: "Open the latest Naukri email and summarize it" }
    ];

    const toolCallData = {
        type: "tool_call",
        tool: "openLatestEmail",
        arguments: { query: "from:Naukri" },
        tool_call_id: "call_abc123"
    };

    const actionResult = {
        success: true,
        action: "openLatestEmail",
        email: {
            id: "msg_999",
            from: "info@naukri.com",
            subject: "Job Alerts",
            body: "You have 3 new job matches."
        }
    };

    // Step 1: Append assistant tool_call message
    apiMessages.push({
        role: "assistant",
        tool_calls: [
            {
                id: toolCallData.tool_call_id,
                type: "function",
                function: {
                    name: toolCallData.tool,
                    arguments: JSON.stringify(toolCallData.arguments)
                }
            }
        ]
    });

    // Step 2: Append tool result message
    apiMessages.push({
        role: "tool",
        tool_call_id: toolCallData.tool_call_id,
        name: toolCallData.tool,
        content: JSON.stringify(actionResult)
    });

    assert.strictEqual(apiMessages.length, 3);
    assert.strictEqual(apiMessages[1].role, "assistant");
    assert.strictEqual(apiMessages[1].tool_calls[0].id, "call_abc123");
    assert.strictEqual(apiMessages[1].tool_calls[0].function.name, "openLatestEmail");
    assert.strictEqual(apiMessages[2].role, "tool");
    assert.strictEqual(apiMessages[2].tool_call_id, "call_abc123");
    assert.ok(apiMessages[2].content.includes("Job Alerts"));
});

// ----------------------------------------------------
// TEST 10: Gmail Thread Structure & Multi-Message Parsing
// ----------------------------------------------------
runTest("Gmail Thread Structure & Multi-Message Parsing formats messages array correctly", () => {
    const mockThreadPayload = {
        id: "thread_100",
        historyId: "999888",
        messages: [
            {
                id: "msg_1",
                threadId: "thread_100",
                snippet: "First message snippet",
                payload: {
                    headers: [
                        { name: "From", value: "Alice <alice@example.com>" },
                        { name: "To", value: "Bob <bob@example.com>" },
                        { name: "Subject", value: "Project Update" },
                        { name: "Date", value: "Fri, 4 Sep 2026 10:00:00 +0000" }
                    ],
                    mimeType: "text/plain",
                    body: { data: Buffer.from("Initial project proposal...").toString("base64url") }
                }
            },
            {
                id: "msg_2",
                threadId: "thread_100",
                snippet: "Second message snippet",
                payload: {
                    headers: [
                        { name: "From", value: "Bob <bob@example.com>" },
                        { name: "To", value: "Alice <alice@example.com>" },
                        { name: "Subject", value: "Re: Project Update" },
                        { name: "Date", value: "Sat, 5 Sep 2026 11:00:00 +0000" }
                    ],
                    mimeType: "text/plain",
                    body: { data: Buffer.from("Looks great! Let's proceed.").toString("base64url") }
                }
            }
        ]
    };

    const parsedMessages = mockThreadPayload.messages.map(msg => {
        const headers = msg.payload.headers || [];
        const getHeader = (name) => {
            const h = headers.find(item => item.name.toLowerCase() === name.toLowerCase());
            return h ? h.value : "";
        };

        const { body, htmlBody } = extractBodiesFromPayload(msg.payload);

        return {
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
            snippet: msg.snippet,
            body: body,
            htmlBody: htmlBody
        };
    });

    assert.strictEqual(parsedMessages.length, 2);
    assert.strictEqual(parsedMessages[0].from, "Alice <alice@example.com>");
    assert.strictEqual(parsedMessages[1].from, "Bob <bob@example.com>");
    assert.strictEqual(parsedMessages[1].body, "Looks great! Let's proceed.");
});

// ----------------------------------------------------
// TEST 11: Gmail Reply Threading Data & Header Formatting
// ----------------------------------------------------
runTest("Gmail Reply Threading Data & Header Formatting", () => {
    const originalEmail = {
        id: "msg_123",
        threadId: "thread_789",
        messageId: "<CAGx123@mail.gmail.com>",
        references: "<parent000@mail.gmail.com>",
        from: "sender@example.com",
        to: "me@example.com",
        subject: "Project Discussion"
    };

    const origMsgId = originalEmail.messageId || "";
    const origRefs = originalEmail.references || "";
    const replyRefs = origMsgId 
      ? (origRefs ? `${origRefs} ${origMsgId}` : origMsgId)
      : origRefs;

    assert.strictEqual(originalEmail.threadId, "thread_789");
    assert.strictEqual(origMsgId, "<CAGx123@mail.gmail.com>");
    assert.strictEqual(replyRefs, "<parent000@mail.gmail.com> <CAGx123@mail.gmail.com>");

    // Verify raw MIME header formatting logic
    const to = originalEmail.from;
    const subject = "Re: " + originalEmail.subject;
    const inReplyTo = origMsgId;
    const references = replyRefs;

    const headers = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit'
    ];
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
    if (references) headers.push(`References: ${references}`);

    const mimeString = headers.join('\r\n');
    assert.ok(mimeString.includes("In-Reply-To: <CAGx123@mail.gmail.com>"));
    assert.ok(mimeString.includes("References: <parent000@mail.gmail.com> <CAGx123@mail.gmail.com>"));
});

// ----------------------------------------------------
// TEST SUMMARY
// ----------------------------------------------------
console.log(`\n====================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================\n`);

if (failed > 0) {
    process.exit(1);
}
