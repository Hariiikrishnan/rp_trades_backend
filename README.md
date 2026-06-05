# RP Trades App Backend

This is the backend for the RP Trades Technician Management App, reverse-engineered from the Flutter UI codebase.

## Tech Stack
- **Node.js & Express**: Core framework
- **PostgreSQL**: Primary database
- **Prisma ORM**: Database management and type safety
- **JWT**: Authentication & Authorization
- **FCM**: Push Notifications (Structure ready)
- **Multer**: Local file storage for signatures, images, and reports

## Project Structure
- `src/controllers`: Business logic for each role
- `src/routes`: API endpoint definitions
- `src/middleware`: Auth and role-based access control
- `src/prisma`: Database client and schema
- `src/services`: Notification and external services
- `uploads/`: Local storage for assets

## Setup Instructions
1. **Environment Variables**: Create a `.env` file
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/rp_trades"
   JWT_SECRET="your_secret"
   JWT_REFRESH_SECRET="your_refresh_secret"
   PORT=3000
   ```
2. **Install Dependencies**: `npm install`
3. **Database Migration**: `npx prisma migrate dev`
4. **Start Server**: `npm start`

## API Endpoints
### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/fcm-token` (Authenticated)

### Customer
- `GET /api/customer/profile`
- `POST /api/customer/complaints`
- `GET /api/customer/complaints/history`

### Admin
- `GET /api/admin/dashboard`
- `POST /api/admin/assign`
- `GET /api/admin/technicians`

### Technician
- `GET /api/technician/jobs`
- `POST /api/technician/reports`
- `PATCH /api/technician/jobs/status`
