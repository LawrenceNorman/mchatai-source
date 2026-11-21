#!/usr/bin/env python3
"""Build content/diagram-icons/icons.json from a folder of Lucide SVGs (ISC licence).

    python3 -I build_icons.py <folder of lucide-static/icons/*.svg> [--out ../icons.json]

Every SVG element (path, circle, ellipse, rect, line, polyline, polygon) becomes ONE path string that
uses only absolute M, L, C and Z, in the icon's 24 x 24 box: arcs and quadratic curves are converted to
cubic curves here, so a reader needs no SVG engine (the macOS diagram kit and the slides-pptx service
read this file). Icons are drawn as strokes (Lucide's stroke width is 2 in the 24 box), never filled.

Standard library only. The SVGs are downloaded data: they are parsed, never executed.
"""
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
TOKEN = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


def fmt(v):
    s = f'{v:.3f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def arc_to_cubics(x1, y1, rx, ry, phi, large, sweep, x2, y2):
    """SVG arc (endpoint form) -> list of cubic segments [(c1x,c1y,c2x,c2y,x,y)] (SVG spec F.6)."""
    if (x1, y1) == (x2, y2):
        return []
    if rx == 0 or ry == 0:
        return [(x1, y1, x2, y2, x2, y2)]
    rx, ry = abs(rx), abs(ry)
    cphi, sphi = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cphi * dx + sphi * dy, -sphi * dx + cphi * dy
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        coef = -coef
    cxp, cyp = coef * rx * y1p / ry, -coef * ry * x1p / rx
    cx = cphi * cxp - sphi * cyp + (x1 + x2) / 2
    cy = sphi * cxp + cphi * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    segs = max(1, int(math.ceil(abs(dt) / (math.pi / 2) - 1e-9)))
    d = dt / segs
    k = 4 / 3 * math.tan(d / 4)
    out = []
    t = t1
    for _ in range(segs):
        c1, s1 = math.cos(t), math.sin(t)
        c2, s2 = math.cos(t + d), math.sin(t + d)
        p1 = (c1 - k * s1, s1 + k * c1)
        p2 = (c2 + k * s2, s2 - k * c2)
        p3 = (c2, s2)

        def tr(p):
            x, y = p[0] * rx, p[1] * ry
            return (cphi * x - sphi * y + cx, sphi * x + cphi * y + cy)
        a, b, e = tr(p1), tr(p2), tr(p3)
        out.append((a[0], a[1], b[0], b[1], e[0], e[1]))
        t += d
    return out


def path_to_abs(d):
    """Any SVG path data -> list of ('M',x,y) ('L',x,y) ('C',x1,y1,x2,y2,x,y) ('Z',)."""
    toks = TOKEN.findall(d)
    out = []
    i = 0
    cmd = None
    cx = cy = sx = sy = 0.0
    last_c2 = None   # reflection point for S
    last_q = None    # control point for T

    def nums(n):
        nonlocal i
        vals = [float(toks[i + j]) for j in range(n)]
        i += n
        return vals
    while i < len(toks):
        t = toks[i]
        if re.fullmatch(r'[A-Za-z]', t):
            cmd = t
            i += 1
            if cmd in 'Zz':
                out.append(('Z',))
                cx, cy = sx, sy
                last_c2 = last_q = None
                continue
        if cmd is None:
            raise ValueError('path data starts without a command')
        rel = cmd.islower()
        C = cmd.upper()
        if C == 'M':
            x, y = nums(2)
            if rel:
                x, y = cx + x, cy + y
            out.append(('M', x, y))
            cx, cy, sx, sy = x, y, x, y
            cmd = 'l' if rel else 'L'   # implicit lineto after the first pair
            last_c2 = last_q = None
        elif C == 'L':
            x, y = nums(2)
            if rel:
                x, y = cx + x, cy + y
            out.append(('L', x, y))
            cx, cy = x, y
            last_c2 = last_q = None
        elif C == 'H':
            (x,) = nums(1)
            x = cx + x if rel else x
            out.append(('L', x, cy))
            cx = x
            last_c2 = last_q = None
        elif C == 'V':
            (y,) = nums(1)
            y = cy + y if rel else y
            out.append(('L', cx, y))
            cy = y
            last_c2 = last_q = None
        elif C == 'C':
            x1, y1, x2, y2, x, y = nums(6)
            if rel:
                x1, y1, x2, y2, x, y = cx + x1, cy + y1, cx + x2, cy + y2, cx + x, cy + y
            out.append(('C', x1, y1, x2, y2, x, y))
            last_c2 = (x2, y2)
            last_q = None
            cx, cy = x, y
        elif C == 'S':
            x2, y2, x, y = nums(4)
            if rel:
                x2, y2, x, y = cx + x2, cy + y2, cx + x, cy + y
            x1, y1 = (2 * cx - last_c2[0], 2 * cy - last_c2[1]) if last_c2 else (cx, cy)
            out.append(('C', x1, y1, x2, y2, x, y))
            last_c2 = (x2, y2)
            last_q = None
            cx, cy = x, y
        elif C == 'Q':
            qx, qy, x, y = nums(4)
            if rel:
                qx, qy, x, y = cx + qx, cy + qy, cx + x, cy + y
            out.append(('C', cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y))
            last_q = (qx, qy)
            last_c2 = None
            cx, cy = x, y
        elif C == 'T':
            x, y = nums(2)
            if rel:
                x, y = cx + x, cy + y
            qx, qy = (2 * cx - last_q[0], 2 * cy - last_q[1]) if last_q else (cx, cy)
            out.append(('C', cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y))
            last_q = (qx, qy)
            last_c2 = None
            cx, cy = x, y
        elif C == 'A':
            rx, ry, phi, large, sweep, x, y = nums(7)
            if rel:
                x, y = cx + x, cy + y
            for seg in arc_to_cubics(cx, cy, rx, ry, phi, int(large), int(sweep), x, y):
                out.append(('C',) + seg)
            cx, cy = x, y
            last_c2 = last_q = None
        else:
            raise ValueError(f'unknown command {cmd}')
    return out


def ellipse_ops(cx, cy, rx, ry):
    k = 0.5522847498
    return [('M', cx + rx, cy),
            ('C', cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry),
            ('C', cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy),
            ('C', cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry),
            ('C', cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy), ('Z',)]


def rect_ops(x, y, w, h, rx, ry):
    if rx <= 0 and ry <= 0:
        return [('M', x, y), ('L', x + w, y), ('L', x + w, y + h), ('L', x, y + h), ('Z',)]
    rx = min(rx or ry, w / 2)
    ry = min(ry or rx, h / 2)
    d = (f'M{x + rx} {y}H{x + w - rx}A{rx} {ry} 0 0 1 {x + w} {y + ry}V{y + h - ry}'
         f'A{rx} {ry} 0 0 1 {x + w - rx} {y + h}H{x + rx}A{rx} {ry} 0 0 1 {x} {y + h - ry}'
         f'V{y + ry}A{rx} {ry} 0 0 1 {x + rx} {y}Z')
    return path_to_abs(d)


def element_ops(el):
    tag = el.tag.split('}')[-1]
    a = el.attrib
    f = lambda k, dflt=0.0: float(a.get(k, dflt))
    if tag == 'path':
        return path_to_abs(a['d'])
    if tag == 'circle':
        return ellipse_ops(f('cx'), f('cy'), f('r'), f('r'))
    if tag == 'ellipse':
        return ellipse_ops(f('cx'), f('cy'), f('rx'), f('ry'))
    if tag == 'rect':
        return rect_ops(f('x'), f('y'), f('width'), f('height'), f('rx'), f('ry'))
    if tag == 'line':
        return [('M', f('x1'), f('y1')), ('L', f('x2'), f('y2'))]
    if tag in ('polyline', 'polygon'):
        pts = [float(v) for v in NUM.findall(a.get('points', ''))]
        pairs = list(zip(pts[0::2], pts[1::2]))
        if not pairs:
            return []
        ops = [('M',) + pairs[0]] + [('L',) + p for p in pairs[1:]]
        return ops + ([('Z',)] if tag == 'polygon' else [])
    return []


def ops_to_string(ops):
    parts = []
    for op in ops:
        parts.append(op[0] + ' '.join(fmt(v) for v in op[1:]) if len(op) > 1 else op[0])
    return ' '.join(parts)


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    src = args[0]
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'icons.json')
    if '--out' in args:
        out = args[args.index('--out') + 1]
    icons = {}
    for name in sorted(os.listdir(src)):
        if not name.endswith('.svg'):
            continue
        root = ET.parse(os.path.join(src, name)).getroot()
        ops = []
        for el in root.iter():
            if el is root:
                continue
            ops += element_ops(el)
        if ops:
            icons[name[:-4]] = ops_to_string(ops)
    doc = {
        'version': 1,
        'source': 'Lucide (lucide-static 0.460.0), https://lucide.dev',
        'license': 'ISC — see LICENSE beside this file',
        'box': 24,
        'strokeWidth': 2,
        'note': 'Each icon is one path of absolute M, L, C, Z commands in a 24 x 24 box, drawn as a round-capped '
                'stroke. Built by tools/build_icons.py; to add an icon, add its Lucide SVG and rebuild — never edit by hand.',
        'icons': icons,
    }
    with open(out, 'w') as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)
        fh.write('\n')
    print(f'{len(icons)} icons -> {os.path.relpath(out)} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
