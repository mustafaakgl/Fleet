# Fleet ERP - Permissions and Roles

Purpose:

Define role-based access control (RBAC) for Fleet ERP.

MVP Goal:

- Prevent unauthorized access
- Hide financial information
- Separate operational and management users

---

# 1. Roles

Available roles:

admin
boss
accounting
office
driver

---

# 2. Admin

Description:

Main system administrator.

Access:

✓ Full system access

Permissions:

Drivers

Vehicles

Companies

Documents

Assignments

Transport Requests

Vehicle Handovers

Notifications

Dashboard

Accidents

Cargo Damage

Revenue

Users

Settings

Can:

Create

Edit

Delete

Deactivate

Manage users

Manage roles

---

# 3. Boss

Description:

Management role.

Access:

✓ Operational
✓ Financial

Permissions:

Drivers

Vehicles

Companies

Dashboard

Documents

Notifications

Accidents

Assignments

Revenue Analytics

Reports

Can:

View all

Edit most entities

Cannot:

Manage system users

---

# 4. Accounting

Description:

Financial and contract role.

Access:

✓ Financial data

Permissions:

Companies

Revenue

Contracts

Company documents

Reports

Dashboard

Can:

View:

Revenue

Company contracts

Expected revenue

Damage value

Email history

Cannot:

Modify assignments

Modify vehicle planning

Modify drivers

---

# 5. Office

Description:

Daily operations role.

Access:

✓ Operational workflows

Permissions:

Drivers

Vehicles

Assignments

Transport Requests

Documents

Vehicle Handovers

Accidents

Notifications

Dashboard

Can:

Approve requests

Create assignments

Manage planning

Upload documents

Cannot view:

Revenue

Damage value

Expected revenue

Financial reports

Company analytics

---

# 6. Driver

Description:

Mobile app only

No admin panel access

Permissions:

Own transport requests

Own assignments

Own handover uploads

Own leave requests

Own accident reports

Can:

Submit transport request

View own assignments

Upload handover photos

Report accidents

Create leave request

Cannot:

View other drivers

View vehicles

View revenue

Access admin panel

---

# 7. Permission Matrix

| Module | Admin | Boss | Accounting | Office | Driver |
|----------|--------|-------|-------------|---------|---------|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ❌ |
| Drivers | ✓ | ✓ | Read | ✓ | Own only |
| Vehicles | ✓ | ✓ | Read | ✓ | Limited |
| Companies | ✓ | ✓ | ✓ | ✓ | ❌ |
| Documents | ✓ | ✓ | ✓ | ✓ | Own later |
| Assignments | ✓ | ✓ | Read | ✓ | Own only |
| Transport Requests | ✓ | ✓ | Read | ✓ | Own only |
| Vehicle Handovers | ✓ | ✓ | Read | ✓ | Own only |
| Accidents | ✓ | ✓ | Read | ✓ | Own only |
| Notifications | ✓ | ✓ | ✓ | ✓ | Own only |
| Revenue | ✓ | ✓ | ✓ | ❌ | ❌ |
| User Management | ✓ | ❌ | ❌ | ❌ | ❌ |

---

# 8. Financial Visibility Rules

Financial values:

Expected Revenue

Company Revenue

Damage Value

Contract Values

Analytics

Visible only:

✓ admin

✓ boss

✓ accounting

Hidden from:

✗ office

✗ driver

Implementation:

canViewFinancials(role)

Example:

```ts
function canViewFinancials(role:string){

return [

'admin',
'boss',
'accounting'

].includes(role)

}
```

---

# 9. Ownership Rules

Driver ownership:

Driver can only access:

driver.user_id == current_user.id

Examples:

GET /assignments

Return:

Only own assignments

GET /leave_requests

Return:

Only own requests

GET /accidents

Return:

Only own reports

---

# 10. Future Roles (V2)

salary_department

Permissions:

Payroll

Salary documents

Work sessions

---

accident_department

Permissions:

Accident reports

Damage workflows

Insurance documents

---

warehouse_manager

Permissions:

Inventory

Loading

Cargo tracking

---

customer_portal

Permissions:

Own shipments

Own assignments

Own documents

Own reports

---

# 11. Security Notes

Rules:

Never trust frontend permissions

Backend always validates:

JWT

Role

Ownership

Resource access

All critical endpoints:

Require:

JWT authentication

Role validation

Ownership checks where needed