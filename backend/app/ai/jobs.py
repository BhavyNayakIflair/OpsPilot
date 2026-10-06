"""
Background Job and Progress Tracking for Long-Running AI Operations.
Supports Redis-backed shared state across workers with transparent in-memory fallback.
Implements SSE streaming and polling progress for AI operations.
"""
import asyncio
import json
import logging
import time
import uuid
from typing import Any, AsyncIterator, Dict, Optional

from app.ai.redis_client import get_redis_client

logger = logging.getLogger(__name__)

JOB_TTL_SECONDS = 3600  # 1 hour


class JobManager:
    """Manages asynchronous AI jobs and progress states."""

    def __init__(self, prefix: str = "ai:job:"):
        self.prefix = prefix

    def _key(self, job_id: str) -> str:
        return f"{self.prefix}{job_id}"

    async def create_job(self, job_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> str:
        jid = job_id or f"job_{uuid.uuid4().hex[:12]}"
        client = await get_redis_client()
        state = {
            "job_id": jid,
            "status": "queued",
            "progress": 0,
            "message": "Job queued",
            "created_at": time.time(),
            "updated_at": time.time(),
            "meta": meta or {},
            "result": None,
            "error": None,
        }
        await client.set(self._key(jid), json.dumps(state), ex=JOB_TTL_SECONDS)
        return jid

    async def update_job(
        self,
        job_id: str,
        status: str,
        progress: int,
        message: str = "",
        result: Optional[Any] = None,
        error: Optional[str] = None,
    ) -> None:
        client = await get_redis_client()
        raw = await client.get(self._key(job_id))
        state = json.loads(raw) if raw else {"job_id": job_id, "created_at": time.time()}

        state["status"] = status
        state["progress"] = progress
        state["message"] = message
        state["updated_at"] = time.time()
        if result is not None:
            state["result"] = result
        if error is not None:
            state["error"] = error

        await client.set(self._key(job_id), json.dumps(state, default=str), ex=JOB_TTL_SECONDS)

    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        client = await get_redis_client()
        raw = await client.get(self._key(job_id))
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def stream_job_events(self, job_id: str, poll_interval_seconds: float = 0.5) -> AsyncIterator[str]:
        """Server-Sent Events generator streaming job progress updates."""
        last_progress = -1
        last_status = ""

        for _ in range(120):  # Maximum 60 seconds stream
            job = await self.get_job(job_id)
            if not job:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            current_progress = job.get("progress", 0)
            current_status = job.get("status", "running")

            if current_progress != last_progress or current_status != last_status:
                yield f"event: progress\ndata: {json.dumps(job)}\n\n"
                last_progress = current_progress
                last_status = current_status

            if current_status in ("completed", "failed"):
                break

            await asyncio.sleep(poll_interval_seconds)


job_manager = JobManager()
