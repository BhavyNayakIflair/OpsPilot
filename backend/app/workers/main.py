import asyncio
import structlog
from app.core.config import settings

logger = structlog.get_logger()


async def run_worker():
    logger.info("Starting OpsPilot Background Worker (arq scheduler)", redis_url=settings.REDIS_URL)
    while True:
        # In mock/local mode, tick periodically
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(run_worker())
