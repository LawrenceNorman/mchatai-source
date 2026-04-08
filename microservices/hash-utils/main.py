"""Hash Utils — mChatAI microservice for hashing, encoding, and UUID generation."""

import base64
import hashlib
import uuid as uuid_lib
import urllib.parse
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

ALGORITHMS = {"md5", "sha1", "sha256", "sha512"}


# ── Models ──

class HashInput(BaseModel):
    text: str = Field(..., min_length=1)
    algorithm: str = Field(default="sha256")

class HashOutput(BaseModel):
    hash: str
    algorithm: str

class HashFileInput(BaseModel):
    file_path: str = Field(..., min_length=1)
    algorithm: str = Field(default="sha256")

class HashFileOutput(BaseModel):
    hash: str
    algorithm: str
    file_size_bytes: int

class EncodeInput(BaseModel):
    text: str = Field(..., min_length=1)
    encoding: str = Field(default="base64")
    decode: bool = False

class EncodeOutput(BaseModel):
    result: str
    encoding: str

class UUIDOutput(BaseModel):
    uuid: str


# ── Endpoints ──

@router.post("/hash", response_model=HashOutput)
async def compute_hash(body: HashInput):
    algo = body.algorithm.lower()
    if algo not in ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm. Use: {sorted(ALGORITHMS)}")
    h = hashlib.new(algo, body.text.encode("utf-8"))
    return HashOutput(hash=h.hexdigest(), algorithm=algo)


@router.post("/hash-file", response_model=HashFileOutput)
async def hash_file(body: HashFileInput):
    algo = body.algorithm.lower()
    if algo not in ALGORITHMS:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm. Use: {sorted(ALGORITHMS)}")
    path = Path(body.file_path).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {body.file_path}")
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return HashFileOutput(hash=h.hexdigest(), algorithm=algo, file_size_bytes=path.stat().st_size)


@router.post("/encode", response_model=EncodeOutput)
async def encode_decode(body: EncodeInput):
    enc = body.encoding.lower()
    if enc == "base64":
        if body.decode:
            result = base64.b64decode(body.text.encode()).decode("utf-8", errors="replace")
        else:
            result = base64.b64encode(body.text.encode()).decode()
    elif enc == "url":
        if body.decode:
            result = urllib.parse.unquote(body.text)
        else:
            result = urllib.parse.quote(body.text)
    elif enc == "hex":
        if body.decode:
            result = bytes.fromhex(body.text).decode("utf-8", errors="replace")
        else:
            result = body.text.encode().hex()
    else:
        raise HTTPException(status_code=400, detail="Supported encodings: base64, url, hex")
    return EncodeOutput(result=result, encoding=enc)


@router.get("/uuid", response_model=UUIDOutput)
async def generate_uuid():
    return UUIDOutput(uuid=str(uuid_lib.uuid4()))
