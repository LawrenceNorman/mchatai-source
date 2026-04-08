"""TourGuide Service — mChatAI microservice for travel recommendations and discovery."""

import asyncio
import httpx
import math
import os
import polyline
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict

router = APIRouter()

# ── Models ──

class UserPreferences(BaseModel):
    climate: Optional[str] = Field(None, description="Preferred climate (warm, cold, temperate)")
    budget: Optional[str] = Field(None, description="Budget level (low, medium, high)")
    activity: Optional[str] = Field(None, description="Activity type (adventure, culture, relaxation)")

class RecommendationInput(BaseModel):
    preferences: UserPreferences

class RecommendationItem(BaseModel):
    name: str
    score: float
    reason: str

class RecommendationsOutput(BaseModel):
    recommendations: List[RecommendationItem]

class SearchInput(BaseModel):
    query: str = Field(..., min_length=1)

class SearchResult(BaseModel):
    name: str
    type: str

class SearchOutput(BaseModel):
    results: List[SearchResult]

class DetailsInput(BaseModel):
    destination: str = Field(..., min_length=1)

class DetailsOutput(BaseModel):
    name: str
    highlights: List[str]
    best_time_to_visit: str
    description: Optional[str] = None

class Coordinate(BaseModel):
    lat: float
    lon: float

class RouteInput(BaseModel):
    route_polyline: Optional[str] = Field(None, description="Encoded polyline string of the route")
    coordinates: Optional[List[Coordinate]] = Field(None, description="List of latitude/longitude coordinates")
    radius: int = Field(10000, description="Search radius in meters (max 10000 for Wikipedia API)")
    interval: float = Field(50000, description="Distance interval in meters to sample points along the route (e.g. 50km)")

class POI(BaseModel):
    pageid: int
    title: str
    lat: float
    lon: float
    dist: float

class RoutePOIsOutput(BaseModel):
    pois: List[POI]

class POIBlurbInput(BaseModel):
    pageid: int = Field(..., description="Wikipedia page ID of the POI")

class POIBlurbOutput(BaseModel):
    pageid: int
    title: str
    original_summary: str
    audio_blurb: str

# ── Mock Data ──

MOCK_DESTINATIONS = [
    {
        "name": "Bali, Indonesia",
        "highlights": ["Uluwatu Temple", "Ubud Monkey Forest", "Tegallalang Rice Terrace"],
        "best_time_to_visit": "April to October",
        "description": "A tropical paradise known for its beaches, volcanic mountains, and iconic rice paddies.",
        "tags": ["warm", "adventure", "medium", "relaxation"]
    },
    {
        "name": "Paris, France",
        "highlights": ["Eiffel Tower", "Louvre Museum", "Notre-Dame Cathedral"],
        "best_time_to_visit": "Spring (April-June) or Fall (September-October)",
        "description": "The City of Light is a global center for art, fashion, gastronomy and culture.",
        "tags": ["temperate", "culture", "high"]
    },
    {
        "name": "Reykjavik, Iceland",
        "highlights": ["Blue Lagoon", "Hallgrimskirkja", "Golden Circle"],
        "best_time_to_visit": "June to August (Summer) or November to February (Northern Lights)",
        "description": "The capital of Iceland, known for its dramatic landscapes with volcanoes, geysers, and hot springs.",
        "tags": ["cold", "adventure", "high"]
    }
]

# ── Endpoints ──

@router.post("/recommendations", response_model=RecommendationsOutput)
async def get_recommendations(body: RecommendationInput):
    prefs = body.preferences
    recommendations = []
    
    for dest in MOCK_DESTINATIONS:
        score = 0.5
        match_reasons = []
        
        if prefs.climate and prefs.climate.lower() in dest["tags"]:
            score += 0.2
            match_reasons.append(f"Matches {prefs.climate} climate")
        
        if prefs.activity and prefs.activity.lower() in dest["tags"]:
            score += 0.2
            match_reasons.append(f"Matches {prefs.activity} activity")
            
        if prefs.budget and prefs.budget.lower() in dest["tags"]:
            score += 0.1
            match_reasons.append(f"Matches {prefs.budget} budget")
            
        if match_reasons:
            recommendations.append(RecommendationItem(
                name=dest["name"],
                score=min(score, 1.0),
                reason=", ".join(match_reasons)
            ))
            
    # Sort by score descending
    recommendations.sort(key=lambda x: x.score, reverse=True)
    
    return RecommendationsOutput(recommendations=recommendations)


@router.post("/search", response_model=SearchOutput)
async def search_destinations(body: SearchInput):
    query = body.query.lower()
    results = []
    
    for dest in MOCK_DESTINATIONS:
        if query in dest["name"].lower() or any(query in tag for tag in dest["tags"]):
            results.append(SearchResult(name=dest["name"], type="destination"))
            
    return SearchOutput(results=results)


@router.post("/details", response_model=DetailsOutput)
async def get_details(body: DetailsInput):
    dest_name = body.destination.lower()
    
    for dest in MOCK_DESTINATIONS:
        if dest_name in dest["name"].lower():
            return DetailsOutput(
                name=dest["name"],
                highlights=dest["highlights"],
                best_time_to_visit=dest["best_time_to_visit"],
                description=dest.get("description")
            )
            
    return DetailsOutput(
        name="Unknown",
        highlights=[],
        best_time_to_visit="Unknown",
        description="Destination details not found in database."
    )

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def simplify_route(coords: List[Coordinate], interval_meters: float) -> List[Coordinate]:
    if not coords:
        return []
    
    simplified = [coords[0]]
    last_added = coords[0]
    
    for coord in coords[1:]:
        dist = haversine_distance(last_added.lat, last_added.lon, coord.lat, coord.lon)
        if dist >= interval_meters:
            simplified.append(coord)
            last_added = coord
            
    if coords[-1] != simplified[-1]:
        simplified.append(coords[-1])
        
    return simplified

async def fetch_wikipedia_pois(client: httpx.AsyncClient, lat: float, lon: float, radius: int) -> List[POI]:
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "geosearch",
        "gscoord": f"{lat}|{lon}",
        "gsradius": min(radius, 10000),
        "gslimit": 50,
        "format": "json"
    }
    
    try:
        response = await client.get(url, params=params, timeout=10.0)
        response.raise_for_status()
        data = response.json()
        
        pois = []
        for item in data.get("query", {}).get("geosearch", []):
            pois.append(POI(
                pageid=item.get("pageid", 0),
                title=item.get("title", ""),
                lat=item.get("lat", 0.0),
                lon=item.get("lon", 0.0),
                dist=item.get("dist", 0.0)
            ))
        return pois
    except Exception as e:
        print(f"Error fetching POIs for {lat},{lon}: {e}")
        return []

@router.post("/route-pois", response_model=RoutePOIsOutput)
async def get_route_pois(body: RouteInput):
    coords = []
    if body.route_polyline:
        try:
            decoded = polyline.decode(body.route_polyline)
            coords = [Coordinate(lat=p[0], lon=p[1]) for p in decoded]
        except Exception as e:
            print(f"Error decoding polyline: {e}")
    elif body.coordinates:
        coords = body.coordinates
        
    if not coords:
        return RoutePOIsOutput(pois=[])
        
    sampled_coords = simplify_route(coords, body.interval)
    
    all_pois = []
    seen_pageids = set()
    
    async with httpx.AsyncClient() as client:
        tasks = [fetch_wikipedia_pois(client, c.lat, c.lon, body.radius) for c in sampled_coords]
        results = await asyncio.gather(*tasks)
        
        for pois in results:
            for poi in pois:
                if poi.pageid not in seen_pageids:
                    seen_pageids.add(poi.pageid)
                    all_pois.append(poi)
                    
    all_pois.sort(key=lambda x: x.dist)
                    
    return RoutePOIsOutput(pois=all_pois)

@router.post("/poi-blurb", response_model=POIBlurbOutput)
async def get_poi_blurb(body: POIBlurbInput):
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "prop": "extracts",
        "pageids": body.pageid,
        "exintro": True,
        "explaintext": True,
        "format": "json"
    }
    
    title = ""
    extract = ""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, params=params, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            pages = data.get("query", {}).get("pages", {})
            page = pages.get(str(body.pageid), {})
            title = page.get("title", "")
            extract = page.get("extract", "")
        except Exception as e:
            print(f"Error fetching Wikipedia summary for {body.pageid}: {e}")
            
    audio_blurb = extract
    api_key = os.environ.get("GEMINI_API_KEY")
    if extract and api_key:
        prompt = f"Condense the following Wikipedia summary into a concise, engaging audio blurb tailored for Text-to-Speech (TTS) playback while driving or walking. Keep it under 3 sentences, sound like a friendly tour guide, and focus on the most interesting facts:\n\nTitle: {title}\nSummary: {extract}"
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "systemInstruction": {"parts": [{"text": "You are a friendly and concise tour guide."}]}
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(gemini_url, json=payload, timeout=15.0)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        audio_blurb = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", extract)
        except Exception as e:
            print(f"Error condensing text with Gemini: {e}")
            
    return POIBlurbOutput(
        pageid=body.pageid,
        title=title,
        original_summary=extract,
        audio_blurb=audio_blurb
    )
