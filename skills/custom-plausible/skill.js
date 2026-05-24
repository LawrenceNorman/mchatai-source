// skill-manifest: { "id": "custom.plausible", "name": "Plausible Analytics", "version": "1.0.0", "author": "mChatAI", "description": "Track a Plausible event (no auth) or query stats via the Stats API (Bearer API key). Actions: event, aggregate, timeseries, breakdown. Supports self-hosted instances via base URL override." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "plausible";

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

function appendQuery(url, key, value) {
    if (value === undefined || value === null || value === "") { return url; }
    var sep = url.indexOf("?") === -1 ? "?" : "&";
    return url + sep + encodeURIComponent(key) + "=" + encodeURIComponent(String(value));
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var action = pickString(config.action, "event");
    var baseURL = pickString(config.baseURL, "https://plausible.io");
    if (baseURL.charAt(baseURL.length - 1) === "/") {
        baseURL = baseURL.slice(0, -1);
    }

    var log = ["Plausible Analytics v1.0.0", "Action: " + action, "Base: " + baseURL];

    if (action === "event") {
        // No auth needed — Plausible accepts events from any caller for registered domains
        var eventName = pickString(config.event, config.name, "pageview");
        var eventURL = pickString(config.eventURL, config.url);
        var domain = pickString(config.domain, config.site_id, config.siteId);

        if (!eventURL && !dryRun) {
            throw new Error("config.eventURL (or config.url) is required — the page URL the event is associated with.");
        }
        if (!domain && !dryRun) {
            throw new Error("config.domain (or config.site_id) is required — your registered Plausible site, e.g. 'mchatai.com'.");
        }

        var body = {
            name: eventName,
            url: eventURL,
            domain: domain
        };
        var referrer = pickString(config.referrer);
        if (referrer) { body.referrer = referrer; }
        var props = config.props;
        if (props) {
            if (typeof props === "string") {
                try { props = JSON.parse(props); } catch (e) {
                    throw new Error("config.props must be a JSON object: " + e.message);
                }
            }
            if (typeof props === "object") { body.props = props; }
        }
        var revenue = config.revenue;
        if (revenue) {
            if (typeof revenue === "string") {
                try { revenue = JSON.parse(revenue); } catch (e) {
                    throw new Error("config.revenue must be a JSON object {currency, amount}: " + e.message);
                }
            }
            if (typeof revenue === "object") { body.revenue = revenue; }
        }

        // Plausible REQUIRES a User-Agent. Forward the user's real one if known
        // (passed via config.userAgent for server-side tracking from a known
        // browser request), else mark this as a server-side event.
        var userAgent = pickString(config.userAgent, "mChatAI-MarketingMachine/1.0 (server-side event)");
        var headers = {
            "Content-Type": "application/json",
            "User-Agent": userAgent
        };
        // X-Forwarded-For lets Plausible bucket by the original visitor's IP
        // when this skill is a relay. Optional.
        var forwardedFor = pickString(config.forwardedFor, config.xForwardedFor);
        if (forwardedFor) { headers["X-Forwarded-For"] = forwardedFor; }

        if (dryRun) {
            log.push("DRY RUN: would POST event '" + eventName + "' for " + domain + " (url=" + safeExcerpt(eventURL, 100) + ")");
            finish("DRY RUN: would track Plausible event '" + eventName + "' for " + domain, log, null);
        } else {
            var res = fetchJSON(baseURL + "/api/event", {
                method: "POST",
                headers: headers,
                body: JSON.stringify(body),
                timeout: 15,
                maxChars: 5000
            });
            if (res.error) { throw new Error("Network: " + res.error); }
            // Plausible returns 202 on success with empty body
            if (res.status === 202 || (res.status >= 200 && res.status < 300)) {
                finish("Plausible event '" + eventName + "' accepted (HTTP " + res.status + ").", log, null);
            } else if (res.status === 400) {
                log.push("400 body: " + safeExcerpt(res.body, 400));
                throw new Error("Plausible 400 — invalid event (domain not registered? props oversized?).");
            } else {
                log.push("HTTP " + res.status + " body=" + safeExcerpt(res.body, 400));
                throw new Error("Plausible HTTP " + res.status);
            }
        }
    } else if (action === "aggregate" || action === "timeseries" || action === "breakdown") {
        // Stats Query API — requires Bearer API key
        var apiKey = resolveCredential("apiKey", "accessToken", "statsApiKey");
        if (!apiKey && !dryRun) {
            throw new Error("Plausible Stats queries require an API key. Create at https://plausible.io/settings/api-keys (or your self-hosted equivalent). Save under Keychain ExtAPI_plausible_apiKey.");
        }
        var siteID = pickString(config.site_id, config.siteId, config.domain);
        if (!siteID && !dryRun) {
            throw new Error("config.site_id (or config.domain) is required.");
        }
        var period = pickString(config.period, "30d");
        var metrics = pickString(config.metrics, "visitors,pageviews");
        var date = pickString(config.date);
        var filters = pickString(config.filters);

        var endpoint = "/api/v1/stats/" + action;
        var url = baseURL + endpoint;
        url = appendQuery(url, "site_id", siteID);
        url = appendQuery(url, "period", period);
        url = appendQuery(url, "metrics", metrics);
        if (date) { url = appendQuery(url, "date", date); }
        if (filters) { url = appendQuery(url, "filters", filters); }
        if (action === "breakdown") {
            var property = pickString(config.property, "event:page");
            url = appendQuery(url, "property", property);
            var limit = pickString(config.limit, "10");
            url = appendQuery(url, "limit", limit);
        }
        if (action === "timeseries") {
            var interval = pickString(config.interval);
            if (interval) { url = appendQuery(url, "interval", interval); }
        }

        if (dryRun) {
            log.push("DRY RUN: would GET " + safeExcerpt(url, 200));
            finish("DRY RUN: would query Plausible " + action + " for " + siteID + " (period=" + period + ")", log, null);
        } else {
            var statsRes = fetchJSON(url, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + apiKey,
                    "Accept": "application/json"
                },
                timeout: 30,
                maxChars: 100000
            });
            if (statsRes.error) { throw new Error("Network: " + statsRes.error); }
            if (statsRes.status === 401) {
                throw new Error("Plausible 401 — API key invalid or revoked.");
            }
            if (statsRes.status === 402) {
                throw new Error("Plausible 402 — Stats API requires a Business plan (or self-hosted).");
            }
            if (!(statsRes.status >= 200 && statsRes.status < 300)) {
                log.push("HTTP " + statsRes.status + " body=" + safeExcerpt(statsRes.body, 600));
                throw new Error("Plausible HTTP " + statsRes.status);
            }
            var parsed;
            try { parsed = JSON.parse(statsRes.body); } catch (e) {
                throw new Error("Bad JSON response.");
            }
            // Format the response as a human-readable summary
            var summary = "";
            if (action === "aggregate" && parsed.results) {
                var pairs = [];
                for (var k in parsed.results) {
                    if (Object.prototype.hasOwnProperty.call(parsed.results, k)) {
                        pairs.push(k + "=" + (parsed.results[k].value !== undefined ? parsed.results[k].value : parsed.results[k]));
                    }
                }
                summary = "Plausible " + siteID + " (" + period + "): " + pairs.join(", ");
            } else if (action === "timeseries" && parsed.results) {
                var rows = parsed.results.map(function (row) {
                    var fields = [];
                    for (var f in row) {
                        if (Object.prototype.hasOwnProperty.call(row, f)) {
                            fields.push(f + "=" + row[f]);
                        }
                    }
                    return fields.join(" ");
                });
                summary = "Plausible " + siteID + " timeseries (" + period + ", " + rows.length + " rows):\n" + rows.join("\n");
            } else if (action === "breakdown" && parsed.results) {
                var bRows = parsed.results.map(function (row) {
                    var fields = [];
                    for (var f in row) {
                        if (Object.prototype.hasOwnProperty.call(row, f)) {
                            fields.push(f + "=" + row[f]);
                        }
                    }
                    return fields.join(" | ");
                });
                summary = "Plausible " + siteID + " breakdown by " + pickString(config.property, "event:page") + " (" + period + "):\n" + bRows.join("\n");
            } else {
                summary = JSON.stringify(parsed);
            }
            finish(summary, log, null);
        }
    } else {
        throw new Error("config.action must be one of: event, aggregate, timeseries, breakdown. Got: " + action);
    }
} catch (err) {
    finish(null, ["Plausible error: " + (err.message || String(err))], err.message || String(err));
}
