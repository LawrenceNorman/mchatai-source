import json, glob, os, re

CANON = {"@dress":"@shirt","@suit":"@shirt","@cardigan":"@shirt","@wrap":"@shirt",
         "@wrapDark":"@shirtDark","@suitTrim":"@shirtDark","@apron":"@shirtDark",
         "@skirt":"@pants","@cord":"@pants","@boot":"@shoe","@gold":"@shirtDark"}
HAIR_EXTRAS = {"hairSide","locs","bun","hood","moustache"}

def sh(part): return part.get('shapes') or part.get('drawables') or []
def canon(shapes):
    out=[]
    for s in shapes:
        s=dict(s)
        for k in ('fill','stroke'):
            v=s.get(k)
            if isinstance(v,str) and v in CANON: s[k]=CANON[v]
        out.append(s)
    return out

faces, hairs, bodies, legs = [], [], [], []
for f in sorted(glob.glob('puppets/ts_*.json')):
    d = json.load(open(f))
    if d.get('kind') not in (None,'character'): continue
    rig = os.path.basename(f).replace('.json','').replace('ts_','')
    P = {p['id']: p for p in d['parts']}
    if not {'head','eyes','mouth','body','armL','armR','legL','legR'} <= set(P): continue
    name = d.get('name', rig).split('—')[0].strip()

    faces.append({
        "id": "face_"+rig, "name": name,
        "head": {"pivot": P['head']['pivot'], "shapes": canon(sh(P['head']))},
        "eyes": {"pivot": P['eyes']['pivot'], "shapes": canon(sh(P['eyes']))},
        "mouthPivot": P['mouth']['pivot'],
        "visemes": {k: canon(v) for k, v in (d.get('visemes') or {}).items()},
    })
    hairShapes = canon(sh(P['hair'])) if 'hair' in P else []
    for extra in sorted(HAIR_EXTRAS):
        if extra in P: hairShapes += canon(sh(P[extra]))
    if hairShapes:
        # Record the crown this hair was drawn for. Without it the assembler
        # cannot tell whether a style belongs to a tall head or a short one, and
        # every mixed pairing leaves the hair hovering.
        hys = []
        for sp in sh(P['head']):
            t = sp.get('type')
            if t in ('ellipse', 'rect'):
                hys.append(sp['y'] + sp['h'])
            elif t == 'polygon':
                hys += [pt[1] for pt in sp.get('points', [])]
            elif t == 'path':
                # Heads are sometimes a path (the alien's is). Measuring only
                # ellipses and rects found its NECK and reported a crown at
                # 0.475, which flung its antennae into the air on every other
                # head. Pull the coordinates out of the path data instead.
                nums = [float(n) for n in re.findall(r'-?\d+\.?\d*', sp.get('d', ''))]
                hys += nums[1::2]
        hairs.append({"id": "hair_"+rig, "name": name,
                      "pivot": P['hair']['pivot'] if 'hair' in P else [0,0.9],
                      "headTop": max(hys) if hys else 1.0,
                      "shapes": hairShapes})
    bodies.append({
        "id": "body_"+rig, "name": name,
        "body": {"pivot": P['body']['pivot'], "shapes": canon(sh(P['body']))},
        "armL": {"pivot": P['armL']['pivot'], "shapes": canon(sh(P['armL']))},
        "armR": {"pivot": P['armR']['pivot'], "shapes": canon(sh(P['armR']))},
    })
    entry = {"id": "legs_"+rig, "name": name,
             "legL": {"pivot": P['legL']['pivot'], "shapes": canon(sh(P['legL']))},
             "legR": {"pivot": P['legR']['pivot'], "shapes": canon(sh(P['legR']))}}
    for slot in ('shoeL','shoeR'):
        if slot in P:
            entry[slot] = {"pivot": P[slot]['pivot'], "shapes": canon(sh(P[slot]))}
    legs.append(entry)

lib = {
  "version": 1,
  "swatches": {
    "skin":  ["#F7DFC8","#F6D2A9","#E0B183","#C68A5B","#A2673C","#7A4A28","#4E3018"],
    "hair":  ["#241A14","#3A2A1C","#6B4A2F","#8A5A2B","#B08040","#D8C08A","#9A9A9A","#E8E4DC"],
    "shirt": ["#E8552D","#2E8B84","#3E6DA8","#B4553F","#6B5B95","#4C7FA8","#C9A227","#5C8A4A"],
    "pants": ["#3E6DA8","#2B3A55","#5B4A7A","#6F6A62","#8D7A63","#2B2118"],
    "shoe":  ["#2B2118","#4E4A44","#7A5A46","#B4553F"]
  },
  "base": {"line":"#241A14","white":"#FFFFFF","pupil":"#241A14",
           "mouth":"#8C3A2E","shirtDark":"#6E4A38"},
  "faces": faces, "hair": hairs, "bodies": bodies, "legs": legs
}
json.dump(lib, open('parts/parts.json','w'), indent=1)
open('parts/parts.json','a').write('\n')
print("faces %d | hair %d | bodies %d | legs %d" % (len(faces), len(hairs), len(bodies), len(legs)))
print("combinations:", len(faces)*max(len(hairs),1)*len(bodies)*len(legs))
