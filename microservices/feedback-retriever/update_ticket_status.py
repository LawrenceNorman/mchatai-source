from fastapi import APIRouter
from pydantic import BaseModel
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class UpdateTicketRequest(BaseModel):
    ticket_id: str
    status: str

@router.post("/update_status")
def update_ticket_status(req: UpdateTicketRequest):
    try:
        import firebase_admin
        from firebase_admin import firestore
    except ImportError:
        logger.warning("firebase_admin not installed, returning mock success.")
        return {"status": "mock_success", "ticket_id": req.ticket_id, "new_status": req.status}
        
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        ticket_ref = db.collection('feedback_tickets').document(req.ticket_id)
        ticket_ref.update({'status': req.status})
        return {"status": "success", "ticket_id": req.ticket_id, "new_status": req.status}
    except Exception as e:
        logger.error(f"Error updating ticket status: {e}")
        return {"status": "error", "error": str(e)}
