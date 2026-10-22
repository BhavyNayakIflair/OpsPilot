from app.jobs.handlers.quote_draft import handle_quote_draft
from app.jobs.handlers.quote_agent import handle_quote_agent

HANDLERS = {
    "quote_draft": handle_quote_draft,
    "quote_agent": handle_quote_agent,
}
