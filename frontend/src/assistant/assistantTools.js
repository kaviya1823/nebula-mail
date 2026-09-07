export const assistantTools = [
  {
    name: "openInbox",
    description: "Open the Inbox view",
    parameters: {}
  },
  {
    name: "openSent",
    description: "Open the Sent view",
    parameters: {}
  },
  {
    name: "openDrafts",
    description: "Open the Drafts view",
    parameters: {}
  },
  {
    name: "openCompose",
    description: "Open the email compose view",
    parameters: {}
  },
  {
    name: "openEmail",
    description: "Open a specific email",
    parameters: {
      emailId: "string"
    }
  },
  {
    name: "openEmailByPosition",
    description: "Open an email by its 1-indexed position in the currently displayed UI email list (e.g. position 1 = 1st email, position 6 = 6th email, position 10 = 10th email).",
    parameters: {
      position: "number"
    }
  },
  {
    name: "openLatestEmail",
    description: "Search for emails matching a query and open the latest matching email in Detail view. Use when user says 'open latest email from X', 'navigate to the recent mail received from X', 'go to the recent mail from X'.",
    parameters: {
      query: "string"
    }
  },
  {
    name: "getCurrentContext",
    description: "Get the current application view and open email ID",
    parameters: {}
  },
  {
    name: "searchEmails",
    description: "Search for emails using a Gmail search query. Use this to filter by date, sender, subject, or keywords.",
    parameters: {
      query: "string"
    }
  },
  {
    name: "fillCompose",
    description: "Open the compose view and fill the recipient, subject, and body.",
    parameters: {
      to: "string",
      subject: "string",
      body: "string"
    }
  },
  {
    name: "sendEmail",
    description: "Send an email. Requires explicit user confirmation first.",
    parameters: {
      to: "string",
      subject: "string",
      body: "string"
    }
  },
  {
    name: "replyToEmail",
    description: "Reply to the currently open email with the specified reply text.",
    parameters: {
      replyBody: "string"
    }
  },
  {
    name: "forwardEmail",
    description: "Forward the currently open email to a recipient.",
    parameters: {
      to: "string",
      extraNote: "string"
    }
  }
];

