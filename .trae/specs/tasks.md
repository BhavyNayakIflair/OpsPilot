# OpsPilot UI/UX Overhaul — Implementation Tasks

Tasks are ordered by dependencies. Priority ordering: P1 (blocking), P2 (important), P3 (polish).

---

## Task 1: Design Tokens + Tailwind Refinement (P1)

**Maps to AC:** F1c, F1d, NFR1

**Work items:**
1. Update `frontend/src/index.css` `:root` and `.dark` blocks to add full semantic token set (text, text-muted, border, surface, surface-muted, canvas, accent, accent-soft, success, warning, danger) plus `--radius-*` and `--shadow-*` CSS variables.
2. Update `frontend/tailwind.config.js` to reference the CSS variables as Tailwind theme extensions (`colors.semantic.*`, `borderRadius.ui.*`, `boxShadow.ui.*`) so Tailwind utilities can consume them.
3. Keep the existing `.page-shell` / `.panel` / button utility classes working (backward compat) — deprecate silently, don't delete yet.
4. Add the skeleton shimmer keyframe animation + toast slide-in keyframe to `index.css`.

**Test Requirements:**
- **rule (NFR1)**: `cd frontend && npm run lint` exits 0 after changes.
- **rule**: `:root` and `.dark` both define every semantic token variable.
- **rule**: Existing `.primary-button`, `.panel` classes still present in compiled CSS (no build break).

**Depends on:** (nothing)

---

## Task 2: UI Primitives Layer — `components/ui/` (P1)

**Maps to AC:** F1a, F1b, F1d

**Work items:**
1. Create `frontend/src/components/ui/Card.tsx` — `Card`, `CardHeader`, `CardContent`, `CardFooter` with consistent padding (default p-5 sm:p-6), radius (2xl), border, shadow.
2. Create `PageHeader.tsx` — takes `title`, `description`, `eyebrow?`, `primaryAction?: ReactNode`, `statChips?: { label, value, tone? }[]`. Unifies the 6 different page-heading markup patterns currently hand-written.
3. Create `Button.tsx` — variants `primary` / `secondary` / `destructive` / `ghost`, sizes `sm` / `md` / `lg`, loading state (spinner), `asChild` optional.
4. Create `Badge.tsx` — variants `default` / `ai` / `new` / `count` / `status-success` / `status-warning` / `status-danger` / `status-muted`. Consumed by Sidebar (replace inline badge spans).
5. Create `Skeleton.tsx` — takes `variant` = 'text' | 'card' | 'table-row' | 'stat-tile' + optional className. Uses shimmer keyframe from Task 1.
6. Create `Alert.tsx` / inline error component — variants `info` / `success` / `warning` / `danger` with icon. Replaces ad-hoc `p.rounded-lg.border.border-rose-200…` blocks on every page.
7. Create `EmptyState.tsx` — takes `icon`, `title`, `description`, `action?`.
8. Create `AIProgress.tsx` — takes `steps: string[]`, `currentStep?: number`, `autoAdvanceMs?: number` (timer-based optimistic rotation), `status: 'running' | 'success' | 'error'`, `onRetry?`, `resultPreview?: ReactNode`.
9. Create `DataTable.tsx` / list view wrapper — optional `searchPlaceholder`, `filters: FilterDef[]` (dropdown/chips), `sortable`, `columns`, `rows`, `emptyState`, `onSearch`, `onFilterChange`, `onSort`. Debounced search input (200 ms) built-in.

**Test Requirements:**
- **rule (F1a)**: All 8+ primitives exist under `components/ui/` with exports.
- **rule (F1d)**: Spot-check 3 primitives (Card, Badge, Button) have `.dark` styles via the token system.
- **rule (NFR1)**: `cd frontend && npm run lint` exits 0.
- **rubric (F1e, self)**: Compare Card side-by-side with an existing `.panel` div; padding/radius consistent within ~4 px and one shadow level. Score 0/1/2.

**Depends on:** Task 1 (tokens)

---

## Task 3: Sidebar + Layout Shell Refinement (P1)

**Maps to AC:** F1b, F6a

**Work items:**
1. In `Sidebar.tsx`: replace inline badge spans (AI / New / Count) with the shared `Badge` primitive from Task 2.
2. Group nav items into visual sections ("Workspace", "Sales", "Delivery", "Finance", "Automation", "Admin") with section dividers + uppercase tiny labels; preserve all existing `navItems` entries and their path/icon.
3. Improve active state: current NavLink active style should inherit from tokens (accent color).
4. Verify mobile off-canvas drawer works (already in `AppLayout.tsx`); optionally add a transition polish (opacity + translate) but keep behavior identical.

**Test Requirements:**
- **rule (F1b)**: All 3 sidebar badges rendered (Workflows→AI, Migration→New, Approvals→Count) use the imported `<Badge>` component — confirmed by grep on Sidebar.tsx showing no inline `rounded-full px-1.5` spans remaining (count badge excepted if it already had distinct logic; migrate it too).
- **rule (F5b)**: Every original `navItems` path still renders a `<NavLink>` with correct `to=`.
- **rule (F6a)**: At ≤768 px, sidebar is off-canvas and toggle works (inspector: `md:static md:translate-x-0` present).
- **rule (NFR1)**: lint passes.

**Depends on:** Task 2 (Badge primitive exists)

---

## Task 4: Dashboard Page Rework (P2)

**Maps to AC:** F2d, F3a, F3b (gap #13), F5b

**Work items:**
1. Replace hand-rolled heading with `<PageHeader>` (keep eyebrow "Workspace overview", greeting, description).
2. Replace 4 stat tiles with `<Card>` primitive + `<Skeleton variant="stat-tile">` for loading.
3. Recent leads panel: **close gap #13** — add lead `source`, `created_at` date secondary line; also add a 3rd parallel panel or sidebar preview of **recent approvals** (the data is already fetched but never rendered — surface top 3 `entity_type` + `label` + `amount`).
4. Project time panel: add project `status` chip; show `currency + budget_amount_cents` alongside hour budget.
5. Empty states on recent leads / projects sections → `<EmptyState>` primitive.

**Test Requirements:**
- **rule (F3a)**: Existing field set (title, value, currency, source for leads; name, budget_hours, budget_progress for projects) still rendered unchanged — grep existing fields against post-change render.
- **rule (F3b, gap #13)**: Dashboard now surfaces approvals data (entity_type + label + amount) in a visible panel, not only the badge count in sidebar.
- **rule (F2d)**: 0 leads / 0 active projects both render `<EmptyState>`.
- **rule (F5a)**: No new POST/PATCH/DELETE; data fetches unchanged (4 GETs, same endpoints).

**Depends on:** Task 2 (Card, PageHeader, EmptyState, Skeleton)

---

## Task 5: CRM Page — 5 Tabs Rework (P1, big)

**Maps to AC:** F2a, F2b, F2c, F2d, F3a, F3b (gaps #1–#4)

**Work items:**
1. Unified CRM `<PageHeader>` (title + "X leads · Y companies" stat chip). Use `<DataTable>` wrapper for list tabs; use consistent filter bar.
2. **Pipeline tab**: Keep Kanban drag-drop (must not break). **Close gap #1**: add `contact_id` lookup contact name as secondary line on card, add `created_at` date tiny meta, add won/lost stage tint (if stage.is_won → success green tint, is_lost → danger red tint).
3. **Leads tab** (table): Add debounced search. **Filters**: stage_id dropdown, source dropdown, status (open/closed). **Sort**: value DESC, created_at DESC. **Close gaps #1 (contact_id) + #4**: Add `Contact` column (contact lookup via contact_id) and `Created` column. Also add `Notes` indicator (dot if `notes` non-empty).
4. **Companies tab**: Convert list to `<DataTable>`. **Search** (by name/website). **Sort** by name, created_at. **Close gap #2**: Add `Industry` column (if industry set else "—") and `Notes` dot indicator. Add "Has activities" derived filter (count activities per company via lead lookup OR skip filter and just surface the field). Surface `created_at`.
5. **Contacts tab**: Convert to `<DataTable>`. **Search** (name/email). **Sort** by last name. **Close gap #3**: Add `Phone` column and `Title` (job role) column — these are in ContactRead schema but hidden. Surface `created_at` meta.
6. **Activities tab**: **Close gap #4**: Surface `user_id` (who performed the activity) as name/avatar initials. **Filters**: kind dropdown, lead_id dropdown. **Sort**: created_at DESC explicit.
7. Every tab's "no records yet" → `<EmptyState>`.
8. Replace per-tab inline error surfaces with shared `<Alert variant="danger">`.
9. CRITICAL: Keep all saveLead / saveCompany / saveContact / saveActivity / moveLead / removeRecord endpoints, methods, payloads, and confirm-dialog behaviors identical.

**Test Requirements:**
- **rule (F5a)**: All 6 mutation functions retain endpoint, HTTP method, and required payload keys. Grep `apiRequest(` lines against pre-change source.
- **rule (F3a)**: No existing column/field removal — every field shown before still shows after.
- **rule (F3b, gaps #1–#4)**: A single rendered Contact row now shows phone + title; Company row shows industry + created_at; Lead row/table shows contact_name + created_at; Activity row shows user_id/performer.
- **rule (F2a)**: Leads, Companies, Contacts tabs each have debounced search input.
- **rule (F2b)**: Leads tab has stage + source filters; Activities has kind + lead filter.
- **rule (F2c)**: Leads table has sortable value/date columns; Companies sortable by name/date; Contacts sortable by name.
- **rule (F2d)**: 0-state on each of 5 tabs renders `<EmptyState>`.

**Depends on:** Task 2 (all primitives)

---

## Task 6: Quotes Page Rework + AI UX (P1, biggest)

**Maps to AC:** F2a/b/c/d, F3a, F3b (gap #5), F4a/b/c/d, F4e, F5a

**Work items:**
1. Quotes heading → `<PageHeader>` with eyebrow "Sales workspace" + "X quotes saved" stat chip.
2. **Quote editor section**: Keep every form field (title, description, lead, rate card, currency, line items, discount, tax, terms). Refactor outer wrapper → `<Card>`.
3. **Saved quotes list**: Convert to `<DataTable>` with search (by title/client), **filters: status (draft/accepted/void), currency**, **sort: created_at DESC, total_cents DESC**. **Close gap #5**: Add Linked Lead column (lead_id lookup, link to /crm), Created At column, Accepted At (green check + date if status == accepted).
4. **Rate card management**: Keep `<details>` accordion pattern; inner table gets `<Card>` + sort. Surface `description` field (RateCardRead has it; currently ignored).
5. **AI UX — critical F4**:
   - "Draft with AI" button: when `aiBusy`, render `AIProgress` panel beneath/above form with rotating steps: `["Reading lead details…", "Checking selected rate card…", "Searching workspace knowledge…", "Drafting line items…", "Calculating totals and discount…"]` at 7 s each.
   - On success: instead of directly writing into form fields, show a tinted preview `<Card>` (accent-soft background, Sparkles icon, banner "AI draft — review before saving. Nothing saved yet.") listing title, assumptions bullets, and line items table. Add two buttons: "Use this draft →" (commits to form fields = current `setEditingId`, `setLineItems` etc. behavior), "Discard" (clears preview, no state written).
   - On AI failure: same `AIProgress` panel re-renders status='error' with message + Retry button calling `draftWithAI()` again with the same payload.
   - Repeat the progress+preview+error pattern for "Run quote agent" button on this page (it has its own agentBusy flag).
6. Empty quotes list → `<EmptyState>` with primary action "Create your first quote".

**Test Requirements:**
- **rule (F5a)**: POST /quotes, PUT /quotes/:id, POST /quotes/draft, POST /workflows/quote-agent/run, DELETE /quotes/:id, GET /quotes/:id/pdf, POST /quotes/rate-cards all retain exact HTTP method and required payload fields. Confirm by line diff of every apiRequest call site.
- **rule (F3a)**: Saved quote row still shows title, status, total, PDF/Accept-link/Delete actions — no removal.
- **rule (F3b, gap #5)**: Saved quotes table has Linked Lead column and Created At column visible.
- **rule (F4a)**: On aiBusy=true, `AIProgress` panel is in the DOM (visible on screen or in test) with rotating step text.
- **rule (F4b)**: On 200 response from /quotes/draft, a visually distinct preview card (different background tint than editor Card) with "AI draft" banner AND Use/Discard buttons renders BEFORE any form input values are populated. Clicking "Use" populates form; clicking "Discard" resets preview without populating.
- **rule (F4c)**: On 4xx/5xx from /quotes/draft, AIProgress panel renders status=error with Retry button. Retry re-calls the endpoint with the same payload.
- **rule (F4d)**: Run quote agent on Quotes page uses same 3-state component pattern (progress / success-result banner / error-retry).
- **rule (F2d)**: 0-quotes renders `<EmptyState>`.
- **rubric (F4e, self)**: Subjective 0–2 for 60 s AI-wait UX. Score: 2 if rotating steps + banner + countdown-ish feel; 1 if spinner-only-or-static; 0 if frozen form.

**Depends on:** Task 2 (all primitives + AIProgress + DataTable + EmptyState + Badge + Alert)

---

## Task 7: Operations Sub-Pages — Projects, Timesheets, People (P1)

**Maps to AC:** F2a/b/c/d, F3a, F3b (gaps #6, #7), F5a

**Work items:**
7a. **Projects**:
- PageHeader + stat chip ("X active"). Convert project rows → `<Card>` + expand toggle unchanged. Add search (name). **Filter**: status (active/archived/all). **Sort**: name, created_at, budget-% DESC. **Close gap #6**: Add description text (truncated) under name; Add Lead link (lead_id lookup); Add start_date/end_date as meta if set. Tasks sub-list: surface `assignee_id` (name/initials) and `estimate_minutes` (e.g. "2h est") — these are in TaskRead but invisible.
- Preserve: saveProject, addTask/updateTask/removeTask, archiveProject endpoints + confirm dialogs.

7b. **Timesheets**:
- PageHeader. Replace error div → Alert. `<DataTable>` wrapper. **Search**: description text. **Filters**: approval_status, project_id, is_billable (yes/no), entry_date range (simplify: preset chips). **Sort**: entry_date DESC (default), minutes DESC. **Close gap #7**: Add Task column (task_id lookup → title or "—") and Employee (employee_id lookup or user_id). Surface user_id name as fallback.
- Preserve: add/edit entry, decide (approve/reject), remove endpoints.

7c. **People & Team**:
- PageHeader. Employee `<DataTable>`. **Search**: name. **Sort**: full_name alpha. **Filter**: is_active. Leave widget → `<Card>` with search/filter. Keep LeaveWidget inner logic.
- Preserve: add/edit/deactivate/reactivate teammate + leave request endpoints.

**Test Requirements:**
- **rule (F5a)**: All operations endpoints retain method+path+required payload: POST/PATCH projects/tasks/timesheets/people/leave-requests, DELETE projects/timesheets/people/leave, PATCH timesheets/:id/approval, PATCH people/:id. Line-by-line against pre-change.
- **rule (F3b, gap #6)**: Project card shows description snippet + lead link + start/end dates; Task row shows assignee + estimate_hours.
- **rule (F3b, gap #7)**: Timesheets table shows task column AND employee/user column.
- **rule (F2a–c)**: Each page has its needed search/filter/sort wiring.
- **rule (F2d)**: All 3 pages render `<EmptyState>` on zero records.

**Depends on:** Task 2 (primitives + DataTable + EmptyState + Alert)

---

## Task 8: Finance Pages — Invoices, Expenses (P1)

**Maps to AC:** F2a/b/c/d, F3a, F3b (gaps #8, #9), F5a

**Work items:**
8a. **Invoices & Billing**:
- PageHeader. `<DataTable>`. **Search**: invoice_number, client_name. **Filters**: status (draft/sent/paid/void), overdue flag (derived: due_date < today AND status in {draft,sent}). **Sort**: due_date ASC (aging order, overdue first). **Close gap #8**: Add Issue Date column; Add Project column (project_id lookup, already a schema field); Add Notes indicator (dot if notes present). Critical: add **visual overdue badge** (red tint / danger Badge) on any row where balance>0 AND due_date<today.
- Preserve: create/edit invoice, mark sent, record payment, void, delete endpoints.

8b. **Expenses & Bills**:
- PageHeader. `<DataTable>`. **Search**: vendor/description. **Filters**: status (pending/approved/rejected), CATEGORY dropdown (this is a schema field that's fully ignored — high priority!). **Sort**: expense_date DESC, amount_cents DESC. **Close gap #9**: Add Category as a visible Badge column (general / travel / meals / software / etc).
- Preserve: create/edit expense, review (approve/reject), delete endpoints.

**Test Requirements:**
- **rule (F5a)**: Billing endpoints unchanged (POST/PUT/PATCH/DELETE /billing/invoices, /billing/invoices/:id/payments, /billing/invoices/:id/status, /billing/expenses, /billing/expenses/:id/review).
- **rule (F3b, gap #8)**: Invoice table now has Issue Date col + Project col + Notes indicator + overdue visual flag.
- **rule (F3b, gap #9)**: Expense table now renders Category Badge column.
- **rule (F2b)**: Invoices has overdue filter; Expenses has category filter.
- **rule (F6b)**: Both tables wrapped in `overflow-x-auto`.

**Depends on:** Task 2

---

## Task 9: Knowledge + Automation Pages — Documents, Migration, Workflows, Approvals (P2)

**Maps to AC:** F2a/b/c/d, F3a, F3b (gaps #10, #11, #12), F4d, F5a

**Work items:**
9a. **Documents & SOWs**:
- PageHeader. Saved-doc `<DataTable>` or card list. **Search**: keeps existing server-side `?q=` (wire through DataTable). **Filters — critical gap #10**: category dropdown (general/contract/sow/policy/rate_card). **Sort**: updated_at DESC, title.
- Keep: save/edit/remove document, semantic search endpoints. Knowledge search result cards already surface everything.

9b. **Odoo Migration**:
- PageHeader. History list: **Close gap #12**: history row shows row_count / imported count (as "X/Y imported") plus error count Badge, and created_at. Add sort by created_at DESC; add filter by target and status.
- Keep: dry-run + apply endpoints, form fields.

9c. **Agent Workflows**:
- PageHeader. Operational checks cards → `<Card>` (keep as cards; OK). Run history: `<DataTable>` with filters by `workflow_type`, `status`. Sort: created_at DESC. **F4d pattern**: "Run quote agent" button on this page uses `AIProgress` with optimistic steps, then success banner (the banner already shows the message — integrate into the AIProgress success state) or error with retry. Run-details `AgentRunDetails` already surface every step field — keep.

9d. **Approvals Inbox** (already best-surfaced page):
- PageHeader. **Gap #11 fix**: Add `entity_type` filter bar (time_entry/expense/quote_draft chips or dropdown). Sort: created_at ASC (queue order — oldest pending first). Keep every field already rendered (entity_type, label, reason, quote preview, assumptions, amount). Keep approve/reject endpoints.

**Test Requirements:**
- **rule (F5a)**: All page write endpoints retained: CRUD documents, POST /migration/dry-run, POST /migration/jobs/:id/apply, POST /workflows/quote-agent/run, POST /workflows/:type, POST /workflows/approvals/:entity_type/:id decisions.
- **rule (F3b, gap #10)**: Documents has visible category filter (dropdown/chips) + category column or badge on each row.
- **rule (F3b, gap #11)**: Approvals has visible entity_type filter.
- **rule (F3b, gap #12)**: Migration history row shows imported count and errors.
- **rule (F4d)**: Workflows Run quote agent button uses AIProgress 3-state pattern (progress/success/error-retry) same as Quotes page.

**Depends on:** Task 2

---

## Task 10: Settings Page — Consistency Pass (P2)

**Maps to AC:** F1e, F3a, F5c, F6b

**Work items:**
1. PageHeader (replace manual h1+p).
2. Org profile card, Your profile card, Members card → `<Card>` primitive.
3. Member `<table>` wrapped in horizontal scroll (F6b); add sort by full_name / role; optional member-name search.
4. Preserve 100% of Settings write endpoints: PUT /users/profile, PUT /organizations/current, POST /organizations/members, DELETE /organizations/members/:id, PATCH member role re-assignment via POST same-endpoint trick.

**Test Requirements:**
- **rule (F5c)**: Every settings write call site retains exact method+path+payload (POST /organizations/members for both invite AND role change).
- **rule (F3a)**: Org name/slug/currency/spend cap + profile name/email + members user/role/status columns all present.
- **rule (F6b)**: Member `<table>` in `overflow-x-auto`.

**Depends on:** Task 2

---

## Task 11: Polish Pass (P3)

**Maps to AC:** F6a/b/c/d, F1e (rubric bump)

**Work items:**
1. Route-change fade: wrap `<Outlet>` in a simple opacity+translate micro-animation (~150 ms) via transition group or plain CSS class on mount.
2. Button/hover/focus consistency: audit all 3 Button variants for focus ring and hover colors; ensure destructive variant is used consistently for Delete (not random text-rose-600 links).
3. Skeleton first-render: Dashboard stat tiles, CRM tabs first load, Quotes list all render Skeleton shapes instead of "Loading…" text.
4. Inline-error-toast consistency: every page's error state uses `<Alert variant="danger">` — no browser alert(), no raw `<p>` with rose color (except confirm dialogs for destructive actions — those are window.confirm and that's fine).
5. Table horizontal scroll wrap audit: every `<table>` in codebase wrapped in `overflow-x-auto`.
6. Audit Navbar Cmd-K palette for dark-mode compatible styling; Cmd-K open shortcut confirmed working.

**Test Requirements:**
- **rule (F6c)**: Button hover/focus transitions all in 150–200 ms window (spot-check `transition` class durations).
- **rule (F6d)**: At least Dashboard stat tiles + CRM tab first-load show Skeleton.
- **rubric (F1e, self)**: Re-score 3-page consistency post-polish. Expected 2/2.

**Depends on:** Tasks 3–10 all complete

---

## Task 12: Build + Lint + Smoke Test + Review Prep (P1)

**Maps to AC:** NFR1, F5a (final pass)

**Work items:**
1. `cd frontend && npm run build` — fix any TS errors.
2. `cd frontend && npm run lint` — fix any lint.
3. Existing tests: `cd frontend && npm test` if tests exist (test files exist per glob: `frontend/src/test/*.test.tsx`). Ensure tests pass or document any test updates for new DOM structure (primitives wrapping tables etc.).
4. Manual smoke checklist of 12 pages + sidebar + navbar: route loads, page header renders, one CRUD action smoke test (create + delete a test company).
5. Record Completion Evidence for every task's TRs.

**Test Requirements:**
- **rule (NFR1)**: build exits 0; lint exits 0.
- **rule**: existing `frontend/src/test/*.test.tsx` tests run to completion without CRASH; test updates are limited to adapting query selectors for new wrapper components (Card/DataTable) — never delete test assertions.

**Depends on:** All prior tasks
