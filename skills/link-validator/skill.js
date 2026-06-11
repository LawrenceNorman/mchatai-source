// skill-manifest: { "id": "custom.linkValidator", "name": "Link Validator", "version": "1.0.0", "author": "mChatAI", "description": "Probe every http(s) URL found in the input text and append a Link Check report with per-URL status and a dead-link rate. Use as a final pipeline step or standalone to QA research output." }
//
// Config:
//   maxLinks          - max URLs to probe (default 20, clamp 1-50)
//   timeoutSeconds    - per-URL probe timeout (default 8, clamp 2-30)
//   failOnDeadLinks   - "true" to set error when deadLinkRate > deadLinkThreshold (default "false")
//   deadLinkThreshold - rate 0..1 that counts as failure when failOnDeadLinks (default "0.2")
//   reportOnly        - "true" to emit ONLY the report (default "false": original text + report)
//
// Output: input text + "## Link Check" markdown report. The report always
// includes a machine-readable summary line:
//   LINKCHECK_SUMMARY {"total":N,"alive":N,"dead":N,"deadLinkRate":0.0}
// so canary scripts can parse results without scraping markdown.

var input = getInput();
var config = input.config || {};
var text = input.text || "";

function clampInt(raw, def, lo, hi) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) { n = def; }
    if (n < lo) { n = lo; }
    if (n > hi) { n = hi; }
    return n;
}

function clampFloat(raw, def, lo, hi) {
    var n = parseFloat(raw);
    if (isNaN(n)) { n = def; }
    if (n < lo) { n = lo; }
    if (n > hi) { n = hi; }
    return n;
}

var maxLinks = clampInt(config.maxLinks, 20, 1, 50);
var timeoutSeconds = clampInt(config.timeoutSeconds, 8, 2, 30);
var failOnDeadLinks = String(config.failOnDeadLinks || "false").toLowerCase() === "true";
var deadLinkThreshold = clampFloat(config.deadLinkThreshold, 0.2, 0, 1);
var reportOnly = String(config.reportOnly || "false").toLowerCase() === "true";

function finish(outText, log, error) {
    setOutput({
        text: outText === undefined ? null : outText,
        log: log || [],
        error: error || null
    });
}

// Extract http(s) URLs, preserving first-seen order, deduped.
// Strip common trailing punctuation that prose wraps around URLs.
function extractURLs(source, limit) {
    var re = /https?:\/\/[^\s<>"')\]}]+/g;
    var seen = {};
    var urls = [];
    var match;
    while ((match = re.exec(source)) !== null) {
        var url = match[0];
        // Trim trailing punctuation that is almost never part of the URL.
        url = url.replace(/[.,;:!?]+$/, "");
        if (!seen[url]) {
            seen[url] = true;
            urls.push(url);
            if (urls.length >= limit) { break; }
        }
    }
    return urls;
}

function probe(url, method) {
    var optsJSON = JSON.stringify({
        method: method,
        headers: { "User-Agent": "mChatAI/1.0 (LinkValidator)" },
        body: null,
        timeout: timeoutSeconds,
        maxChars: 2000
    });
    try {
        var result = JSON.parse(httpFetch(url, optsJSON));
        return result;
    } catch (e) {
        return { status: 0, error: String(e && e.message ? e.message : e) };
    }
}

function checkURL(url, log) {
    var head = probe(url, "HEAD");
    var status = head.status || 0;
    // Some servers reject HEAD (405/501) or misbehave (403 bot blocks on
    // HEAD only) — retry once with GET before judging.
    if (status === 405 || status === 501 || status === 403 || status === 0) {
        var get = probe(url, "GET");
        if ((get.status || 0) > 0) {
            status = get.status;
        }
    }
    var alive = status >= 200 && status < 400;
    log.push((alive ? "OK   " : "DEAD ") + status + " " + url);
    return { url: url, status: status, alive: alive };
}

var log = [];

if (!text || text.length === 0) {
    finish("", ["No input text — nothing to check."], "linkValidator: empty input text.");
} else {
    var urls = extractURLs(text, maxLinks);
    if (urls.length === 0) {
        var noneReport = "\n\n## Link Check\nNo http(s) URLs found in input.\nLINKCHECK_SUMMARY {\"total\":0,\"alive\":0,\"dead\":0,\"deadLinkRate\":0}";
        finish(reportOnly ? noneReport.trim() : text + noneReport, ["No URLs found."], null);
    } else {
        var results = [];
        for (var i = 0; i < urls.length; i++) {
            results.push(checkURL(urls[i], log));
        }

        var dead = [];
        var aliveCount = 0;
        for (var j = 0; j < results.length; j++) {
            if (results[j].alive) { aliveCount++; } else { dead.push(results[j]); }
        }
        var deadRate = results.length > 0 ? dead.length / results.length : 0;
        var deadRateRounded = Math.round(deadRate * 100) / 100;

        var lines = [];
        lines.push("## Link Check");
        lines.push("Checked " + results.length + " URL(s): " + aliveCount + " alive, " + dead.length + " dead.");
        if (dead.length > 0) {
            lines.push("");
            lines.push("Dead links:");
            for (var k = 0; k < dead.length; k++) {
                lines.push("- [HTTP " + dead[k].status + "] " + dead[k].url);
            }
        }
        lines.push("");
        lines.push("LINKCHECK_SUMMARY " + JSON.stringify({
            total: results.length,
            alive: aliveCount,
            dead: dead.length,
            deadLinkRate: deadRateRounded
        }));

        var report = lines.join("\n");
        var outText = reportOnly ? report : text + "\n\n" + report;

        var error = null;
        if (failOnDeadLinks && deadRate > deadLinkThreshold) {
            error = "linkValidator: deadLinkRate " + deadRateRounded + " exceeds threshold " + deadLinkThreshold + " (" + dead.length + "/" + results.length + " dead).";
        }
        finish(outText, log, error);
    }
}
