#!/usr/bin/env python3
"""Build LoopStar's recorded drum kits (iPhone, subscribers) from sample-kits.config.json.

    python3 frameworks/loopstar/drums/tools/build_sample_kits.py [--app-fallback <path>] [--only <kit-id>]

For each kit in the config: fetch its sources (an archive or single files, by URL, cached under
~/.cache/loopstar-sample-kits; every download is checked against the sha256 in the config), pick
one file per voice, and write frameworks/loopstar/drums/sample-kits/<kit-id>/<voice>.wav:

  * mono, 48 kHz, 16-bit PCM (the app decodes anything AVAudioFile reads, but WAV is the
    plainest thing for raw.githubusercontent to serve and for anyone to audit);
  * the attack at sample 0 (everything before 5 % of the hit's peak trimmed, 1 ms kept);
  * cut where the tail falls under -60 dBFS, or at the voice's longest (a crash rings 3 s,
    a closed hat 0.6 s), with a 10 ms fade at the cut;
  * peak at -1 dBFS, then the voice's place in the kit from the config's "gains" (the index
    carries them, so a re-balance is a JSON edit, not a re-render).

A voice can blend several files of the SAME hit (a close mic and the overheads, recorded at
once, so they line up), each at a gain. A kit can carry a "process" applied to every voice
before shaping (and "voice_process" for one voice's own, over it): pitch (semitones, by resampling, so lower = longer), a sample-and-hold "rate"
and "bits" (the 12-bit / 26 kHz sampler sound), a low-pass, and a tanh "drive".

Level: an acoustic hit is nearly all transient, so peak-normalized it plays far quieter than
the synth kits (a rock beat measured -23 LUFS against their -12.5). Each voice gets a PUNCH
stage, the lookahead limiter the app levels takes with (1.5 ms, ~50 ms release, at most
MAX_PUNCH_DB off the attack), and the build searches for the kick's level at which a reference
beat (kick on 1 and 3, snare on 2 and 4, 8th-note hats) reaches the kit's "beat_lufs" (default
BEAT_LUFS: where the synth kits' beats sit before the drum fader). Every other voice sits at
its "balance" in LU against the kick (defaults below; a kit may override), measured BS.1770
K-weighted over its loudest 400 ms. A voice that must come DOWN keeps its file at -1 dBFS and
gets an index gain under 1 (a re-balance is a JSON edit); one that must come UP is limited.

Then frameworks/loopstar/drums/sample-kits/index.json is rewritten from the config (with each
kit's size), and with --app-fallback, the app's bundled copy too (they must stay identical;
LoopStarDrumContentTests checks).

Only CC0 or CC-BY material: the samples themselves are redistributed (this public repo, then
inside the app). Each kit's "credit" names the author and licence; the config's "license_url"
says where it was read. RULE #1: everything kit-specific lives in the config, not the app.
"""

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import urllib.request
import wave
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DRUMS = os.path.dirname(HERE)
CONFIG = os.path.join(DRUMS, "sample-kits.config.json")
OUT = os.path.join(DRUMS, "sample-kits")
REPO_ROOT = os.path.abspath(os.path.join(DRUMS, "..", "..", ".."))
CACHE = os.path.expanduser("~/.cache/loopstar-sample-kits")

RATE = 48_000
VOICES = ["kick", "snare", "clap", "closedHat", "openHat", "rim", "tom", "shaker", "ride", "crash"]
# Longest a one-shot runs (seconds): past this it is a pad, not a hit.
LONGEST = {"kick": 1.2, "snare": 1.0, "clap": 0.8, "closedHat": 0.6, "openHat": 1.6, "rim": 0.5,
           "tom": 1.4, "shaker": 0.5, "ride": 2.5, "crash": 3.0}
# Where each voice sits against the kick, in LU (momentary loudness): a kit's "balance" overrides.
BALANCE = {"kick": 0.0, "snare": 0.0, "clap": -2.0, "rim": -6.0, "tom": -2.0, "closedHat": -9.0,
           "openHat": -7.0, "shaker": -11.0, "ride": -9.0, "crash": -6.0}
# A reference beat's loudness before the drum fader, LUFS (the synth kits' median is about
# -10.6; their rock beat -12.5): a kit may set "beat_lufs".
BEAT_LUFS = -12.0
MAX_PUNCH_DB = 10.0
# The kick carries the beat's level and an acoustic one is nearly all attack: a little more room.
MAX_KICK_PUNCH_DB = 12.0
SNARE_SLACK_LU = 3.0
# The attack: the first sample over 5 % of the hit's own peak (an absolute -50 dBFS caught a
# room mic's hiss and left kicks 3-10 ms late), with 1 ms kept before it.
GATE_START_DB = -26.0
GATE_END_DB = -60.0
FADE_S = 0.010
PEAK_DB = -1.0


def fail(message):
    print(f"build_sample_kits: {message}", file=sys.stderr)
    sys.exit(1)


def fetch(url, sha256):
    """The bytes at `url`, from the cache when its hash matches."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha256(url.encode()).hexdigest()[:24] + "-" + os.path.basename(url.split("?")[0]))
    if os.path.exists(path):
        data = open(path, "rb").read()
    else:
        print(f"  fetching {url}")
        request = urllib.request.Request(url, headers={"User-Agent": "mchatai-source build_sample_kits"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        open(path, "wb").write(data)
    digest = hashlib.sha256(data).hexdigest()
    if sha256 and digest != sha256:
        fail(f"{url}: sha256 {digest} is not the config's {sha256} — the source changed; check its licence again")
    if not sha256:
        print(f"  (no sha256 in the config for {url}: it is {digest})")
    return data


def parts(kit, voice):
    """A voice's source parts as (spec, gain): one file, or several takes of the same hit."""
    spec = kit["sources"][voice]
    specs = spec if isinstance(spec, list) else [spec]
    out = []
    for part in specs:
        part = {"member": part} if isinstance(part, str) else part
        out.append((part, float(part.get("gain", 1.0))))
    return out


def part_bytes(kit, voice, spec):
    """The raw file for one part: a member of the kit's archive, or its own URL."""
    if "url" in spec:
        return fetch(spec["url"], spec.get("sha256")), os.path.basename(spec["url"])
    archive = kit.get("archive")
    if not archive:
        fail(f"{kit['id']}.{voice}: a member name needs the kit's archive")
    data = fetch(archive["url"], archive.get("sha256"))
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        try:
            return z.read(spec["member"]), os.path.basename(spec["member"])
        except KeyError:
            names = [n for n in z.namelist() if n.lower().endswith((".wav", ".flac", ".aif", ".aiff", ".ogg"))]
            fail(f"{kit['id']}.{voice}: no {spec['member']!r} in the archive; it has e.g. {names[:12]}")


def decode(data, name):
    """Any audio ffmpeg reads → mono float32 at 48 kHz."""
    process = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"],
        input=data, capture_output=True)
    if process.returncode != 0 or not process.stdout:
        fail(f"ffmpeg couldn't read {name}: {process.stderr.decode(errors='replace')[:300]}")
    return np.frombuffer(process.stdout, dtype="<f4").astype(np.float64)


def biquad(x, b0, b1, b2, a1, a2):
    y = np.empty_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, out
        y[i] = out
    return y


def lowpass(x, hz, q=0.707):
    """RBJ cookbook low-pass."""
    w = 2 * np.pi * hz / RATE
    alpha = np.sin(w) / (2 * q)
    cos = np.cos(w)
    a0 = 1 + alpha
    return biquad(x, (1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, -2 * cos / a0, (1 - alpha) / a0)


K_STAGES = [(1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585),
            (1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621)]


def kweight(x):
    """BS.1770 K-weighting (both stages, 48 kHz), applied in the frequency domain: the filters'
    responses times the spectrum, with a second of padding for their tails (same result as
    running the biquads, minus a Python loop per sample)."""
    n = 1 << int(np.ceil(np.log2(len(x) + RATE)))
    spectrum = np.fft.rfft(x, n)
    z = np.exp(-1j * np.linspace(0, np.pi, len(spectrum)))
    for b0, b1, b2, a1, a2 in K_STAGES:
        spectrum *= (b0 + b1 * z + b2 * z * z) / (1 + a1 * z + a2 * z * z)
    return np.fft.irfft(spectrum, n)[:len(x)]


def momentary_lufs(x):
    """The loudest 400 ms of a mono hit, BS.1770 K-weighted."""
    k = kweight(x)
    block = int(0.4 * RATE)
    squares = k * k
    if len(squares) <= block:
        power = squares.mean() if len(squares) else 0
    else:
        csum = np.concatenate([[0], np.cumsum(squares)])
        hop = block // 4
        power = max((csum[i + block] - csum[i]) / block for i in range(0, len(squares) - block + 1, hop))
    # Mono measured as both channels of a centred source.
    return -0.691 + 10 * np.log10(max(2 * power, 1e-20))


def limit(x, ceiling):
    """Lookahead peak limiter (the app's LoopStarLoudness.limit): under `ceiling`, the dip a
    smooth 1.5 ms ramp ahead of each peak, ~50 ms release."""
    over = np.abs(x) > ceiling
    if not over.any():
        return x
    need = np.ones_like(x)
    need[over] = ceiling / np.abs(x[over])
    window = int(0.0015 * RATE)
    padded = np.concatenate([need, np.ones(window)])
    forward = np.lib.stride_tricks.sliding_window_view(padded, window + 1).min(axis=1)[:len(x)]
    csum = np.concatenate([[0.0], np.cumsum(forward)])
    idx = np.arange(len(x))
    lo = np.maximum(0, idx - window + 1)
    count = idx - lo + 1
    smooth = (csum[idx + 1] - csum[lo] + (window - count) * forward[0]) / window
    # Release: gain[i] = min(smooth[i], 1 - (1 - gain[i-1]) * r), i.e. the reduction d = 1 - gain
    # is the running max of each sample's own reduction decayed by r per sample — in logs, a
    # running maximum (np.maximum.accumulate), so no loop.
    log_r = -1 / (0.05 * RATE)
    i = np.arange(len(x))
    reduction = np.maximum(1 - np.minimum(smooth, 1), 1e-12)
    d = np.exp(np.maximum.accumulate(np.log(reduction) - i * log_r) + i * log_r)
    gain = 1 - np.minimum(d, 1)
    return np.clip(x * gain, -ceiling, ceiling)


def punch(x, target_lufs, most_db=MAX_PUNCH_DB):
    """A peak-normalized voice brought to `target_lufs`: down by gain (returned, for the index),
    up through the limiter (at most `most_db`; two passes make up what the release ducks)."""
    ceiling = 10 ** (PEAK_DB / 20)
    gain_db = target_lufs - momentary_lufs(x)
    if gain_db <= 0:
        return x, 10 ** (gain_db / 20)
    gain_db = min(gain_db, most_db)
    y = x
    for _ in range(2):
        y = limit(x * 10 ** (gain_db / 20), ceiling)
        short = target_lufs - momentary_lufs(y)
        if short < 0.25 or gain_db >= most_db:
            break
        gain_db = min(most_db, gain_db + short)
    return y, 1.0


def reference_beat(voices, gains, bpm=100.0, bars=2):
    """Kick on 1 and 3, snare on 2 and 4, 8th-note hats at 0.75, as the renderer sums it (x0.8)."""
    bar = int(RATE * 60 / bpm * 4)
    step = bar // 16
    out = np.zeros(bar * bars + 3 * RATE)
    hits = []
    for b in range(bars):
        hits += [("closedHat", b * bar + s * step, 0.75) for s in range(0, 16, 2)]
        hits += [("kick", b * bar, 1.0), ("kick", b * bar + 8 * step, 1.0),
                 ("snare", b * bar + 4 * step, 1.0), ("snare", b * bar + 12 * step, 1.0)]
    for voice, at, velocity in hits:
        if voice in voices:
            y = voices[voice] * gains.get(voice, 1.0) * velocity * 0.8
            out[at:at + len(y)] += y
    return out[:bar * bars]


def integrated_lufs(x):
    k = kweight(x)
    return -0.691 + 10 * np.log10(max(2 * float(np.mean(k * k)), 1e-20))


def level_kit(shaped, balance, beat_lufs):
    """The kick level whose reference beat reaches `beat_lufs`, every voice at its balance:
    (files, gains, beat loudness)."""
    anchor = "kick" if "kick" in shaped else next(iter(shaped))

    def at(kick_target):
        # The kick first; every other voice against where the kick ACTUALLY got to (a kick held
        # back by its punch limit must not leave the hats above it).
        files, gains = {}, {}
        files[anchor], gains[anchor] = punch(shaped[anchor], kick_target, MAX_KICK_PUNCH_DB)
        reached = momentary_lufs(files[anchor] * gains[anchor])
        for voice, x in shaped.items():
            if voice != anchor:
                most = MAX_KICK_PUNCH_DB if voice == "snare" else MAX_PUNCH_DB
                files[voice], gains[voice] = punch(x, reached + balance.get(voice, -6.0) - balance.get(anchor, 0.0), most)
        return files, gains
    lo, hi = -30.0, 0.0
    # The backbeat holds the kick down: no more than SNARE_SLACK_LU over what the snare can reach
    # (a ribbon mic that loves the kick left a snare 6 LU under it).
    if "snare" in shaped and anchor == "kick":
        loudest_snare = momentary_lufs(punch(shaped["snare"], 0.0, MAX_KICK_PUNCH_DB)[0])
        hi = min(hi, loudest_snare - balance.get("snare", 0.0) + balance.get("kick", 0.0) + SNARE_SLACK_LU)
    best = None
    for _ in range(9):
        mid = (lo + hi) / 2
        files, gains = at(mid)
        loud = integrated_lufs(reference_beat(files, gains))
        best = (files, gains, loud)
        if abs(loud - beat_lufs) < 0.3:
            break
        if loud < beat_lufs:
            lo = mid
        else:
            hi = mid
    return best


def process(x, settings):
    """A kit's character, before shaping: pitch, sampler grit, low-pass, drive."""
    if not settings:
        return x
    semis = float(settings.get("pitch_semitones", 0))
    if semis:
        # Resample: played back at RATE, it sounds `semis` lower (and longer).
        ratio = 2 ** (semis / 12)
        idx = np.arange(0, len(x) - 1, ratio)
        x = np.interp(idx, np.arange(len(x)), x)
    rate = settings.get("rate")
    if rate:
        # Sample-and-hold at `rate`: the aliasing is the point.
        hold = RATE / float(rate)
        idx = (np.floor(np.arange(len(x)) / hold) * hold).astype(int)
        x = x[np.clip(idx, 0, len(x) - 1)]
    bits = settings.get("bits")
    if bits:
        peak = np.max(np.abs(x)) or 1
        steps = 2 ** (int(bits) - 1)
        x = np.round(x / peak * steps) / steps * peak
    if settings.get("lowpass_hz"):
        x = lowpass(x, float(settings["lowpass_hz"]))
    drive = float(settings.get("drive", 0))
    if drive > 0:
        peak = np.max(np.abs(x)) or 1
        g = 1 + 6 * drive
        x = np.tanh(x / peak * g) / np.tanh(g) * peak
    return x


def shape(x, voice, trim_start=True):
    """Attack at 0, tail cut under the gate or at the voice's longest, faded, peak at -1 dBFS."""
    peak = np.max(np.abs(x)) if x.size else 0
    if peak <= 0:
        fail(f"{voice}: silent")
    x = x / peak
    if trim_start:
        above = np.nonzero(np.abs(x) > 10 ** (GATE_START_DB / 20))[0]
        start = max(0, int(above[0]) - int(0.001 * RATE)) if above.size else 0
        x = x[start:]
    # The tail: the last 5 ms window still over the end gate.
    window = int(0.005 * RATE)
    frames = len(x) // window * window
    if frames:
        env = np.abs(x[:frames]).reshape(-1, window).max(axis=1)
        loud = np.nonzero(env > 10 ** (GATE_END_DB / 20))[0]
        end = (int(loud[-1]) + 1) * window if loud.size else len(x)
    else:
        end = len(x)
    end = min(end, int(LONGEST.get(voice, 1.0) * RATE), len(x))
    x = x[:end].copy()
    fade = min(int(FADE_S * RATE), len(x))
    if fade:
        x[-fade:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade)))
    return x * 10 ** (PEAK_DB / 20)


def write_wav(path, x):
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-fallback", help="the app's bundled copy of index.json to rewrite too")
    parser.add_argument("--only", help="rebuild one kit's audio (the index is always rewritten)")
    args = parser.parse_args()

    config = json.load(open(CONFIG))
    kits = config.get("kits", [])
    ids = [k["id"] for k in kits]
    if len(ids) != len(set(ids)):
        fail("kit ids must be unique (and are never reused)")
    index_path = os.path.join(OUT, "index.json")
    previous = json.load(open(index_path)) if os.path.exists(index_path) else {}
    previous_gains = {k["id"]: k.get("gains") for k in previous.get("kits", [])}
    index_kits = []
    for kit in kits:
        folder_rel = f"frameworks/loopstar/drums/sample-kits/{kit['id']}"
        folder = os.path.join(REPO_ROOT, folder_rel)
        unknown = set(kit["sources"]) - set(VOICES)
        if unknown:
            fail(f"{kit['id']}: unknown voices {sorted(unknown)}")
        if not kit.get("credit") or not kit.get("license_url"):
            fail(f"{kit['id']}: a credit and a license_url are required")
        if not args.only or args.only == kit["id"]:
            print(f"{kit['id']}:")
            os.makedirs(folder, exist_ok=True)
            for name in os.listdir(folder):
                if name.endswith(".wav"):
                    os.remove(os.path.join(folder, name))
            shaped = {}
            for voice in VOICES:
                if voice not in kit["sources"]:
                    continue
                mixed, names, trim = None, [], True
                for spec, gain in parts(kit, voice):
                    data, name = part_bytes(kit, voice, spec)
                    x = decode(data, name) * gain
                    mixed = x if mixed is None else (
                        np.pad(mixed, (0, max(0, len(x) - len(mixed)))) + np.pad(x, (0, max(0, len(mixed) - len(x)))))
                    names.append(name if gain == 1 else f"{name}×{gain:g}")
                    trim = trim and not spec.get("keep_start")
                # The kit's character, with any voice's own over it ("voice_process").
                settings = dict(kit.get("process") or {}, **(kit.get("voice_process", {}).get(voice) or {}))
                shaped[voice] = shape(process(mixed, settings), voice, trim_start=trim)
                print(f"  {voice:<9} {len(shaped[voice]) / RATE:5.2f} s  ← {' + '.join(names)}")
            balance = dict(BALANCE, **kit.get("balance", {}))
            files, gains, loud = level_kit(shaped, balance, float(kit.get("beat_lufs", BEAT_LUFS)))
            for voice, y in files.items():
                write_wav(os.path.join(folder, f"{voice}.wav"), y)
            kit["_gains"] = {v: round(g, 3) for v, g in gains.items()}
            print(f"  reference beat {loud:.1f} LUFS; gains {kit['_gains']}")
        files = {voice: f"{voice}.wav" for voice in VOICES if voice in kit["sources"]}
        missing = [f for f in files.values() if not os.path.exists(os.path.join(folder, f))]
        if missing:
            fail(f"{kit['id']}: not built yet ({missing}); run without --only")
        size = sum(os.path.getsize(os.path.join(folder, f)) for f in files.values())
        entry = {"id": kit["id"], "name": kit["name"]}
        for key in ("group", "blurb", "credit"):
            if kit.get(key):
                entry[key] = kit[key]
        entry["access"] = kit.get("access", "subscriber")
        entry["fallback"] = kit["fallback"]
        entry["folder"] = folder_rel
        entry["voices"] = files
        # The measured balance (kept from the last build's index when --only skipped this kit).
        gains = kit.get("_gains") or previous_gains.get(kit["id"])
        if gains:
            entry["gains"] = {v: gains[v] for v in VOICES if v in gains}
        entry["bytes"] = size
        index_kits.append(entry)

    index = {"_doc": previous.get("_doc", ""), "version": 1, "kits": index_kits}
    text = json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    open(index_path, "w").write(text)
    print(f"wrote {os.path.relpath(index_path, REPO_ROOT)} ({len(index_kits)} kits)")
    if args.app_fallback:
        open(args.app_fallback, "w").write(text)
        print(f"wrote {args.app_fallback}")


if __name__ == "__main__":
    main()
