// skill-manifest: { "id": "custom.reddit-submit", "name": "Reddit Submit", "version": "1.0.0", "author": "mChatAI", "description": "Submit a text or link post to a subreddit, or reply to a post/comment, via Reddit's OAuth API. Requires a unique User-Agent and a user-context access token." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "reddit";

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

function formEncode(params) {
    var parts = [];
    for (var k in params) {
        if (!Object.prototype.hasOwnProperty.call(params, k)) { continue; }
        var v = params[k];
        if (v === undefined || v === null) { continue; }
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    }
    return parts.join("&");
}

function parseRedditJSON(body, log) {
    var parsed;
    try { parsed = JSON.parse(body); } catch (e) {
        throw new Error("Reddit returned non-JSON body: " + safeExcerpt(body, 200));
    }
    if (parsed && parsed.json && parsed.json.errors && parsed.json.errors.length) {
        // errors is [[code, message, field], ...]
        var summary = parsed.json.errors.map(function (e) {
            return e[0] + ": " + e[1] + (e[2] ? " (" + e[2] + ")" : "");
        }).join("; ");
        log.push("Reddit API errors: " + summary);
        throw new Error("Reddit: " + summary);
    }
    return parsed && parsed.json ? parsed.json : parsed;
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";

    var accessToken = resolveCredential("accessToken", "bearerToken", "token");
    var userAgent = pickString(config.userAgent, getSecret(keychainKey("userAgent")));

    if (!userAgent) {
        // Reddit rejects vague User-Agent strings ("python-requests/2.x", "curl/7.x")
        // outright. Encourage a real one but accept a generic fallback so dry-runs work.
        userAgent = "mChatAI-Marketing/1.0 (by anonymous; see https://mchatai.com)";
    }

    if (!accessToken && !dryRun) {
        throw new Error("Reddit Submit requires an OAuth 2.0 user-context access token. Tokens expire every 60 minutes; refresh manually or wire a refresh-token pipeline. Save under Keychain ExtAPI_reddit_accessToken. Generate via the 'authorization code' flow at https://www.reddit.com/prefs/apps.");
    }

    var action = pickString(config.action, "submit");
    var log = ["Reddit Submit v1.0.0", "Action: " + action, "User-Agent: " + safeExcerpt(userAgent, 80)];

    if (action === "submit") {
        var subreddit = pickString(config.subreddit, config.sr);
        if (subreddit && subreddit.indexOf("r/") === 0) {
            subreddit = subreddit.slice(2);
        }
        if (subreddit && subreddit.indexOf("/r/") === 0) {
            subreddit = subreddit.slice(3);
        }
        if (!subreddit) {
            throw new Error("config.subreddit is required (without /r/ prefix, e.g. 'IndieGaming').");
        }

        var title = pickString(config.title);
        if (!title) { throw new Error("config.title is required."); }
        if (title.length > 300) {
            throw new Error("Reddit title is " + title.length + " chars (max 300).");
        }

        var url = pickString(config.url);
        var text = pickString(config.text, input.text);
        var kind = pickString(config.kind, url ? "link" : "self");
        if (kind !== "self" && kind !== "link") {
            throw new Error("config.kind must be 'self' or 'link'.");
        }
        if (kind === "self" && !text) {
            throw new Error("Self post requires config.text (or pipeline input text).");
        }
        if (kind === "link" && !url) {
            throw new Error("Link post requires config.url.");
        }

        var nsfw = (config.nsfw === true || config.nsfw === "true") ? "true" : "false";
        var spoiler = (config.spoiler === true || config.spoiler === "true") ? "true" : "false";
        var sendReplies = (config.sendReplies === false || config.sendReplies === "false") ? "false" : "true";

        var params = {
            api_type: "json",
            sr: subreddit,
            kind: kind,
            title: title,
            nsfw: nsfw,
            spoiler: spoiler,
            sendreplies: sendReplies,
            resubmit: "true"
        };
        if (kind === "self") { params.text = text; }
        if (kind === "link") { params.url = url; }

        if (dryRun) {
            log.push("DRY RUN: would submit '" + safeExcerpt(title, 80) + "' to /r/" + subreddit + " (kind=" + kind + ")");
            finish("DRY RUN: would submit to /r/" + subreddit + ": " + safeExcerpt(title, 80), log, null);
        } else {
            var res = fetchJSON("https://oauth.reddit.com/api/submit", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + accessToken,
                    "User-Agent": userAgent,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formEncode(params),
                timeout: 30,
                maxChars: 30000
            });
            if (res.error) { throw new Error("Network: " + res.error); }
            if (res.status === 401) {
                throw new Error("Reddit 401 — access token expired or invalid. Refresh via OAuth refresh flow.");
            }
            if (res.status === 403) {
                throw new Error("Reddit 403 — token may lack 'submit' scope, or subreddit doesn't allow posts (rate limit / karma gate / banned).");
            }
            if (!(res.status >= 200 && res.status < 300)) {
                log.push("HTTP " + res.status + " body=" + safeExcerpt(res.body, 600));
                throw new Error("Reddit HTTP " + res.status);
            }
            var parsed = parseRedditJSON(res.body, log);
            if (parsed && parsed.data && parsed.data.url) {
                log.push("Posted: " + parsed.data.url + " id=" + parsed.data.id);
                finish("Posted to /r/" + subreddit + ". URL: " + parsed.data.url, log, null);
            } else {
                log.push("Unexpected response: " + safeExcerpt(res.body, 400));
                finish("Submitted (no URL in response body — check subreddit directly).", log, null);
            }
        }
    } else if (action === "comment") {
        var thingID = pickString(config.thingID, config.thing_id);
        if (!thingID) {
            throw new Error("config.thingID required for comment action. Use t3_xxx (post) or t1_xxx (comment) — the 'name' field on the parent.");
        }
        if (!/^t[1-5]_/.test(thingID)) {
            throw new Error("config.thingID must start with t1_/t3_/etc. Got: " + thingID);
        }
        var commentText = pickString(config.text, input.text);
        if (!commentText) {
            throw new Error("config.text required for comment action.");
        }

        var cParams = {
            api_type: "json",
            thing_id: thingID,
            text: commentText
        };

        if (dryRun) {
            log.push("DRY RUN: would reply to " + thingID + ": " + safeExcerpt(commentText, 200));
            finish("DRY RUN: would reply to " + thingID, log, null);
        } else {
            var cRes = fetchJSON("https://oauth.reddit.com/api/comment", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + accessToken,
                    "User-Agent": userAgent,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formEncode(cParams),
                timeout: 30,
                maxChars: 30000
            });
            if (cRes.error) { throw new Error("Network: " + cRes.error); }
            if (!(cRes.status >= 200 && cRes.status < 300)) {
                log.push("HTTP " + cRes.status + " body=" + safeExcerpt(cRes.body, 600));
                throw new Error("Reddit HTTP " + cRes.status);
            }
            var cParsed = parseRedditJSON(cRes.body, log);
            var commentID = "";
            if (cParsed && cParsed.data && cParsed.data.things && cParsed.data.things[0]) {
                commentID = cParsed.data.things[0].data.name || cParsed.data.things[0].data.id || "";
            }
            log.push("Comment id: " + commentID);
            finish("Posted Reddit comment" + (commentID ? " (id=" + commentID + ")" : ""), log, null);
        }
    } else {
        throw new Error("config.action must be 'submit' or 'comment'. Got: " + action);
    }
} catch (err) {
    finish(null, ["Reddit Submit error: " + (err.message || String(err))], err.message || String(err));
}
