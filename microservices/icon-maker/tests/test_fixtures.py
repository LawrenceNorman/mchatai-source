"""Smoke-run every QAFlywheel fixture in tests/fixtures/ through /compose.
Byte-level regression (perceptual hash) stays in the Swift-side canary; this
just proves each fixture composes all requested sizes without error."""

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import main

FIXTURES = sorted((Path(__file__).parent / "fixtures").glob("*.json"))


@pytest.fixture(scope="module")
def client():
    app = FastAPI()
    app.include_router(main.router)
    return TestClient(app)


@pytest.mark.parametrize("fixture_path", FIXTURES, ids=lambda p: p.stem)
def test_fixture_composes(client, fixture_path):
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    resp = client.post("/compose", json=fixture["request"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    if fixture.get("expect", {}).get("all_sizes_present"):
        for size in fixture["request"].get("sizes", []):
            assert str(size) in body["pngs"], f"size {size} missing from response"
