"""Material Icons catalog loader + SF Symbol → Material alias resolver.

The Material Icons Round font uses the icon NAME itself as a ligature
(drawing "whatshot" as a string renders the flame glyph). No codepoint
table needed — we just need to validate that the name exists in the
catalog before asking the font to render it.

Also loads the vendored game-icons.net glyph set (`assets/game_icons/`):
white-on-transparent PNGs the compositor tints + scales like a font glyph.
`symbol_set: "material"` falls through to the game catalog on a miss so
existing callers pick up game glyphs with zero client changes.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel


class ResolvedSymbol(BaseModel):
    id: str
    set: Literal["material", "sf", "game"]
    display_text: str  # what to draw via the font ligature (game: the id, informational)
    categories: List[str] = []
    original_request: Optional[str] = None  # e.g. "flame.fill" when SF→Material remap happened
    remap_note: Optional[str] = None
    asset_path: Optional[str] = None  # game set: absolute path to the vendored white-on-transparent PNG


@dataclass
class MaterialSymbolCatalog:
    icons_by_name: Dict[str, Dict]
    categories: List[str]
    sf_hints: Dict[str, str]

    @property
    def count(self) -> int:
        return len(self.icons_by_name)

    @classmethod
    def load(cls, catalog_path: Path, sf_hints_path: Path) -> "MaterialSymbolCatalog":
        if not catalog_path.exists():
            return cls(icons_by_name={}, categories=[], sf_hints={})
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
        icons = {entry["n"]: {"name": entry["n"], "categories": entry.get("c", [])} for entry in data.get("icons", [])}
        categories = data.get("categories", [])
        sf_hints: Dict[str, str] = {}
        if sf_hints_path.exists():
            try:
                sf_hints = json.loads(sf_hints_path.read_text(encoding="utf-8"))
                if not isinstance(sf_hints, dict):
                    sf_hints = {}
            except json.JSONDecodeError:
                sf_hints = {}
        return cls(icons_by_name=icons, categories=categories, sf_hints=sf_hints)

    def get(self, name: str) -> Optional[Dict]:
        return self.icons_by_name.get(name)

    def categories_with_counts(self) -> List[Dict]:
        counts: Dict[str, int] = {c: 0 for c in self.categories}
        for entry in self.icons_by_name.values():
            for cat in entry.get("categories", []):
                counts[cat] = counts.get(cat, 0) + 1
        return [{"name": name, "count": counts.get(name, 0)} for name in self.categories]

    def search(self, query: str, limit: int = 50) -> List[Dict]:
        q = query.lower().strip()
        # Substring match on name, then categories. Prefix matches rank first.
        prefix: List[Dict] = []
        contains: List[Dict] = []
        category_match: List[Dict] = []
        for entry in self.icons_by_name.values():
            name = entry["name"].lower()
            if name.startswith(q):
                prefix.append(entry)
            elif q in name:
                contains.append(entry)
            elif any(q in cat.lower() for cat in entry.get("categories", [])):
                category_match.append(entry)
        merged = (prefix + contains + category_match)[:limit]
        return merged

    def map_sf_to_material(self, sf_name: str) -> Optional[str]:
        # Try direct alias first, then strip .fill / .circle / etc variants.
        if sf_name in self.sf_hints:
            target = self.sf_hints[sf_name]
            return target if target in self.icons_by_name else None
        stem = sf_name.split(".")[0]
        if stem in self.sf_hints:
            target = self.sf_hints[stem]
            return target if target in self.icons_by_name else None
        # Last-ditch: if the SF stem happens to match a Material name, use it.
        if stem in self.icons_by_name:
            return stem
        return None


@dataclass
class GameIconCatalog:
    """Vendored game-icons.net glyphs (assets/game_icons/). Same catalog JSON
    shape as the Material catalog; each entry has a matching png/<id>.png."""

    icons_by_name: Dict[str, Dict]
    png_dir: Path

    @property
    def count(self) -> int:
        return len(self.icons_by_name)

    @classmethod
    def load(cls, catalog_path: Path, png_dir: Path) -> "GameIconCatalog":
        if not catalog_path.exists():
            # Partial/stale install — degrade to material-only, but say so.
            print(f"[icon-maker] WARNING: game icon catalog missing at {catalog_path}; game glyphs unavailable")
            return cls(icons_by_name={}, png_dir=png_dir)
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
        icons = {entry["n"]: {"name": entry["n"], "categories": entry.get("c", [])} for entry in data.get("icons", [])}
        return cls(icons_by_name=icons, png_dir=png_dir)

    def get(self, name: str) -> Optional[Dict]:
        return self.icons_by_name.get(name)

    def png_path(self, name: str) -> Path:
        return self.png_dir / f"{name}.png"

    def search(self, query: str, limit: int = 50) -> List[Dict]:
        q = query.lower().strip()
        prefix: List[Dict] = []
        contains: List[Dict] = []
        category_match: List[Dict] = []
        for entry in self.icons_by_name.values():
            name = entry["name"].lower()
            if name.startswith(q):
                prefix.append(entry)
            elif q in name:
                contains.append(entry)
            elif any(q in cat.lower() for cat in entry.get("categories", [])):
                category_match.append(entry)
        return (prefix + contains + category_match)[:limit]


def _resolve_game(symbol_id: str, game_catalog: GameIconCatalog) -> ResolvedSymbol:
    entry = game_catalog.get(symbol_id) or {}
    return ResolvedSymbol(
        id=symbol_id,
        set="game",
        display_text=symbol_id,
        categories=entry.get("categories", []),
        asset_path=str(game_catalog.png_path(symbol_id)),
    )


def resolve_symbol(
    symbol_id: Optional[str],
    symbol_set: str,
    catalog: MaterialSymbolCatalog,
    game_catalog: Optional[GameIconCatalog] = None,
) -> Optional[ResolvedSymbol]:
    if not symbol_id or symbol_set == "none":
        return None
    game_catalog = game_catalog or GameIconCatalog(icons_by_name={}, png_dir=Path("."))

    if symbol_set in ("material", "game"):
        # Material tries the Material catalog FIRST, then falls through to the
        # game catalog — the Swift client always sends symbol_set "material",
        # so an LLM-picked game glyph works with zero client changes. Explicit
        # "game" prefers the game catalog and falls back to Material.
        in_material = catalog.get(symbol_id) is not None
        in_game = game_catalog.get(symbol_id) is not None
        if not in_material and not in_game:
            from fastapi import HTTPException
            suggestions = [s["name"] for s in catalog.search(symbol_id, limit=5)]
            suggestions += [s["name"] for s in game_catalog.search(symbol_id, limit=5)]
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "symbol_not_found",
                    "message": f"Symbol '{symbol_id}' not found in the Material or game catalogs",
                    "suggestions": suggestions[:10],
                },
            )
        prefer_game = symbol_set == "game"
        if in_game and (prefer_game or not in_material):
            return _resolve_game(symbol_id, game_catalog)
        entry = catalog.get(symbol_id)
        return ResolvedSymbol(
            id=symbol_id,
            set="material",
            display_text=symbol_id,
            categories=entry.get("categories", []),
        )

    if symbol_set == "sf":
        mapped = catalog.map_sf_to_material(symbol_id)
        if mapped is None:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "sf_symbols_unsupported_in_service",
                    "message": f"SF Symbol '{symbol_id}' has no Material equivalent in sf_symbol_hints.json",
                    "hint": "Use the macOS IconMaker app for native SF Symbol rendering, or pass symbol_set='material' with a Material name.",
                },
            )
        entry = catalog.get(mapped) or {}
        return ResolvedSymbol(
            id=mapped,
            set="material",  # We rendered it via Material; record the origin.
            display_text=mapped,
            categories=entry.get("categories", []),
            original_request=symbol_id,
            remap_note=f"SF '{symbol_id}' → Material '{mapped}'",
        )

    return None
