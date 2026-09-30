# Capitol Production Deployment Guide

## Architecture Overview

Capitol now uses a PostgreSQL-based backend designed for scalability to ~80k monthly active users.

### Technology Stack
- **Backend**: Node.js + Express
- **Database**: PostgreSQL with connection pooling
- **Authentication**: JWT tokens with bcrypt password hashing
- **Storage**: Local filesystem (dev) / S3-compatible (production)
- **Security**: Rate limiting, helmet headers, input validation
- **Transactions**: ACID-compliant database operations

## Local Development Setup

### 1. Install PostgreSQL

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download from https://www.postgresql.org/download/windows/

### 2. Create Database

```bash
psql -U postgres
CREATE DATABASE capitol;
CREATE USER capitol_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE capitol TO capitol_user;
\q
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=capitol
DB_USER=capitol_user
DB_PASSWORD=your_password
JWT_SECRET=generate_random_32_char_string
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
PORT=3001
```

### 4. Install Dependencies

```bash
cd /workspaces/capitol_final_launch/files
npm install
cd server
npm install
```

### 5. Run Migrations

The backend automatically runs migrations on startup, but you can also run them manually:

```bash
psql -U capitol_user -d capitol -f server/migrations/001_initial_schema.sql
```

### 6. Start Development Server

```bash
npm run dev
```

The backend will start on `http://localhost:3001` and the frontend on `http://localhost:5173`.

## Production Deployment

### 1. PostgreSQL Database Setup

**Option A: Managed PostgreSQL (Recommended)**
- AWS RDS
- Google Cloud SQL
- Azure Database for PostgreSQL
- DigitalOcean Managed Databases
- Railway
- Neon (serverless PostgreSQL)

**Option B: Self-Hosted PostgreSQL**
- Use a VPS with sufficient resources
- Configure PostgreSQL for production settings
- Set up regular backups
- Configure connection pooling

### 2. Configure Production Environment Variables

Set these in your hosting platform (Vercel, Railway, etc.):

```
DB_HOST=your-db-host.rds.amazonaws.com
DB_PORT=5432
DB_NAME=capitol
DB_USER=capitol_user
DB_PASSWORD=your_secure_password
JWT_SECRET=your_production_jwt_secret_32_chars
STORAGE_PROVIDER=s3
S3_BUCKET=capitol-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your_aws_access_key
S3_SECRET_ACCESS_KEY=your_aws_secret_key
S3_ENDPOINT=https://s3.amazonaws.com
PORT=3001
NODE_ENV=production
```

### 3. S3 Storage Setup

1. Create an S3 bucket named `capitol-uploads`
2. Configure CORS policy for your domain
3. Create IAM user with programmatic access
4. Attach policy allowing:
   - `s3:PutObject`
   - `s3:GetObject`
   - `s3:DeleteObject`
5. Use the access key and secret in environment variables

### 4. Vercel Deployment

Update `vercel.json` to use the new backend:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install && npm --prefix server install",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api"
    },
    {
      "source": "/uploads/(.*)",
      "destination": "/api"
    },
    {
      "source": "/((?!assets/).*)",
      "destination": "/index.html"
    }
  ]
}
```

Set environment variables in Vercel project settings.

### 5. Database Migration in Production

On first deployment, the backend will automatically run migrations. Ensure the database user has `CREATE TABLE` permissions.

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

### Indexes

All frequently queried fields are indexed:
- User lookups (username, email, invite_code)
- Room membership (room_id, user_id, status)
- Proofs (user_id, date_key, room_id)
- Notifications (user_id, read, created_at)
- Social features (from_user_id, to_user_id)

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

### Database Connection Pooling
- Max 20 concurrent connections
- 30-second idle timeout
- Automatic connection cleanup

### Performance Optimizations
- Indexed lookups on all foreign keys
- Pagination on list endpoints
- Efficient queries with JOINs instead of N+1
- Transaction support for atomic operations

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
- Clean expired sessions (implement cron job)
- Archive old proofs (implement cleanup job)
- Monitor database performance
- Check connection pool usage

## Backup Strategy

### PostgreSQL Backups
- Daily automated backups
- Point-in-time recovery support
- Backup retention policy (30 days recommended)
- Test restoration process

### S3 Backup
- S3 has built-in durability (99.999999999%)
- Enable versioning for important files
- Configure lifecycle policies for old uploads

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql -U capitol_user -d capitol -c "SELECT 1"
```

### Migration Failures
- Check database user permissions
- Verify schema compatibility
- Check for constraint violations
- Review migration logs

### Performance Issues
- Check connection pool usage
- Analyze slow queries with `EXPLAIN ANALYZE`
- Verify indexes are being used
- Check for N+1 query patterns

### Memory Issues
- Monitor connection pool size
- Check for memory leaks in long-running processes
- Profile memory usage of critical routes

## Capacity Planning

### Current Architecture Supports
- **Target**: ~80k monthly active users
- **Concurrent Users**: ~1,000 simultaneous connections
- **Database**: 20 connection pool (configurable)
- **Storage**: S3 unlimited + CDN
- **Rate Limits**: Configurable per endpoint

### Scaling Considerations
- For higher loads, increase connection pool size
- Add read replicas for query-heavy workloads
- Implement Redis for session caching
- Add CDN for static assets
- Consider microservices for specific features

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