# Fleet ERP - Quick Start Guide

# 🚀 Quick Start

Recommended:

Docker setup

---

# 1. Project Structure

fleet-erp/

frontend/

backend/

database/

docs/

---

# 2. Tech Stack

Frontend:

- Next.js
- React
- TypeScript
- Tailwind
- shadcn/ui

Backend:

- NestJS
- Prisma ORM
- JWT Authentication

Database:

- PostgreSQL

Development:

- Docker
- Docker Compose

---

# 3. Run Using Docker

Start all services:

```bash
docker-compose up -d
```

Check containers:

```bash
docker ps
```

Expected:

frontend

backend

postgres

---

# 4. Backend Setup

Go to backend:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

Copy env:

```bash
cp .env.example .env
```

Environment:

```env
DATABASE_URL="postgresql://fleet:fleet123@localhost:5432/fleet"

JWT_SECRET="secret"

PORT=3000
```

Generate Prisma:

```bash
npx prisma generate
```

Run migrations:

```bash
npx prisma migrate dev
```

Seed database:

```bash
npm run seed
```

Start development:

```bash
npm run start:dev
```

Backend:

```txt
http://localhost:3000
```

---

# 5. Frontend Setup

Go to frontend:

```bash
cd frontend
```

Install:

```bash
npm install
```

Copy env:

```bash
cp .env.example .env
```

Frontend environment:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

Run:

```bash
npm run dev
```

Frontend:

```txt
http://localhost:3001
```

---

# 6. Test Users

Admin

```txt
Email:

admin@fleet.com

Password:

admin123
```

Boss

```txt
Email:

boss@fleet.com

Password:

boss123
```

Accounting

```txt
Email:

accounting@fleet.com

Password:

accounting123
```

Office

```txt
Email:

office@fleet.com

Password:

office123
```

Driver

```txt
Email:

driver@fleet.com

Password:

driver123
```

---

# 7. API Test

Login:

POST

```txt
/api/v1/auth/login
```

Body:

```json
{
"email":"admin@fleet.com",
"password":"admin123"
}
```

Response:

```json
{
"access_token":"..."
}
```

Get drivers:

```txt
GET

/api/v1/drivers
```

Header:

```txt
Authorization:

Bearer token
```

---

# 8. Database Creation Order

Recommended:

1 users

2 drivers

3 vehicles

4 companies

5 assignments

6 transport_requests

7 calendar_events

8 documents

9 notifications

10 reminders

11 vehicle_handovers

12 vehicle_equipment

13 accidents

14 leave_requests

15 service_records

16 company_emails

---

# 9. Common Commands

Backend:

```bash
npm run start:dev

npm run build

npm run lint

npm run prisma:generate

npm run prisma:migrate

npm run prisma:studio
```

Frontend:

```bash
npm run dev

npm run build

npm run lint
```

---

# 10. Troubleshooting

Port already in use:

Backend:

```bash
lsof -i :3000
kill -9 PID
```

Frontend:

```bash
lsof -i :3001
kill -9 PID
```

Database issues:

```bash
npx prisma generate

npx prisma migrate reset
```

---

# 11. MVP Checklist

Authentication

Drivers

Vehicles

Companies

Documents

Assignments

Transport Requests

Calendar

Vehicle Handovers

Accidents

Notifications

Dashboard

Global Search

---

# 12. Future V2

GPS Tracking

AI Route Optimization

Messenger

OCR Document Reading

Warehouse Module

Customer Portal

Payroll

AI Assistant