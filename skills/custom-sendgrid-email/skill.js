// skill-manifest: { "id": "custom.sendgrid-email", "name": "SendGrid Email", "version": "1.0.0", "author": "mChatAI", "description": "Send a transactional or marketing email via SendGrid v3 (single recipient, multi-recipient, template, or contact list segment)." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "sendgrid";

function pickString() {
    for (var i = 0; i < arguments.length; i++) {
        var v = arguments[i];
        if (typeof v === "string" && v.length > 0) { return v; }
    }
    return "";
}

function keychainKey(field) {
    return "ExtAPI_" + providerRawValue + "_" + field;
}

function resolveCredential() {
    for (var i = 0; i < arguments.length; i++) {
        var direct = pickString(config[arguments[i]]);
        if (direct) { return direct; }
    }
    for (var j = 0; j < arguments.length; j++) {
        var stored = pickString(getSecret(keychainKey(arguments[j])));
        if (stored) { return stored; }
    }
    return "";
}

function fetchJSON(url, options) {
    var opts = options || {};
    var optsJSON = JSON.stringify({
        method: opts.method || "GET",
        headers: opts.headers || {},
        body: opts.body || null,
        timeout: opts.timeout || 30,
        maxChars: opts.maxChars || 200000
    });
    var result = httpFetch(url, optsJSON);
    return JSON.parse(result);
}

function finish(text, log, error) {
    setOutput({
        text: text === undefined ? null : text,
        log: log || [],
        error: error || null
    });
}

function safeExcerpt(text, limit) {
    var t = pickString(text);
    if (!t) { return ""; }
    if (t.length <= limit) { return t; }
    return t.slice(0, limit) + "...";
}

function looksLikeEmail(s) {
    return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizeRecipients(value, fieldName) {
    if (!value) { return []; }
    var raw = value;
    if (typeof raw === "string") {
        // Try JSON parse, else comma-split
        var trimmed = raw.replace(/^\s+|\s+$/g, "");
        if (trimmed.charAt(0) === "[") {
            try { raw = JSON.parse(trimmed); } catch (e) {
                throw new Error(fieldName + " looked like JSON but failed to parse: " + e.message);
            }
        } else {
            raw = trimmed.split(",");
        }
    }
    if (!Array.isArray(raw)) { raw = [raw]; }
    var out = [];
    for (var i = 0; i < raw.length; i++) {
        var item = raw[i];
        if (typeof item === "string") {
            var trimmed2 = item.replace(/^\s+|\s+$/g, "");
            if (!trimmed2) { continue; }
            if (!looksLikeEmail(trimmed2)) {
                throw new Error(fieldName + "[" + i + "] is not a valid email: " + trimmed2);
            }
            out.push({ email: trimmed2 });
        } else if (item && typeof item === "object" && item.email) {
            if (!looksLikeEmail(item.email)) {
                throw new Error(fieldName + "[" + i + "].email is not valid: " + item.email);
            }
            var entry = { email: item.email };
            if (item.name) { entry.name = String(item.name); }
            out.push(entry);
        } else {
            throw new Error(fieldName + "[" + i + "] must be an email string or {email,name} object.");
        }
    }
    return out;
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var apiKey = resolveCredential("apiKey", "sendgridApiKey", "accessToken");
    if (!apiKey && !dryRun) {
        throw new Error("SendGrid Email requires an API key. Save under Keychain ExtAPI_sendgrid_apiKey or pass config.apiKey. Create one at https://app.sendgrid.com/settings/api_keys (needs 'Mail Send' permission).");
    }

    var fromEmail = pickString(config.from, config.fromEmail);
    if (!fromEmail) {
        throw new Error("config.from (sender email) is required. Must match a verified sender or domain in SendGrid.");
    }
    if (!looksLikeEmail(fromEmail)) {
        throw new Error("config.from is not a valid email: " + fromEmail);
    }
    var fromName = pickString(config.fromName);

    var to = normalizeRecipients(config.to, "config.to");
    var cc = normalizeRecipients(config.cc, "config.cc");
    var bcc = normalizeRecipients(config.bcc, "config.bcc");
    if (!to.length) {
        throw new Error("config.to is required (string, comma-separated, or JSON array).");
    }

    var subject = pickString(config.subject);
    var html = pickString(config.html);
    var text = pickString(config.text, input.text);
    var templateID = pickString(config.templateID);
    var dynamicTemplateData = null;
    if (config.dynamicTemplateData) {
        if (typeof config.dynamicTemplateData === "string") {
            try { dynamicTemplateData = JSON.parse(config.dynamicTemplateData); } catch (e) {
                throw new Error("config.dynamicTemplateData must be a JSON object: " + e.message);
            }
        } else if (typeof config.dynamicTemplateData === "object") {
            dynamicTemplateData = config.dynamicTemplateData;
        }
    }

    if (!templateID && !subject) {
        throw new Error("Either config.subject or config.templateID is required.");
    }
    if (!templateID && !html && !text) {
        throw new Error("Provide config.text, config.html, or config.templateID for the email body.");
    }

    var sandboxMode = config.sandboxMode === true || config.sandboxMode === "true";

    var personalization = { to: to };
    if (cc.length) { personalization.cc = cc; }
    if (bcc.length) { personalization.bcc = bcc; }
    if (templateID && dynamicTemplateData) {
        personalization.dynamic_template_data = dynamicTemplateData;
    }
    if (subject && !templateID) {
        personalization.subject = subject;
    }

    var fromField = { email: fromEmail };
    if (fromName) { fromField.name = fromName; }

    var body = {
        personalizations: [personalization],
        from: fromField
    };

    var replyTo = pickString(config.replyTo);
    if (replyTo) {
        if (!looksLikeEmail(replyTo)) { throw new Error("config.replyTo is not valid: " + replyTo); }
        body.reply_to = { email: replyTo };
    }

    if (templateID) {
        body.template_id = templateID;
    } else {
        var content = [];
        if (text) { content.push({ type: "text/plain", value: text }); }
        if (html) { content.push({ type: "text/html", value: html }); }
        body.content = content;
        if (subject) { body.subject = subject; }
    }

    // Categories for tracking (SendGrid analytics)
    if (config.categories) {
        var cats = config.categories;
        if (typeof cats === "string") {
            try {
                var parsedCats = JSON.parse(cats);
                cats = Array.isArray(parsedCats) ? parsedCats : cats.split(",").map(function (s) { return s.replace(/^\s+|\s+$/g, ""); });
            } catch (e) {
                cats = cats.split(",").map(function (s) { return s.replace(/^\s+|\s+$/g, ""); });
            }
        }
        if (Array.isArray(cats) && cats.length) {
            body.categories = cats.slice(0, 10);
        }
    }

    if (sandboxMode) {
        body.mail_settings = { sandbox_mode: { enable: true } };
    }

    var log = [
        "SendGrid Email v1.0.0",
        "From: " + (fromName ? fromName + " <" + fromEmail + ">" : fromEmail),
        "To: " + to.length + " recipient(s)" + (cc.length ? ", cc " + cc.length : "") + (bcc.length ? ", bcc " + bcc.length : ""),
        "Mode: " + (templateID ? "template=" + templateID : "inline subject/body"),
        sandboxMode ? "SANDBOX MODE (no actual delivery)" : "Live send"
    ];

    if (dryRun) {
        log.push("DRY RUN: would POST to /v3/mail/send. Body bytes: " + JSON.stringify(body).length);
        finish("DRY RUN: would send " + (templateID ? "template " + templateID : "inline email '" + safeExcerpt(subject, 80) + "'") + " to " + to.length + " recipient(s).", log, null);
    } else {
        var response = fetchJSON("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            timeout: 30,
            maxChars: 20000
        });

        if (response.error) {
            log.push("Network error: " + response.error);
            throw new Error("Request failed: " + response.error);
        }
        // SendGrid returns 202 Accepted on success with empty body
        if (response.status === 202) {
            var msgID = "";
            if (response.headers && (response.headers["x-message-id"] || response.headers["X-Message-Id"])) {
                msgID = response.headers["x-message-id"] || response.headers["X-Message-Id"];
            }
            log.push("Accepted (202). X-Message-Id: " + (msgID || "<none>"));
            finish("Email accepted by SendGrid" + (msgID ? " (id=" + msgID + ")" : "") + ".", log, null);
        } else if (response.status >= 200 && response.status < 300) {
            log.push("HTTP " + response.status + " body=" + safeExcerpt(response.body, 600));
            finish("Email sent (HTTP " + response.status + ").", log, null);
        } else {
            log.push("HTTP " + response.status + " body=" + safeExcerpt(response.body, 800));
            throw new Error("SendGrid HTTP " + response.status);
        }
    }
} catch (err) {
    finish(null, ["SendGrid Email error: " + (err.message || String(err))], err.message || String(err));
}
