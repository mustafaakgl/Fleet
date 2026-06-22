# Fleet QA Testing Principles

These principles define **how** the Fleet QA agents test. The goal is **not** to
generate random bug reports. The goal is structured, evidence-based exploratory
testing driven by risk. Every agent must apply these principles and must be
honest about what is a confirmed bug versus a risk, a test idea, or something
that needs manual verification.

## 1. Risk-Based Testing
Prioritize the areas that can cause the most damage:
- unauthorized access
- finance data leakage
- data loss
- wrong driver/vehicle assignment
- wrong document owner
- missed compliance reminder
- wrong export/report
- broken request/calendar synchronization

## 2. Charter-Based Exploratory Testing
Every session must start with a charter:
- What are we testing?
- Which risk are we exploring?
- Which role are we using?
- What evidence do we need?
- What would count as a bug?

## 3. Happy Path + Sad Path
For every module:
- test the normal successful flow
- test missing data
- test invalid data
- test duplicate data
- test refresh/back behavior
- test direct URL access when relevant

## 4. Role-Based Testing
Always consider:
- admin
- boss
- accounting
- office
- driver

Especially check:
- finance visibility
- document visibility
- edit/delete permissions
- direct URL bypass
- API-level permissions

## 5. Boundary and Edge Case Testing
Test:
- empty values
- very long text
- invalid dates
- past dates
- future dates
- duplicate submit
- unsupported file types
- large files
- special characters
- deleted related records

## 6. Data Integrity
Check whether data remains consistent across:
- list page
- detail page
- API response
- database relationship
- export
- dashboard
- calendar
- reminders

## 7. Cross-Module Effects
Fleet modules are connected. Always ask:
- If a driver is deleted, what happens to documents and assignments?
- If a vehicle document expires, does dashboard/reminder change?
- If leave is approved, does calendar update?
- If assignment changes, does export update?

## 8. Evidence-Based Bug Reporting
Do not call something a bug unless there is evidence.

Use these categories:
- Confirmed Bug: evidence exists
- Bug Candidate: likely bug but needs manual verification
- Risk: possible issue based on code or flow
- Test Idea: something that should be tested
- UX Issue: usability or clarity problem
- Question: requirement unclear

## 9. Reproducibility
Every bug or bug candidate must include:
- role
- preconditions
- steps to reproduce
- expected result
- actual result or suspected actual result
- evidence needed

## 10. Regression Thinking
For every bug or risk, define:
- what could break nearby?
- what should be retested after fix?
- which module could be affected?
