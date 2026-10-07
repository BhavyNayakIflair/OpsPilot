# Odoo Migration Center — Sample CSV Test Files

This directory contains test CSV files tailored for testing the **Odoo Migration Center** UI (`/migration`):

## Files

1. **`sample_company.csv`** (Target: **Companies**)
   - **Required Header**: `name`
   - **Optional Headers**: `website`, `industry`, `notes`
   - **Records**: 5 B2B tech/healthcare/finance enterprises.

2. **`sample_contacts.csv`** (Target: **Contacts**)
   - **Required Headers**: `first_name`, `last_name`
   - **Optional Headers**: `email`, `phone`, `title`, `company`
   - **Records**: 5 executive contacts linked to the companies in `sample_company.csv`.

3. **`sample_lead.csv`** (Target: **Leads**)
   - **Required Header**: `title`
   - **Optional Headers**: `company`, `value_cents`, `currency`, `source`, `notes`
   - **Records**: 5 high-value migration and consulting deals ($28k to $120k).

---

## How to Test on the UI

1. Open the UI at `http://localhost:5173/migration` (or your active frontend port).
2. **Step 1 — Import Companies**:
   - Set **Records to import** to `Companies`.
   - Click **Choose file** and select `test/sample_company.csv`.
   - Click **Preview CSV**.
   - Verify that 5 rows appear in the preview table with `0 errors`.
   - Click **Apply import**.
   - Check **CRM & Leads → Companies** to verify the companies appear.
3. **Step 2 — Import Contacts**:
   - Set **Records to import** to `Contacts`.
   - Click **Choose file** and select `test/sample_contacts.csv`.
   - Click **Preview CSV** and then **Apply import**.
   - Check **CRM & Leads → Contacts** to verify contacts are linked to their companies.
4. **Step 3 — Import Leads**:
   - Set **Records to import** to `Leads`.
   - Click **Choose file** and select `test/sample_lead.csv`.
   - Click **Preview CSV** and then **Apply import**.
   - Check **CRM & Leads → Pipeline** to verify the deals are placed in the "New" stage.
