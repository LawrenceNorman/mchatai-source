// skill-manifest: { "id": "custom.youtube-upload", "name": "YouTube Upload", "version": "1.0.0", "author": "mChatAI", "description": "Initiate a YouTube resumable upload session (caller PUTs the bytes), or update metadata / privacy on an existing video. JS-only — binary upload of the video file is delegated to a microservice or shell since JSCore can't stream large bodies." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "youtube";

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

function parseObject(value, fieldName) {
    if (!value) { return null; }
    if (typeof value === "object") { return value; }
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch (e) {
            throw new Error(fieldName + " must be a JSON object: " + e.message);
        }
    }
    throw new Error(fieldName + " must be a JSON object or JSON string.");
}

function buildSnippet(config) {
    var snippet = {};
    var title = pickString(config.title);
    if (!title) { throw new Error("config.title is required."); }
    if (title.length > 100) {
        throw new Error("config.title exceeds YouTube's 100-char limit (" + title.length + ").");
    }
    snippet.title = title;
    var description = pickString(config.description);
    if (description) {
        if (description.length > 5000) {
            throw new Error("config.description exceeds YouTube's 5000-char limit (" + description.length + ").");
        }
        snippet.description = description;
    }
    var categoryID = pickString(config.categoryID, config.categoryId, "22"); // 22 = People & Blogs (safe default)
    snippet.categoryId = categoryID;
    var tags = config.tags;
    if (tags) {
        if (typeof tags === "string") {
            try {
                var parsedTags = JSON.parse(tags);
                tags = Array.isArray(parsedTags) ? parsedTags : tags.split(",");
            } catch (e) {
                tags = tags.split(",");
            }
        }
        if (Array.isArray(tags)) {
            tags = tags.map(function (t) { return String(t).replace(/^\s+|\s+$/g, ""); }).filter(function (t) { return t.length; });
            // YouTube limit: 500 chars across all tags inc. commas
            var totalTagChars = tags.reduce(function (sum, t) { return sum + t.length + 2; }, 0);
            if (totalTagChars > 500) {
                throw new Error("Tags exceed YouTube's 500-char aggregate limit (current: " + totalTagChars + ").");
            }
            snippet.tags = tags;
        }
    }
    var defaultLang = pickString(config.defaultLanguage);
    if (defaultLang) { snippet.defaultLanguage = defaultLang; }
    return snippet;
}

function buildStatus(config) {
    var status = {};
    var privacy = pickString(config.privacyStatus, "private");
    if (privacy !== "public" && privacy !== "private" && privacy !== "unlisted") {
        throw new Error("config.privacyStatus must be public, private, or unlisted.");
    }
    status.privacyStatus = privacy;
    if (config.publishAt) {
        // Scheduled publish — must be private + future ISO8601 timestamp
        if (privacy !== "private") {
            throw new Error("config.publishAt requires privacyStatus=private.");
        }
        status.publishAt = pickString(config.publishAt);
    }
    if (config.madeForKids !== undefined) {
        status.madeForKids = (config.madeForKids === true || config.madeForKids === "true");
    } else {
        status.selfDeclaredMadeForKids = false;
    }
    if (config.embeddable !== undefined) {
        status.embeddable = (config.embeddable === true || config.embeddable === "true");
    }
    if (config.license) {
        status.license = pickString(config.license, "youtube"); // "youtube" or "creativeCommon"
    }
    return status;
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var accessToken = resolveCredential("accessToken", "bearerToken", "oauthToken");

    if (!accessToken && !dryRun) {
        throw new Error("YouTube Upload requires a Google OAuth 2.0 access token with scope https://www.googleapis.com/auth/youtube.upload. Tokens expire in 1 hour — wire refresh-token flow separately. Save under Keychain ExtAPI_youtube_accessToken.");
    }

    var action = pickString(config.action, "initiateUpload");
    var log = ["YouTube Upload v1.0.0", "Action: " + action];

    if (action === "initiateUpload") {
        var snippet = buildSnippet(config);
        var status = buildStatus(config);
        var contentLength = parseInt(pickString(config.fileSizeBytes, "0"), 10);
        var contentType = pickString(config.contentType, "video/*");

        if (dryRun) {
            log.push("DRY RUN: would initiate upload for '" + safeExcerpt(snippet.title, 80) + "' privacy=" + status.privacyStatus + " size=" + (contentLength || "unknown"));
            finish("DRY RUN: would create YouTube upload session for " + snippet.title, log, null);
        } else {
            // Resumable upload init: POST returns Location header = the upload URL
            var initHeaders = {
                "Authorization": "Bearer " + accessToken,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": contentType
            };
            if (contentLength > 0) {
                initHeaders["X-Upload-Content-Length"] = String(contentLength);
            }

            var initRes = fetchJSON(
                "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                {
                    method: "POST",
                    headers: initHeaders,
                    body: JSON.stringify({ snippet: snippet, status: status }),
                    timeout: 30,
                    maxChars: 10000
                }
            );

            if (initRes.error) { throw new Error("Network: " + initRes.error); }
            if (initRes.status === 401) {
                throw new Error("YouTube 401 — OAuth token expired or lacks youtube.upload scope.");
            }
            if (initRes.status === 403) {
                throw new Error("YouTube 403 — quota exceeded (default 10,000 units/day; an upload costs 1,600 units) or channel not verified for uploads.");
            }
            if (!(initRes.status >= 200 && initRes.status < 300)) {
                log.push("HTTP " + initRes.status + " body=" + safeExcerpt(initRes.body, 600));
                throw new Error("YouTube HTTP " + initRes.status);
            }

            var uploadURL = "";
            if (initRes.headers) {
                uploadURL = initRes.headers["location"] || initRes.headers["Location"] || "";
            }
            if (!uploadURL) {
                log.push("Init succeeded but no Location header. Body: " + safeExcerpt(initRes.body, 400));
                throw new Error("Upload URL missing from response headers — cannot resume.");
            }

            // Caller must now PUT the file bytes to uploadURL. Document this clearly.
            log.push("Upload URL acquired (expires in 1 week).");
            var instructions = [
                "YouTube resumable upload session created.",
                "uploadURL: " + uploadURL,
                "",
                "Next: PUT the video bytes to that URL with Content-Type: " + contentType + ".",
                "From a shell: curl -X PUT -H 'Content-Type: " + contentType + "' --data-binary @video.mp4 '" + uploadURL + "'",
                "",
                "The server returns the created Video resource (JSON with videoId) on success.",
                "Note: This URL is valid for 1 week. Re-initiate if expired."
            ].join("\n");
            finish(instructions, log, null);
        }
    } else if (action === "updateMetadata") {
        var videoID = pickString(config.videoID, config.videoId, config.id);
        if (!videoID && !dryRun) { throw new Error("config.videoID required for updateMetadata."); }
        var snippet2 = buildSnippet(config);
        var status2 = buildStatus(config);

        if (dryRun) {
            log.push("DRY RUN: would update video " + (videoID || "<unknown>") + " with title='" + safeExcerpt(snippet2.title, 80) + "' privacy=" + status2.privacyStatus);
            finish("DRY RUN: would update YouTube video " + (videoID || "<unknown>"), log, null);
        } else {
            var updateBody = {
                id: videoID,
                snippet: snippet2,
                status: status2
            };
            var updateRes = fetchJSON(
                "https://www.googleapis.com/youtube/v3/videos?part=snippet,status",
                {
                    method: "PUT",
                    headers: {
                        "Authorization": "Bearer " + accessToken,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(updateBody),
                    timeout: 30,
                    maxChars: 20000
                }
            );
            if (updateRes.error) { throw new Error("Network: " + updateRes.error); }
            if (!(updateRes.status >= 200 && updateRes.status < 300)) {
                log.push("HTTP " + updateRes.status + " body=" + safeExcerpt(updateRes.body, 600));
                throw new Error("YouTube HTTP " + updateRes.status);
            }
            var watchURL = "https://www.youtube.com/watch?v=" + videoID;
            log.push("Updated. URL: " + watchURL);
            finish("Updated YouTube video " + videoID + ". URL: " + watchURL, log, null);
        }
    } else if (action === "getVideo") {
        var gID = pickString(config.videoID, config.videoId, config.id);
        if (!gID) { throw new Error("config.videoID required for getVideo."); }
        if (dryRun) {
            log.push("DRY RUN: would fetch metadata for " + gID);
            finish("DRY RUN: would fetch " + gID, log, null);
        } else {
            var parts = pickString(config.parts, "snippet,status,statistics");
            var getRes = fetchJSON(
                "https://www.googleapis.com/youtube/v3/videos?part=" + encodeURIComponent(parts) + "&id=" + encodeURIComponent(gID),
                {
                    method: "GET",
                    headers: { "Authorization": "Bearer " + accessToken, "Accept": "application/json" },
                    timeout: 20,
                    maxChars: 50000
                }
            );
            if (getRes.error) { throw new Error("Network: " + getRes.error); }
            if (!(getRes.status >= 200 && getRes.status < 300)) {
                log.push("HTTP " + getRes.status + " body=" + safeExcerpt(getRes.body, 600));
                throw new Error("YouTube HTTP " + getRes.status);
            }
            var gParsed;
            try { gParsed = JSON.parse(getRes.body); } catch (e) { throw new Error("Bad JSON response."); }
            if (!gParsed.items || !gParsed.items.length) {
                finish("No YouTube video found with id=" + gID, log, null);
            } else {
                var item = gParsed.items[0];
                var summary = "id=" + item.id;
                if (item.snippet) {
                    summary += " title='" + safeExcerpt(item.snippet.title, 60) + "'";
                    summary += " published=" + (item.snippet.publishedAt || "?");
                }
                if (item.status) { summary += " privacy=" + (item.status.privacyStatus || "?"); }
                if (item.statistics) {
                    summary += " views=" + (item.statistics.viewCount || "0");
                    summary += " likes=" + (item.statistics.likeCount || "0");
                }
                finish(summary, log, null);
            }
        }
    } else {
        throw new Error("config.action must be one of: initiateUpload, updateMetadata, getVideo. Got: " + action);
    }
} catch (err) {
    finish(null, ["YouTube Upload error: " + (err.message || String(err))], err.message || String(err));
}
