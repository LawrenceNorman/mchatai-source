from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from collections import defaultdict
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class PendingProductsRequest(BaseModel):
    limit: int = 20


@router.post("/pending_products")
def get_pending_products(req: PendingProductsRequest):
    """List products (by DNA UUID) that have untriaged feedback, ordered by ticket count."""
    try:
        import firebase_admin
        from firebase_admin import firestore
    except ImportError:
        logger.warning("firebase_admin not installed, returning mock data.")
        return {
            "status": "mock_success",
            "products": [
                {"dna_uuid": "MOCK-UUID-1234", "ticket_count": 3, "bugs": 2, "features": 1,
                 "generator_source": "GameMaker", "latest_title": "Game crashes on level 2"}
            ]
        }

    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={"projectId": "mchatai-2367e"})
        db = firestore.client()

        # Query all triage-status tickets that have a dna_uuid
        query = db.collection('feedback_tickets').where('status', '==', 'triage')
        products = defaultdict(lambda: {"ticket_count": 0, "bugs": 0, "features": 0,
                                         "generator_source": "unknown", "latest_title": ""})

        for doc in query.stream():
            data = doc.to_dict()
            dna = data.get('dna_uuid')
            if not dna:
                continue
            p = products[dna]
            p["ticket_count"] += 1
            if data.get('type') == 'bug':
                p["bugs"] += 1
            elif data.get('type') == 'feature':
                p["features"] += 1
            if data.get('generator_source'):
                p["generator_source"] = data['generator_source']
            p["latest_title"] = data.get('title', '')

        # Sort by ticket count descending
        sorted_products = sorted(
            [{"dna_uuid": k, **v} for k, v in products.items()],
            key=lambda x: x["ticket_count"],
            reverse=True
        )[:req.limit]

        return {"status": "success", "products": sorted_products}
    except Exception as e:
        logger.error(f"Error querying pending products: {e}")
        return {"status": "error", "error": str(e)}
