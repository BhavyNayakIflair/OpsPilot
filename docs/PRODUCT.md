# OpsPilot - Product Specification

## 1. Executive Summary & Vision
OpsPilot is an AI-native, lightweight business operations SaaS tailored specifically for small IT services companies, software development agencies, consultancies, and managed service providers (MSPs) with 5 to 50 employees.

Traditional ERPs like Odoo are bloated, complex, require expensive partner implementations, and charge licensing fees for dozens of modules small agencies never touch (manufacturing, POS, e-commerce, complex warehousing). Small IT companies run on billable hours, milestone deliverables, rate cards, and client proposals. OpsPilot replaces spreadsheet chaos and heavy ERPs with an AI-first workflow engine where AI agents execute the repetitive administrative burden and humans approve consequential steps.

---

## 2. Target Customer Profile (ICP)
- **Company size:** 5 to 50 employees (founders, PMs, engineers, sales leads, fractional finance).
- **Domain:** Custom software shops, web/mobile development agencies, IT staff augmentation, MSPs, cybersecurity consultancies.
- **Pain Points:**
  - Hours lost weekly assembling quotes from spreadsheets and old proposals.
  - End-of-month invoicing pain: collecting timesheets, catching rate mismatches, detecting missing logs, and tracking fixed-price milestone billing.
  - Odoo licensing and maintenance is disproportionately heavy and costly.
  - Lack of real-time visibility into project budget burn and schedule risk.

---

## 3. Product Scope & Disciplined Boundaries
### In Scope (Core Modules):
1. **CRM & Leads:** Visual Kanban pipeline, lead capture API, contact & company records, AI lead scoring & enrichment.
2. **Quotes & Proposals:** Rate card lookup, line-item drafting, PDF export, digital e-acceptance links.
3. **Projects & Tasks:** Automatically created upon deal win, milestone schedules, hourly budget tracking.
4. **Timesheets:** Weekly grid entry, billable vs non-billable categorization, single-click team manager approvals.
5. **Invoicing & Payments:** T&M, fixed-price milestones, retainers, multi-currency (USD, EUR, INR, GBP), payment tracking, aging reports.
6. **Expenses & Vendor Bills:** Capture, PO/contract verification, automated discrepancy detection.
7. **People & Team:** Employee records, cost & billing rates, leave tracking, utilization analytics.
8. **Knowledge & Documents:** SOWs, contracts, rate cards, indexed with vector embeddings for RAG.
9. **Odoo Migration Center:** 1-day migration via CSV/Excel exports or live JSON-RPC with AI field mapping and dry runs.
10. **Approvals & Agent Workflows:** Human-in-the-loop review for high-consequence operations.

### Non-Goals (Out of Scope):
- Heavy manufacturing & MRP
- Warehouse inventory tracking
- Full general ledger / certified tax accounting (OpsPilot exports cleanly to accountant tools)
- Payroll calculation & compliance
- E-commerce & Point of Sale (POS)
