#!/usr/bin/env python3
"""Procedural CC0 genre sound pack for ToonStudio — pure stdlib synthesis.

Everything here is synthesized from oscillators and filtered noise with fixed
seeds, so the output is deterministic and licence-clean. Same approach as the
original 8-sound pack (boom/pop/whoosh/...), extended with the material four
three-act genre stories need: horror, revenge, fantasy, adventure.

Run:  python3 make_genre_sounds.py <output-dir>
"""

import math
import random
import struct
import sys
import wave

SR = 44100


# ---------------------------------------------------------------- primitives

def silence(dur):
    return [0.0] * int(dur * SR)


def sine(freq, dur, amp=1.0, phase=0.0):
    return [amp * math.sin(2 * math.pi * freq * t / SR + phase)
            for t in range(int(dur * SR))]


def sine_sweep(f0, f1, dur, amp=1.0):
    n = int(dur * SR)
    out, phase = [], 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * (i / n)
        phase += 2 * math.pi * f / SR
        out.append(amp * math.sin(phase))
    return out


def saw(freq, dur, amp=1.0):
    n = int(dur * SR)
    return [amp * (2.0 * ((freq * t / SR) % 1.0) - 1.0) for t in range(n)]


def triangle(freq, dur, amp=1.0):
    n = int(dur * SR)
    return [amp * (4.0 * abs(((freq * t / SR) + 0.25) % 1.0 - 0.5) - 1.0)
            for t in range(n)]


def noise(dur, amp=1.0, seed=1):
    rng = random.Random(seed)
    return [amp * (rng.random() * 2 - 1) for _ in range(int(dur * SR))]


def lowpass(x, cutoff):
    """One-pole lowpass. cutoff in Hz."""
    if not x:
        return x
    dt = 1.0 / SR
    rc = 1.0 / (2 * math.pi * cutoff)
    a = dt / (rc + dt)
    out = [x[0]]
    for s in x[1:]:
        out.append(out[-1] + a * (s - out[-1]))
    return out


def highpass(x, cutoff):
    if not x:
        return x
    dt = 1.0 / SR
    rc = 1.0 / (2 * math.pi * cutoff)
    a = rc / (rc + dt)
    out = [x[0]]
    for i in range(1, len(x)):
        out.append(a * (out[-1] + x[i] - x[i - 1]))
    return out


def env_adsr(x, a=0.01, d=0.05, s=0.8, r=0.1):
    n = len(x)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    ns = max(0, n - na - nd - nr)
    out = []
    for i, v in enumerate(x):
        if i < na:
            g = i / max(1, na)
        elif i < na + nd:
            g = 1.0 + (s - 1.0) * ((i - na) / max(1, nd))
        elif i < na + nd + ns:
            g = s
        else:
            g = s * (1.0 - (i - na - nd - ns) / max(1, nr))
        out.append(v * g)
    return out


def env_exp(x, tau):
    """Exponential decay envelope, tau = seconds to fall to 1/e."""
    return [v * math.exp(-i / (tau * SR)) for i, v in enumerate(x)]


def gain(x, g):
    return [v * g for v in x]


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def cat(*tracks):
    out = []
    for t in tracks:
        out.extend(t)
    return out


def at(base, insert, t):
    """Mix `insert` into `base` starting at time t (extends base if needed)."""
    i0 = int(t * SR)
    need = i0 + len(insert)
    if need > len(base):
        base = base + [0.0] * (need - len(base))
    for i, v in enumerate(insert):
        base[i0 + i] += v
    return base


def echo(x, delay, feedback, wet=0.5, taps=4):
    d = int(delay * SR)
    out = list(x) + [0.0] * d * taps
    src = list(x)
    g = wet
    for tap in range(1, taps + 1):
        g0 = g * (feedback ** (tap - 1))
        off = d * tap
        for i, v in enumerate(src):
            out[i + off] += v * g0
    return out


def softclip(x, drive=1.0):
    return [math.tanh(v * drive) for v in x]


def vibrato(freq, dur, amp=1.0, vfreq=5.0, vdepth=0.02):
    n = int(dur * SR)
    out, phase = [], 0.0
    for i in range(n):
        f = freq * (1.0 + vdepth * math.sin(2 * math.pi * vfreq * i / SR))
        phase += 2 * math.pi * f / SR
        out.append(amp * math.sin(phase))
    return out


def normalize(x, peak=0.89):
    m = max(abs(v) for v in x) or 1.0
    return [v * peak / m for v in x]


def fade(x, fin=0.005, fout=0.02):
    n, ni, no = len(x), int(fin * SR), int(fout * SR)
    out = list(x)
    for i in range(min(ni, n)):
        out[i] *= i / max(1, ni)
    for i in range(min(no, n)):
        out[n - 1 - i] *= i / max(1, no)
    return out


def loopable(x, crossfade=0.35):
    """Make a seamless loop by crossfading the tail into the head."""
    nf = int(crossfade * SR)
    if nf >= len(x):
        return x
    body = x[:-nf]
    tail = x[-nf:]
    out = list(body)
    for i in range(nf):
        g = i / nf
        out[i] = out[i] * g + tail[i] * (1 - g)
    return out


def write_wav(path, x, peak=0.89):
    x = normalize(x, peak)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767)) for v in x))


# ------------------------------------------------------------------- musical

def note(n):
    """MIDI note number -> Hz."""
    return 440.0 * (2 ** ((n - 69) / 12.0))


def pluck(freq, dur, amp=1.0, bright=3000, tau=0.35):
    """Harp/pluck-ish: bright start, exponential decay."""
    body = mix(sine(freq, dur, 0.7), sine(freq * 2, dur, 0.22),
               sine(freq * 3, dur, 0.08))
    body = env_exp(body, tau)
    return gain(lowpass(body, bright), amp)


def pad(freqs, dur, amp=1.0, cutoff=900):
    layers = []
    for k, f in enumerate(freqs):
        layers.append(vibrato(f, dur, 0.5 / (k + 1) if k else 0.6,
                              vfreq=0.18 + 0.07 * k, vdepth=0.006))
        layers.append(sine(f * 1.003, dur, 0.18))
    return gain(lowpass(env_adsr(mix(*layers), a=0.6, d=0.4, s=0.85, r=0.8),
                        cutoff), amp)


def thump(freq=55, dur=0.35, amp=1.0):
    body = env_exp(sine_sweep(freq * 1.8, freq, dur, 1.0), 0.09)
    click = env_exp(noise(0.02, 0.4, seed=7), 0.01)
    return gain(mix(body, click), amp)


# ----------------------------------------------------------------------- SFX

def sfx_thunder():
    rumble = lowpass(noise(3.2, 1.0, seed=11), 90)
    rumble = [v * (1.0 + 0.65 * math.sin(2 * math.pi * 0.9 * i / SR + 1.3)
                   + 0.35 * math.sin(2 * math.pi * 2.1 * i / SR))
              for i, v in enumerate(rumble)]
    crack = env_exp(highpass(noise(0.35, 1.0, seed=12), 900), 0.05)
    body = at(env_exp(rumble, 1.15), gain(crack, 0.8), 0.02)
    return fade(softclip(body, 1.6), fout=0.8)


def sfx_door_creak():
    segments = []
    rng = random.Random(21)
    f = 310.0
    for _ in range(6):
        dur = rng.uniform(0.10, 0.24)
        f *= rng.uniform(0.93, 1.12)
        seg = vibrato(f, dur, 0.8, vfreq=rng.uniform(9, 16),
                      vdepth=rng.uniform(0.04, 0.09))
        segments.append(env_adsr(seg, a=0.02, d=0.02, s=0.8, r=0.03))
        segments.append(silence(rng.uniform(0.01, 0.05)))
    creak = softclip(lowpass(cat(*segments), 1600), 2.2)
    return fade(creak, fout=0.12)


def sfx_knock():
    k = thump(85, 0.22, 1.0)
    knock = mix(k, env_exp(lowpass(noise(0.03, 0.7, seed=31), 1200), 0.012))
    out = silence(0.02)
    for i, t in enumerate([0.0, 0.42, 0.84]):
        out = at(out, gain(knock, 1.0 - 0.07 * i), t + 0.02)
    return echo(out, 0.11, 0.3, wet=0.25, taps=2)


def sfx_heartbeat_loop():
    lub = thump(52, 0.28, 1.0)
    dub = thump(48, 0.24, 0.75)
    cycle = silence(1.05)  # ~57 bpm — dread pace
    cycle = at(cycle, lub, 0.0)
    cycle = at(cycle, dub, 0.30)
    return loopable(cat(cycle, cycle), crossfade=0.10)


def sfx_wind_loop():
    n = noise(7.0, 1.0, seed=41)
    swell = [v * (0.55 + 0.45 * math.sin(2 * math.pi * 0.16 * i / SR)
                  + 0.18 * math.sin(2 * math.pi * 0.47 * i / SR + 2.0))
             for i, v in enumerate(lowpass(n, 420))]
    whistle = [v * (0.5 + 0.5 * math.sin(2 * math.pi * 0.09 * i / SR + 4.1))
               for i, v in enumerate(gain(lowpass(highpass(
                   noise(7.0, 1.0, seed=42), 700), 1500), 0.12))]
    return loopable(mix(swell, whistle), crossfade=0.9)


def sfx_bell_toll():
    partials = [(1.0, 1.0), (2.02, 0.55), (2.94, 0.32), (4.16, 0.2),
                (5.43, 0.12), (6.79, 0.07)]
    f0 = 147.0
    layers = [env_exp(sine(f0 * m, 4.2, a), 1.25 / (i + 1))
              for i, (m, a) in enumerate(partials)]
    strike = env_exp(highpass(noise(0.04, 0.5, seed=51), 1800), 0.01)
    return fade(mix(mix(*layers), strike), fout=1.2)


def sfx_chains():
    rng = random.Random(61)
    out = silence(1.35)
    for _ in range(26):
        f = rng.uniform(1900, 5200)
        clink = env_exp(mix(sine(f, 0.06, 0.5), sine(f * 1.51, 0.06, 0.3),
                            highpass(noise(0.05, 0.5, seed=rng.randrange(9999)), 2400)),
                        0.018)
        out = at(out, gain(clink, rng.uniform(0.3, 0.9)), rng.uniform(0, 1.1))
    return fade(softclip(out, 1.4), fout=0.2)


def sfx_footsteps():
    rng = random.Random(71)
    out = silence(2.3)
    for i in range(5):
        step = env_exp(lowpass(noise(0.09, 1.0, seed=100 + i), 300), 0.03)
        step = mix(step, thump(rng.uniform(70, 82), 0.12, 0.5))
        out = at(out, gain(step, rng.uniform(0.7, 1.0)), 0.12 + i * 0.44)
    return out


def sfx_drip():
    plip = env_exp(sine_sweep(1400, 640, 0.09, 0.9), 0.03)
    return fade(echo(plip, 0.33, 0.42, wet=0.5, taps=4), fout=0.4)


def sfx_fire_loop():
    crackle_bed = gain(lowpass(noise(5.0, 1.0, seed=81), 900), 0.35)
    rng = random.Random(82)
    out = list(crackle_bed)
    for _ in range(60):
        pop_ = env_exp(highpass(noise(0.02, 1.0, seed=rng.randrange(9999)), 1400),
                       0.006)
        out = at(out, gain(pop_, rng.uniform(0.2, 0.75)), rng.uniform(0, 4.9))
    roarbed = [v * (0.8 + 0.2 * math.sin(2 * math.pi * 0.5 * i / SR))
               for i, v in enumerate(lowpass(noise(5.0, 0.5, seed=83), 160))]
    return loopable(mix(out, roarbed), crossfade=0.8)


def sfx_owl():
    def hoot(f, dur):
        return env_adsr(vibrato(f, dur, 0.9, vfreq=4.5, vdepth=0.012),
                        a=0.05, d=0.08, s=0.75, r=0.12)
    seq = cat(hoot(392, 0.28), silence(0.12), hoot(370, 0.5))
    return fade(echo(lowpass(seq, 900), 0.28, 0.3, wet=0.3, taps=2), fout=0.35)


def sfx_roar():
    base = sine_sweep(130, 70, 1.5, 1.0)
    growl = [v * (1.0 + 0.85 * math.sin(2 * math.pi * 28 * i / SR)
                  + 0.4 * math.sin(2 * math.pi * 51 * i / SR + 0.7))
             for i, v in enumerate(base)]
    grit = gain(lowpass(noise(1.5, 1.0, seed=91), 500), 0.55)
    body = softclip(mix(growl, grit), 3.2)
    return fade(env_adsr(body, a=0.06, d=0.2, s=0.9, r=0.55), fout=0.4)


def sfx_magic():
    root = 523.25  # C5
    steps = [0, 4, 7, 11, 14, 18, 21]
    out = silence(1.6)
    for i, s in enumerate(steps):
        out = at(out, pluck(root * (2 ** (s / 12)), 0.7, 0.7, bright=6000,
                            tau=0.28), i * 0.09)
    sparkle = env_adsr(gain(highpass(noise(1.2, 1.0, seed=101), 6000), 0.16),
                       a=0.3, d=0.3, s=0.5, r=0.55)
    return fade(mix(echo(out, 0.21, 0.35, wet=0.35, taps=3), sparkle), fout=0.5)


def sfx_sword():
    ring1 = env_exp(sine(2960, 0.9, 0.7), 0.22)
    ring2 = env_exp(sine(4430, 0.7, 0.45), 0.15)
    ring3 = env_exp(sine(6100, 0.5, 0.3), 0.1)
    scrape = env_exp(highpass(noise(0.12, 1.0, seed=111), 3000), 0.03)
    return fade(mix(ring1, ring2, ring3, scrape), fout=0.3)


def sfx_coins():
    rng = random.Random(121)
    out = silence(1.1)
    for _ in range(22):
        f = rng.uniform(3800, 7600)
        ching = env_exp(mix(sine(f, 0.09, 0.5), sine(f * 1.62, 0.07, 0.3)), 0.025)
        out = at(out, gain(ching, rng.uniform(0.3, 0.8)), rng.uniform(0, 0.85))
    return fade(out, fout=0.2)


def sfx_sting_horror():
    cluster = [note(38), note(39), note(44), note(45), note(50)]
    hit = mix(*[saw(f, 2.6, 0.5 / (i + 1)) for i, f in enumerate(cluster)])
    hit = env_adsr(lowpass(hit, 800), a=0.004, d=0.9, s=0.25, r=1.4)
    sub = env_exp(sine_sweep(90, 38, 2.2, 0.9), 0.7)
    shiver = env_adsr(gain(highpass(noise(2.2, 1.0, seed=131), 3400), 0.1),
                      a=0.5, d=0.6, s=0.4, r=1.0)
    return fade(softclip(mix(hit, sub, shiver), 1.5), fout=1.0)


def sfx_sting_reveal():
    ns = [note(57), note(60), note(64)]
    out = silence(1.7)
    for i, f in enumerate(ns):
        tone = mix(triangle(f, 0.9 - i * 0.12, 0.6), sine(f * 2, 0.8 - i * 0.12, 0.2))
        out = at(out, env_adsr(tone, a=0.02, d=0.1, s=0.8, r=0.25), i * 0.16)
    top = mix(triangle(note(69), 1.1, 0.7), sine(note(69) * 2, 1.1, 0.25))
    out = at(out, env_adsr(top, a=0.02, d=0.15, s=0.85, r=0.5), 0.5)
    return fade(echo(out, 0.19, 0.3, wet=0.3, taps=2), fout=0.5)


def sfx_crumble():
    rng = random.Random(141)
    bed = env_adsr(lowpass(noise(2.4, 1.0, seed=142), 240), a=0.03, d=0.5,
                   s=0.7, r=0.8)
    out = list(bed)
    for _ in range(34):
        rock = env_exp(lowpass(noise(0.06, 1.0, seed=rng.randrange(9999)),
                               rng.uniform(300, 900)), 0.02)
        out = at(out, gain(rock, rng.uniform(0.3, 0.9)), rng.uniform(0, 2.0))
    return fade(softclip(out, 1.5), fout=0.5)


def sfx_gasp():
    breath = env_adsr(gain(highpass(noise(0.5, 1.0, seed=151), 900), 0.9),
                      a=0.06, d=0.1, s=0.7, r=0.18)
    swept = [v * (0.4 + 0.6 * min(1.0, i / (0.3 * SR)))
             for i, v in enumerate(lowpass(breath, 2600))]
    return fade(swept, fout=0.1)


# --------------------------------------------------------------- music loops

def beat_grid(pattern, step, sound_fn, total):
    out = silence(total)
    t = 0.0
    i = 0
    while t < total - 0.01:
        ch = pattern[i % len(pattern)]
        if ch != ".":
            out = at(out, sound_fn(ch), t)
        t += step
        i += 1
    return out


def music_dread_loop():
    """Horror bed: low semitone-throb drone + sparse dissonant bell. ~55bpm."""
    dur = 13.09  # 6 bars of 4/4 at 55 bpm
    root = note(33)  # A1
    drone = pad([root, root * 2, note(40)], dur, 0.8, cutoff=420)
    throb = [v * (0.72 + 0.28 * math.sin(2 * math.pi * (55 / 60 / 2) * i / SR))
             for i, v in enumerate(drone)]
    semis = silence(dur)
    for k, t in enumerate([x * (60 / 55) for x in range(0, 12)]):
        f = note(45) if k % 4 != 3 else note(46)  # minor 3rd, sting to the 4th bar
        semis = at(semis, gain(env_adsr(sine(f, 0.5, 0.5), a=0.01, d=0.2,
                                        s=0.4, r=0.2), 0.16), t)
    bell = silence(dur)
    for t, f in [(3.27, note(57)), (7.63, note(56)), (11.45, note(51))]:
        bell = at(bell, gain(env_exp(mix(sine(f, 2.6, 0.5),
                                         sine(f * 2.94, 2.2, 0.18)), 0.9), 0.35), t)
    return loopable(mix(throb, gain(semis, 0.7), bell)[:int(dur * SR)], 0.6)


def music_tension_loop():
    """Revenge bed: staccato minor pulse over a pedal, 92bpm, Dm."""
    bpm, bars = 92, 4
    beat = 60 / bpm
    dur = bars * 4 * beat
    root = note(38)  # D2
    pedal = pad([root, root * 1.5], dur, 0.55, cutoff=380)

    def stab(_):
        return gain(env_adsr(lowpass(mix(saw(note(50), 0.16, 0.5),
                                         saw(note(53), 0.16, 0.35),
                                         saw(note(57), 0.16, 0.3)), 1300),
                             a=0.004, d=0.06, s=0.4, r=0.05), 0.5)

    stabs = beat_grid("x..x..x.x...x..x", beat / 4, stab, dur)
    pulse = beat_grid("x.x.x.x.x.x.x.x.", beat / 2,
                      lambda _: thump(note(26), 0.18, 0.55), dur)
    line = silence(dur)
    melody = [(0.0, 62), (3.5, 60), (4.0, 58), (7.5, 57), (8.0, 62),
              (11.5, 65), (12.0, 63), (14.0, 58)]
    for t, n in melody:
        line = at(line, gain(env_adsr(vibrato(note(n), 1.15, 0.5, 4.4, 0.008),
                                      a=0.03, d=0.2, s=0.7, r=0.3), 0.30), t * beat)
    return loopable(mix(pedal, stabs, pulse, lowpass(line, 2400))[:int(dur * SR)], 0.4)


def music_mystic_loop():
    """Fantasy bed: harp arpeggio in E lydian + airy pad. 3/4 feel."""
    bpm, bars = 100, 6
    beat = 60 / bpm
    dur = bars * 3 * beat
    padding = pad([note(40), note(47), note(52), note(56)], dur, 0.5, cutoff=750)
    arp_notes = [52, 56, 59, 63, 66, 63, 59, 56]
    arp = silence(dur)
    t = 0.0
    i = 0
    while t < dur - 0.3:
        n = arp_notes[i % len(arp_notes)] + (12 if (i // len(arp_notes)) % 2 else 0)
        arp = at(arp, pluck(note(n), 1.1, 0.5, bright=5200, tau=0.5), t)
        t += beat / 2
        i += 1
    chime = silence(dur)
    for t2, n in [(0.0, 76), (5.4, 78), (9.0, 71), (13.5, 75)]:
        chime = at(chime, gain(env_exp(sine(note(n), 2.4, 0.4), 1.0), 0.22),
                   t2 * beat)
    return loopable(mix(padding, arp, chime)[:int(dur * SR)], 0.5)


def music_quest_loop():
    """Adventure bed: driving 120bpm mixolydian riff + drums."""
    bpm, bars = 120, 4
    beat = 60 / bpm
    dur = bars * 4 * beat

    def kick(_):
        return thump(48, 0.16, 0.85)

    def snare(_):
        return gain(mix(env_exp(highpass(noise(0.11, 1.0, seed=161), 1300), 0.03),
                        env_exp(sine(190, 0.08, 0.4), 0.03)), 0.6)

    drums = mix(beat_grid("x...x...x...x...", beat / 2, kick, dur),
                beat_grid("....x.......x...", beat / 2, snare, dur),
                beat_grid("x.x.x.x.x.x.x.x.", beat / 2,
                          lambda _: gain(env_exp(highpass(
                              noise(0.03, 1.0, seed=162), 6000), 0.01), 0.25), dur))
    root = note(43)  # G2
    bassline = beat_grid("x..x..x...x..x..", beat / 2,
                         lambda _: gain(env_adsr(lowpass(saw(root, 0.22, 0.7), 700),
                                                 a=0.004, d=0.08, s=0.6, r=0.06), 0.6),
                         dur)
    lead_notes = [(0, 67), (1, 70), (1.5, 72), (3, 74), (4, 72), (5, 70),
                  (6, 67), (8, 67), (9, 70), (9.5, 72), (11, 74), (12, 77),
                  (13, 74), (14, 72), (15, 70)]
    lead = silence(dur)
    for t, n in lead_notes:
        tone = mix(triangle(note(n), 0.42, 0.6), sine(note(n) * 2, 0.42, 0.15))
        lead = at(lead, gain(env_adsr(tone, a=0.01, d=0.08, s=0.75, r=0.1), 0.4),
                  t * beat)
    return loopable(mix(drums, bassline, lowpass(lead, 3200))[:int(dur * SR)], 0.3)


def music_lament_loop():
    """Slow sad bed for aftermath scenes. Am, 60bpm."""
    bpm, bars = 60, 4
    beat = 60 / bpm
    dur = bars * 3 * beat
    padding = pad([note(33), note(45), note(48), note(52)], dur, 0.7, cutoff=520)
    line = silence(dur)
    for t, n in [(0, 57), (2, 55), (3, 52), (5.4, 53), (7, 52), (9, 48)]:
        line = at(line, gain(env_adsr(vibrato(note(n), 1.9, 0.5, 4.2, 0.01),
                                      a=0.12, d=0.4, s=0.7, r=0.6), 0.26), t * beat)
    return loopable(mix(padding, lowpass(line, 1900))[:int(dur * SR)], 0.6)


def music_triumph():
    """One-shot ending fanfare (not a loop) — resolve any of the four stories."""
    seq = [(0.0, [55, 60], 0.5), (0.5, [55, 62], 0.5), (1.0, [55, 64], 0.7),
           (1.8, [60, 67], 1.6)]
    out = silence(4.2)
    for t, ns, d in seq:
        chord = mix(*[mix(triangle(note(n), d, 0.5), sine(note(n) * 2, d, 0.18))
                      for n in ns])
        out = at(out, env_adsr(chord, a=0.02, d=0.1, s=0.85, r=0.3), t)
    out = at(out, thump(49, 0.4, 0.8), 1.8)
    shimmer = env_adsr(gain(highpass(noise(2.2, 1.0, seed=171), 5200), 0.1),
                       a=0.9, d=0.5, s=0.5, r=0.8)
    return fade(mix(echo(out, 0.24, 0.3, wet=0.25, taps=2), shimmer), fout=0.9)


def sfx_bells():
    """Jester cap-and-bells jingle — Fortunato's motif."""
    rng = random.Random(181)
    out = silence(0.9)
    for _ in range(14):
        f = rng.uniform(2400, 4800)
        ding = env_exp(mix(sine(f, 0.12, 0.5), sine(f * 2.41, 0.10, 0.22),
                           sine(f * 3.89, 0.07, 0.1)), 0.045)
        out = at(out, gain(ding, rng.uniform(0.35, 0.8)), rng.uniform(0, 0.55))
    return fade(out, fout=0.25)


def sfx_scrape():
    """Trowel on stone / brick laid — masonry one-shot."""
    grind = env_adsr(gain(lowpass(highpass(noise(0.5, 1.0, seed=191), 500), 2200), 0.9),
                     a=0.03, d=0.15, s=0.6, r=0.15)
    swept = [v * (1.0 + 0.5 * math.sin(2 * math.pi * 7 * i / SR))
             for i, v in enumerate(grind)]
    thunk = at(silence(0.8), thump(95, 0.18, 0.8), 0.52)
    return fade(mix(swept, thunk), fout=0.12)


def sfx_bolt():
    """Door bolt scraped back + latch clack."""
    slide = env_adsr(gain(lowpass(highpass(noise(0.3, 1.0, seed=201), 700), 2600), 0.7),
                     a=0.02, d=0.1, s=0.65, r=0.08)
    clack = env_exp(mix(sine(1300, 0.06, 0.6), lowpass(noise(0.04, 0.8, seed=202), 2000)),
                    0.02)
    out = at(list(slide), clack, 0.34)
    return fade(out, fout=0.1)


def sfx_clock_loop():
    """Parlor clock — tick... tock..., loopable at 60bpm."""
    def tick(f):
        return env_exp(mix(sine(f, 0.05, 0.5),
                           highpass(noise(0.02, 0.6, seed=211), 2000)), 0.012)
    cycle = silence(2.0)
    cycle = at(cycle, gain(tick(2100), 0.8), 0.0)
    cycle = at(cycle, gain(tick(1700), 0.65), 1.0)
    return loopable(cat(cycle, cycle), crossfade=0.05)


def sfx_rain_loop():
    """Steady rain, loopable — pairs with wind + thunder."""
    bed = gain(highpass(lowpass(noise(6.0, 1.0, seed=221), 6000), 400), 0.5)
    rng = random.Random(222)
    out = list(bed)
    for _ in range(140):
        drop = env_exp(highpass(noise(0.012, 1.0, seed=rng.randrange(99999)), 2500), 0.004)
        out = at(out, gain(drop, rng.uniform(0.1, 0.45)), rng.uniform(0, 5.9))
    return loopable(out, crossfade=0.7)


def music_caper_loop():
    """Comedy caper bed — Red Chief. Pizzicato-ish bounce, 132bpm major."""
    bpm, bars = 132, 4
    beat = 60 / bpm
    dur = bars * 4 * beat
    bass_notes = [45, 45, 52, 45, 47, 47, 54, 47, 48, 48, 55, 48, 47, 47, 54, 45]
    bass = silence(dur)
    for i, n in enumerate(bass_notes):
        bass = at(bass, pluck(note(n), 0.32, 0.55, bright=1600, tau=0.12), i * beat)
    melody = [(0, 69), (0.5, 71), (1, 72), (2, 69), (3, 76), (3.5, 74),
              (4, 71), (5, 74), (6, 71), (7, 67), (7.5, 69),
              (8, 72), (8.5, 74), (9, 76), (10, 72), (11, 79), (11.5, 77),
              (12, 74), (13, 71), (14, 69), (14.5, 67), (15, 69)]
    lead = silence(dur)
    for t, n in melody:
        lead = at(lead, pluck(note(n), 0.4, 0.5, bright=3400, tau=0.16), t * beat)
    offbeat = beat_grid(".x.x.x.x.x.x.x.x", beat / 2,
                        lambda _: gain(env_exp(highpass(noise(0.03, 1.0, seed=231), 5000),
                                               0.012), 0.18), dur)
    return loopable(mix(bass, lead, offbeat)[:int(dur * SR)], 0.25)


def music_carnival_loop():
    """Carnival tarantella — Cask act 1. 6/8 feel, minor but festive, 150bpm."""
    bpm, bars = 150, 4
    beat = 60 / bpm            # one eighth-triplet pulse
    dur = bars * 6 * beat
    melody = [(0, 69), (1, 71), (2, 72), (3, 76), (4, 74), (5, 72),
              (6, 71), (7, 69), (8, 68), (9, 71), (10, 69), (11, 64),
              (12, 69), (13, 71), (14, 72), (15, 76), (16, 79), (17, 77),
              (18, 76), (19, 74), (20, 72), (21, 71), (22, 69), (23, 69)]
    lead = silence(dur)
    for t, n in melody:
        tone = mix(triangle(note(n), 0.34, 0.6), sine(note(n) * 2, 0.3, 0.14))
        lead = at(lead, env_adsr(tone, a=0.01, d=0.06, s=0.7, r=0.08), t * beat)
    oom = silence(dur)
    for i in range(bars * 6):
        n = 45 if i % 6 in (0, 3) else 52
        g = 0.5 if i % 6 in (0, 3) else 0.3
        oom = at(oom, pluck(note(n), 0.3, g, bright=1400, tau=0.1), i * beat)
    jingle = beat_grid("x.....x.....x.....x.....", beat,
                       lambda _: gain(env_exp(sine(3600, 0.1, 0.4), 0.03), 0.22), dur)
    return loopable(mix(lead, oom, jingle)[:int(dur * SR)], 0.25)


# -------------------------------------------------------------------- output

SOUNDS = [
    # file, builder, index entry extras
    ("thunder.wav", sfx_thunder, {"name": "Thunder", "gain": 0.85}),
    ("door_creak.wav", sfx_door_creak, {"name": "Door creak", "gain": 0.7}),
    ("knock.wav", sfx_knock, {"name": "Knock at the door", "gain": 0.9}),
    ("heartbeat_loop.wav", sfx_heartbeat_loop,
     {"name": "Heartbeat (loop)", "gain": 0.6, "loop": True}),
    ("wind_loop.wav", sfx_wind_loop,
     {"name": "Night wind (loop)", "gain": 0.35, "loop": True}),
    ("bell_toll.wav", sfx_bell_toll, {"name": "Bell toll", "gain": 0.7}),
    ("chains.wav", sfx_chains, {"name": "Chains", "gain": 0.7}),
    ("footsteps.wav", sfx_footsteps, {"name": "Footsteps", "gain": 0.75}),
    ("drip.wav", sfx_drip, {"name": "Cave drip", "gain": 0.6}),
    ("fire_loop.wav", sfx_fire_loop,
     {"name": "Torch fire (loop)", "gain": 0.35, "loop": True}),
    ("owl.wav", sfx_owl, {"name": "Owl", "gain": 0.6}),
    ("roar.wav", sfx_roar, {"name": "Monster roar", "gain": 0.9}),
    ("magic.wav", sfx_magic, {"name": "Magic spell", "gain": 0.75}),
    ("sword.wav", sfx_sword, {"name": "Sword clash", "gain": 0.8}),
    ("coins.wav", sfx_coins, {"name": "Treasure coins", "gain": 0.7}),
    ("sting_horror.wav", sfx_sting_horror, {"name": "Horror sting", "gain": 0.85}),
    ("sting_reveal.wav", sfx_sting_reveal, {"name": "Reveal sting", "gain": 0.8}),
    ("crumble.wav", sfx_crumble, {"name": "Rockfall", "gain": 0.8}),
    ("gasp.wav", sfx_gasp, {"name": "Gasp", "gain": 0.7}),
    ("dread_loop.wav", music_dread_loop,
     {"name": "Dread (music loop)", "gain": 0.3, "loop": True}),
    ("tension_loop.wav", music_tension_loop,
     {"name": "Tension (music loop)", "gain": 0.3, "loop": True}),
    ("mystic_loop.wav", music_mystic_loop,
     {"name": "Mystic (music loop)", "gain": 0.3, "loop": True}),
    ("quest_loop.wav", music_quest_loop,
     {"name": "Quest (music loop)", "gain": 0.3, "loop": True}),
    ("lament_loop.wav", music_lament_loop,
     {"name": "Lament (music loop)", "gain": 0.3, "loop": True}),
    ("triumph.wav", music_triumph, {"name": "Triumph fanfare", "gain": 0.6}),
    ("bells.wav", sfx_bells, {"name": "Jester bells", "gain": 0.7}),
    ("scrape.wav", sfx_scrape, {"name": "Stone scrape", "gain": 0.75}),
    ("bolt.wav", sfx_bolt, {"name": "Door bolt", "gain": 0.8}),
    ("clock_loop.wav", sfx_clock_loop,
     {"name": "Clock tick (loop)", "gain": 0.35, "loop": True}),
    ("rain_loop.wav", sfx_rain_loop,
     {"name": "Rain (loop)", "gain": 0.3, "loop": True}),
    ("caper_loop.wav", music_caper_loop,
     {"name": "Caper (music loop)", "gain": 0.3, "loop": True}),
    ("carnival_loop.wav", music_carnival_loop,
     {"name": "Carnival (music loop)", "gain": 0.3, "loop": True}),
]


def main():
    import json
    import os
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(outdir, exist_ok=True)
    index = []
    for filename, builder, meta in SOUNDS:
        path = os.path.join(outdir, filename)
        samples = builder()
        write_wav(path, samples)
        seconds = len(samples) / SR
        entry = {"id": filename.replace(".wav", ""), "file": filename}
        entry.update(meta)
        index.append(entry)
        print(f"  {filename:22s} {seconds:6.2f}s  {os.path.getsize(path):>9,} bytes")
    with open(os.path.join(outdir, "_new_index.json"), "w") as f:
        json.dump(index, f, indent=2)
    print(f"\n{len(SOUNDS)} sounds -> {outdir}")


if __name__ == "__main__":
    main()
