// skill-manifest: { "id": "custom.imagegen", "name": "Image Generation", "version": "1.0.0", "author": "mChatAI", "description": "Generate an image via Replicate (any text-to-image model). Defaults to flux-schnell (fast + cheap). Returns image URL(s) hosted on Replicate's CDN. Uses Prefer: wait for synchronous response when possible." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "replicate";

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

function extractImageURLs(output) {
    // Replicate output shapes vary by model:
    //   - SDXL/flux: array of URL strings
    //   - Some models: single URL string
    //   - Some: { image: "url", ... }
    if (!output) { return []; }
    if (typeof output === "string") { return [output]; }
    if (Array.isArray(output)) {
        return output.filter(function (v) { return typeof v === "string"; });
    }
    if (typeof output === "object") {
        var collected = [];
        for (var k in output) {
            if (!Object.prototype.hasOwnProperty.call(output, k)) { continue; }
            var v = output[k];
            if (typeof v === "string" && v.indexOf("http") === 0) { collected.push(v); }
            if (Array.isArray(v)) {
                for (var i = 0; i < v.length; i++) {
                    if (typeof v[i] === "string" && v[i].indexOf("http") === 0) { collected.push(v[i]); }
                }
            }
        }
        return collected;
    }
    return [];
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var apiToken = resolveCredential("apiKey", "accessToken", "replicateToken");

    if (!apiToken && !dryRun) {
        throw new Error("Image Generation requires a Replicate API token. Create at https://replicate.com/account/api-tokens (free tier available). Save under Keychain ExtAPI_replicate_apiKey.");
    }

    var prompt = pickString(config.prompt, input.text);
    if (!prompt) {
        throw new Error("config.prompt (or pipeline input text) is required.");
    }

    // Model resolution — supports either explicit version hash or owner/name (latest version)
    var version = pickString(config.version);
    var model = pickString(config.model, "black-forest-labs/flux-schnell");
    var modelParts = model.split("/");
    if (!version && modelParts.length !== 2) {
        throw new Error("config.model must be 'owner/name' (e.g. 'stability-ai/sdxl') unless config.version (version hash) is set.");
    }

    // Build input. Start from any explicit `input` config, then layer convenience keys.
    var modelInput = parseObject(config.input, "config.input") || {};
    modelInput.prompt = prompt;
    var negPrompt = pickString(config.negativePrompt, config.negative_prompt);
    if (negPrompt) { modelInput.negative_prompt = negPrompt; }

    var aspectRatio = pickString(config.aspectRatio, config.aspect_ratio);
    if (aspectRatio) { modelInput.aspect_ratio = aspectRatio; }
    var width = pickString(config.width);
    var height = pickString(config.height);
    if (width) { modelInput.width = parseInt(width, 10); }
    if (height) { modelInput.height = parseInt(height, 10); }

    var numOutputs = pickString(config.numOutputs, config.num_outputs);
    if (numOutputs) { modelInput.num_outputs = parseInt(numOutputs, 10); }
    var seed = pickString(config.seed);
    if (seed) { modelInput.seed = parseInt(seed, 10); }
    var steps = pickString(config.steps, config.num_inference_steps);
    if (steps) { modelInput.num_inference_steps = parseInt(steps, 10); }
    var guidance = pickString(config.guidance, config.guidance_scale);
    if (guidance) { modelInput.guidance_scale = parseFloat(guidance); }
    var outputFormat = pickString(config.outputFormat, config.output_format);
    if (outputFormat) { modelInput.output_format = outputFormat; }

    var maxWaitRaw = pickString(config.maxWaitSeconds, "60");
    var maxWait = parseInt(maxWaitRaw, 10);
    if (isNaN(maxWait) || maxWait < 1) { maxWait = 60; }
    if (maxWait > 60) { maxWait = 60; }  // Replicate caps Prefer: wait at 60

    var log = ["Image Generation v1.0.0", "Prompt: " + safeExcerpt(prompt, 120)];
    if (version) { log.push("Version: " + safeExcerpt(version, 60)); }
    else { log.push("Model: " + model + " (latest version)"); }

    if (dryRun) {
        log.push("DRY RUN: would create Replicate prediction with input keys: " + Object.keys(modelInput).join(", "));
        finish("DRY RUN: would generate image with " + (version || model) + " for prompt '" + safeExcerpt(prompt, 60) + "'", log, null);
    } else {
        var url, body;
        if (version) {
            url = "https://api.replicate.com/v1/predictions";
            body = { version: version, input: modelInput };
        } else {
            url = "https://api.replicate.com/v1/models/" + modelParts[0] + "/" + modelParts[1] + "/predictions";
            body = { input: modelInput };
        }

        var headers = {
            "Authorization": "Token " + apiToken,
            "Content-Type": "application/json",
            "Prefer": "wait=" + maxWait
        };

        var res = fetchJSON(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body),
            timeout: maxWait + 15,
            maxChars: 50000
        });

        if (res.error) { throw new Error("Network: " + res.error); }
        if (res.status === 401) {
            throw new Error("Replicate 401 — API token invalid.");
        }
        if (res.status === 402) {
            throw new Error("Replicate 402 — billing required for this model/quota.");
        }
        if (res.status === 422) {
            log.push("422 body: " + safeExcerpt(res.body, 600));
            throw new Error("Replicate 422 — invalid input. Check model's input schema at https://replicate.com/" + (version ? "<version>" : model) + ".");
        }
        if (!(res.status >= 200 && res.status < 300)) {
            log.push("HTTP " + res.status + " body=" + safeExcerpt(res.body, 600));
            throw new Error("Replicate HTTP " + res.status);
        }

        var parsed;
        try { parsed = JSON.parse(res.body); } catch (e) {
            throw new Error("Bad JSON response: " + e.message);
        }

        log.push("Prediction id: " + (parsed.id || "<none>") + " status: " + (parsed.status || "<none>"));

        if (parsed.status === "succeeded") {
            var urls = extractImageURLs(parsed.output);
            if (!urls.length) {
                log.push("Output: " + safeExcerpt(JSON.stringify(parsed.output), 400));
                throw new Error("Prediction succeeded but no image URL extracted. Check model's output shape.");
            }
            var timing = "";
            if (parsed.metrics && parsed.metrics.predict_time) {
                timing = " (" + parsed.metrics.predict_time.toFixed(2) + "s predict)";
            }
            finish("Generated " + urls.length + " image(s)" + timing + ":\n" + urls.join("\n"), log, null);
        } else if (parsed.status === "failed" || parsed.status === "canceled") {
            log.push("Failure detail: " + safeExcerpt(parsed.error || JSON.stringify(parsed), 600));
            throw new Error("Prediction " + parsed.status + ": " + (parsed.error || "no detail provided"));
        } else {
            // Still processing — Prefer: wait timed out. Caller can poll urls.get.
            var pollURL = parsed.urls && parsed.urls.get;
            log.push("Did not complete in " + maxWait + "s. Poll: " + (pollURL || "<no url>"));
            finish("Image generation in progress (status=" + parsed.status + ", id=" + parsed.id + "). Poll: " + (pollURL || "https://api.replicate.com/v1/predictions/" + parsed.id), log, null);
        }
    }
} catch (err) {
    finish(null, ["Image Generation error: " + (err.message || String(err))], err.message || String(err));
}
