"""Tests for TourGuide microservice endpoints and utility functions."""

import math
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from main import (
    router,
    haversine_distance,
    simplify_route,
    Coordinate,
    RecommendationInput,
    UserPreferences,
    SearchInput,
    DetailsInput,
    RouteInput,
    POIBlurbInput,
    MOCK_DESTINATIONS,
    get_recommendations,
    search_destinations,
    get_details,
    get_route_pois,
    get_poi_blurb,
)


# ── Haversine Distance Tests ──

class TestHaversineDistance:
    def test_same_point_returns_zero(self):
        assert haversine_distance(0, 0, 0, 0) == 0.0

    def test_known_distance_nyc_to_la(self):
        # NYC (40.7128, -74.0060) to LA (34.0522, -118.2437) ≈ 3,944 km
        dist = haversine_distance(40.7128, -74.0060, 34.0522, -118.2437)
        assert 3_900_000 < dist < 4_000_000  # meters

    def test_short_distance(self):
        # Two points ~111 km apart (1 degree latitude at equator)
        dist = haversine_distance(0, 0, 1, 0)
        assert 110_000 < dist < 112_000

    def test_antipodal_points(self):
        # North pole to south pole ≈ 20,015 km
        dist = haversine_distance(90, 0, -90, 0)
        assert 20_000_000 < dist < 20_100_000

    def test_symmetric(self):
        d1 = haversine_distance(48.8566, 2.3522, 51.5074, -0.1278)
        d2 = haversine_distance(51.5074, -0.1278, 48.8566, 2.3522)
        assert abs(d1 - d2) < 0.01


# ── Simplify Route Tests ──

class TestSimplifyRoute:
    def test_empty_route(self):
        assert simplify_route([], 1000) == []

    def test_single_point(self):
        coords = [Coordinate(lat=0, lon=0)]
        result = simplify_route(coords, 1000)
        assert len(result) == 1

    def test_two_close_points_kept(self):
        coords = [Coordinate(lat=0, lon=0), Coordinate(lat=0.001, lon=0)]
        result = simplify_route(coords, 50)  # 50m interval
        # Both kept: first always included, last always appended if different
        assert len(result) >= 2

    def test_simplification_reduces_points(self):
        # 100 points along equator, 0.001° apart (~111m each)
        coords = [Coordinate(lat=0, lon=i * 0.001) for i in range(100)]
        result = simplify_route(coords, 5000)  # 5km interval
        assert len(result) < len(coords)
        assert result[0] == coords[0]  # first preserved
        assert result[-1] == coords[-1]  # last preserved

    def test_all_points_far_apart_kept(self):
        # Points 1° apart (~111km), interval 50km → all kept
        coords = [Coordinate(lat=0, lon=i) for i in range(5)]
        result = simplify_route(coords, 50_000)
        assert len(result) == 5


# ── Recommendations Endpoint Tests ──

class TestRecommendations:
    @pytest.mark.asyncio
    async def test_warm_climate_recommends_bali(self):
        body = RecommendationInput(preferences=UserPreferences(climate="warm"))
        result = await get_recommendations(body)
        names = [r.name for r in result.recommendations]
        assert "Bali, Indonesia" in names

    @pytest.mark.asyncio
    async def test_cold_climate_recommends_iceland(self):
        body = RecommendationInput(preferences=UserPreferences(climate="cold"))
        result = await get_recommendations(body)
        names = [r.name for r in result.recommendations]
        assert "Reykjavik, Iceland" in names

    @pytest.mark.asyncio
    async def test_culture_activity_recommends_paris(self):
        body = RecommendationInput(preferences=UserPreferences(activity="culture"))
        result = await get_recommendations(body)
        names = [r.name for r in result.recommendations]
        assert "Paris, France" in names

    @pytest.mark.asyncio
    async def test_multiple_preferences_boost_score(self):
        body = RecommendationInput(preferences=UserPreferences(climate="cold", activity="adventure"))
        result = await get_recommendations(body)
        iceland = next((r for r in result.recommendations if "Iceland" in r.name), None)
        assert iceland is not None
        assert abs(iceland.score - 0.9) < 0.001  # 0.5 base + 0.2 climate + 0.2 activity

    @pytest.mark.asyncio
    async def test_no_preferences_returns_empty(self):
        body = RecommendationInput(preferences=UserPreferences())
        result = await get_recommendations(body)
        # No matches when no prefs → empty (score stays 0.5 but no match_reasons)
        assert len(result.recommendations) == 0

    @pytest.mark.asyncio
    async def test_scores_capped_at_1(self):
        body = RecommendationInput(preferences=UserPreferences(
            climate="warm", activity="adventure", budget="medium"
        ))
        result = await get_recommendations(body)
        for r in result.recommendations:
            assert r.score <= 1.0

    @pytest.mark.asyncio
    async def test_results_sorted_by_score_descending(self):
        body = RecommendationInput(preferences=UserPreferences(climate="warm", activity="adventure"))
        result = await get_recommendations(body)
        scores = [r.score for r in result.recommendations]
        assert scores == sorted(scores, reverse=True)


# ── Search Endpoint Tests ──

class TestSearch:
    @pytest.mark.asyncio
    async def test_search_by_name(self):
        body = SearchInput(query="Paris")
        result = await search_destinations(body)
        assert len(result.results) == 1
        assert result.results[0].name == "Paris, France"

    @pytest.mark.asyncio
    async def test_search_by_tag(self):
        body = SearchInput(query="adventure")
        result = await search_destinations(body)
        names = [r.name for r in result.results]
        assert "Bali, Indonesia" in names
        assert "Reykjavik, Iceland" in names

    @pytest.mark.asyncio
    async def test_search_case_insensitive(self):
        body = SearchInput(query="bali")
        result = await search_destinations(body)
        assert len(result.results) >= 1

    @pytest.mark.asyncio
    async def test_search_no_results(self):
        body = SearchInput(query="atlantis")
        result = await search_destinations(body)
        assert len(result.results) == 0


# ── Details Endpoint Tests ──

class TestDetails:
    @pytest.mark.asyncio
    async def test_known_destination(self):
        body = DetailsInput(destination="Bali")
        result = await get_details(body)
        assert result.name == "Bali, Indonesia"
        assert len(result.highlights) == 3
        assert "Uluwatu Temple" in result.highlights

    @pytest.mark.asyncio
    async def test_unknown_destination(self):
        body = DetailsInput(destination="Atlantis")
        result = await get_details(body)
        assert result.name == "Unknown"
        assert result.highlights == []

    @pytest.mark.asyncio
    async def test_partial_name_match(self):
        body = DetailsInput(destination="paris")
        result = await get_details(body)
        assert result.name == "Paris, France"
        assert result.best_time_to_visit.startswith("Spring")


# ── Route POIs Endpoint Tests ──

class TestRoutePOIs:
    @pytest.mark.asyncio
    async def test_empty_input_returns_empty(self):
        body = RouteInput()
        result = await get_route_pois(body)
        assert result.pois == []

    @pytest.mark.asyncio
    async def test_coordinates_input(self):
        """Test with coordinates — requires network. Mock Wikipedia API."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "query": {
                "geosearch": [
                    {"pageid": 123, "title": "Test POI", "lat": 48.85, "lon": 2.35, "dist": 100}
                ]
            }
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_class.return_value = mock_client

            body = RouteInput(coordinates=[
                Coordinate(lat=48.8566, lon=2.3522),
                Coordinate(lat=48.8606, lon=2.3376),
            ], interval=100)
            result = await get_route_pois(body)
            assert len(result.pois) >= 1
            assert result.pois[0].title == "Test POI"

    @pytest.mark.asyncio
    async def test_deduplication(self):
        """Same POI from multiple sample points should appear only once."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "query": {
                "geosearch": [
                    {"pageid": 999, "title": "Duplicate POI", "lat": 0, "lon": 0, "dist": 50}
                ]
            }
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_class.return_value = mock_client

            body = RouteInput(coordinates=[
                Coordinate(lat=0, lon=0),
                Coordinate(lat=0.001, lon=0),
            ], interval=10)
            result = await get_route_pois(body)
            pageids = [p.pageid for p in result.pois]
            assert pageids.count(999) == 1


# ── POI Blurb Endpoint Tests ──

class TestPOIBlurb:
    @pytest.mark.asyncio
    async def test_blurb_without_gemini_key(self):
        """Without GEMINI_API_KEY, should return raw Wikipedia extract."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "query": {
                "pages": {
                    "123": {"title": "Eiffel Tower", "extract": "The Eiffel Tower is a famous landmark."}
                }
            }
        }

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch.dict("os.environ", {}, clear=True):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_class.return_value = mock_client

            body = POIBlurbInput(pageid=123)
            result = await get_poi_blurb(body)
            assert result.title == "Eiffel Tower"
            assert result.original_summary == "The Eiffel Tower is a famous landmark."
            assert result.audio_blurb == result.original_summary  # No Gemini → raw text

    @pytest.mark.asyncio
    async def test_blurb_with_gemini_key(self):
        """With GEMINI_API_KEY, should call Gemini and return condensed blurb."""
        wiki_response = MagicMock()
        wiki_response.status_code = 200
        wiki_response.raise_for_status = MagicMock()
        wiki_response.json.return_value = {
            "query": {
                "pages": {
                    "456": {"title": "Big Ben", "extract": "Big Ben is the nickname for the Great Bell."}
                }
            }
        }

        gemini_response = MagicMock()
        gemini_response.status_code = 200
        gemini_response.json.return_value = {
            "candidates": [
                {"content": {"parts": [{"text": "Welcome to Big Ben! This iconic clock tower..."}]}}
            ]
        }

        with patch("httpx.AsyncClient") as mock_client_class, \
             patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}):
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=wiki_response)
            mock_client.post = AsyncMock(return_value=gemini_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_class.return_value = mock_client

            body = POIBlurbInput(pageid=456)
            result = await get_poi_blurb(body)
            assert result.title == "Big Ben"
            assert "Welcome to Big Ben" in result.audio_blurb

    @pytest.mark.asyncio
    async def test_blurb_wikipedia_error_graceful(self):
        """Wikipedia API failure should return empty strings, not crash."""
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=Exception("Network error"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_class.return_value = mock_client

            body = POIBlurbInput(pageid=999)
            result = await get_poi_blurb(body)
            assert result.pageid == 999
            assert result.title == ""
            assert result.original_summary == ""


# ── Model Validation Tests ──

class TestModelValidation:
    def test_search_input_requires_query(self):
        with pytest.raises(Exception):
            SearchInput(query="")

    def test_details_input_requires_destination(self):
        with pytest.raises(Exception):
            DetailsInput(destination="")

    def test_route_input_defaults(self):
        body = RouteInput()
        assert body.radius == 10000
        assert body.interval == 50000

    def test_coordinate_model(self):
        c = Coordinate(lat=48.8566, lon=2.3522)
        assert c.lat == 48.8566
        assert c.lon == 2.3522

    def test_user_preferences_all_optional(self):
        prefs = UserPreferences()
        assert prefs.climate is None
        assert prefs.budget is None
        assert prefs.activity is None
