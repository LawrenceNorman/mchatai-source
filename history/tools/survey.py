#!/usr/bin/env python3
"""A series' long list: the people a community's encyclopedias hold, with their dates, a line
about each, how strongly each is tied to the place, and where a history line falls.
(2026-10-05, Black Seattle: "a long list ... so I can see where there is a line".)

A survey is LEADS, never members. Who belongs in a series is decided by a dossier and the
identity check (PLAYBOOK §1); an encyclopedia filing a person under a topic is a lead, never
evidence of who they are. No model is called.

  survey.py run  <series-id> <out-dir> [--stories <dir>] [--roadmap "Name;Name"] [--fame <run-dir>]
                 [--guide <narrated-pack.json>]
                 fetch every source in the series' `survey` block; write <out-dir>/survey.json.
                 --stories marks who is written or scouted; --fame is the fame.py run folder
  survey.py show <out-dir> [--line N]
                 the list by era, with the history line drawn N years back (default: the
                 series' `historyLineYears`)

Sources (series.json `survey.sources`, each optional):
  historylink-topic  {topicId}  biographies filed under a HistoryLink topic ("Surname, Given
                                (dates)"); each essay is read for its summary and dated sentences
  blackpast-search   {term}     BlackPast entries for a person whose BODY names the place. The
                                encyclopedia is based in Seattle, so its search matches its own
                                address on 2,000 entries; the body never carries that
  fame-run           {run}      a fame.py run's ranked names and identity statements
  landmark-guide     {}         people the landmark guide's narrations (--guide) call Black or
                                African American, with the landmark; `survey.seeds` adds the
                                author's own ({name, landmark, note}). Our writing: leads only

Each person gets: names, born/died (conflicts kept), a summary sentence, a field (keywords), the
place's mentions in their entry, `notableFrom` (the earliest year a sentence ties a role or an
arrival to the place, with that sentence), Wikipedia pageviews for the last 60 days when an
article of that name exists, and our status (written, scouted, roadmap). Every estimate says
it is one.

The place lens (2026-10-08): `life` says where the entry puts the person's life (lived and
worked, lived, worked, born here, passed through, named only), with its sentences
(`lifeEvidence`), and `places` lists the places the entry has them living or working at,
landmarks first (linked to the landmark guide), each with its sentence. `survey.areaTerms`
names the place's areas; `survey.elsewhereTerms` names cities that end a stretch in the place.
"""
import datetime
import html
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, load_json, save_json  # noqa: E402
import cite  # noqa: E402
import fame  # noqa: E402
import fetch  # noqa: E402

YEAR = re.compile(r"\b(1[6-9]\d\d|20[0-4]\d)\b")
SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“])")
# "Barnett, Powell S. (1883-1971)", "Alley-Barnes, Royal (b. 1946)", "Lopes, Manuel (1812-?)"
HL_BIO = re.compile(r"^(?P<surname>[^,()]+),\s*(?P<given>[^()]+?)\s*\((?P<dates>[^)]*\d{4}[^)]*)\)\s*$")
# "Powell S. Barnett (1883-1971)", "Richard Gadson (1986-  )", "Seh-Dong-Hong-Beh (1835?-1860?)"
BP_BIO = re.compile(r"^(?P<name>[^()]+?)\s*\((?P<dates>(?:c\.\s*)?\d{4}\??\s*[-–]\s*(?:\d{4}\??)?\s*)\)\s*$")
NOT_A_PERSON = re.compile(r"\b(Church|Society|Association|League|Club|Company|School|University|College|"
                          r"Hospital|Union|Party|Council|Committee|Movement|Foundation|Institute|Center|"
                          r"Centre|Museum|Newspaper|Journal|Lodge|Temple|Mission|Inc\.?|Corporation|Band|"
                          r"Orchestra|Choir|Fund|Project|Alliance|Coalition|Organization|Bank)\b")
HONORIFIC = {"bishop", "rev", "reverend", "dr", "judge", "mother", "father", "sister", "brother",
             "elder", "deacon", "captain", "major", "general", "sir", "madame", "mrs", "mr", "ms", "miss"}
SUFFIX = {"jr", "sr", "ii", "iii", "iv"}
ROLE = re.compile(r"\b(elected|appointed|founded|co-founded|established|opened|organized|organised|became|"
                  r"served|led|hired|named|won|published|recorded|signed|played|performed|pastor|president|"
                  r"director|chair|first|joined|launched|built|owned|ran|taught|coached|began|started)\b", re.I)
ARRIVAL = re.compile(r"\b(arrived|moved|came|settled|relocated|returned)\b", re.I)
NOT_NOTABLE = re.compile(r"\b(born|graduated|graduating|attended|enrolled|studied|died|buried|retired)\b", re.I)
FIELDS = [   # first match wins; checked against the summary sentence, then the opening paragraph
    ("music", r"\b(jazz|musician|singer|vocalist|pianist|saxophon\w*|trumpet\w*|drummer|bandleader|composer|"
              r"rapper|hip.hop|guitarist|bluesman|blues|songwriter|record producer|music)\b"),
    ("government & law", r"\b(mayor|council\w*|legislat\w*|senator|representative|governor|judge|justice|"
                         r"attorney|lawyer|politician|commissioner|elected official|city official|police)\b"),
    ("civil rights & community", r"\b(civil rights|activist|NAACP|Urban League|organizer|organiser|community "
                                 r"leader|advocate|open housing|Black Panther|CORE)\b"),
    ("faith", r"\b(minister|pastor|bishop|reverend|church|clergy\w*|preacher|evangelist)\b"),
    ("education & scholarship", r"\b(teacher|educator|professor|historian|scholar|principal|librarian|school)\b"),
    ("medicine & science", r"\b(physician|doctor|nurse|dentist|surgeon|scientist|engineer|inventor|chemist|"
                           r"pharmacist|medical)\b"),
    ("press & letters", r"\b(journalist|editor|publisher|newspaper|writer|author|poet|novelist|reporter|"
                        r"broadcaster)\b"),
    ("arts", r"\b(artist|painter|sculptor|photographer|actor|actress|dancer|playwright|filmmaker|designer)\b"),
    ("sports", r"\b(basketball|football|baseball|boxer|athlete|NBA|NFL|Olympic|track|coach)\b"),
    ("business & labor", r"\b(business\w*|entrepreneur|owner|merchant|barber|restaurateur|hotel\w*|banker|"
                         r"union|labor|labour|developer|contractor)\b"),
    ("military", r"\b(soldier|veteran|army|navy|marine|airman|Buffalo Soldier|military)\b"),
]


def text_of(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


CACHE_DIR = None        # <out-dir>/_cache during a run: a rerun reads what it already fetched
LENS = {"areas": [], "elsewhere": [], "matchers": [], "link": None}   # the place lens, set by cmd_run


def get_text(url):
    """One polite GET (fetch.py's per-host clock, the tools' User-Agent), cached per run folder."""
    import hashlib
    path = os.path.join(CACHE_DIR, hashlib.sha1(url.encode()).hexdigest() + ".txt") if CACHE_DIR else None
    if path and os.path.isfile(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": fame.API_UA})
    with urllib.request.urlopen(req, timeout=40) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    if path:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
    return text


def life_dates(dates):
    """'1883-1971' → (1883, 1971, False); 'b. 1946' / '1986-  ' → (1946, None, True); '1812-?' → (1812, None, False)."""
    d = dates.replace("–", "-")
    years = [int(y) for y in YEAR.findall(d)]
    if re.match(r"^\s*b\.", d) or re.search(r"-\s*$", d):
        return (years[0] if years else None), None, True
    if "-" in d:
        born, died = d.split("-", 1)
        b = YEAR.search(born)
        x = YEAR.search(died)
        return (int(b.group(1)) if b else None), (int(x.group(1)) if x else None), False
    return (years[0] if years else None), None, False


def fold(text):
    """'Zoë' and 'Zoe' are one name: a second source often leaves the accent off."""
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def name_key(name, born):
    words = [w.strip(".,").lower() for w in re.sub(r"[\"“”'(][^\"“”')]*[\"“”')]", " ", fold(name)).split()]
    words = [w for w in words if w and w not in HONORIFIC]
    while words and words[-1] in SUFFIX:
        words = words[:-1]
    if not words:
        return None
    return (words[-1], words[0], born)


def sentences(text):
    """cite.py's splitter: an initial ("John T. Gayton") does not end a sentence."""
    return [text[a:b].strip() for a, b in cite.sentences(text) if text[a:b].strip()]


def notable_from(text, born, place_terms):
    """(year, sentence, basis): the earliest year a sentence ties a role or an arrival to the place.
    Birth, schooling and death sentences never count, nor years before age 15."""
    best = None
    floor = (born + 15) if born else 1800
    for s in sentences(text):
        if NOT_NOTABLE.search(s) and not ROLE.search(s):
            continue
        here = any(t.lower() in s.lower() for t in place_terms)
        if not here or not (ROLE.search(s) or ARRIVAL.search(s)):
            continue
        ys = [int(y) for y in YEAR.findall(s) if floor <= int(y) <= datetime.date.today().year]
        if ys and (best is None or min(ys) < best[0]):
            best = (min(ys), s[:300], "a dated sentence naming the place")
    return best


def field_of(*texts):
    for t in texts:
        for name, pat in FIELDS:
            if t and re.search(pat, t, re.I):
                return name
    return "other"


# "drafted by the Seattle SuperSonics" ties a player to a team, not to the city: counted apart, so
# Bill Russell (who coached there and stayed) and a visiting quarterback can be told apart.
TEAM = re.compile(r"\bSeattle (?:Seahawks|SuperSonics|Sonics|Mariners|Storm|Sounders|Reign|Kraken|Pilots|"
                  r"Rainiers|Totems|Thunderbirds|Steelheads|Majestics|Dragons|Bombers)\b")


def place_count(text, place_terms):
    """Mentions of the place that are not a sports team's name."""
    plain = TEAM.sub(" ", text)
    return sum(len(re.findall(r"\b" + re.escape(t) + r"\b", plain)) for t in place_terms)


def team_count(text):
    return len(TEAM.findall(text))


# ── the place lens (2026-10-08) ──────────────────────────────────────────────
# Lawrence: "I would like to focus on people who lived and worked in Seattle (not just people who
# passed through) and the significant places that they lived and worked." Read from each entry's
# own sentences; no model. A sentence puts the subject IN the place when it names the place, one of
# its areas (`survey.areaTerms`) or one of its landmarks; the sentences after it IN THE SAME
# PARAGRAPH stay there until one names somewhere else (a "City, State" the entry uses, or
# `survey.elsewhereTerms`) or goes back before the year that put them there. A verdict keeps its
# sentences, and each place the sentence it came from, so the author can check both.

LIVED = re.compile(r"\b(lived|lives|living|resided|resides|residing|residence|resident|home|homes|house|"
                   r"moved into|grew up|raised|boarding|apartment|settled|made (?:his|her|their) home|"
                   r"bought (?:a|the|their) (?:house|home|lot|lots|land|property))\b", re.I)
WORKED = re.compile(r"\b(worked|works|working|employed|employment|job|hired|opened|owned|owner|ran|operated|"
                    r"managed|founded|co-founded|established|organi[sz]ed|taught|teacher|teaching|principal|"
                    r"pastor|minister|preached|practiced|practised|practice|office|shop|store|barber|barbershop|"
                    r"restaurant|hotel|cafe|café|nightclub|club|clubs|studio|clinic|business|editor|edited|"
                    r"published|publisher|served|elected|appointed|director|president|chair|chaired|career|"
                    r"retired|bandleader|council|legislat\w*|commission\w*|librarian|nurse|physician|doctor|"
                    r"lawyer|attorney|judge|realtor|contractor|porter|laborer|labourer|mason|carpenter|engineer|"
                    r"engineering|programmer|scientist|architect|company|firm|dentist|dermatolog\w*|pharmac\w*|"
                    r"chemist|musician|pianist|trumpeter|saxophonist|singer|drummer|guitarist|organist|choir|"
                    r"reporter|journalist|columnist)\b", re.I)
PASSING = re.compile(r"\b(visited|visiting|visits|visit|toured|touring|tour|performed|performing|performance|"
                     r"concerts?|appeared|appearance|spoke|speech|lectured|lecture|passed through|stopped|"
                     r"stopover|en route|on (?:a|his|her|their) way|trip|traveled to|travelled to|vacation|"
                     r"games?|played against|competed|drafted|traded)\b", re.I)
BORN = re.compile(r"\bborn\b", re.I)
# Not the city: the chief it is named for, a famous trial.
NOT_HERE = re.compile(r"\bChief (?:Seattle|Sealth)\b|\bSeattle Seven\b")
# A building is a place when the sentence puts someone AT it; "founded the Dorcas Charity Club" names
# an organisation (2026-10-08).
LOCATIVE = re.compile(r"\b(?:at|in|inside|outside|near|into|from|on|to)\s+(?:the\s+)?$", re.I)
STATES = (r"Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|"
          r"Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|"
          r"Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|"
          r"New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|"
          r"South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|"
          r"Wisconsin|Wyoming|D\.C\.|British Columbia|Ontario|Canada")
# Another state, after a word that puts someone there ("in Mississippi", "the University of Iowa"):
# never a bare name, since Virginia and Georgia are first names too. And Washington, D.C.
OTHER_STATE = re.compile(r"\b(?:in|from|to|at|of|near|across)\s+(?:the\s+)?(?:" +
                         STATES.replace("|Washington|", "|").replace("D\\.C\\.|", "") + r")\b|\bWashington,?\s+D\.\s?C\.")
CITY_STATE = re.compile(r"\b(?:in|to|from|at|for|near)\s+((?:[A-Z][a-zA-Z.'’-]+\s?){1,3}),\s+(?:" + STATES + r")\b")
MOVED_AWAY = re.compile(r"\b(?:moved|relocated|returned|left|went|transferred)\b(?:\s+\w+){0,3}?\s+(?:to|for)\s+"
                        r"((?:[A-Z][a-zA-Z.'’-]+\s?){1,3})")
ARRIVED = re.compile(r"\b(moved|came|arrived|settled|relocated|returned|migrated)\b", re.I)

ADDRESS = re.compile(r"\b(\d{2,5}(?:-\d{1,4})?\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\.?\s+)?"
                     r"(?:\d{1,3}(?:st|nd|rd|th)|[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s+"
                     r"(?:Avenue|Ave\.?|Street|St\.?|Way|Boulevard|Blvd\.?|Place|Pl\.?|Road|Rd\.?|Drive|Dr\.?|"
                     r"Court|Terrace|Lane)(?:\s+(?:North|South|East|West|NE|NW|SE|SW|N|S|E|W)\b\.?)?)")
CORNER = re.compile(r"\b((?:(?:N|S|E|W|North|South|East|West)\.?\s+)?\d{1,3}(?:st|nd|rd|th)(?:\s+(?:Avenue|Ave\.?))?"
                    r"\s+(?:and|&)\s+(?:(?:N|S|E|W|North|South|East|West)\.?\s+)?(?:\d{1,3}(?:st|nd|rd|th)|[A-Z][a-z]+)"
                    r"(?:\s+(?:Avenue|Ave\.?|Street|St\.?|Way))?)")
STREET = re.compile(r"\b(?:on|along|off|near)\s+((?:(?:N|S|E|W|North|South|East|West)\.?\s+)?"
                    r"(?:\d{1,3}(?:st|nd|rd|th)|[A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?\s+(?:Avenue|Street|Way|Boulevard))\b")
PLACE_NOUN = (r"Church|Cathedral|Temple|Chapel|School|Academy|College|Library|Hall|Club|Hotel|Inn|Cafe|Café|"
              r"Restaurant|Theatre|Theater|Building|Hospital|Clinic|Park|Playfield|Center|Centre|Market|Station|"
              r"Store|Barbershop|Lodge|Mission|Gallery|Studio|Ballroom|Tavern|Lounge|Cabaret|Arena|Auditorium|"
              r"Armory|Shipyard|Mill|Wharf|Pier|Cemetery|Apartments|House|Home")
NAMED = re.compile(r"((?:[A-Z][\w'’&.\-]*\s+){1,6}(?:" + PLACE_NOUN + r"))\b")
NAMED_OF = re.compile(r"\b((?:University|College|Church|School|Hospital|Museum) of (?:the )?(?:[A-Z][\w'’.\-]*\s?){1,4})")
LEAD_WORDS = {"The", "In", "At", "He", "She", "They", "His", "Her", "Their", "After", "When", "By", "On", "From",
              "For", "With", "As", "A", "An", "Its", "This", "That", "Then", "There", "During", "Before", "While",
              "Although", "Later", "Soon", "Both", "Seattle's", "Seattle’s", "And", "But", "It", "Today", "Now"}


def _named(raw):
    """A named place without the sentence words caught at its front ("In 1932 the Cornish School")."""
    words = raw.split()
    while words and (words[0] in LEAD_WORDS or YEAR.fullmatch(words[0].strip(",."))):
        words = words[1:]
    return " ".join(words) if len(words) >= 2 else None


def place_lens(paras, place_terms, area_terms=(), elsewhere_terms=(), matchers=None, link=None,
               start_here=False, born=None, died=None):
    """What an entry says about the subject's life in the place, sentence by sentence:
    {"lived", "worked", "born", "passing": bool, "evidence": [{"s", "roles"}], "places": [...], "from"}.
    `matchers` are cite.landmark_patterns() rows; `link` makes a landmark's page address;
    `start_here` for a text that is about a place in it (a landmark's own narration)."""
    out = {"lived": False, "worked": False, "born": False, "passing": False, "evidence": [], "places": [], "from": None}
    here_terms = [t for t in list(place_terms) + list(area_terms) if t]
    here_rx = re.compile(r"\b(?:" + "|".join(re.escape(t) for t in here_terms) + r")\b") if here_terms else None
    away = set(t for t in elsewhere_terms if t)
    states = re.compile(r"^(?:" + STATES + r")$")
    for para in paras:                          # an entry names the cities it moves between ("Mobile, Alabama"): learn them
        para = TEAM.sub(" ", para)
        for m in CITY_STATE.finditer(para):
            city = m.group(1).strip()
            # Never a state ("in Washington, D.C." must not make every "University of Washington" elsewhere).
            if not states.match(city) and (here_rx is None or not here_rx.search(city)):
                away.add(city)
    away_rx = re.compile(r"\b(?:" + "|".join(re.escape(t) for t in sorted(away, key=len, reverse=True)) + r")\b") if away else None
    lo, hi = (born or 1800), min(died or 9999, datetime.date.today().year)
    seen, passing_ev = set(), []
    for para in paras:
        para = NOT_HERE.sub(" ", TEAM.sub(" ", para))
        here, here_year = start_here, None
        low = para.lower()
        hits = []                               # landmarks named in this paragraph, by offset
        for lid, place, rx in matchers or []:
            if not any(w.lower() in low for w in rx.words) and not re.search(r"\d", para):
                continue
            for m in rx.finditer(para):
                hits.append((m.start(), lid, place))
        for a, b in cite.sentences(para):
            sent = para[a:b].strip()
            if not sent:
                continue
            marks = [(lid, place) for at, lid, place in hits if a <= at < b]
            named_here = bool(marks) or bool(here_rx and here_rx.search(sent))
            years = [int(y) for y in YEAR.findall(sent) if lo <= int(y) <= hi]
            if named_here:
                here = True
                here_year = min(years) if years else here_year
            elif (away_rx and away_rx.search(sent)) or OTHER_STATE.search(sent):
                # A landmark's own narration stays at the landmark: "a Black engineer from Mississippi"
                # says where he came from, and only that sentence is set aside.
                here = start_here
                continue
            elif here and here_year and years and max(years) < here_year:
                continue                        # a look back to before they came: not their life here
            if not here:
                continue
            lived, worked, passing = bool(LIVED.search(sent)), bool(WORKED.search(sent)), bool(PASSING.search(sent))
            if named_here and ARRIVED.search(sent) and not (passing and not (lived or worked)):
                lived = True
            if named_here and BORN.search(sent) and not (lived or worked):
                out["born"] = True
                if years:
                    out["from"] = min([out["from"] or 9999] + years[:1])
                continue
            if named_here and passing and not (lived or worked):
                out["passing"] = True
                passing_ev.append({"s": sent[:300], "roles": ["passed through"]})
                continue
            roles = [r for r, on in (("lived", lived), ("worked", worked)) if on]
            out["lived"] |= lived
            out["worked"] |= worked
            if roles and len(out["evidence"]) < 4 and not any(e["roles"] == roles for e in out["evidence"]):
                out["evidence"].append({"s": sent[:300], "roles": roles})
            role = " and ".join(roles)
            if roles and years and not BORN.search(sent):   # a birth elsewhere is not the start of a life here
                out["from"] = min(out["from"] or 9999, min(years))
            found = [{"name": place.get("name") or lid, "landmark": lid, "url": link(lid) if link else ""}
                     for lid, place in marks]
            for rx, kind in ((ADDRESS, "address"), (CORNER, "corner"), (STREET, "street")):
                for m in rx.finditer(sent):
                    pre = sent[max(0, m.start() - 6):m.start()].lower()
                    if kind == "address" and YEAR.fullmatch(m.group(1).split()[0]) and re.search(r"\b(in|of|by|since|until|from)\s*$", pre):
                        continue                # "in 1910 Madison Street was paved" is a year, not a number
                    found.append({"name": m.group(1).strip().rstrip(".,"), "kind": kind})
            if roles:                           # a named building, when the sentence puts them AT it
                for rx in (NAMED, NAMED_OF):
                    for m in rx.finditer(sent):
                        nm = _named(m.group(1).strip())
                        lead = sent[max(0, m.start() - 14):m.start()] + m.group(1)[:len(m.group(1)) - len(nm or "")]
                        if nm and LOCATIVE.search(lead) and not (here_rx and here_rx.fullmatch(nm)):
                            found.append({"name": nm.rstrip(".,"), "kind": "named"})
            found = [f for f in found if f.get("landmark") or not ((away_rx and away_rx.search(f["name"]))
                                                                   or OTHER_STATE.search(f["name"]))]
            found.sort(key=lambda f: 0 if f.get("landmark") else 1)
            for f in found:
                key = place_key(f["name"])
                if key in seen:
                    continue
                seen.add(key)
                f.update({"role": role, "year": min(years) if years else None, "s": sent[:300]})
                f.setdefault("kind", "landmark")
                out["places"].append(f)
    if not (out["lived"] or out["worked"]):     # only then is "passed through" the story the entry tells
        out["evidence"] += passing_ev[:4 - len(out["evidence"])]
    return out


def place_key(name):
    """One key for a place however it is written: "1st African Methodist Episcopal Church" and
    "First African Methodist Episcopal Church", "Medical Dental Building" landmark or not."""
    k = re.sub(r"[^a-z0-9 ]", "", name.lower())
    for a, b in (("1st", "first"), ("2nd", "second"), ("3rd", "third"), ("avenue", "ave"), ("street", "st")):
        k = re.sub(r"\b" + a + r"\b", b, k)
    return re.sub(r"^the ", "", re.sub(r"\s+", " ", k)).strip()


def life_of(lens):
    """The lens as one word for the list: where the entry puts the person's life."""
    if lens.get("lived") and lens.get("worked"):
        return "lived and worked"
    for k, v in (("lived", "lived"), ("worked", "worked"), ("born", "born here"), ("passing", "passed through")):
        if lens.get(k):
            return v
    return ""


def merge_lens(into, lens):
    for k in ("lived", "worked", "born", "passing"):
        into[k] = bool(into.get(k)) or bool(lens.get(k))
    if lens.get("from") and (not into.get("from") or lens["from"] < into["from"]):
        into["from"] = lens["from"]
    same = lambda a, b: re.sub(r"\W+", "", a.lower())[:80] == re.sub(r"\W+", "", b.lower())[:80]   # noqa: E731
    for e in lens.get("evidence", []):
        if len(into.setdefault("evidence", [])) < 4 and not any(same(e["s"], x["s"]) for x in into["evidence"]):
            into["evidence"].append(e)
    places = into.setdefault("places", [])
    for p in lens.get("places", []):
        hit = next((q for q in places if place_key(q["name"]) == place_key(p["name"])), None)
        if hit is None:
            places.append(p)
        elif p.get("landmark") and not hit.get("landmark"):   # the landmark's record wins, keeping a known role
            places[places.index(hit)] = {**p, "role": p.get("role") or hit.get("role"), "year": p.get("year") or hit.get("year")}
    return into


def ranked_places(places, cap=12):
    """Landmarks first, then where they lived or worked, then the rest; in the entry's order within each."""
    order = {"landmark": 0, "address": 1, "corner": 2, "named": 3, "street": 4}
    return sorted(places, key=lambda p: (0 if p.get("landmark") else 1, 0 if p.get("role") else 1,
                                         order.get(p.get("kind"), 5)))[:cap]


# ── sources ──────────────────────────────────────────────────────────────────

def historylink_topic(src, place_terms, log):
    out, page = [], 1
    while True:
        url = ("https://www.historylink.org/Search/Results?" + urllib.parse.urlencode(
            {"TopicId": src["topicId"], "FilterTopic": "on", "SortBy": "Title", "PageSize": 100, "ResultsPage": page}))
        t = get_text(url)
        rows = [(m.group(1), text_of(m.group(2))) for m in re.finditer(r'href="(/File/\d+)"[^>]*>(.*?)</a>', t, re.S)]
        bios = [(href, title) for href, title in rows if HL_BIO.match(title) and not NOT_A_PERSON.search(title)]
        if not rows or not any("(" in title for _, title in rows):
            break
        for href, title in bios:
            m = HL_BIO.match(title)
            given, surname = m.group("given").strip(), m.group("surname").strip()
            suffix = ""
            sm = re.search(r"\b(Jr\.|Sr\.|II|III)$", given)
            if sm:
                given, suffix = given[:sm.start()].strip(), " " + sm.group(1)
            born, died, living = life_dates(m.group("dates"))
            out.append({"name": f"{given} {surname}{suffix}", "born": born, "died": died, "living": living,
                        "source": {"site": "HistoryLink", "url": "https://www.historylink.org" + href, "title": title}})
        log(f"HistoryLink topic {src['topicId']} page {page}: {len(bios)} biographies")
        if f"ResultsPage={page + 1}" not in t:
            break
        page += 1
    for p in out:                                   # each essay: its summary and its dated sentences
        try:
            t = get_text(p["source"]["url"])
        except Exception as e:                      # a missing essay is a gap, not a stop
            log(f"  could not read {p['source']['url']}: {e}")
            continue
        paras = []
        for raw in re.findall(r"<p>(.*?)</p>", t, re.S):
            s = text_of(raw)
            if s.startswith(("Sources", "Licensing", "©")) or "HistoryLink.org" in s:
                break
            if len(s) > 40:
                paras.append(s)
        body = " ".join(paras)
        p["summary"] = sentences(paras[0])[0] if paras else ""
        p["opening"] = paras[0] if paras else ""
        p["placeMentions"] = place_count(body, place_terms)
        p["teamMentions"] = team_count(body)
        p["notable"] = notable_from(TEAM.sub(" ", body), p["born"], place_terms)
        p["lens"] = place_lens(paras, place_terms, LENS["areas"], LENS["elsewhere"], LENS["matchers"], LENS["link"],
                               born=p["born"], died=p["died"])
    return out


def blackpast_search(src, place_terms, log):
    out, page = [], 1
    while True:
        url = ("https://www.blackpast.org/wp-json/wp/v2/posts?" + urllib.parse.urlencode(
            {"search": src["term"], "per_page": 100, "page": page, "_fields": "title,link,content"}))
        try:
            rows = json.loads(get_text(url))
        except urllib.error.HTTPError as e:
            if e.code == 400:                       # past the last page
                break
            raise
        if not rows:
            break
        kept = 0
        for r in rows:
            title = html.unescape(r["title"]["rendered"]).strip()
            m = BP_BIO.match(title)
            if not m or "/african-american-history/" not in r["link"] or NOT_A_PERSON.search(m.group("name")):
                continue
            # A picture's credit line ("Image Ownership: Public Domain") is not the entry.
            body = text_of(re.sub(r"<figure.*?</figure>|<figcaption.*?</figcaption>", " ", r["content"]["rendered"], flags=re.S))
            body = re.sub(r"^[“\"]?Image (?:Ownership|Courtesy|Source)[^”\"]*[”\"]?\s*", "", body)
            n, teams = place_count(body, place_terms), team_count(body)
            if not n and not teams:
                continue
            born, died, living = life_dates(m.group("dates"))
            first = sentences(body)[0] if body else ""
            paras = [text_of(x) for x in re.split(r"</p>", re.sub(r"<figure.*?</figure>", " ", r["content"]["rendered"], flags=re.S))]
            keep = []
            for x in paras:                     # the entry, not its sources or its "originally published" note
                if x.startswith(("Sources", "This article was originally published", "This entry")):
                    break
                if len(x) > 40 and not x.startswith(("Image Ownership", "“Image", "Image Courtesy")):
                    keep.append(x)
            paras = keep
            out.append({"name": m.group("name").strip(), "born": born, "died": died, "living": living,
                        "summary": first, "opening": body[:600], "placeMentions": n, "teamMentions": teams,
                        "notable": notable_from(TEAM.sub(" ", body), born, place_terms),
                        "lens": place_lens(paras, place_terms, LENS["areas"], LENS["elsewhere"], LENS["matchers"], LENS["link"],
                                           born=born, died=died),
                        "source": {"site": "BlackPast", "url": r["link"], "title": title}})
            kept += 1
        log(f"BlackPast '{src['term']}' page {page}: {kept} people whose entry names the place")
        page += 1
    return out


def fame_run(src, place_terms, log, run_dir):
    """The fame.py run's screened names (identity statements) from its run folder, when given."""
    out = []
    screen = load_json(os.path.join(run_dir, "screen.json"), {}) if run_dir else {}
    texts = {}
    for f in (os.listdir(os.path.join(run_dir, "_screen")) if run_dir and os.path.isdir(os.path.join(run_dir, "_screen")) else []):
        a = load_json(os.path.join(run_dir, "_screen", f), {}) or {}
        if a.get("title"):
            texts[a["title"]] = a.get("text") or ""
    for r in screen.get("rows", []):
        if not r.get("identity"):
            continue
        paras = [x for x in (texts.get(r["title"]) or "").split("\n") if len(x) > 40]
        out.append({"lens": place_lens(paras, place_terms, LENS["areas"], LENS["elsewhere"], LENS["matchers"], LENS["link"]),
                    "name": r["title"].split(" (")[0], "born": None, "died": None, "living": None,
                    "summary": "", "opening": "", "placeMentions": r.get("localMentions", 0), "notable": None,
                    "identityStatement": r["identity"][0],
                    "source": {"site": "Wikipedia", "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(r["title"].replace(" ", "_")),
                               "title": r["title"]}})
    log(f"fame run {src['run']}: {len(out)} names with an identity statement")
    return out


# The landmark guide's own narrations (2026-10-08, Lawrence: "notable black people in the Seattle
# Landmarks would be good to pull in"). They are OUR writing, so a name found there is a lead,
# never a source: the scout reads the City's documents. Only the narrated pack is read, never the
# City's reports or their OCR: the pack is the text the corrections gate checks (La Quinta's
# privacy correction among them).
GUIDE_STOP = set("""Church School Building Library Street Avenue Way District Seattle Washington Hall Club Company
Society League Association Baptist Methodist Episcopal Mount High Elementary University College Park House Board
City Council County State Department Hospital Center Northwest Pacific Boeing Republican Times Post Intelligencer
African Black American North South East West Central First Second Third Fourth Fifth Great Depression War World
Civil Rights National Register Landmarks Preservation Historic Federal Union Bank Hotel Theatre Theater Market
Square Pioneer International Lake Hill Valley Bay Island Point Sound Puget King Queen Capitol Madison Jackson
Garfield Douglass Truth Zion Christ Temple Ministries Brotherhood Order Lodge Masonic Elks Urban Mission Station Fire
Navy Army Coast Guard Corps Office Act Day Museum Gallery Centre Plaza Boulevard Apartments Court Terrace Studio
Arts Art Music Jazz Cafe Restaurant Tavern Lounge Brothers Inc Corporation Clinic Foundation Fund Committee
Commission Party Congress Senate Legislature Supreme Medical Dental Public Schools Housing Authority Project Projects
Homes Home Community Neighborhood Area Line Forge Ten""".split())
TITLES = ("Dr", "Rev", "Reverend", "Mrs", "Mr", "Judge", "Bishop", "Elder")
GUIDE_NAME = r"(?:(?:Dr|Rev|Reverend|Mrs|Mr|Judge|Bishop|Elder)\.?\s+)?[A-Z][a-z]+(?:\s+(?:[A-Z]\.|[A-Z][a-z]+)){1,2}(?:\s+Jr\.)?"
GUIDE_ID = r"(?:Black|African[- ]American|Negro)"
ROLEWORDS = r"(?:(?!of\b|a\b|an\b|the\b|in\b|at\b|to\b|for\b|and\b|with\b)[a-z][\w-]*\s+){1,3}"
GUIDE_PATTERNS = [
    re.compile(r"(" + GUIDE_NAME + r"),\s+(?:a|an|the)\s+(?:[\w-]+\s+){0,3}?" + GUIDE_ID + r"\b"),          # Matthew Hudson, a Black teacher
    re.compile(GUIDE_ID + r"\s+" + ROLEWORDS + r"(" + GUIDE_NAME + r")"),                                      # Black pioneer William Grose
    re.compile(r"(" + GUIDE_NAME + r")\s+(?:was|became|is)\s+(?:the\s+|an?\s+|one of the\s+)?(?:[a-z][\w-]*\s+){0,3}?" + GUIDE_ID + r"\b"),
]
GUIDE_PAIR = re.compile(r"\b([A-Z][a-z]+) and ([A-Z][a-z]+) ([A-Z][a-z]+),\s+(?:a|an|the)\s+(?:[\w-]+\s+){0,2}?" + GUIDE_ID +
                        r"\s+(?:couple|family|pair)\b")                                                        # Samuel and Susie Stone, a Black couple
GUIDE_PRONOUN = re.compile(r"^(?:He|She)\s+(?:was|became)\s+(?:a|an|the|one)\b[\w\s,-]{0,60}?\b" + GUIDE_ID + r"\b")
GUIDE_NAME_RX = re.compile(GUIDE_NAME)


def guide_person(name):
    words = [w.strip(".") for w in name.split() if w.strip(".") not in TITLES]
    return len(words) >= 2 and not any(w in GUIDE_STOP for w in words)


def guide_people(text):
    """{name: [sentence index, …]}: who a narration calls Black or African American. "He was a Black
    engineer" counts for the last sentence that named exactly ONE person: "Richard and Mildred Norman
    met at Boeing" names two, so it is left for the author's own seeds."""
    spans = [(a, b) for a, b in cite.sentences(text) if text[a:b].strip()]
    found, last = {}, None
    for i, (a, b) in enumerate(spans):
        sent = text[a:b].strip()
        got = {m.group(1) for rx in GUIDE_PATTERNS for m in rx.finditer(sent) if guide_person(m.group(1))}
        for m in GUIDE_PAIR.finditer(sent):
            got |= {f"{m.group(1)} {m.group(3)}", f"{m.group(2)} {m.group(3)}"}
        if GUIDE_PRONOUN.search(sent) and last:
            got.add(last)
        for n in got:
            found.setdefault(n, []).append(i)
        named = {m.group(0) for m in GUIDE_NAME_RX.finditer(sent) if guide_person(m.group(0))}
        pair = re.search(r"\b[A-Z][a-z]+ and [A-Z][a-z]+ [A-Z][a-z]+\b", sent)
        if named or pair:
            last = next(iter(named)) if len(named) == 1 and not pair else None
    return found, spans


def guide_rows(place, link, extra_names=()):
    """Rows for the people a landmark's narration names as Black, plus any author seeds for it: each
    lead's sentences (theirs, and the "He was …" one after), the landmark as one of their places."""
    text = place.get("text") or ""
    found, spans = guide_people(text)
    for n in extra_names:
        sur = n.split()[-1]
        idx = [i for i, (a, b) in enumerate(spans) if re.search(r"\b" + re.escape(sur) + r"s?\b", text[a:b])]
        if idx:
            found.setdefault(n, [])
            found[n] = sorted(set(found[n]) | set(idx))
    rows = []
    for name, idx in found.items():
        sur = name.split()[-1]
        keep = sorted({j for i in idx for j in (i, i + 1) if j < len(spans)
                       and (j == i or re.match(r"(?:He|She|They|The " + re.escape(sur) + r"s)\b", text[spans[j][0]:spans[j][1]].strip()))})
        sents = [text[spans[j][0]:spans[j][1]].strip() for j in keep]
        lens = place_lens([" ".join(sents)], ["Seattle"], [], LENS["elsewhere"], [], None, start_here=True)
        lens["places"].insert(0, {"name": place.get("name", place["id"]), "landmark": place["id"],
                                  "url": link(place["id"]) if link else "", "kind": "landmark",
                                  "role": " and ".join(r for r in ("lived", "worked") if lens.get(r)),
                                  "year": None, "s": sents[0][:300] if sents else ""})
        lens["lived"] = lens["lived"] or bool(re.search(r"\b(home|house|lived|owned|bought)\b", " ".join(sents), re.I))
        rows.append({"name": name, "born": None, "died": None, "living": None,
                     "summary": sents[0][:300] if sents else "", "opening": "", "placeMentions": 2, "teamMentions": 0,
                     "notable": notable_from(" ".join(sents), None, ["Seattle", place.get("name", "")]) if sents else None,
                     "lens": lens, "fromGuide": True,
                     "source": {"site": "Seattle Landmarks", "url": link(place["id"]) if link else "",
                                "title": place.get("name", place["id"])}})
    return rows


def landmark_guide(src, place_terms, log, pack_path, seeds=()):
    """Leads from the landmark guide's narrations (see GUIDE_PATTERNS), plus the author's seeds."""
    pack = load_json(pack_path, {}) if pack_path else {}
    by_id = {p["id"]: p for p in pack.get("places", [])}
    seeded = {}
    for sd in seeds or []:
        if sd.get("landmark") in by_id:
            seeded.setdefault(sd["landmark"], []).append(sd["name"])
    out = []
    for place in pack.get("places", []):
        if re.search(GUIDE_ID, place.get("text") or "") or place["id"] in seeded:
            out += guide_rows(place, LENS["link"], seeded.get(place["id"], ()))
    for r in out:
        sd = next((x for x in seeds or [] if x["name"] == r["name"]), None)
        if sd:
            r["seed"] = sd.get("note", "")
    log(f"landmark guide: {len(out)} leads from {len(by_id)} narrations ({sum(len(v) for v in seeded.values())} seeded)")
    return out


# ── the list ─────────────────────────────────────────────────────────────────

def same_given(a, b):
    """'norm' and 'norman', 'sam' and 'samuel', 'manuel' and 'emanuel'. Only ever asked about two
    rows with the same surname AND the same birth year."""
    short, long_ = sorted((a, b), key=len)
    return (len(short) >= 3 and long_.startswith(short)) or (len(short) >= 4 and short in long_)


def middle_initials(name):
    """The initials between the first name and the surname: 'John T. Gayton' → 't'."""
    words = [w.strip(".,").lower() for w in name.split() if w.strip(".,").lower() not in HONORIFIC | SUFFIX]
    return "".join(w[0] for w in words[1:-1] if w and not w.startswith(("“", '"')))


def merge(rows):
    people = {}
    for r in rows:
        k = name_key(r["name"], r["born"])
        loose = name_key(r["name"], None)
        hit = people.get(k) or next((p for kk, p in people.items()
                                     if kk[:2] == (loose[:2] if loose else None)
                                     and (kk[2] is None or r["born"] is None or abs(kk[2] - r["born"]) <= 1)), None)
        if hit is None and loose and r["born"]:
            hit = next((p for kk, p in people.items() if kk[0] == loose[0] and kk[2] == r["born"]
                        and same_given(kk[1], loose[1])), None)
        if hit is None:
            hit = people[k] = {"name": r["name"], "names": [], "born": r["born"], "died": r["died"],
                               "living": r["living"], "summary": "", "opening": "", "placeMentions": 0,
                               "notable": None, "sources": [], "conflicts": []}
        if r["name"] not in hit["names"]:
            hit["names"].append(r["name"])
        for f in ("born", "died"):
            if r[f] and hit[f] and r[f] != hit[f]:
                hit["conflicts"].append(f"{f}: {hit[f]} or {r[f]} ({r['source']['site']})")
            hit[f] = hit[f] or r[f]
        if r["living"] is not None and hit["living"] is None:
            hit["living"] = r["living"]
        if r.get("summary") and (not hit["summary"] or r["source"]["site"] == "HistoryLink"):
            hit["summary"], hit["opening"] = r["summary"], r.get("opening", "")
        hit["placeMentions"] = max(hit["placeMentions"], r.get("placeMentions") or 0)
        hit["teamMentions"] = max(hit.get("teamMentions", 0), r.get("teamMentions") or 0)
        if r.get("notable") and (not hit["notable"] or r["notable"][0] < hit["notable"][0]):
            hit["notable"] = r["notable"]
        if r.get("identityStatement"):
            hit["identityStatement"] = r["identityStatement"]
        if r.get("lens"):
            merge_lens(hit.setdefault("lens", {}), r["lens"])
        hit["sources"].append(r["source"])
    return list(people.values())


def pageviews(people, log):
    """Last 60 days of views for each person whose name is THEIR Wikipedia article: not a
    disambiguation page, and its opening names their birth or death year (or, with neither known,
    Seattle). "George Bush" (1790-1863) otherwise counts another man's readers."""
    names = sorted({p["name"] for p in people})
    titles = fame.resolve_titles(names)
    intros = {}
    cand = sorted({t for t in titles.values() if t})
    for i in range(0, len(cand), 20):
        q = fame.wiki(action="query", titles="|".join(cand[i:i + 20]), prop="pageprops|extracts", exintro=1,
                      explaintext=1, exlimit=20, ppprop="disambiguation").get("query", {})
        for pg in q.get("pages", []):
            if "disambiguation" not in (pg.get("pageprops") or {}):
                intros[pg["title"]] = pg.get("extract") or ""
    for p in people:
        t = titles.get(p["name"])
        intro = intros.get(t)
        years = [str(y) for y in (p.get("born"), p.get("died")) if y]
        if intro is None or (years and not any(y in intro for y in years)) or (not years and "Seattle" not in intro):
            titles[p["name"]] = None
    wanted = sorted({t for t in titles.values() if t})
    views = {}
    for i in range(0, len(wanted), 50):
        params = dict(action="query", prop="pageviews", titles="|".join(wanted[i:i + 50]), pvipdays=60)
        while True:              # the API answers a batch in parts: follow `continue` to the end
            r = fame.wiki(**params)
            for pg in r.get("query", {}).get("pages", []):
                pv = pg.get("pageviews")
                if pv:
                    views[pg["title"]] = sum(v or 0 for v in pv.values())
            if "continue" not in r:
                break
            params.update(r["continue"])
    for p in people:
        t = titles.get(p["name"])
        if t:
            p["wikipedia"] = {"title": t, "views60": views.get(t)}
    log(f"Wikipedia: {sum(1 for p in people if p.get('wikipedia'))} of {len(people)} names are articles")


def status_of(people, stories_dir, roadmap):
    have = {}
    if stories_dir and os.path.isdir(stories_dir):
        for slug in os.listdir(stories_dir):
            meta = load_json(os.path.join(stories_dir, slug, "project.json"), None)
            d = load_json(os.path.join(stories_dir, slug, "dossier.json"), {}) or {}
            if not isinstance(meta, dict):
                if not d:
                    continue
                meta = {}                       # scouted: a dossier, no StoryMaker project yet
            names = [meta.get("subject"), meta.get("name"), d.get("subject")] + list(d.get("aliases") or [])
            state = "written" if os.path.isfile(os.path.join(stories_dir, slug, "book", "manifest.json")) else "scouted"
            born = fame_year((d.get("lifespan") or {}).get("born"))
            known = [n for n in names if isinstance(n, str) and n.strip()]
            for n in known:
                k = name_key(n, None)
                if k:
                    have.setdefault(k[:2], []).append((state, slug, born, known))
    for p in people:
        for n in p["names"]:
            k = name_key(n, None)
            for state, slug, born, known in have.get(k[:2] if k else None, []):
                if born is not None and p["born"] is not None and abs(born - p["born"]) > 1:
                    continue
                # A son or grandson shares a name: with no birth year to tell them apart, the
                # middle initials must agree (John T. Gayton is not John Jacob or John Cyrus).
                mi = middle_initials(n)
                if born is None and mi and not any(middle_initials(x) in ("", mi) and middle_initials(x) == mi
                                                   for x in known):
                    continue
                p["status"], p["story"] = state, slug
        if "status" not in p and any(name_key(n, None) and name_key(n, None)[:2] == name_key(r, None)[:2]
                                     for n in p["names"] for r in roadmap):
            p["status"] = "roadmap"
    for r in roadmap:                               # on the roadmap but in no source we read
        # Any status counts: a roadmap name that has since been scouted is that row, not a second one.
        if not any(name_key(r, None)[:2] in [name_key(n, None)[:2] for n in p["names"] if name_key(n, None)]
                   for p in people):
            people.append({"name": r, "names": [r], "born": None, "died": None, "living": False, "summary": "",
                           "opening": "", "placeMentions": 0, "notable": None, "sources": [], "conflicts": [],
                           "status": "roadmap"})


def canonical_names(stories_dir):
    """{alias, lowercased: subject} from every dossier, so a lead spelled as a story's alias
    (the landmark narrations' "William Gross") joins that story's row."""
    out = {}
    if stories_dir and os.path.isdir(stories_dir):
        for slug in os.listdir(stories_dir):
            d = load_json(os.path.join(stories_dir, slug, "dossier.json"), {}) or {}
            subject = d.get("subject")
            if not subject:
                continue
            for a in d.get("aliases") or []:
                if isinstance(a, str) and len(a.split()) >= 2:
                    out.setdefault(a.lower(), subject)
    return out


def fame_year(v):
    m = YEAR.search(str(v or ""))
    return int(m.group(1)) if m else None


def cmd_run(series_id, out_dir, stories_dir=None, roadmap=(), fame_dir=None, guide_pack=None):
    series = next((s for s in (load_json(os.path.join(HISTORY, "series.json"), {}) or {}).get("series", [])
                   if s.get("id") == series_id), None)
    cfg = (series or {}).get("survey")
    if not cfg:
        print(f"series.json has no `survey` block for {series_id!r}")
        return 2
    place_terms = cfg.get("placeTerms") or ["Seattle"]
    LENS["areas"], LENS["elsewhere"] = cfg.get("areaTerms") or [], cfg.get("elsewhereTerms") or []
    LENS["matchers"] = cite.landmark_patterns()
    template = (cite._images().config().get("landmarkLinks") or {}).get("url") or ""
    LENS["link"] = (lambda lid: template.replace("{id}", lid)) if template else None
    os.makedirs(out_dir, exist_ok=True)
    global CACHE_DIR
    CACHE_DIR = os.path.join(out_dir, "_cache")
    log = lambda s: print(s, flush=True)       # noqa: E731
    rows = []
    for src in cfg.get("sources", []):
        kind = src.get("kind")
        try:
            if kind == "historylink-topic":
                rows += historylink_topic(src, place_terms, log)
            elif kind == "blackpast-search":
                rows += blackpast_search(src, place_terms, log)
            elif kind == "fame-run":
                rows += fame_run(src, place_terms, log, fame_dir)
            elif kind == "landmark-guide":
                rows += landmark_guide(src, place_terms, log, guide_pack, cfg.get("seeds") or [])
        except (fame.Refused, urllib.error.URLError, TimeoutError) as e:
            log(f"{kind}: stopped early ({e}); the list holds what was read before it")
    canon = canonical_names(stories_dir)
    for r in rows:                              # only the guide's spellings: an encyclopedia's own name stays
        if r.get("fromGuide"):
            r["name"] = canon.get(r["name"].lower(), r["name"])
    people = merge(rows)
    try:
        pageviews(people, log)
    except fame.Refused as e:
        log(f"pageviews: {e}")
    status_of(people, stories_dir, list(roadmap))
    for p in people:
        p["field"] = field_of(p.get("summary"), p.get("opening"))
        n = p.get("notable")
        p["notableFrom"] = n[0] if n else None
        p["notableEvidence"] = n[1] if n else ""
        p.pop("notable", None)
        p["tie"] = ("strong" if p["placeMentions"] >= 2 else "named" if p["placeMentions"] == 1
                    else "team" if p.get("teamMentions") else "none found")
        lens = p.pop("lens", None) or {}
        p["life"] = life_of(lens) or ("named only" if p["placeMentions"] else "no Seattle line" if not p.get("teamMentions") else "team only")
        p["lifeEvidence"] = lens.get("evidence", [])
        p["places"] = ranked_places(lens.get("places", []))
        # When their life in the place began, from the lens: a Seattle-born life from its birth year.
        p["seattleFrom"] = lens.get("from") or (p["born"] if lens.get("born") and p.get("born") else None)
    people.sort(key=lambda p: (p.get("notableFrom") or (p["born"] + 30 if p["born"] else 9999), p["name"]))
    save_json(os.path.join(out_dir, "survey.json"), {
        "series": series_id, "generated": datetime.date.today().isoformat(),
        "historyLineYears": series.get("historyLineYears"), "placeTerms": place_terms,
        "note": "Leads, not members: each needs a dossier and the identity check before it can be written.",
        "people": people})
    print(f"{len(people)} people → {os.path.join(out_dir, 'survey.json')}")
    return 0


def cmd_show(out_dir, line=None):
    data = load_json(os.path.join(out_dir, "survey.json"), None)
    if not data:
        print("no survey.json: run first")
        return 2
    years = line or data.get("historyLineYears") or 30
    cut = datetime.date.today().year - years
    by = {}
    for p in data["people"]:
        era = p.get("notableFrom") or ((p["born"] + 30) if p.get("born") else None)
        by.setdefault((era // 10 * 10) if era else None, []).append((era, p))
    print(f"{len(data['people'])} people; history line {years} years: notable by {cut}")
    for dec in sorted(by, key=lambda d: d if d is not None else 9999):
        print(f"\n{dec or 'undated'}s" if dec else "\nundated")
        for era, p in by[dec]:
            mark = " " if era and era <= cut else "›"
            st = f" [{p['status']}]" if p.get("status") else ""
            yrs = f"{p.get('born') or '?'}–{'' if p.get('living') else (p.get('died') or '?')}"
            print(f" {mark} {p['name']} ({yrs}) · {p['field']} · {p['tie']}{st}")
    return 0


def main(argv):
    def flag(name):
        return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else None
    if len(argv) >= 4 and argv[1] == "run":
        roadmap = [n.strip() for n in (flag("--roadmap") or "").split(";") if n.strip()]
        return cmd_run(argv[2], argv[3], flag("--stories"), roadmap, flag("--fame"), flag("--guide"))
    if len(argv) >= 3 and argv[1] == "show":
        return cmd_show(argv[2], int(flag("--line")) if flag("--line") else None)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
