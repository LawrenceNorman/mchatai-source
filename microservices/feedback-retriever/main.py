from fastapi import APIRouter
from fetch_top_feedback_ticket import router as fetch_router
from update_ticket_status import router as update_router

router = APIRouter()
router.include_router(fetch_router)
router.include_router(update_router)
