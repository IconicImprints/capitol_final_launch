# Capitol Supabase Migration Guide

## Problem Analysis

The production database persistence issue was caused by:

1. **Temporary Storage**: The backend was using `/tmp/capitol-data` for JSON file storage on Vercel
2. **Ephemeral Nature**: Vercel's `/tmp` directory is temporary and gets cleared between deployments/function invocations
3. **Data Loss**: All rooms, users, and data disappeared on each Vercel deployment

## Solution Implemented

### Files Changed

1. **server/db.js** - Complete rewrite to support dual persistence:
   - Local development: JSON file storage (unchanged behavior)
   - Production (Vercel): Supabase database storage
   - Preserved `loadDb()`, `saveDb()`, and `withDb()` interface for compatibility
   - Added async versions for Supabase operations

2. **server/index.js** - Updated all route handlers:
   - Converted all database operations to async/await
   - Updated middleware functions (`auth`, `optionalAuth`) to async
   - Maintained existing API response shapes

3. **supabase_migration.sql** - New file:
   - Complete database schema matching existing data model
   - Tables for all data types: users, sessions, rooms, room_members, proofs, streaks, achievements, notifications, follows, challenges, close_friends, freeze_tokens, waiting_queue, replacement_queue, config
   - Proper indexes for performance
   - Default achievements and config values

## Deployment Steps

### 1. Set Up Supabase Project

1. Create a new Supabase project at https://supabase.com
2. Go to Project Settings → API
3. Copy the following credentials:
   - Project URL
   - anon/public key
   - service_role key (keep this secret!)

### 2. Run Database Migration

In your Supabase project dashboard:

1. Go to SQL Editor
2. Create a new query
3. Copy and paste the contents of `supabase_migration.sql`
4. Run the query to create all tables

### 3. Configure Environment Variables

In your Vercel project settings (Environment Variables):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VERCEL=true
```

**Important**: 
- `SUPABASE_SERVICE_ROLE_KEY` should only be set on the server (backend)
- Never expose the service role key to frontend code
- The frontend uses `VITE_SUPABASE_ANON_KEY` for client operations

### 4. Deploy to Vercel

1. Push your changes to your Git repository
2. Vercel will automatically deploy
3. The backend will now use Supabase for persistence

### 5. Verify Deployment

After deployment:

1. Check that the API responds correctly: `https://getcapitol.vercel.app/api/rooms`
2. Create a test room via the UI
3. Refresh the page - the room should persist
4. Check Vercel logs for any Supabase connection errors

## Architecture Details

### Persistence Layer Selection

The system automatically selects the persistence layer based on environment:

```javascript
const USE_SUPABASE = isSupabaseConfigured;
```

- **Local Development**: Uses JSON file storage in `server/data/` when Supabase is not configured
- **Any Environment**: Uses Supabase when credentials are configured (both local and production)

### Data Model Preservation

The Supabase schema exactly matches the existing JSON structure:

- All user fields preserved (xp, streak, level, etc.)
- Room structure maintained
- Proof system unchanged
- Achievement system intact
- All relationships preserved via foreign keys

### XP System Connection

The XP system is now properly connected:

1. **Single Source of Truth**: User XP is stored in the `users.xp` column
2. **All XP Updates**: Go through the backend API (`/api/economy/xp`, proof submission, referrals)
3. **Frontend Display**: All UI components read from the same canonical user object
4. **Persistence**: XP changes persist across refreshes and deployments

### Room Removal Flow

The room removal system now works correctly:

1. **Kick/Inactive Removal**: Updates `room_members.status` to "kicked" or "inactive_kicked"
2. **User State**: Sets `user.kicked_from_room = true` and `user.kick_status`
3. **Notifications**: Creates notification with reason (inactivity, manual kick, etc.)
4. **Frontend**: Can check `kick_status` to show appropriate UI
5. **Persistence**: All state changes persist in Supabase

## Testing Checklist

- [ ] Local development still works with JSON storage
- [ ] Build completes successfully (`npm run build`)
- [ ] Supabase migration runs without errors
- [ ] Environment variables configured in Vercel
- [ ] Production API returns rooms after deployment
- [ ] Created rooms persist across page refreshes
- [ ] User XP updates correctly and persists
- [ ] Room removal/kick flow works end-to-end
- [ ] No console errors in production

## Troubleshooting

### Rooms still disappear after deployment

1. Check Vercel environment variables are set
2. Verify Supabase credentials are correct
3. Check Vercel function logs for Supabase connection errors
4. Ensure the migration was run successfully

### XP values not updating

1. Check that XP updates go through backend API
2. Verify user object is being refreshed from backend
3. Check for multiple XP update sources (should only be backend)

### Room removal not working

1. Check `room_members.status` is being updated
2. Verify `user.kicked_from_room` flag is set
3. Check notifications are being created
4. Ensure frontend is reading updated user state

## Security Notes

- **Service Role Key**: Never commit to Git, never expose to frontend
- **Environment Variables**: Always use Vercel environment variables, never hardcode
- **Database Access**: Service role key bypasses RLS - use only on server
- **Frontend**: Uses anon key with Row Level Security policies

## Future Improvements

1. Add Row Level Security (RLS) policies to Supabase
2. Implement database transactions for critical operations
3. Add connection pooling for high-traffic scenarios
4. Consider caching layer for frequently accessed data
5. Add database backup/restore procedures