from fastapi import APIRouter
from submit_issue import router as submit_router

router = APIRouter()
router.include_router(submit_router)