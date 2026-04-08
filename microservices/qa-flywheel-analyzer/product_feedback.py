from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class ProductFeedbackRequest(BaseModel):
    dna_uuid: str
    status_filter: Optional[str] = None  # 'triage', 'open', 'resolved', etc.
    limit: int = 50


@router.post("/product_feedback")
def get_product_feedback(req: ProductFeedbackRequest):
    try:
        import firebase_admin
        from firebase_admin import firestore
    except ImportError:
        logger.warning("firebase_admin not installed, returning mock data.")
        return {
            "status": "mock_success",
            "dna_uuid": req.dna_uuid,
            "tickets": [
                {"id": "mock_1", "title": "Mock bug", "type": "bug", "severity": "medium", "status": "triage"}
            ],
            "summary": {"total": 1, "bugs": 1, "features": 0}
        }

    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={"projectId": "mchatai-2367e"})
        db = firestore.client()

        query = db.collection('feedback_tickets').where('dna_uuid', '==', req.dna_uuid)
        if req.status_filter:
            query = query.where('status', '==', req.status_filter)
        query = query.limit(req.limit)

        tickets = []
        bugs = 0
        features = 0
        for doc in query.stream():
            data = doc.to_dict()
            data['id'] = doc.id
            tickets.append(data)
            if data.get('type') == 'bug':
                bugs += 1
            elif data.get('type') == 'feature':
                features += 1

        return {
            "status": "success",
            "dna_uuid": req.dna_uuid,
            "tickets": tickets,
            "summary": {"total": len(tickets), "bugs": bugs, "features": features}
        }
    except Exception as e:
        logger.error(f"Error querying product feedback: {e}")
        return {"status": "error", "error": str(e)}
