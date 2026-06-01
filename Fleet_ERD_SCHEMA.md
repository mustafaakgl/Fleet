1. One driver cannot have overlapping assignments.

2. One vehicle cannot have overlapping assignments.

3. Driver cannot receive assignment if:
    - UT
    - KT
    - inactive

4. Vehicle cannot receive assignment if:
    - maintenance
    - inactive
    - broken

5. Transport request approval:

Transport Request
        ↓
Create Assignment
        ↓
Create AT calendar event
        ↓
Update Driver History
        ↓
Update Vehicle History
        ↓
Update Company History
        ↓
Create Notification

6. Vehicle handover photo:

If:

previous_vehicle == current_vehicle

→ no photo required

Else:

→ handover photo required

7. Risk score:

1 accident → Green

2 accidents → Yellow

3+ accidents → Red

8. Revenue:

Visible only:

- admin
- boss
- accounting