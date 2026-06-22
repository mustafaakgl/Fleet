# Manual Exploratory Test Session — documents

## Session Info
- Module: documents
- Date: ______________________
- Tester: ______________________
- Environment: local dev (backend :3000, frontend :3001)
- App URL: http://localhost:3001
- Browser: ______________________
- Test Data: prepare the records needed by the preconditions below (drivers/vehicles/companies, documents, expiries, two tenants)
- Roles Tested: admin, boss, accounting, office, driver
- Timebox: 60–90 minutes

## Session Charter
Explore the `documents` module to surface the highest-risk defects (unauthorized access, finance/data leakage, data loss, wrong owner or assignment, missed compliance reminders, inconsistent export/calendar). Test across roles (admin/boss/accounting/office/driver), cover happy and sad paths, and capture evidence. A finding only counts as a confirmed bug when there is evidence; otherwise classify it as a Bug Candidate, Risk, Test Idea, UX Issue, or Question.

## Testing Principles Applied
- Risk-Based Testing
- Charter-Based Exploratory Testing
- Role-Based Testing
- Boundary and Edge Case Testing
- Data Integrity
- Cross-Module Effects
- Evidence-Based Bug Reporting
- Regression Thinking

## Test Cases

### TC-DOC-001 — Office role attempts to view private driver documents

**Category:** Auth & RBAC  
**Principle:** Role-Based Testing  
**Role:** office  
**Preconditions:**  
**Steps:**  
1. Log in as office.  
2. Filter documents by ownerType=driver, category=medical.  
3. Try to open a driver medical document detail/download.  

**Expected Result:** Private driver documents are hidden from office.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** API response + screenshot of denied/empty result.  
**Bug ID:**  
**Notes:**  

### TC-DOC-002 — Direct-ID access to another tenant's document

**Category:** Auth & RBAC  
**Principle:** Risk-Based Testing  
**Role:** office  
**Preconditions:**  
**Steps:**  
1. Log in as office of tenant A.  
2. GET /documents/<tenant-B-document-id> directly.  

**Expected Result:** 403/404 — tenant scope enforced at the API.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Request/response logs showing tenant mismatch.  
**Bug ID:**  
**Notes:**  

### TC-DOC-003 — Owner-type mismatch between document and owner

**Category:** Data Integrity  
**Principle:** Data Integrity  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Upload a vehicle inspection document.  
2. Submit ownerType=driver via the API.  

**Expected Result:** Owner-type/category mismatch is rejected.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** DB row showing ownerType vs category.  
**Bug ID:**  
**Notes:**  

### TC-DOC-004 — Expired document should drive a compliance reminder

**Category:** Data Integrity  
**Principle:** Cross-Module Effects  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Set a document expiry to the past.  
2. Run the reminder generation job.  

**Expected Result:** A compliance reminder is created for the owner.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Reminder table before/after the job.  
**Bug ID:**  
**Notes:**  

### TC-DOC-005 — Upload an unsupported file type (.exe)

**Category:** Forms & Validation  
**Principle:** Boundary and Edge Case Testing  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Open the document upload form.  
2. Select an .exe file and submit via the API.  

**Expected Result:** Backend rejects unsupported file types.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Stored file metadata + API response.  
**Bug ID:**  
**Notes:**  

### TC-DOC-006 — Upload a file with a 300+ character name

**Category:** Forms & Validation  
**Principle:** Boundary and Edge Case Testing  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Upload a file with a very long name.  

**Expected Result:** Name is validated/truncated; clean success or error.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Server log + request payload.  
**Bug ID:**  
**Notes:**  

### TC-DOC-007 — Company document expiry should notify the fleet manager

**Category:** Business Flow  
**Principle:** Cross-Module Effects  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Advance a company document to expired.  
2. Run reminder generation.  

**Expected Result:** Fleet manager receives a compliance reminder.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Reminder rows filtered by ownerType=company.  
**Bug ID:**  
**Notes:**  

### TC-DOC-008 — Renewing a document should clear the stale reminder

**Category:** Business Flow  
**Principle:** Regression Thinking  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Open an expired document with an open reminder.  
2. Upload a renewed version with a future expiry.  

**Expected Result:** Old reminder is resolved; new expiry tracked.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Reminder status history for the document.  
**Bug ID:**  
**Notes:**  

### TC-DOC-009 — Browser back after a successful upload

**Category:** UI/UX  
**Principle:** Happy Path + Sad Path  
**Role:** admin  
**Preconditions:**  
**Steps:**  
1. Upload a document successfully.  
2. Press the browser back button.  

**Expected Result:** No duplicate submission; form is reset.  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Screen recording + document rows.  
**Bug ID:**  
**Notes:**  

### TC-DOC-010 — Refresh should preserve the active document filter

**Category:** UI/UX  
**Principle:** Boundary and Edge Case Testing  
**Role:** office  
**Preconditions:**  
**Steps:**  
1. Apply a category filter on the documents list.  
2. Refresh the page.  

**Expected Result:** Filter state is preserved (e.g. via URL params).  
**Actual Result:**  
**Status:** Not Run  
**Evidence:** Before/after screenshots of the list.  
**Bug ID:**  
**Notes:**  

## Bugs Found
- (none yet — log confirmed failures in `bugs/bug_log.md` using `templates/bug_report_template.md`)

## Questions / Requirement Gaps
- ...

## Regression Notes
- Re-test affected flows after any related code change.
- Re-check cross-module side effects (dashboard, reminders, calendar, export) impacted by this module.

## Session Summary
- Passed:
- Failed:
- Blocked:
- Bugs created:
- Follow-up needed:
