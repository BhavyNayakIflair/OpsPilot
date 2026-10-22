from arq import run_worker
from arq.connections import RedisSettings
from arq.cron import cron
from arq.worker import Worker

from app.core.config import settings
from app.core.database import engine
from app.jobs.runner import run_job
from app.workers.reaper import purge_terminal_jobs, reap_jobs


async def on_startup(_ctx: dict) -> None:
    await reap_jobs()


async def on_shutdown(_ctx: dict) -> None:
    await engine.dispose()


class WorkerSettings:
    functions = [run_job]
    queue_name = settings.JOBS_QUEUE_NAME
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = settings.JOBS_AI_MAX_CONCURRENCY
    job_timeout = settings.OLLAMA_QUOTE_TIMEOUT_SECONDS + 60
    max_tries = 1
    keep_result = 0
    health_check_interval = 15
    on_startup = on_startup
    on_shutdown = on_shutdown
    cron_jobs = [
        cron(reap_jobs, second={0, 30}, run_at_startup=True),
        cron(purge_terminal_jobs, hour=2, minute=0),
    ]


if __name__ == "__main__":
    run_worker(WorkerSettings)
