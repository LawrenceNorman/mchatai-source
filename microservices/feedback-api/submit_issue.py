import os
import json
import psycopg2
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uuid

router = APIRouter()

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://user:password@localhost:5432/mchatai")

class IssuePayload(BaseModel):
    dna_uuid: str
    title: str
    description: str
    issue_type: str  # 'bug', 'feature', 'chore', 'other'
    metadata: Optional[Dict[str, Any]] = None
    release_uuid: Optional[str] = None

class FeedbackPayload(BaseModel):
    dna_uuid: str
    rating: str  # 'thumbs_up', 'thumbs_down', 'neutral'
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    release_uuid: Optional[str] = None

class TelemetryPacketPayload(BaseModel):
    app_version: str
    success_rate: float
    total_cost_usd: float
    error_breakdown: List[Dict[str, Any]]
    top_failing_pipelines: List[Dict[str, Any]]
    recent_error_messages: List[str] = []

@router.post("/submit_telemetry_packet")
async def submit_telemetry_packet(payload: TelemetryPacketPayload):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

    try:
        packet_uuid = str(uuid.uuid4())
        query = """
            INSERT INTO telemetry_packets (
                packet_uuid, app_version, success_rate, total_cost_usd, 
                error_breakdown, top_failing_pipelines, recent_error_messages
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        cursor.execute(query, (
            packet_uuid,
            payload.app_version,
            payload.success_rate,
            payload.total_cost_usd,
            json.dumps(payload.error_breakdown),
            json.dumps(payload.top_failing_pipelines),
            json.dumps(payload.recent_error_messages)
        ))
        packet_id = cursor.fetchone()[0]
        conn.commit()
        return {"status": "success", "packet_uuid": packet_uuid, "packet_id": str(packet_id)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database execution error: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@router.post("/report_issue")
async def report_issue(payload: IssuePayload):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

    try:
        # 1. Resolve product_lineage_id from dna_uuid
        cursor.execute("SELECT id FROM product_lineages WHERE product_dna_uuid = %s", (payload.dna_uuid,))
        result = cursor.fetchone()
        lineage_id = result[0] if result else None
        
        # 2. Map old issue_type to new kind
        kind_map = {
            'bug': 'bug',
            'feature': 'feature',
            'chore': 'task',
            'other': 'task'
        }
        kind = kind_map.get(payload.issue_type, 'task')
        
        # 3. Insert into work_items (New Canonical Table)
        work_item_query = """
            INSERT INTO work_items (kind, title, description, status, source_type, source_ref)
            VALUES (%s, %s, %s, 'triage', 'user_feedback', %s)
            RETURNING id
        """
        cursor.execute(work_item_query, (kind, payload.title, payload.description, payload.dna_uuid))
        work_item_id = cursor.fetchone()[0]
        
        # 4. Link to product lineage if found
        if lineage_id:
            cursor.execute(
                "INSERT INTO work_item_links (work_item_id, link_type, linked_id) VALUES (%s, 'lineage', %s)",
                (work_item_id, lineage_id)
            )
            
        # 5. Legacy Sync: Insert into old 'issues' table
        cursor.execute("SELECT product_id FROM product_metadata WHERE dna_uuid = %s", (payload.dna_uuid,))
        old_product_result = cursor.fetchone()
        old_product_id = old_product_result[0] if old_product_result else None
        
        cursor.execute(
            "INSERT INTO issues (title, description, type, product_id, status) VALUES (%s, %s, %s, %s, 'triage')",
            (payload.title, payload.description, payload.issue_type, old_product_id)
        )
        
        conn.commit()
        return {
            "status": "success", 
            "work_item_id": str(work_item_id), 
            "product_lineage_id": str(lineage_id) if lineage_id else None
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database execution error: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@router.get("/list_work_items")
async def list_work_items(
    kind: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    dna_uuid: Optional[str] = Query(None),
    limit: int = Query(20, le=100)
):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

    try:
        query = "SELECT id, kind, title, description, status, priority, severity, created_at FROM work_items WHERE 1=1"
        params = []
        
        if kind:
            query += " AND kind = %s"
            params.append(kind)
        if status:
            query += " AND status = %s"
            params.append(status)
        if dna_uuid:
            query += " AND source_ref = %s"
            params.append(dna_uuid)
            
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        
        items = []
        for row in rows:
            items.append({
                "id": str(row[0]),
                "kind": row[1],
                "title": row[2],
                "description": row[3],
                "status": row[4],
                "priority": row[5],
                "severity": row[6],
                "created_at": row[7].isoformat() if row[7] else None
            })
            
        return {"status": "success", "work_items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database execution error: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@router.get("/list_product_lineages")
async def list_product_lineages(
    product_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, le=100)
):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

    try:
        query = "SELECT id, product_dna_uuid, product_type, name, generator_family, current_status, created_at FROM product_lineages WHERE 1=1"
        params = []
        
        if product_type:
            query += " AND product_type = %s"
            params.append(product_type)
        if status:
            query += " AND current_status = %s"
            params.append(status)
            
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        
        items = []
        for row in rows:
            items.append({
                "id": str(row[0]),
                "product_dna_uuid": row[1],
                "product_type": row[2],
                "name": row[3],
                "generator_family": row[4],
                "current_status": row[5],
                "created_at": row[6].isoformat() if row[6] else None
            })
            
        return {"status": "success", "product_lineages": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database execution error: {str(e)}")
    finally:
        cursor.close()
        conn.close()

@router.post("/submit_feedback")
async def submit_feedback(payload: FeedbackPayload):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

    try:
        cursor.execute("SELECT id FROM product_lineages WHERE product_dna_uuid = %s", (payload.dna_uuid,))
        lineage_result = cursor.fetchone()
        lineage_id = lineage_result[0] if lineage_result else None
        
        release_id = None
        if payload.release_uuid:
            cursor.execute("SELECT id FROM product_releases WHERE release_uuid = %s", (payload.release_uuid,))
            release_result = cursor.fetchone()
            release_id = release_result[0] if release_result else None
            
        feedback_uuid = str(uuid.uuid4())
        feedback_event_query = """
            INSERT INTO feedback_events (feedback_uuid, product_lineage_id, product_release_id, feedback_type, body, rating, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        cursor.execute(feedback_event_query, (
            feedback_uuid,
            lineage_id,
            release_id,
            'bug_report' if payload.rating == 'thumbs_down' else 'rating',
            payload.notes,
            payload.rating,
            json.dumps(payload.metadata) if payload.metadata else None
        ))
        feedback_event_id = cursor.fetchone()[0]
        
        conn.commit()
        return {"status": "success", "feedback_event_id": str(feedback_event_id)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database execution error: {str(e)}")
    finally:
        cursor.close()
        conn.close()
