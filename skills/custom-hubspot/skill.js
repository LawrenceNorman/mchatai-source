// skill-manifest: { "id": "custom.hubspot", "name": "HubSpot CRM", "version": "1.0.0", "author": "mChatAI", "description": "HubSpot CRM v3: upsert contacts by email, look up contacts, update lifecycle stage, add/remove from static lists. Single Private App access token." }
var input = getInput();
var config = input.config || {};
var providerRawValue = "hubspot";

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

function parseObject(value, fieldName) {
    if (!value) { return {}; }
    if (typeof value === "object") { return value; }
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch (e) {
            throw new Error(fieldName + " must be a JSON object: " + e.message);
        }
    }
    throw new Error(fieldName + " must be a JSON object or JSON string.");
}

function hubspotFetch(method, path, body, accessToken, log) {
    var headers = {
        "Authorization": "Bearer " + accessToken,
        "Accept": "application/json"
    };
    if (body) { headers["Content-Type"] = "application/json"; }

    var res = fetchJSON("https://api.hubapi.com" + path, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : null,
        timeout: 30,
        maxChars: 50000
    });
    if (res.error) {
        log.push("Network: " + res.error);
        throw new Error("Network: " + res.error);
    }
    if (res.status === 401) {
        throw new Error("HubSpot 401 — Private App token invalid or revoked. Regenerate at Settings → Integrations → Private Apps.");
    }
    if (res.status === 403) {
        throw new Error("HubSpot 403 — token lacks required scopes (typically crm.objects.contacts.read, crm.objects.contacts.write, crm.lists.read, crm.lists.write).");
    }
    if (!(res.status >= 200 && res.status < 300)) {
        log.push("HTTP " + res.status + " body=" + safeExcerpt(res.body, 600));
        var parsed = null;
        try { parsed = JSON.parse(res.body); } catch (e) { /* not JSON */ }
        var msg = (parsed && parsed.message) ? parsed.message : ("HTTP " + res.status);
        throw new Error("HubSpot: " + msg);
    }
    if (!res.body || res.body.length === 0) { return null; }
    try { return JSON.parse(res.body); } catch (e) {
        throw new Error("HubSpot returned non-JSON body: " + safeExcerpt(res.body, 200));
    }
}

try {
    var dryRun = config.dryRun === true || config.dryRun === "true";
    var accessToken = resolveCredential("apiKey", "accessToken", "privateAppToken");

    if (!accessToken && !dryRun) {
        throw new Error("HubSpot requires a Private App access token. Create at Settings → Integrations → Private Apps with these scopes minimum: crm.objects.contacts.read, crm.objects.contacts.write, crm.lists.read, crm.lists.write. Save under Keychain ExtAPI_hubspot_apiKey.");
    }

    var action = pickString(config.action, "upsertContact");
    var log = ["HubSpot CRM v1.0.0", "Action: " + action];

    if (action === "upsertContact") {
        var email = pickString(config.email);
        if (!email && !dryRun) {
            throw new Error("config.email is required for upsertContact.");
        }
        if (email && !looksLikeEmail(email)) {
            throw new Error("config.email is not valid: " + email);
        }
        var props = parseObject(config.properties, "config.properties");
        // Always include email so the contact is created if it doesn't exist
        if (email) { props.email = email; }
        // Convenience aliases
        var firstName = pickString(config.firstName);
        var lastName = pickString(config.lastName);
        var company = pickString(config.company);
        var lifecycleStage = pickString(config.lifecycleStage);
        if (firstName) { props.firstname = firstName; }
        if (lastName) { props.lastname = lastName; }
        if (company) { props.company = company; }
        if (lifecycleStage) { props.lifecyclestage = lifecycleStage; }

        if (dryRun) {
            log.push("DRY RUN: would upsert contact " + (email || "<no email>") + " with " + Object.keys(props).length + " properties");
            finish("DRY RUN: would upsert contact " + (email || "<unknown>"), log, null);
        } else {
            var upsertBody = {
                inputs: [{
                    idProperty: "email",
                    id: email,
                    properties: props
                }]
            };
            var upsertRes = hubspotFetch("POST", "/crm/v3/objects/contacts/batch/upsert", upsertBody, accessToken, log);
            var resultRow = upsertRes && upsertRes.results && upsertRes.results[0];
            if (resultRow) {
                log.push("Contact id=" + resultRow.id);
                finish("HubSpot contact upserted: " + email + " (id=" + resultRow.id + ")", log, null);
            } else {
                log.push("Response body did not contain results: " + safeExcerpt(JSON.stringify(upsertRes), 400));
                finish("HubSpot contact upserted: " + email + " (id unknown — check response).", log, null);
            }
        }
    } else if (action === "getContact") {
        var qEmail = pickString(config.email);
        if (!qEmail) { throw new Error("config.email required for getContact."); }
        if (!looksLikeEmail(qEmail)) { throw new Error("config.email not valid: " + qEmail); }
        var requestedProps = config.properties || ["email", "firstname", "lastname", "lifecyclestage", "company", "createdate", "lastmodifieddate"];
        if (typeof requestedProps === "string") {
            try { requestedProps = JSON.parse(requestedProps); } catch (e) {
                requestedProps = requestedProps.split(",").map(function (s) { return s.replace(/^\s+|\s+$/g, ""); });
            }
        }

        if (dryRun) {
            log.push("DRY RUN: would look up " + qEmail);
            finish("DRY RUN: would search for contact " + qEmail, log, null);
        } else {
            var searchBody = {
                filterGroups: [{
                    filters: [{ propertyName: "email", operator: "EQ", value: qEmail }]
                }],
                properties: requestedProps,
                limit: 1
            };
            var searchRes = hubspotFetch("POST", "/crm/v3/objects/contacts/search", searchBody, accessToken, log);
            if (searchRes && searchRes.total > 0 && searchRes.results && searchRes.results[0]) {
                var hit = searchRes.results[0];
                var summary = "id=" + hit.id;
                if (hit.properties) {
                    for (var k in hit.properties) {
                        if (Object.prototype.hasOwnProperty.call(hit.properties, k) && hit.properties[k]) {
                            summary += " " + k + "=" + safeExcerpt(String(hit.properties[k]), 80);
                        }
                    }
                }
                finish(summary, log, null);
            } else {
                finish("No HubSpot contact found for " + qEmail, log, null);
            }
        }
    } else if (action === "setLifecycleStage") {
        var sEmail = pickString(config.email);
        var stage = pickString(config.stage, config.lifecycleStage);
        if (!sEmail) { throw new Error("config.email required."); }
        if (!stage) { throw new Error("config.stage required (e.g. 'lead', 'marketingqualifiedlead', 'opportunity', 'customer')."); }

        if (dryRun) {
            log.push("DRY RUN: would set " + sEmail + " lifecycle=" + stage);
            finish("DRY RUN: would set " + sEmail + " → " + stage, log, null);
        } else {
            // Upsert with just the lifecycle stage; HubSpot handles email-as-key.
            var stageBody = {
                inputs: [{
                    idProperty: "email",
                    id: sEmail,
                    properties: { lifecyclestage: stage }
                }]
            };
            hubspotFetch("POST", "/crm/v3/objects/contacts/batch/upsert", stageBody, accessToken, log);
            finish("Set lifecycle stage: " + sEmail + " → " + stage, log, null);
        }
    } else if (action === "addToList" || action === "removeFromList") {
        var listID = pickString(config.listID, config.listId);
        if (!listID) {
            throw new Error("config.listID required (numeric HubSpot static list ID).");
        }
        var emails = config.emails;
        if (typeof emails === "string") {
            try {
                var parsedEmails = JSON.parse(emails);
                emails = Array.isArray(parsedEmails) ? parsedEmails : emails.split(",");
            } catch (e) {
                emails = emails.split(",");
            }
        }
        if (!Array.isArray(emails)) { emails = [pickString(config.email)]; }
        emails = emails.map(function (e) { return String(e).replace(/^\s+|\s+$/g, ""); }).filter(function (e) { return e.length; });
        if (!emails.length) { throw new Error("config.emails (or config.email) required — list of contact emails."); }
        for (var i = 0; i < emails.length; i++) {
            if (!looksLikeEmail(emails[i])) {
                throw new Error("emails[" + i + "] not valid: " + emails[i]);
            }
        }

        var verb = action === "addToList" ? "add" : "remove";
        if (dryRun) {
            log.push("DRY RUN: would " + verb + " " + emails.length + " email(s) to list " + listID);
            finish("DRY RUN: would " + verb + " " + emails.length + " contact(s) " + (verb === "add" ? "to" : "from") + " list " + listID, log, null);
        } else {
            var listRes = hubspotFetch("POST", "/contacts/v1/lists/" + encodeURIComponent(listID) + "/" + verb, { emails: emails }, accessToken, log);
            var updated = (listRes && listRes.updated && listRes.updated.length) ? listRes.updated.length : 0;
            var discarded = (listRes && listRes.discarded && listRes.discarded.length) ? listRes.discarded.length : 0;
            var invalidVids = (listRes && listRes.invalidVids && listRes.invalidVids.length) ? listRes.invalidVids.length : 0;
            var invalidEmails = (listRes && listRes.invalidEmails && listRes.invalidEmails.length) ? listRes.invalidEmails.length : 0;
            log.push("updated=" + updated + " discarded=" + discarded + " invalidVids=" + invalidVids + " invalidEmails=" + invalidEmails);
            finish("List " + verb + " on list " + listID + ": updated=" + updated + " discarded=" + discarded, log, null);
        }
    } else {
        throw new Error("config.action must be one of: upsertContact, getContact, setLifecycleStage, addToList, removeFromList. Got: " + action);
    }
} catch (err) {
    finish(null, ["HubSpot error: " + (err.message || String(err))], err.message || String(err));
}
