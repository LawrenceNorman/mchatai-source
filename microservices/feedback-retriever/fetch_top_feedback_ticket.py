from fastapi import APIRouter
import json
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/fetch_top")
def fetch_top_ticket():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        logger.warning("firebase_admin not installed, returning mock ticket.")
        return {
            "status": "mock_success",
            "ticket": {
                "id": "mock_123",
                "priority": "high",
                "status": "in_review",
                "description": "Mock feedback ticket due to missing firebase_admin",
            }
        }
        
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={"projectId": "mchatai-2367e"})
        db = firestore.client()
        tickets_ref = db.collection('feedback_tickets')
        query = tickets_ref.where('status', '==', 'pending').order_by('priority', direction=firestore.Query.DESCENDING).limit(1)
        results = query.stream()
        
        ticket_doc = None
        for doc in results:
            ticket_doc = doc
            break
            
        if not ticket_doc:
            return {"status": "no_pending_tickets"}
            
        ticket_doc.reference.update({'status': 'in_review'})
        data = ticket_doc.to_dict()
        data['id'] = ticket_doc.id
        return {"status": "success", "ticket": data}
    except Exception as e:
        logger.error(f"Error fetching top ticket: {e}")
        return {"status": "error", "error": str(e)}
