.PHONY: test test-backend test-frontend run-backend run-frontend dev compose-up compose-down

test: test-backend test-frontend

test-backend:
	PYTHONPATH=backend .venv/bin/pytest backend/tests -v

test-frontend:
	cd frontend && npx vitest run

run-backend:
	cd backend && PYTHONPATH=. ../.venv/bin/alembic upgrade head && PYTHONPATH=. ../.venv/bin/uvicorn app.main:app --reload --port 8000

run-frontend:
	cd frontend && npm run dev

compose-up:
	docker compose up -d

compose-down:
	docker compose down
