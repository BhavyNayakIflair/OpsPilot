"""Seed Northwind Digital demo environment CLI script."""
import asyncio
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.database import AsyncSessionLocal
from app.services.seed_service import seed_northwind_demo


async def main():
    print("🌱 Seeding Northwind Digital demo data...")
    async with AsyncSessionLocal() as session:
        result = await seed_northwind_demo(session)
        print(f"✅ Successfully seeded: {result}")


if __name__ == "__main__":
    asyncio.run(main())
