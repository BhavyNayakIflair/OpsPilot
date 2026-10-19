# OpsPilot Cross-Module Enhancement Audit

**Date:** October 19, 2026  
**Repository:** `github.com/BhavyNayakIflair/OpsPilot`  
**Baseline Test Status:**
- Backend: 99/99 pytest tests passing (`backend/tests`)
- Frontend: 41/41 vitest tests passing across 10 test files (`frontend/src/test`)

---

## 1. Executive Summary

OpsPilot possesses foundation models for multi-tenant delivery and billing (Employees, Projects, Tasks, Timesheets, Invoices, Payments, Expenses). However, these modules currently operate as isolated data silos without unified team structure, project allocation, robust assignment mechanics, leave conflict detection, or professional invoice PDF generation.

This audit maps existing implementation assets against target requirements across all five project phases.

---

## 2. In-Depth Module Analysis & File Paths

### 2.1 Invoices & Billing
- **Models (`backend/app/models/billing.py`):**
  - `Invoice`: contains `org_id`, `project_id`, `invoice_number`, `client_name`, `status`, `currency`, `subtotal_cents`, `tax_cents`, `total_cents`, `paid_cents`, `issue_date`, `due_date`, `notes`.
  - `InvoiceLineItem`: `invoice_id`, `description`, `quantity`, `unit_price_cents`, `amount_cents`.
  - `Payment`: `invoice_id`, `amount_cents`, `paid_date`, `method`, `reference`.
  - `Expense`: `submitted_by`, `vendor`, `category`, `description`, `amount_cents`, `currency`, `expense_date`, `status`.
- **Endpoints (`backend/app/api/v1/endpoints/billing.py`):**
  - `GET /api/v1/billing/invoices`: returns full list for tenant without server-side search, filtering (status, client, date range, overdue), or pagination.
  - `POST /api/v1/billing/invoices`: generates non-sequential `INV-{year}-{random_hex}` numbers using `secrets.token_hex(3)`.
  - `PATCH /api/v1/billing/invoices/{id}/status`: only allows toggling between `sent` and `void`. Does not enforce the lifecycle state machine `draft -> sent -> partially_paid -> paid`.
  - `POST /api/v1/billing/invoices/{id}/payments`: updates `paid_cents` and sets status to `paid` or `partial`. Over-payment check exists, but transitions to `partially_paid` are not standardized (`partial` is stored).
- **PDF Generation (`backend/app/services/pdf_service.py`):**
  - Quote PDF generation exists (`generate_quote_pdf`) using ReportLab.
  - **Missing:** No invoice PDF generator exists, and no `GET /api/v1/billing/invoices/{id}/pdf` endpoint exists.
- **Frontend (`frontend/src/pages/Operations.tsx:2149-2640`):**
  - `InvoicingPage` provides a table with local-only client filtering and simple create/edit forms.
  - **Missing:** Server-side search/pagination, payments sub-panel, PDF preview/download actions, overdue badges based on `due_date`, and payment creation modal.

### 2.2 Tasks, Projects, and Assignments
- **Models (`backend/app/models/operations.py`):**
  - `Project`: stores project metadata (`budget_minutes`, `budget_amount_cents`).
  - `ProjectTask`: stores `assignee_id` as a single nullable foreign key to `employees.id`.
- **Existing Assignment Flow:**
  - Single employee foreign key only (`assignee_id`).
  - No `TaskAssignee` many-to-many relationship.
  - No assignee role classification (`owner`, `contributor`, `reviewer`).
  - No concept of `ProjectMember` (allocations, roles, start/end dates).
  - No assignment router or service (`/assignments` does not exist).
- **Frontend (`frontend/src/pages/Operations.tsx:647-1050`):**
  - Projects page shows expandable projects with tasks, but only displays single avatar initial or `Unassigned`. There is no assignee picker or multi-select.

### 2.3 People, Teams, and Leave
- **People / Employees (`backend/app/models/operations.py:6-19`):**
  - `Employee` model with `user_id` (optional 1:1), `full_name`, `title`, `email`, `billing_rate_cents`, `cost_rate_cents`, `weekly_capacity_minutes`, `annual_leave_days`, `is_active`.
  - Managed via `/api/v1/operations/people`.
- **Teams:**
  - **Completely Missing:** No `Team` or `TeamMember` models, no endpoints, and no UI components.
- **Leave (`backend/app/models/operations.py:75-89`):**
  - `LeaveRequest` stores `employee_id`, `start_date`, `end_date`, `leave_type` (string), `working_days` (int), `status`.
  - **Missing:** No `LeaveType` or `LeaveBalance` tables. Balances are not tracked per year or deducted/restored on approval/cancellation.
  - Self-approval is not prevented. Working days are not validated against weekends.

---

## 3. Numbered Findings & Missing Cross-Module Flows

1. **[Finding 1 - No Multi-Assignee or Roles]:** Tasks only support a single nullable `assignee_id`. Multi-assignee support (`TaskAssignee` with `owner`, `contributor`, `reviewer` roles and `assigned_by`/`assigned_at`) is missing.
2. **[Finding 2 - Missing Project Membership & Allocation]:** Projects have no concept of project members (`ProjectMember`). Any employee can be assigned tasks or log hours on any project without explicit membership or allocation hours/week.
3. **[Finding 3 - Missing Team & TeamMember Domain]:** No structure exists to group people into teams with a team lead, preventing team-lead approvals, team availability overviews, and team-based task suggestions.
4. **[Finding 4 - Zero Leave Conflict Detection on Assignments]:** Assigning a person to a task due during their approved leave does not trigger warnings or require confirmation overrides.
5. **[Finding 5 - No Reassignment Flagging on Leave Approval]:** Approving a leave request does not check for existing assigned tasks that overlap the leave period, leaving projects blindsided by absences.
6. **[Finding 6 - No Real-Time Capacity & Workload Computation]:** Task estimates (`estimate_minutes`) are never aggregated against `weekly_capacity_minutes` and approved leave to flag employee overload or recommend available assignees.
7. **[Finding 7 - Leave Accounting Gaps]:** Leave types and per-year leave balances do not exist as relational entities. Balances are neither deducted upon approval nor refunded upon cancellation.
8. **[Finding 8 - Non-Deterministic & Non-Sequential Invoice Numbering]:** Invoice numbers use random hex strings (`INV-2026-A1B2C3`) which risk collision and violate accounting standards for sequential numbering per organization.
9. **[Finding 9 - Incomplete Invoice Lifecycle & Mutability]:** Status transitions do not enforce the `draft -> sent -> partially_paid -> paid` state machine with 409 Conflict safeguards. Paid and void invoices remain editable.
10. **[Finding 10 - Missing Invoice PDF Generation & Preview]:** While ReportLab is used for quote PDFs, no invoice PDF generation service or `GET /invoices/{id}/pdf` endpoint exists.
11. **[Finding 11 - Frontend View Deficits]:** Frontend lacks dedicated tabs for Project Members, Team directory & availability, Leave calendar & approval queues, Task multi-assignee pickers with leave conflict dialogues, and Invoice payment management with PDF download.

---

## 4. Implementation Plan & Target Design

- **Phase 1: Data Model & Migrations**
  - New reversible Alembic migration for `teams`, `team_members`, `project_members`, `task_assignees`, `leave_types`, `leave_balances`, and updated invoice sequence counter.
  - Dual-write & backfill: Sync `TaskAssignee` with existing `assignee_id` as `owner` role.
  - Seed Northwind Digital demo dataset (3 teams, 12 people, project allocations, tasks with assignees, leave balances, and conflict scenarios).
- **Phase 2: Backend Services & Business Rules**
  - Assignment service (`/assignments` router): membership enforcement, capacity calculation, leave conflict warnings with override flag, suggestions endpoint.
  - Leave service: working days calculator (excluding weekends), overlap rejection, balance deduction/restoration, self-approval prevention, task "needs reassignment" flagging.
  - Invoice service: sequential numbering (`INV-{YYYY}-{0001}` race-safe), state machine enforcement with 409 responses, server-side Decimal rounding, payment recording, list filtering & overdue calculation.
- **Phase 3: Invoice PDF Generation**
  - ReportLab invoice generator in `backend/app/services/pdf_service.py` with multi-page table wrapping, branded headers/footers, org metadata, and line items.
  - Endpoint `GET /api/v1/billing/invoices/{id}/pdf` with inline/attachment query flag and proper MIME headers.
- **Phase 4: Frontend Enhancements**
  - Enhance Tasks UI with multi-assignee picker, leave conflict confirmation dialog, and "needs reassignment" badge.
  - Add Project Members tab and workload summary.
  - Add People and Teams availability detail views.
  - Add Leave request form, balance tracker, approval queue, and calendar.
  - Enhance Invoices page with server-filtered list, overdue flags, payment modal, and PDF preview/download.
- **Phase 5: Stabilization & Verification**
  - Comprehensive unit and integration test suite covering all 8 specified test flows.
  - Migration reversibility testing (`alembic upgrade head`, `alembic downgrade -1`).
  - Full regression test run.
