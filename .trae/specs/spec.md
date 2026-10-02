# OpsPilot UI/UX Overhaul — Specification

## Problem

OpsPilot's React + TypeScript + Vite + Tailwind frontend has working backend APIs (FastAPI) but has three critical product gaps:

1. **Inconsistent design language.** Every page hand-rolls its own header, card, button, and list markup. Spacing, borders, shadows, empty states, and error displays all differ across pages for no product reason. There is no `components/ui/` layer — primitives are duplicated inline.

2. **Data returned by the API is partially hidden.** The backend Pydantic schemas return rich fields (industry, phone, title, category, issue_date, created_at, user_id, assumptions, lead_id links, task estimates, assignees, overdue signals via due_date comparison, …). The frontend UI ignores 15–40% of these fields on every list-bearing page.

3. **No AI-action UX for slow calls.** "Draft with AI" and "Run quote agent" can take 30–90+ seconds on local CPU inference. Currently the buttons disable with text like "Drafting…" but the form area shows no progress, no step-level status, no preview/confirmation that AI output landed, and no inline error-with-retry for failed AI calls. Failed requests silently surface as one top-level banner at best.

## Users

- **Sales users** (CRM, Quotes, Leads pipeline, Approvals)
- **Delivery users** (Projects, Tasks, Timesheets)
- **Finance users** (Invoices, Expenses, Approvals, Billing)
- **Owners / Admins** (People, Settings, Migration, Agent Workflows, Documents)

All users share one React app; role-based visibility is already implemented with guards on edit/delete buttons.

## Goals

1. **Apply one consistent design system across every page.** Build it once in `components/ui/` (primitives) and `components/layout/` (shell). Every existing heading, card, table row, button, empty state, loading block, and error surface must use shared primitives.
2. **Surface every field the API already returns.** Do not request new backend fields. For each page, ensure every non-internal field (`org_id` is internal; `created_at`/`updated_at` are product fields) has a home in the UI either as a table column, a secondary line, or a chip.
3. **Give AI actions a distinct UX from fast API fetches.** Distinguish skeleton shimmer (fast data, < 3 s) from `AIProgress` rotating status lines + preview card (slow AI, 30–90 s). Never dump AI-generated line items silently into an editable form without a review-tinted "AI draft" indicator.
4. **Preserve every existing action.** Create company, draft quote, approve timesheet, add lead, log time, generate PDF, edit profile, invite member, run workflow, etc. — every existing form submit, button click, and data fetch must keep working. No backend contract changes except *optional additive* query params (e.g. `?q=`, `?status=`) that default to current behavior.
5. **Make lists searchable, filterable, and sortable where Phase-0 audit flags it.** Client-side is fine for small lists (< 200 items); server-side `?q=` param support already exists for Documents and can be added optionally for others if needed.
6. **Polish responsively and micro-interactions.** Sidebar drawer on mobile, horizontal table scroll, route-change fade, 200ms hover/focus transitions, consistent toast/inline error.

## Non-Goals

- **No backend rewrite.** No schema changes. No changes to what an existing endpoint returns without query params.
- **No new paid dependencies.** Only Tailwind, lucide-react, @tanstack/react-query (already installed), clsx, tailwind-merge, recharts, @xyflow/react, react-router-dom.
- **Not a visual redesign.** Keep the existing dark/light mode toggle, the existing sidebar structure, the existing color family (indigo/sky brand). Phase 1 is *unification*, not rebranding.
- **No auth changes.** AuthContext flow, token storage, login page stay as-is.
- **No TanStack Query migration in this pass.** Pages currently use raw `useState` + `useEffect` + `apiRequest()`. Phase 2 wiring (search/filter debounce) will still use the same pattern; we will not rewrite the data layer to `useQuery` hooks (that's a separate follow-up).

## Functional Requirements (Acceptance Criteria)

### F1 — Design System (Phase 1)
- **rule**: A new `frontend/src/components/ui/` directory contains at minimum: `Card.tsx`, `PageHeader.tsx`, `DataTable.tsx` (or `ListView.tsx`), `Skeleton.tsx`, `AIProgress.tsx`, `Toast.tsx` (or inline `Alert.tsx`), `Badge.tsx`, `Button.tsx`.
- **rule**: `components/layout/` contains the existing `AppLayout.tsx`, `Sidebar.tsx`, `Navbar.tsx`, plus a new `Badge` usage for sidebar AI/New/Count badges (previously one-off inline spans).
- **rule**: `tailwind.config.js` or `index.css` CSS variables define a semantic token set: `--text`, `--text-muted`, `--border`, `--surface`, `--surface-muted`, `--canvas`, `--accent`, `--accent-soft`, `--success`, `--warning`, `--danger`; one consistent radius scale (sm/md/lg/xl/2xl); one shadow scale (sm/md/lg/xl).
- **rule**: Dark mode (via existing `.dark` class strategy) works for every new primitive: Card, PageHeader, DataTable row, Skeleton, Badge, Button backgrounds.
- **rubric (0–2, pass ≥ 1.5)**: Design-system consistency — an untrained eye comparing three pages sees no visual difference in heading padding, card radius, button sizing, or row hover states.

### F2 — Search / Filter / Sort / Empty States (Phase 2)
- **rule**: Every page flagged ✅ "Needs search?" in the Phase-0 audit table has a debounced (≈200 ms) search input that filters its list. Documents already supports `?q=` and must keep using it.
- **rule**: Every page flagged ✅ "Needs filter?" has at least the filter(s) identified in Phase 0 (Approvals: `entity_type`; Invoices: `status`, overdue; CRM Leads: `stage_id`, `source`; Projects: `status`; Expenses: `status`, `category`; Documents: `category`; Activities: `kind`, `lead_id`).
- **rule**: Every page flagged ✅ "Needs sort?" exposes at least the primary sort identified in Phase 0 (e.g. Invoices by `due_date ASC` with overdue first; Projects by name/created_at). Client-side sort is acceptable.
- **rule**: Empty list states (no leads, no projects, no invoices, all caught up, etc.) render an icon + title + description + (where applicable) a primary action button using a shared `<EmptyState />` primitive. No page shows a blank `<p>` tag as empty state.

### F3 — Surface Ignored API Fields (Phase 2)
- **rule**: For every page, the number of rendered non-internal fields matches or exceeds the count listed in the Phase-0 audit "currently rendered" column. No field listed in Phase 0 as "currently rendered" is ever removed.
- **rule**: For each page, at least **half** of the Phase-0 "currently ignored" fields are visibly surfaced (secondary line, chip, column, meta line). The specific high-priority gaps listed in the Phase-0 "Summary" (#1–#13) must all be closed.

### F4 — AI Action UX (Phase 3)
- **rule**: Clicking "Draft with AI" on the Quotes page immediately shows (a) the button disabled with spinner + "Drafting…", and (b) a visually distinct `AIProgress` panel in or above the form area showing rotating step-level status messages on a ~5–8s timer (e.g. "Reading lead details…" → "Checking rate card…" → "Searching workspace knowledge…" → "Drafting line items…" → "Calculating totals…").
- **rule**: On successful AI draft, before any data is written into the regular editable form, a visually distinct "AI draft — review before saving" preview card (different background tint, AI icon, one-line reminder banner) shows the AI output. Assumptions list is inside this card. A primary "Use this draft" and secondary "Discard" action commits or cancels.
- **rule**: On AI failure, the same `AIProgress` panel shows a clear inline error message (not browser alert, not silent) with a "Retry" button that re-runs the same payload.
- **rule**: Same progress + preview + error/retry pattern is applied to the Quote Agent action (both on Quotes page and Agent Workflows page "Run quote agent" button).
- **rubric (0–2, pass ≥ 1.5)**: Subjective UX feel — a user whose AI call takes 60+ seconds does not stare at a frozen form and does not wonder whether anything is happening.

### F5 — No Existing Action Regression
- **rule**: Every existing `POST`, `PATCH`, `PUT`, `DELETE` call present in the codebase before this spec has the same endpoint, the same method, the same required body shape, and the same success-side-effect (form clear + data reload). Evidence: existing test suites (`frontend/src/test/CRM.test.tsx`, `Quotes.test.tsx`) still pass if ran.
- **rule**: Sidebar links, Navbar Cmd-K palette, theme toggle, logout, route NavLinks all route to unchanged paths.
- **rule**: Settings-level forms (save profile, save workspace, invite/remove member, change role) still fire the same endpoints.

### F6 — Polish & Responsive (Phase 4)
- **rule**: On viewport width ≤ 768 px, the sidebar is rendered as an off-canvas drawer accessible via the existing navbar hamburger. The existing drawer backdrop/translate in AppLayout is present and working.
- **rule**: Every `<table>` element is wrapped in a horizontally scrollable container (overflow-x-auto) so narrow viewports do not break layout.
- **rule**: Hover/focus transitions on primary, secondary, and destructive buttons are consistent at ≈150–200 ms duration.
- **rule**: Skeleton shimmer effect uses a CSS linear-gradient keyframe animation ≈1.5 s duration; no flash of unstyled content on route change.

## Non-Functional Requirements

- **NFR1 (lint/typecheck)**: `cd frontend && npm run build` (which runs `tsc -b && vite build`) and `cd frontend && npm run lint` both exit 0.
- **NFR2 (no new deps)**: `package.json` `dependencies` and `devDependencies` gain zero new packages except optional open-source ones with explicit user approval.
- **NFR3 (bundle impact)**: New primitives are tree-shakeable ES components; no global CSS beyond the existing Tailwind layer and CSS variable block.

## Constraints

- Existing CSS class names in `index.css`'s `@layer components` (`.page-shell`, `.panel`, `.field-control`, `.primary-button`, `.secondary-button`, `.danger-button`, `.status-message`, `.page-heading`, `.page-title`, `.page-description`, `.panel-heading`, `.field-label`) may be refactored into `components/ui/` components but must continue to exist for backward compatibility with any leftover page markup until Phase 2 completes.
- FastAPI backend may receive optional `?q=`, `?status=`, `?category=`, `?kind=` query params on list endpoints only as additive changes with pre-existing defaults matching today's unparametrized behavior. If added, they live in `backend/app/api/v1/endpoints/{crm,operations,billing,documents}.py` and are fully backward-compatible.

## Dependencies

- FastAPI backend already running and reachable (existing development proxy via Vite or Docker compose).
- Tailwind class-based dark mode (`.dark` on `<html>`) — in use already via existing Navbar toggle.

## Assumptions

- The existing `QuoteAgentRun` response from `POST /workflows/quote-agent/run` does not expose a granular job-status polling endpoint today. If it is synchronous (blocks until completion), Phase 3's `AIProgress` rotating messages are timer-based optimistically, not polling-based. If a polling endpoint (`GET /workflows/runs/:id`) is later added, the same `AIProgress` component can be refactored to use it without changing the UI contract.
- Lead, Contact, Company, Project, Invoice, Expense, TimeEntry list endpoints do not yet support `?q=` server-side. For Phase 2, client-side filtering of the currently-fetched full list is an acceptable implementation that matches today's fetch-everything behavior.

## Open Questions

None at spec time. The Phase-0 audit resolves every field/endpoint ambiguity from the source. Ambiguities (e.g. whether to add `?q=` server-side vs client-side) are resolved in favor of the zero-backend-change option first.

## Acceptance Criteria Vocabulary

| ID | Type | Statement |
|---|---|---|
| F1a | rule | `components/ui/` has Card, PageHeader, DataTable/ListView, Skeleton, AIProgress, Toast/Alert, Badge, Button |
| F1b | rule | Sidebar badges (AI/New/Count) use shared Badge primitive |
| F1c | rule | Semantic tokens (text/muted/border/surface/… + radius/shadow scales) defined |
| F1d | rule | Dark mode works for every new primitive |
| F1e | rubric | Subjective 3-page visual consistency (scale 0–2, ≥1.5 pass) |
| F2a | rule | Debounced search on every ✅-Needs-search page |
| F2b | rule | Filters on every ✅-Needs-filter page per Phase-0 list |
| F2c | rule | Sort on every ✅-Needs-sort page per Phase-0 list |
| F2d | rule | Shared EmptyState primitive on every list page |
| F3a | rule | No currently-rendered field ever removed |
| F3b | rule | All 13 high-priority ignored-field gaps closed |
| F4a | rule | Quotes Draft-with-AI shows AIProgress rotating steps |
| F4b | rule | Quotes AI draft → preview-tinted card with Use/Discard before form write |
| F4c | rule | Quotes AI failure inline error with Retry in same panel |
| F4d | rule | Agent Workflows Run-quote-agent follows same progress/preview/error pattern |
| F4e | rubric | Subjective 60 s AI-wait UX feel (scale 0–2, ≥1.5 pass) |
| F5a | rule | Every existing write-endpoint retains method, path, and required payload shape |
| F5b | rule | Routing, Cmd-K palette, theme toggle, logout all functional |
| F5c | rule | Settings write endpoints (profile/org/members) unchanged |
| F6a | rule | Mobile off-canvas sidebar drawer works ≤768 px |
| F6b | rule | Every `<table>` wrapped in horizontal scroll |
| F6c | rule | Consistent 150–200 ms button hover/focus transitions |
| F6d | rule | Skeleton shimmer 1.5 s keyframe, no FOUC |
| NFR1 | rule | `npm run build` and `npm run lint` exit 0 |
