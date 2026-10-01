# Capitol Production Deployment Guide

## Architecture Overview

Capitol uses a Supabase-based backend (PostgreSQL) designed for scalability to ~80k monthly active users.

### Technology Stack
- **Frontend**: React + Vite
- **Backend**: Node.js + Express (files/server/index.js)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT tokens with bcrypt password hashing + Supabase Auth
- **Storage**: Supabase Storage
- **Security**: Rate limiting, helmet headers, input validation, content moderation
- **Transactions**: ACID-compliant database operations via Supabase RPC

## Local Development Setup

### 1. Install Dependencies

```bash
cd files
npm install
cd server
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` in `files/` and `files/server/` and configure:

```bash
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret

# JWT Secret (for custom session management)
JWT_SECRET=generate_random_32_char_string

# Server Configuration
PORT=3001
NODE_ENV=development

# Frontend Supabase Configuration (must match SUPABASE_URL and SUPABASE_ANON_KEY)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Apply Database Schema

Apply the schema from `supabase_complete_schema.sql` in your Supabase dashboard SQL editor.

### 4. Start Development Server

```bash
# From project root
npm run dev

# Or from files/
npm run dev
```

The backend will start on `http://localhost:3001` and the frontend on `http://localhost:5173`.

## Production Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import the project in Vercel
3. Set the following environment variables in Vercel project settings:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=your-jwt-secret
JWT_SECRET=your-production-jwt-secret-32-chars
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

4. Deploy

Vercel will:
- Build the frontend (`files/dist`)
- Deploy the API as a serverless function (`api/index.js` -> `files/server/index.js`)

### Database Setup

1. Create a Supabase project at https://supabase.com
2. Apply the schema from `supabase_complete_schema.sql` in the SQL editor
3. Configure authentication settings in Supabase dashboard
4. Set up storage buckets: `profile-pictures`, `banners`, `proofs`, `uploads`

### Environment Variables

Required for production:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
JWT_SECRET=your_production_jwt_secret_32_chars
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com
```

## Database Schema

The schema includes:

### Core Tables
- `users` - User accounts with XP, streaks, settings
- `sessions` - JWT token management
- `rooms` - Room configuration
- `room_members` - Room membership with status tracking
- `proofs` - Daily proof submissions
- `streaks` - Streak tracking
- `achievements` - Achievement definitions
- `user_achievements` - User achievement unlocks

### Social Tables
- `follows` - User follows
- `close_friends` - Close friendships
- `close_friend_requests` - Friend requests
- `challenges` - User challenges

### Game State Tables
- `notifications` - User notifications
- `freeze_tokens` - Grace period tokens
- `waiting_queue` - AutoMatch queue
- `replacement_queue` - Room replacement queue
- `config` - System configuration
- `activity_log` - XP/streak tracking

## Security Features

### Authentication
- bcrypt password hashing (10 rounds)
- JWT tokens with 7-day expiration
- Session validation against database
- Automatic session cleanup

### Rate Limiting
- General: 100 requests per 15 minutes per IP
- Auth: 5 requests per 15 minutes per IP
- Proofs: 1 submission per 24 hours per user

### Security Headers
- Helmet middleware for security headers
- CORS configured for production domain
- Content validation on uploads

### Authorization
- User-level authentication for protected routes
- Admin-only routes with `requireAdmin` middleware
- User isolation - users can only access their own data

## Scalability Features

### Database
- Supabase PostgreSQL with connection pooling
- Indexed lookups on all foreign keys
- Pagination on list endpoints
- Efficient queries with JOINs instead of N+1
- Transaction support for atomic operations via Supabase RPC

### Stateless API
- No in-memory state
- Multiple instances can run behind a load balancer
- Session state stored in database

### Error Handling
- Centralized error handling middleware
- Proper HTTP status codes
- Database error translation
- Request logging for debugging

## Monitoring & Maintenance

### Health Checks
- `/api/health` endpoint checks database connectivity
- Request logging with duration tracking
- Error logging with context

### Regular Maintenance
- Clean expired sessions (runs every hour via `startCleanupInterval`)
- Archive old proofs (implement cleanup job)
- Monitor database performance
- Check connection pool usage

## Backup Strategy

### Supabase Backups
- Supabase provides daily automated backups
- Point-in-time recovery available
- Test restoration process

### Storage
- Supabase Storage has built-in durability
- Enable versioning for important uploads

## API Contract

The backend maintains the following API contract with the frontend:

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/me` - Get current user
- `PATCH /api/users/me` - Update current user
- `POST /api/users/follow/:targetId` - Follow user
- `DELETE /api/users/follow/:targetId` - Unfollow user

### Rooms
- `GET /api/rooms` - List rooms
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms` - Create room
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/leave` - Leave room
- `POST /api/rooms/:id/kick` - Kick user from room

### Proofs
- `GET /api/proofs` - List proofs
- `POST /api/images/upload` - Upload proof image
- `POST /api/proofs` - Submit proof

### Notifications
- `GET /api/notifications` - Get notifications
- `POST /api/notifications` - Create notification
- `POST /api/notifications/read` - Mark notifications read

### Economy
- `GET /api/leaderboard` - Get leaderboard
- `POST /api/economy/xp` - Update XP
- `GET /api/economy/freeze-tokens` - Get freeze tokens
- `POST /api/economy/buy-freeze` - Buy freeze token
- `POST /api/economy/use-freeze` - Use freeze token

### Queue System
- `POST /api/waiting-queue/join` - Join AutoMatch queue
- `DELETE /api/waiting-queue/leave` - Leave queue
- `GET /api/waiting-queue/status` - Get queue status

### Referrals
- `GET /api/referrals/code/:code` - Check invite code
- `POST /api/referrals/process` - Process referral

### Admin
- `POST /api/admin/check-inactivity` - Run inactivity check
- `GET /api/admin/config` - Get system config
- `PATCH /api/admin/config` - Update system config

## Testing

Run backend tests:

```bash
cd files/server
npm test
```

## Troubleshooting

### Database Connection Issues
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly
- Check Supabase project status
- Verify RLS policies are configured correctly

### Migration Failures
- Check database user permissions
- Verify schema compatibility
- Review migration logs in Supabase dashboard

### Performance Issues
- Check Supabase connection pool usage
- Analyze slow queries in Supabase dashboard
- Verify indexes are being used

## API Contract

The backend maintains the existing API contract with the frontend:

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Users
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user by ID
- `PATCH /api/users/me` - Update current user
- `POST /api/users/follow/:targetId` - Follow user
- `DELETE /api/users/follow/:targetId` - Unfollow user

### Rooms
- `GET /api/rooms` - List rooms
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms` - Create room
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/leave` - Leave room
- `POST /api/rooms/:id/kick` - Kick user from room

### Proofs
- `GET /api/proofs` - List proofs
- `POST /api/files/upload` - Upload proof image
- `POST /api/proofs` - Submit proof

### Notifications
- `GET /api/notifications` - Get notifications
- `POST /api/notifications` - Create notification
- `POST /api/notifications/read` - Mark notifications read

### Economy
- `GET /api/leaderboard` - Get leaderboard
- `POST /api/economy/xp` - Update XP
- `GET /api/economy/freeze-tokens` - Get freeze tokens
- `POST /api/economy/buy-freeze` - Buy freeze token
- `POST /api/economy/use-freeze` - Use freeze token

### Queue System
- `POST /api/waiting-queue/join` - Join AutoMatch queue
- `DELETE /api/waiting-queue/leave` - Leave queue
- `GET /api/waiting-queue/status` - Get queue status

### Referrals
- `GET /api/referrals/code/:code` - Check invite code
- `POST /api/referrals/process` - Process referral

### Admin
- `POST /api/admin/check-activity` - Run activity check
- `GET /api/admin/config` - Get system config
- `PATCH /api/admin/config` - Update system config

## Testing

Run backend tests:

```bash
cd server
npm test
```

Tests cover:
- Database connectivity
- User signup
- Room creation
- Room membership
- XP updates
- Proof submission
- Transaction rollback

## Upgrade Path

The old JSON-based backend is preserved in `server/index.js` (renamed) for comparison. The new PostgreSQL backend is in `server/index_new.js` and should be renamed to `server/index.js` for production use.

To switch:
1. Backup existing data (if any)
2. Run database migrations
3. Update environment variables
4. Deploy new backend
5. Monitor for issues
6. Keep old backend as fallback initially