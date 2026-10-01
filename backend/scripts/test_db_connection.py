import asyncio
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine, Base
from app.models import Organization, User, Membership, AuditLog, Subscription, UsageCounter


async def check_connection():
    print(f"Connecting to database via: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")
    try:
        async with engine.begin() as conn:
            # Test simple query
            is_pg = "postgresql" in settings.DATABASE_URL
            query_str = "SELECT version();" if is_pg else "SELECT sqlite_version();"
            res = await conn.execute(text(query_str))
            row = res.fetchone()
            print(" Connected successfully!")
            db_type = "PostgreSQL" if is_pg else "SQLite"
            print(f" {db_type} Version: {row[0] if row else 'Unknown'}")

            # Create tables
            print(" Creating database tables if they do not exist...")
            await conn.run_sync(Base.metadata.create_all)
            print(" Tables verified/created successfully:")
            for table_name in Base.metadata.tables.keys():
                print(f"   • {table_name}")

        print("\nAll database checks passed successfully! OpsPilot is ready to run.")
    except Exception as e:
        print(f"\n❌ Connection failed: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(check_connection())
