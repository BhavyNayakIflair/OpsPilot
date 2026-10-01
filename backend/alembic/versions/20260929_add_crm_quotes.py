"""Initialize the Phase 1 base schema and tenant-scoped business modules."""
from alembic import op
from app.models import Base  # import registers every model with metadata

revision = "20260929_crm_quotes"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # This is the initial revision in the repository; create the Phase 1 base
    # tables as well as the new CRM and quotes tables on a clean installation.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade():
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=True)
