from fastapi import APIRouter
from product_feedback import router as feedback_router
from pending_products import router as pending_router

router = APIRouter()
router.include_router(feedback_router)
router.include_router(pending_router)
