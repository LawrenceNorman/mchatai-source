// skill-manifest: { "id": "custom.bluesky-post", "name": "Bluesky Post", "version": "1.0.0", "author": "mChatAI", "description": "Post text or threads to Bluesky via the AT Protocol. Authenticates with handle + app password, mints a session JWT, then creates a feed post record." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "bluesky";

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

// Mints a session JWT against bsky.social using identifier+password (app password).
function createSession(serviceURL, identifier, password, log) {
    var res = fetchJSON(serviceURL + "/xrpc/com.atproto.server.createSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier, password: password }),
        timeout: 20,
        maxChars: 20000
    });
    if (res.error || !(res.status >= 200 && res.status < 300)) {
        log.push("createSession HTTP " + res.status + " body=" + safeExcerpt(res.body, 600));
        throw new Error("Bluesky auth failed (HTTP " + res.status + "). Verify handle + app password at https://bsky.app/settings/app-passwords.");
    }
    var parsed;
    try { parsed = JSON.parse(res.body); } catch (e) {
        throw new Error("createSession returned non-JSON body.");
    }
    if (!parsed || !parsed.accessJwt || !parsed.did) {
        throw new Error("createSession response missing accessJwt or did: " + safeExcerpt(res.body, 200));
    }
    return { accessJwt: parsed.accessJwt, did: parsed.did, handle: parsed.handle };
}

function createPostRecord(serviceURL, session, postRecord, log) {
    var res = fetchJSON(serviceURL + "/xrpc/com.atproto.repo.createRecord", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + session.accessJwt,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            repo: session.did,
            collection: "app.bsky.feed.post",
            record: postRecord
        }),
        timeout: 30,
        maxChars: 20000
    });
    if (res.error) {
        log.push("createRecord network: " + res.error);
        return { ok: false, error: "network: " + res.error };
    }
    if (!(res.status >= 200 && res.status < 300)) {
        log.push("createRecord HTTP " + res.status + " body=" + safeExcerpt(res.body, 600));
        return { ok: false, error: "HTTP " + res.status };
    }
    var parsed;
    try { parsed = JSON.parse(res.body); } catch (e) {
        return { ok: false, error: "bad JSON: " + e.message };
    }
    if (!parsed || !parsed.uri || !parsed.cid) {
        return { ok: false, error: "missing uri/cid: " + safeExcerpt(res.body, 200) };
    }
    return { ok: true, uri: parsed.uri, cid: parsed.cid };
}

// at://did:plc:xxx/app.bsky.feed.post/<rkey>  →  https://bsky.app/profile/<handle>/post/<rkey>
function webURLFor(uri, handle) {
    var parts = uri.split("/");
    var rkey = parts[parts.length - 1];
    return "https://bsky.app/profile/" + (handle || "") + "/post/" + rkey;
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var identifier = resolveCredential("identifier", "handle", "username");
    var password = resolveCredential("appPassword", "password");

    if ((!identifier || !password) && !dryRun) {
        throw new Error("Bluesky Post requires an identifier (handle) + app password. Generate an app password at https://bsky.app/settings/app-passwords (never use your main password). Save under Keychain ExtAPI_bluesky_handle + ExtAPI_bluesky_appPassword.");
    }

    var serviceURL = pickString(config.serviceURL, "https://bsky.social");
    if (serviceURL.charAt(serviceURL.length - 1) === "/") {
        serviceURL = serviceURL.slice(0, -1);
    }

    var thread = null;
    if (config.thread) {
        if (typeof config.thread === "string") {
            try { thread = JSON.parse(config.thread); } catch (e) {
                throw new Error("config.thread must be a JSON array of strings: " + e.message);
            }
        } else if (Array.isArray(config.thread)) {
            thread = config.thread;
        } else {
            throw new Error("config.thread must be a string-array or JSON string.");
        }
        if (!thread.length) { throw new Error("config.thread is empty."); }
    }

    var singleText = pickString(config.text, input.text);
    var log = ["Bluesky Post v1.0.0", "Service: " + serviceURL];

    if (dryRun) {
        var desc;
        if (thread) {
            desc = "DRY RUN: would post thread of " + thread.length + " posts. First: " + safeExcerpt(thread[0], 200);
        } else if (singleText) {
            desc = "DRY RUN: would post: " + safeExcerpt(singleText, 200);
        } else {
            throw new Error("No text or thread provided.");
        }
        log.push(desc);
        finish(desc, log, null);
    } else {
        var session = createSession(serviceURL, identifier, password, log);
        log.push("Session: handle=" + session.handle + " did=" + safeExcerpt(session.did, 60));

        if (thread) {
            var rootRef = null;
            var parentRef = null;
            var firstURI = null;
            var postedLines = [];
            for (var i = 0; i < thread.length; i++) {
                var t = thread[i];
                if (typeof t !== "string" || !t.length) {
                    throw new Error("Thread item " + i + " is not a non-empty string.");
                }
                if (t.length > 300) {
                    log.push("Warning: thread item " + i + " is " + t.length + " chars (>300 grapheme limit). Bluesky will reject.");
                }
                var record = {
                    "$type": "app.bsky.feed.post",
                    text: t,
                    createdAt: new Date().toISOString()
                };
                if (rootRef && parentRef) {
                    record.reply = { root: rootRef, parent: parentRef };
                }
                var res = createPostRecord(serviceURL, session, record, log);
                if (!res.ok) {
                    if (firstURI) {
                        log.push("Thread partial: posted " + i + "/" + thread.length + ". First: " + firstURI);
                    }
                    throw new Error("Thread item " + i + " failed: " + res.error);
                }
                if (!firstURI) {
                    firstURI = res.uri;
                    rootRef = { uri: res.uri, cid: res.cid };
                }
                parentRef = { uri: res.uri, cid: res.cid };
                postedLines.push("[" + res.uri + "]");
                log.push("Posted " + (i + 1) + "/" + thread.length + " uri=" + res.uri);
            }
            finish("Posted Bluesky thread of " + thread.length + " posts. URL: " + webURLFor(firstURI, session.handle), log, null);
        } else {
            if (!singleText) {
                throw new Error("Provide config.text, config.thread, or pipeline input text.");
            }
            if (singleText.length > 300) {
                log.push("Warning: text is " + singleText.length + " chars (>300 grapheme limit). Bluesky will reject.");
            }
            var record2 = {
                "$type": "app.bsky.feed.post",
                text: singleText,
                createdAt: new Date().toISOString()
            };
            var res2 = createPostRecord(serviceURL, session, record2, log);
            if (!res2.ok) { throw new Error("Post failed: " + res2.error); }
            finish("Posted to Bluesky. URL: " + webURLFor(res2.uri, session.handle), log, null);
        }
    }
} catch (err) {
    finish(null, ["Bluesky Post error: " + (err.message || String(err))], err.message || String(err));
}
