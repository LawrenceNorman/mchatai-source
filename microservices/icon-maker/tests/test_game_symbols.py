"""Game symbol set (v1.1.0): resolution fallthrough, compose rendering, and
fail-loud asset errors. Run: pytest tests/ (needs fastapi pydantic pillow numpy httpx)."""

import base64
import io
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

import main
from symbols import GameIconCatalog, resolve_symbol


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(main.router)
    return TestClient(app, raise_server_exceptions=False)


def _decode_png(b64: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")


# ── Resolution ───────────────────────────────────────────────────────────────

def test_material_set_falls_through_to_game_catalog():
    # The Swift client always sends symbol_set "material" — a game-only id
    # must still resolve (zero client changes).
    resolved = resolve_symbol("chess-knight", "material", main._get_catalog(), main._get_game_catalog())
    assert resolved is not None
    assert resolved.set == "game"
    assert resolved.id == "chess-knight"
    assert resolved.asset_path and Path(resolved.asset_path).exists()


def _synthetic_collision_catalog():
    # The vendored set deliberately has NO ids colliding with Material names
    # (colliders were renamed, e.g. rocket → space-rocket), so collision
    # preference is exercised with a synthetic game catalog instead.
    return GameIconCatalog(
        icons_by_name={"rocket": {"name": "rocket", "categories": ["space"]}},
        png_dir=main.GAME_PNG_DIR,
    )


def test_vendored_ids_never_collide_with_material():
    material = main._get_catalog()
    game = main._get_game_catalog()
    colliding = [n for n in game.icons_by_name if material.get(n) is not None]
    assert colliding == [], f"game ids shadowed by material (unreachable art): {colliding}"


def test_material_set_prefers_material_on_collision():
    resolved = resolve_symbol("rocket", "material", main._get_catalog(), _synthetic_collision_catalog())
    assert resolved.set == "material"


def test_explicit_game_set_prefers_game_on_collision():
    resolved = resolve_symbol("rocket", "game", main._get_catalog(), _synthetic_collision_catalog())
    assert resolved.set == "game"
    assert resolved.asset_path.endswith("rocket.png")


def test_not_found_includes_suggestions_from_both_catalogs():
    # "dungeon" is not itself an id in either catalog, but the game catalog's
    # substring search should suggest "dungeon-gate".
    with pytest.raises(HTTPException) as exc_info:
        resolve_symbol("dungeon", "material", main._get_catalog(), main._get_game_catalog())
    detail = exc_info.value.detail
    assert exc_info.value.status_code == 404
    assert detail["code"] == "symbol_not_found"
    assert "dungeon-gate" in detail["suggestions"]  # game catalog contributed


def test_not_found_via_http(client):
    resp = client.post("/compose", json={"symbol_id": "definitely-not-a-real-glyph", "sizes": [64]})
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "symbol_not_found"


# ── Compose with a game glyph ────────────────────────────────────────────────

def test_compose_game_glyph_center_is_tinted_white(client):
    resp = client.post(
        "/compose",
        json={
            "symbol_id": "chess-knight",
            "symbol_set": "material",  # fallthrough path, like the Swift client
            "symbol_color": "#FFFFFF",
            "bg_color": "#1F2937",
            "sizes": [256],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["meta"]["symbol_resolved"]["set"] == "game"
    img = _decode_png(body["pngs"]["256"])
    assert img.size == (256, 256)
    # Center 25% region must contain white glyph pixels.
    cx0, cx1 = 96, 160
    white = sum(
        1
        for x in range(cx0, cx1)
        for y in range(cx0, cx1)
        if img.getpixel((x, y))[:3] >= (240, 240, 240)
    )
    assert white > 50, f"only {white} white pixels in center region"


def test_compose_game_glyph_respects_symbol_size(client):
    def glyph_bbox_width(symbol_size):
        resp = client.post(
            "/compose",
            json={
                "symbol_id": "chess-knight",
                "symbol_color": "#FFFFFF",
                "bg_color": "#000000",
                "symbol_size": symbol_size,
                "sizes": [1024],
            },
        )
        assert resp.status_code == 200, resp.text
        img = _decode_png(resp.json()["pngs"]["1024"])
        xs = [
            x
            for x in range(0, 1024, 4)
            for y in range(0, 1024, 4)
            if img.getpixel((x, y))[:3] >= (240, 240, 240)
        ]
        assert xs, f"no white glyph pixels at symbol_size={symbol_size}"
        return max(xs) - min(xs)

    small = glyph_bbox_width(300)
    large = glyph_bbox_width(700)
    assert large > small * 1.5, f"glyph extent {small} → {large} did not scale with symbol_size"


def test_info_reports_game_set(client):
    info = client.get("/info").json()
    assert info["version"] == "1.1.0"
    assert "game" in info["symbol_sets"]
    assert info["game_catalog_count"] >= 45


# ── Fail-loud asset errors ───────────────────────────────────────────────────

def test_missing_material_font_returns_500(client, monkeypatch):
    monkeypatch.setattr(main, "MATERIAL_FONT_PATH", Path("/nonexistent/MaterialIconsRound.otf"))
    resp = client.post("/compose", json={"symbol_id": "star", "sizes": [64]})
    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "font_missing"


def test_missing_game_png_returns_500(client, monkeypatch):
    broken = GameIconCatalog(
        icons_by_name={"chess-knight": {"name": "chess-knight", "categories": []}},
        png_dir=Path("/nonexistent/game_icons/png"),
    )
    monkeypatch.setattr(main, "_game_catalog", broken)
    resp = client.post("/compose", json={"symbol_id": "chess-knight", "sizes": [64]})
    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "game_asset_missing"
