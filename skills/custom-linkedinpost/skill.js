// skill-manifest: { "id": "custom.linkedinpost", "name": "LinkedIn Post", "version": "1.0.0", "author": "mChatAI", "description": "Post text content to LinkedIn as a personal share or company page update via the UGC Posts API." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "linkedin";

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

function fetchPersonURN(accessToken, log) {
    var res = fetchJSON("https://api.linkedin.com/v2/userinfo", {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + accessToken,
            "Accept": "application/json"
        },
        timeout: 15,
        maxChars: 10000
    });
    if (res.error || !(res.status >= 200 && res.status < 300)) {
        log.push("userinfo HTTP " + res.status + " body=" + safeExcerpt(res.body, 400));
        throw new Error("Could not resolve LinkedIn person URN. Check 'openid profile' scopes on your token. Status " + res.status + ".");
    }
    var parsed;
    try { parsed = JSON.parse(res.body); } catch (e) {
        throw new Error("userinfo returned non-JSON body.");
    }
    if (!parsed || !parsed.sub) {
        throw new Error("userinfo missing 'sub' field. Body: " + safeExcerpt(res.body, 200));
    }
    return "urn:li:person:" + parsed.sub;
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var accessToken = resolveCredential("accessToken", "bearerToken", "userAccessToken");
    if (!accessToken && !dryRun) {
        throw new Error("LinkedIn Post requires an OAuth 2.0 user access token with scope 'w_member_social' (and 'w_organization_social' for company posts). Save as Keychain ExtAPI_linkedin_accessToken or pass config.accessToken.");
    }

    var text = pickString(config.text, input.text);
    if (!text) {
        throw new Error("Provide config.text or pipeline input text.");
    }

    // Author URN: prefer explicit, else fetch from /userinfo for personal, else require for org
    var authorURN = pickString(config.authorURN, config.organizationURN);
    var log = ["LinkedIn Post v1.0.0"];

    if (!authorURN) {
        if (config.target === "organization" || config.organizationID) {
            var orgID = pickString(config.organizationID);
            if (!orgID) {
                throw new Error("Posting to a company page requires config.organizationURN (e.g. urn:li:organization:12345) or config.organizationID.");
            }
            authorURN = "urn:li:organization:" + orgID;
        } else {
            if (dryRun) {
                authorURN = "urn:li:person:<resolved-at-runtime>";
                log.push("Dry run: skipping /userinfo lookup.");
            } else {
                authorURN = fetchPersonURN(accessToken, log);
                log.push("Resolved author URN from /userinfo: " + authorURN);
            }
        }
    }

    var visibility = pickString(config.visibility, "PUBLIC");
    if (visibility !== "PUBLIC" && visibility !== "CONNECTIONS" && visibility !== "LOGGED_IN") {
        throw new Error("config.visibility must be PUBLIC, CONNECTIONS, or LOGGED_IN.");
    }

    var ugcBody = {
        author: authorURN,
        lifecycleState: "PUBLISHED",
        specificContent: {
            "com.linkedin.ugc.ShareContent": {
                shareCommentary: { text: text },
                shareMediaCategory: "NONE"
            }
        },
        visibility: {
            "com.linkedin.ugc.MemberNetworkVisibility": visibility
        }
    };

    // Article share support: { articleURL, articleTitle, articleDescription, articleThumbnailURL }
    var articleURL = pickString(config.articleURL);
    if (articleURL) {
        var media = { status: "READY", originalUrl: articleURL };
        var articleTitle = pickString(config.articleTitle);
        var articleDescription = pickString(config.articleDescription);
        if (articleTitle) { media.title = { text: articleTitle }; }
        if (articleDescription) { media.description = { text: articleDescription }; }
        var thumb = pickString(config.articleThumbnailURL);
        if (thumb) { media.thumbnails = [{ url: thumb }]; }
        ugcBody.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "ARTICLE";
        ugcBody.specificContent["com.linkedin.ugc.ShareContent"].media = [media];
    }

    if (dryRun) {
        log.push("DRY RUN: would POST to /v2/ugcPosts. Author: " + authorURN + ". Text: " + safeExcerpt(text, 200));
        finish("DRY RUN: would post to LinkedIn as " + authorURN, log, null);
    } else {
        var response = fetchJSON("https://api.linkedin.com/v2/ugcPosts", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + accessToken,
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0"
            },
            body: JSON.stringify(ugcBody),
            timeout: 30,
            maxChars: 50000
        });

        if (response.error) {
            log.push("Network error: " + response.error);
            throw new Error("Request failed: " + response.error);
        }
        if (!(response.status >= 200 && response.status < 300)) {
            log.push("HTTP " + response.status + " body=" + safeExcerpt(response.body, 800));
            throw new Error("LinkedIn HTTP " + response.status);
        }

        // Created posts return the URN in body.id OR in the x-restli-id header
        var postID = "";
        if (response.headers && (response.headers["x-restli-id"] || response.headers["X-RestLi-Id"])) {
            postID = response.headers["x-restli-id"] || response.headers["X-RestLi-Id"];
        }
        if (!postID && response.body) {
            try {
                var parsed = JSON.parse(response.body);
                if (parsed && parsed.id) { postID = parsed.id; }
            } catch (e) { /* body may be empty on 201, that's fine */ }
        }

        if (postID) {
            log.push("Created post URN: " + postID);
            finish("Posted to LinkedIn. URN: " + postID, log, null);
        } else {
            log.push("Post created but no URN returned. HTTP " + response.status);
            finish("Posted to LinkedIn (URN not returned in response).", log, null);
        }
    }
} catch (err) {
    finish(null, ["LinkedIn Post error: " + (err.message || String(err))], err.message || String(err));
}
