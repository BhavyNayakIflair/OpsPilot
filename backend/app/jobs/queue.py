import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)
_inline_tasks: set[asyncio.Task] = set()


class JobQueue(Protocol):
    async def enqueue(self, job_id: str) -> None: ...


class ArqJobQueue:
    async def enqueue(self, job_id: str, provider=None) -> None:
        from arq.connections import create_pool, RedisSettings

        pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        try:
            await pool.enqueue_job(
                "run_job",
                job_id,
                _job_id=job_id,
                _queue_name=settings.JOBS_QUEUE_NAME,
            )
        finally:
            await pool.aclose()


class InlineJobQueue:
    def __init__(self, runner: Callable[[dict, str], Awaitable[None]] | None = None):
        self._runner = runner

    async def enqueue(self, job_id: str, provider=None) -> None:
        if self._runner is None:
            from app.jobs.runner import run_job

            runner = run_job
        else:
            runner = self._runner
        logger.warning("Running background job inline; this mode is not durable")
        task = asyncio.create_task(
            runner({"provider": provider} if provider is not None else {}, job_id),
            name=f"inline-job-{job_id}",
        )
        _inline_tasks.add(task)
        task.add_done_callback(_inline_tasks.discard)


async def get_job_queue() -> JobQueue:
    mode = settings.JOBS_EXECUTION_MODE
    if mode == "inline":
        return InlineJobQueue()
    if mode == "queue":
        return ArqJobQueue()

    from app.ai.redis_client import get_redis_client, is_memory_fallback

    client = await get_redis_client()
    if is_memory_fallback(client):
        logger.warning("Redis unavailable; using inline background jobs (not durable)")
        return InlineJobQueue()
    return ArqJobQueue()


async def enqueue_job(job_id: str, provider=None) -> bool:
    try:
        queue = await get_job_queue()
        if isinstance(queue, InlineJobQueue):
            await queue.enqueue(job_id, provider=provider)
        else:
            await queue.enqueue(job_id)
        return True
    except Exception:
        logger.exception("Could not enqueue background job", extra={"job_id": job_id})
        return False
