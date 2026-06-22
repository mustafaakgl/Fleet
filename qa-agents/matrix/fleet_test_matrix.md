# Fleet Full-System Test Matrix

_DRY RUN - NEEDS MANUAL VERIFICATION_

Total scenarios: **168**

| ID | Module | Risk | Principle | Category | Role | Agent | Scenario | Expected Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TM-001 | auth | Critical | Regression Thinking | Security | office_tenant_a | Security Abuse Agent | Logout then browser back. | Protected pages are not accessible after logout via back button. |
| TM-002 | auth | Critical | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Direct URL access to a protected page. | Unauthorized direct access is blocked/redirected. |
| TM-003 | auth | Critical | Role-Based Testing | Auth & RBAC | driver_tenant_a_1 | Auth & RBAC Agent | Driver attempts to open the admin dashboard. | Driver is denied access to the web admin dashboard. |
| TM-004 | auth | Critical | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Office attempts to open a finance route. | Office is denied access to finance routes. |
| TM-005 | auth | Critical | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the auth module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-006 | auth | Critical | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the auth module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-007 | auth | Critical | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the auth module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-008 | auth | Critical | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the auth module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-009 | auth | Critical | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the auth module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-010 | auth | Critical | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the auth module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-011 | auth | Critical | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the auth module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-012 | auth | Critical | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the auth module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-013 | auth | Critical | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the auth module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-014 | dashboard | Medium | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the dashboard module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-015 | dashboard | Medium | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the dashboard module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-016 | dashboard | Medium | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the dashboard module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-017 | dashboard | Medium | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the dashboard module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-018 | dashboard | Medium | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the dashboard module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-019 | dashboard | Medium | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the dashboard module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-020 | dashboard | Medium | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the dashboard module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-021 | dashboard | Medium | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the dashboard module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-022 | dashboard | Medium | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the dashboard module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-023 | drivers | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the drivers module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-024 | drivers | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the drivers module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-025 | drivers | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the drivers module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-026 | drivers | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the drivers module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-027 | drivers | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the drivers module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-028 | drivers | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the drivers module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-029 | drivers | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the drivers module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-030 | drivers | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the drivers module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-031 | drivers | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the drivers module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-032 | vehicles | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the vehicles module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-033 | vehicles | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the vehicles module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-034 | vehicles | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the vehicles module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-035 | vehicles | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the vehicles module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-036 | vehicles | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the vehicles module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-037 | vehicles | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the vehicles module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-038 | vehicles | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the vehicles module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-039 | vehicles | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the vehicles module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-040 | vehicles | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the vehicles module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-041 | companies | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the companies module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-042 | companies | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the companies module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-043 | companies | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the companies module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-044 | companies | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the companies module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-045 | companies | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the companies module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-046 | companies | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the companies module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-047 | companies | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the companies module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-048 | companies | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the companies module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-049 | companies | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the companies module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-050 | documents | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Office role attempts to view private driver salary/medical documents. | Access is denied; private documents are never shown to office. |
| TM-051 | documents | High | Risk-Based Testing | Security | office_tenant_b | Security Abuse Agent | Direct-ID access to another tenant's document via URL/API. | Request is rejected; no cross-tenant document is returned. |
| TM-052 | documents | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Owner-type mismatch between a document and its owner. | Document is bound to the correct owner type; mismatches are rejected. |
| TM-053 | documents | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Expired document should drive a compliance reminder. | An expiry creates the expected reminder/notification. |
| TM-054 | documents | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Upload an unsupported file type. | Upload is rejected with a clear validation error. |
| TM-055 | documents | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Upload a file with a 300+ character file name. | Name is rejected or safely truncated; no crash or corruption. |
| TM-056 | documents | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Renewing a document should clear the stale reminder. | Old reminder is cleared and a fresh expiry cycle starts. |
| TM-057 | documents | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the documents module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-058 | documents | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the documents module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-059 | documents | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the documents module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-060 | documents | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the documents module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-061 | documents | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the documents module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-062 | documents | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the documents module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-063 | documents | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the documents module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-064 | documents | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the documents module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-065 | documents | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the documents module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-066 | reminders | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the reminders module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-067 | reminders | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the reminders module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-068 | reminders | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the reminders module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-069 | reminders | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the reminders module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-070 | reminders | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the reminders module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-071 | reminders | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the reminders module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-072 | reminders | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the reminders module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-073 | reminders | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the reminders module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-074 | reminders | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the reminders module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-075 | einsatzplan | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Driver assigned without the correct license class. | Assignment is blocked or flagged; license rules are enforced. |
| TM-076 | einsatzplan | High | Boundary and Edge Case Testing | Business Flow | admin_tenant_a | Business Flow Agent | Same driver assigned to overlapping jobs. | Overlap is detected and prevented or clearly warned. |
| TM-077 | einsatzplan | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Leave day conflicts with an assignment. | Conflict is surfaced; assignment respects approved leave. |
| TM-078 | einsatzplan | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Assignment update should update the calendar. | Calendar reflects the assignment change immediately. |
| TM-079 | einsatzplan | High | Data Integrity | Data Integrity | accounting_tenant_a | Data Integrity Agent | Daily overview export should match the assignments. | Export rows exactly match the on-screen assignments. |
| TM-080 | einsatzplan | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the einsatzplan module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-081 | einsatzplan | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the einsatzplan module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-082 | einsatzplan | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the einsatzplan module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-083 | einsatzplan | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the einsatzplan module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-084 | einsatzplan | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the einsatzplan module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-085 | einsatzplan | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the einsatzplan module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-086 | einsatzplan | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the einsatzplan module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-087 | einsatzplan | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the einsatzplan module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-088 | einsatzplan | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the einsatzplan module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-089 | urlaubsplaner | Low | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the urlaubsplaner module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-090 | urlaubsplaner | Low | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the urlaubsplaner module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-091 | urlaubsplaner | Low | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the urlaubsplaner module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-092 | urlaubsplaner | Low | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the urlaubsplaner module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-093 | urlaubsplaner | Low | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the urlaubsplaner module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-094 | urlaubsplaner | Low | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the urlaubsplaner module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-095 | urlaubsplaner | Low | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the urlaubsplaner module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-096 | urlaubsplaner | Low | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the urlaubsplaner module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-097 | urlaubsplaner | Low | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the urlaubsplaner module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-098 | requests | High | Cross-Module Effects | Business Flow | office_tenant_a | Business Flow Agent | Leave approval creates a calendar event. | Approval produces the expected calendar event. |
| TM-099 | requests | High | Happy Path + Sad Path | Business Flow | office_tenant_a | Business Flow Agent | Rejected request should not create a calendar event. | No calendar event is created for a rejected request. |
| TM-100 | requests | High | Boundary and Edge Case Testing | Business Flow | office_tenant_a | Business Flow Agent | Overlapping leave request. | Overlap is detected and handled per business rules. |
| TM-101 | requests | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Office role approval permissions. | Office can only approve what its role permits. |
| TM-102 | requests | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the requests module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-103 | requests | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the requests module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-104 | requests | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the requests module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-105 | requests | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the requests module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-106 | requests | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the requests module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-107 | requests | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the requests module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-108 | requests | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the requests module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-109 | requests | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the requests module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-110 | requests | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the requests module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-111 | handovers | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the handovers module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-112 | handovers | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the handovers module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-113 | handovers | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the handovers module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-114 | handovers | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the handovers module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-115 | handovers | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the handovers module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-116 | handovers | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the handovers module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-117 | handovers | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the handovers module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-118 | handovers | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the handovers module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-119 | handovers | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the handovers module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-120 | accidents | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the accidents module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-121 | accidents | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the accidents module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-122 | accidents | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the accidents module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-123 | accidents | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the accidents module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-124 | accidents | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the accidents module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-125 | accidents | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the accidents module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-126 | accidents | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the accidents module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-127 | accidents | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the accidents module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-128 | accidents | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the accidents module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-129 | notifications | Medium | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the notifications module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-130 | notifications | Medium | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the notifications module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-131 | notifications | Medium | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the notifications module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-132 | notifications | Medium | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the notifications module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-133 | notifications | Medium | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the notifications module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-134 | notifications | Medium | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the notifications module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-135 | notifications | Medium | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the notifications module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-136 | notifications | Medium | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the notifications module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-137 | notifications | Medium | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the notifications module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-138 | global_search | Medium | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the global_search module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-139 | global_search | Medium | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the global_search module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-140 | global_search | Medium | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the global_search module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-141 | global_search | Medium | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the global_search module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-142 | global_search | Medium | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the global_search module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-143 | global_search | Medium | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the global_search module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-144 | global_search | Medium | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the global_search module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-145 | global_search | Medium | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the global_search module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-146 | global_search | Medium | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the global_search module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-147 | export | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Export should match the UI. | Exported data exactly matches what the UI shows. |
| TM-148 | export | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Office role should not export finance data. | Finance columns/exports are unavailable to office. |
| TM-149 | export | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Empty-day export should not fail. | Empty export produces a valid, empty file without error. |
| TM-150 | export | High | Boundary and Edge Case Testing | Data Integrity | office_tenant_a | Data Integrity Agent | Special characters should export correctly. | Unicode/special characters render correctly in the export. |
| TM-151 | export | High | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the export module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-152 | export | High | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the export module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-153 | export | High | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the export module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-154 | export | High | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the export module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-155 | export | High | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the export module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-156 | export | High | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the export module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-157 | export | High | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the export module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-158 | export | High | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the export module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-159 | export | High | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the export module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-160 | user_management | Critical | Risk-Based Testing | Security | driver_tenant_a_1 | Security Abuse Agent | Apply Risk-Based Testing to the user_management module: explore for security concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-161 | user_management | Critical | Charter-Based Exploratory Testing | Business Flow | admin_tenant_a | Business Flow Agent | Apply Charter-Based Exploratory Testing to the user_management module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-162 | user_management | Critical | Happy Path + Sad Path | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Happy Path + Sad Path to the user_management module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-163 | user_management | Critical | Role-Based Testing | Auth & RBAC | office_tenant_a | Auth & RBAC Agent | Apply Role-Based Testing to the user_management module: explore for auth & rbac concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-164 | user_management | Critical | Boundary and Edge Case Testing | Forms & Validation | office_tenant_a | Forms & Validation Agent | Apply Boundary and Edge Case Testing to the user_management module: explore for forms & validation concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-165 | user_management | Critical | Data Integrity | Data Integrity | admin_tenant_a | Data Integrity Agent | Apply Data Integrity to the user_management module: explore for data integrity concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-166 | user_management | Critical | Cross-Module Effects | Business Flow | admin_tenant_a | Business Flow Agent | Apply Cross-Module Effects to the user_management module: explore for business flow concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-167 | user_management | Critical | Evidence-Based Bug Reporting | UI/UX | office_tenant_a | UI/UX Agent | Apply Evidence-Based Bug Reporting to the user_management module: explore for ui/ux concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |
| TM-168 | user_management | Critical | Regression Thinking | Regression | admin_tenant_a | Regression Agent | Apply Regression Thinking to the user_management module: explore for regression concerns and capture evidence. | Behavior matches Fleet business rules and the role's allowed/forbidden actions; no data leak or loss. |

## Evidence Required Per Scenario

- **TM-001** (auth): Screenshot of the UI state, Network/API request and response
- **TM-002** (auth): Screenshot of the UI state, Network/API request and response
- **TM-003** (auth): Screenshot of the UI state, Network/API request and response
- **TM-004** (auth): Screenshot of the UI state, Network/API request and response
- **TM-005** (auth): Screenshot of the UI state, Network/API request and response
- **TM-006** (auth): Screenshot of the UI state, Network/API request and response
- **TM-007** (auth): Screenshot of the UI state, Network/API request and response
- **TM-008** (auth): Screenshot of the UI state, Network/API request and response
- **TM-009** (auth): Screenshot of the UI state, Network/API request and response
- **TM-010** (auth): Screenshot of the UI state, Network/API request and response
- **TM-011** (auth): Screenshot of the UI state, Network/API request and response
- **TM-012** (auth): Screenshot of the UI state, Network/API request and response
- **TM-013** (auth): Screenshot of the UI state, Network/API request and response
- **TM-014** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-015** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-016** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-017** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-018** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-019** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-020** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-021** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-022** (dashboard): Screenshot of the UI state, Network/API request and response
- **TM-023** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-024** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-025** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-026** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-027** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-028** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-029** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-030** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-031** (drivers): Screenshot of the UI state, Network/API request and response
- **TM-032** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-033** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-034** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-035** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-036** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-037** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-038** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-039** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-040** (vehicles): Screenshot of the UI state, Network/API request and response
- **TM-041** (companies): Screenshot of the UI state, Network/API request and response
- **TM-042** (companies): Screenshot of the UI state, Network/API request and response
- **TM-043** (companies): Screenshot of the UI state, Network/API request and response
- **TM-044** (companies): Screenshot of the UI state, Network/API request and response
- **TM-045** (companies): Screenshot of the UI state, Network/API request and response
- **TM-046** (companies): Screenshot of the UI state, Network/API request and response
- **TM-047** (companies): Screenshot of the UI state, Network/API request and response
- **TM-048** (companies): Screenshot of the UI state, Network/API request and response
- **TM-049** (companies): Screenshot of the UI state, Network/API request and response
- **TM-050** (documents): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-051** (documents): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-052** (documents): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-053** (documents): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-054** (documents): Screenshot of the UI state, Network/API request and response
- **TM-055** (documents): Screenshot of the UI state, Network/API request and response
- **TM-056** (documents): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-057** (documents): Screenshot of the UI state, Network/API request and response
- **TM-058** (documents): Screenshot of the UI state, Network/API request and response
- **TM-059** (documents): Screenshot of the UI state, Network/API request and response
- **TM-060** (documents): Screenshot of the UI state, Network/API request and response
- **TM-061** (documents): Screenshot of the UI state, Network/API request and response
- **TM-062** (documents): Screenshot of the UI state, Network/API request and response
- **TM-063** (documents): Screenshot of the UI state, Network/API request and response
- **TM-064** (documents): Screenshot of the UI state, Network/API request and response
- **TM-065** (documents): Screenshot of the UI state, Network/API request and response
- **TM-066** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-067** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-068** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-069** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-070** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-071** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-072** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-073** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-074** (reminders): Screenshot of the UI state, Network/API request and response
- **TM-075** (einsatzplan): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-076** (einsatzplan): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-077** (einsatzplan): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-078** (einsatzplan): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-079** (einsatzplan): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-080** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-081** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-082** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-083** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-084** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-085** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-086** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-087** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-088** (einsatzplan): Screenshot of the UI state, Network/API request and response
- **TM-089** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-090** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-091** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-092** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-093** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-094** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-095** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-096** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-097** (urlaubsplaner): Screenshot of the UI state, Network/API request and response
- **TM-098** (requests): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-099** (requests): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-100** (requests): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-101** (requests): Screenshot of the UI state, Network/API request and response
- **TM-102** (requests): Screenshot of the UI state, Network/API request and response
- **TM-103** (requests): Screenshot of the UI state, Network/API request and response
- **TM-104** (requests): Screenshot of the UI state, Network/API request and response
- **TM-105** (requests): Screenshot of the UI state, Network/API request and response
- **TM-106** (requests): Screenshot of the UI state, Network/API request and response
- **TM-107** (requests): Screenshot of the UI state, Network/API request and response
- **TM-108** (requests): Screenshot of the UI state, Network/API request and response
- **TM-109** (requests): Screenshot of the UI state, Network/API request and response
- **TM-110** (requests): Screenshot of the UI state, Network/API request and response
- **TM-111** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-112** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-113** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-114** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-115** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-116** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-117** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-118** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-119** (handovers): Screenshot of the UI state, Network/API request and response
- **TM-120** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-121** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-122** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-123** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-124** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-125** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-126** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-127** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-128** (accidents): Screenshot of the UI state, Network/API request and response
- **TM-129** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-130** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-131** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-132** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-133** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-134** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-135** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-136** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-137** (notifications): Screenshot of the UI state, Network/API request and response
- **TM-138** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-139** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-140** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-141** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-142** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-143** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-144** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-145** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-146** (global_search): Screenshot of the UI state, Network/API request and response
- **TM-147** (export): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-148** (export): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-149** (export): Screenshot of the UI state, Network/API request and response
- **TM-150** (export): Screenshot of the UI state, Network/API request and response, DB record or export sample
- **TM-151** (export): Screenshot of the UI state, Network/API request and response
- **TM-152** (export): Screenshot of the UI state, Network/API request and response
- **TM-153** (export): Screenshot of the UI state, Network/API request and response
- **TM-154** (export): Screenshot of the UI state, Network/API request and response
- **TM-155** (export): Screenshot of the UI state, Network/API request and response
- **TM-156** (export): Screenshot of the UI state, Network/API request and response
- **TM-157** (export): Screenshot of the UI state, Network/API request and response
- **TM-158** (export): Screenshot of the UI state, Network/API request and response
- **TM-159** (export): Screenshot of the UI state, Network/API request and response
- **TM-160** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-161** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-162** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-163** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-164** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-165** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-166** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-167** (user_management): Screenshot of the UI state, Network/API request and response
- **TM-168** (user_management): Screenshot of the UI state, Network/API request and response
