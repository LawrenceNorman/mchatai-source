// skill-manifest: { "id": "custom.xpost", "name": "X Post", "version": "1.0.0", "author": "mChatAI", "description": "Post a tweet, thread, or reply to X (Twitter) via API v2 using a user access token." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "twitter";

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

function postTweet(accessToken, body, log) {
    var response = fetchJSON("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + accessToken
        },
        body: JSON.stringify(body),
        timeout: 30,
        maxChars: 50000
    });
    if (response.error) {
        log.push("Network error: " + response.error);
        return { ok: false, error: "Network: " + response.error };
    }
    if (!(response.status >= 200 && response.status < 300)) {
        log.push("HTTP " + response.status + " body=" + safeExcerpt(response.body, 600));
        return { ok: false, error: "HTTP " + response.status };
    }
    var parsed;
    try { parsed = JSON.parse(response.body); } catch (e) {
        return { ok: false, error: "Bad JSON response: " + e.message };
    }
    var data = parsed && parsed.data ? parsed.data : null;
    if (!data || !data.id) {
        return { ok: false, error: "Response missing data.id: " + safeExcerpt(response.body, 400) };
    }
    return { ok: true, id: data.id, text: data.text || body.text };
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var accessToken = resolveCredential("accessToken", "bearerToken", "userAccessToken");
    if (!accessToken && !dryRun) {
        throw new Error("XPost requires an X user access token. Save it via mChatAI credentials (Keychain key: ExtAPI_twitter_accessToken) or pass as config.accessToken. App-only bearer tokens cannot create posts.");
    }

    // Inputs (priority: config.thread > config.text > input.text)
    var thread = null;
    if (config.thread) {
        if (typeof config.thread === "string") {
            try { thread = JSON.parse(config.thread); } catch (e) {
                throw new Error("config.thread must be a JSON array of strings. Parse error: " + e.message);
            }
        } else if (Array.isArray(config.thread)) {
            thread = config.thread;
        } else {
            throw new Error("config.thread must be an array of strings or a JSON-encoded array.");
        }
        if (!thread.length) { throw new Error("config.thread is empty."); }
    }

    var singleText = pickString(config.text, input.text);
    var inReplyTo = pickString(config.inReplyToTweetID);

    var mediaIDs = null;
    if (config.mediaIDs) {
        if (typeof config.mediaIDs === "string") {
            try { mediaIDs = JSON.parse(config.mediaIDs); } catch (e) {
                throw new Error("config.mediaIDs must be a JSON array of media_id strings.");
            }
        } else if (Array.isArray(config.mediaIDs)) {
            mediaIDs = config.mediaIDs;
        }
    }

    var log = ["XPost v1.0.0"];

    if (dryRun) {
        var dryDescription;
        if (thread) {
            dryDescription = "DRY RUN: would post thread of " + thread.length + " tweets. First: " + safeExcerpt(thread[0], 280);
        } else if (singleText) {
            dryDescription = "DRY RUN: would post tweet: " + safeExcerpt(singleText, 280);
        } else {
            throw new Error("No text or thread provided.");
        }
        log.push(dryDescription);
        finish(dryDescription, log, null);
    } else {
        if (thread) {
            // Post each tweet, threading via in_reply_to_tweet_id
            var lastID = inReplyTo || null;
            var firstID = null;
            var postedTexts = [];
            for (var i = 0; i < thread.length; i++) {
                var t = thread[i];
                if (typeof t !== "string" || !t.length) {
                    throw new Error("Thread item " + i + " is not a non-empty string.");
                }
                if (t.length > 280) {
                    log.push("Warning: thread item " + i + " is " + t.length + " chars (>280); X API will reject. Truncate before posting.");
                }
                var body = { text: t };
                if (lastID) { body.reply = { in_reply_to_tweet_id: lastID }; }
                if (i === 0 && mediaIDs && mediaIDs.length) { body.media = { media_ids: mediaIDs }; }
                var res = postTweet(accessToken, body, log);
                if (!res.ok) {
                    if (firstID) {
                        log.push("Thread partially posted up to " + (i) + "/" + thread.length + ". First tweet ID: " + firstID);
                    }
                    throw new Error("Thread post failed at item " + i + ": " + res.error);
                }
                lastID = res.id;
                if (!firstID) { firstID = res.id; }
                postedTexts.push("[" + res.id + "] " + safeExcerpt(t, 80));
                log.push("Posted " + (i + 1) + "/" + thread.length + " id=" + res.id);
            }
            var url = "https://x.com/i/status/" + firstID;
            finish("Posted thread of " + thread.length + " tweets. URL: " + url + "\n" + postedTexts.join("\n"), log, null);
        } else {
            if (!singleText) {
                throw new Error("Provide config.text, config.thread, or pipeline input text.");
            }
            if (singleText.length > 280) {
                log.push("Warning: tweet is " + singleText.length + " chars (>280); X API will reject. Truncate or use config.thread.");
            }
            var body2 = { text: singleText };
            if (inReplyTo) { body2.reply = { in_reply_to_tweet_id: inReplyTo }; }
            if (mediaIDs && mediaIDs.length) { body2.media = { media_ids: mediaIDs }; }
            var res2 = postTweet(accessToken, body2, log);
            if (!res2.ok) { throw new Error("Tweet failed: " + res2.error); }
            var url2 = "https://x.com/i/status/" + res2.id;
            finish("Posted tweet id=" + res2.id + ". URL: " + url2, log, null);
        }
    }
} catch (err) {
    finish(null, ["XPost error: " + (err.message || String(err))], err.message || String(err));
}
