# Fleet Management System

Complete fleet management solution for logistics companies.

## Project Structure

```
Fleet/
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # Authentication module
│   │   ├── drivers/        # Driver management
│   │   ├── vehicles/       # Vehicle management
│   │   ├── assignments/    # Assignment/Einsatzplan
│   │   ├── leave-requests/ # Leave request handling
│   │   ├── documents/      # Document tracking
│   │   ├── reminders/      # Reminder system
│   │   ├── notifications/  # Notification service
│   │   ├── dashboard/      # Dashboard statistics
│   │   ├── roles/          # Role management
│   │   ├── departments/    # Department management
│   │   ├── users/          # User management
│   │   ├── common/         # Common utilities
│   │   ├── prisma/         # Database service
│   │   ├── app.module.ts   # Main module
│   │   └── main.ts         # Entry point
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Database seed
│   └── package.json
│
├── frontend/                # Next.js Admin Panel
│   ├── pages/
│   │   ├── login.tsx       # Login page
│   │   ├── dashboard.tsx   # Dashboard
│   │   ├── drivers/        # Drivers management
│   │   ├── vehicles/       # Vehicles management
│   │   ├── assignments/    # Assignments
│   │   ├── leave-requests/ # Leave requests
│   │   └── reminders/      # Reminders
│   ├── components/
│   │   ├── layout/         # Layout components
│   │   └── ui/             # UI components
│   ├── lib/
│   │   ├── api.ts          # API client
│   │   └── services.ts     # API services
│   ├── styles/
│   └── package.json
│
├── 00_PROJECT_OVERVIEW.md
├── 01_DATABASE_SCHEMA.md
├── 02_ARCHITECTURE.md
├── 03_API_SPECIFICATION.md
├── 04_STATE_MACHINES.md
├── 05_UI_WIREFRAMES.md
├── 06_NOTIFICATION_RULES.md
├── 07_PERMISSIONS_AND_ROLES.md
├── docker-compose.yml
└── README.md
```

## Tech Stack

**Backend:**
- NestJS 10
- PostgreSQL 16
- Prisma ORM
- JWT Authentication
- Passport.js

**Frontend:**
- Next.js 14
- React 18
- Tailwind CSS
- Axios
- TypeScript

**DevOps:**
- Docker & Docker Compose
- PostgreSQL Alpine

## Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (if running locally)

### Local Development

#### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Setup database
npm run prisma:migrate
npm run prisma:seed

# Start development server
npm run start:dev
```

Backend will run on `http://localhost:3000`

#### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev
```

Frontend will run on `http://localhost:3001`

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Services:
- Frontend: http://localhost:3001
- Backend: http://localhost:3000
- PostgreSQL: localhost:5432

## Test Credentials

- **Admin:** admin@fleet.com / admin123
- **Manager:** manager@fleet.com / manager123
- **Driver:** ali@fleet.com / driver123

## Key Features

### MVP Phase 1
- ✅ User authentication with JWT
- ✅ Role-based access control (Admin, Fleet Manager, Driver, HR)
- ✅ Driver management (CRUD, licenses, passports)
- ✅ Vehicle management (CRUD, TÜV, SP tracking)
- ✅ Assignment/Einsatzplan management
- ✅ Leave request handling
- ✅ Document expiry tracking
- ✅ Automated reminders (7, 30, 60, 90 days)
- ✅ Dashboard with statistics
- ✅ Notification system

### Future Features (Phase 2+)
- GPS live tracking
- Work sessions and Feierabend logic
- Messenger system
- Multi-language support
- Accident reporting
- Cargo incident reporting
- Email automation
- Salary integration

## API Endpoints

Base URL: `/api/v1`

### Authentication
- `POST /auth/signin` - User login
- `GET /auth/me` - Get current user

### Drivers
- `GET /drivers` - Get all drivers
- `POST /drivers` - Create driver
- `GET /drivers/:id` - Get driver details
- `PUT /drivers/:id` - Update driver
- `DELETE /drivers/:id` - Delete driver

### Vehicles
- `GET /vehicles` - Get all vehicles
- `POST /vehicles` - Create vehicle
- `GET /vehicles/:id` - Get vehicle details
- `PUT /vehicles/:id` - Update vehicle
- `DELETE /vehicles/:id` - Delete vehicle

### Assignments
- `GET /assignments` - Get all assignments
- `POST /assignments` - Create assignment
- `PUT /assignments/:id` - Update assignment
- `DELETE /assignments/:id` - Delete assignment

### Leave Requests
- `GET /leave-requests` - Get all leave requests
- `POST /leave-requests` - Create leave request
- `PUT /leave-requests/:id/approve` - Approve leave
- `PUT /leave-requests/:id/reject` - Reject leave

### Dashboard
- `GET /dashboard` - Get dashboard statistics

### Reminders
- `GET /reminders` - Get all reminders

### Notifications
- `GET /notifications` - Get notifications
- `PUT /notifications/:id/read` - Mark as read

## Database Schema

Key entities:
- `users` - System users
- `roles` - User roles (admin, fleet_manager, driver, hr)
- `departments` - Company departments
- `drivers` - Driver profiles
- `vehicles` - Vehicle information
- `assignments` - Driver-vehicle assignments
- `leave_requests` - Leave/sick leave requests
- `documents` - Document metadata
- `reminders` - Expiry reminders
- `notifications` - User notifications

## Development

### Code Quality
```bash
# Backend
cd backend
npm run lint
npm run format

# Frontend
cd frontend
npm run lint
npm run format
```

### Testing
```bash
# Backend
cd backend
npm run test

# Frontend
cd frontend
npm run test
```

## Deployment

### Production Environment Variables

**Backend (.env):**
```
DATABASE_URL=postgresql://user:pass@host:5432/fleet
JWT_SECRET=your_strong_secret_key
JWT_EXPIRY=3600
PORT=3000
NODE_ENV=production
API_URL=https://api.yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

## Documentation

- [Project Overview](./00_PROJECT_OVERVIEW.md)
- [Database Schema](./01_DATABASE_SCHEMA.md)
- [Architecture](./02_ARCHITECTURE.md)
- [API Specification](./03_API_SPECIFICATION.md)
- [State Machines](./04_STATE_MACHINES.md)
- [UI Wireframes](./05_UI_WIREFRAMES.md)
- [Notification Rules](./06_NOTIFICATION_RULES.md)
- [Permissions & Roles](./07_PERMISSIONS_AND_ROLES.md)

## License

UNLICENSED

## Support

For issues and questions, please refer to the documentation files or contact the development team.
