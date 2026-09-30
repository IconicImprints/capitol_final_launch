# Environment Variables Security Guide

## Browser-Safe Variables (Can be exposed to frontend)

These variables are safe to expose to the browser bundle and should use the `VITE_` prefix for Vite:

### Frontend Configuration
- `VITE_SUPABASE_URL` - Supabase project URL (public)
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (designed for public use)
- `VITE_POSTHOG_KEY` - PostHog API key (public analytics key)
- `VITE_POSTHOG_HOST` - PostHog API host (public)
- `VITE_API_URL` - API base URL (development only)

## Server-Only Secrets (NEVER expose to frontend)

These variables must NEVER be exposed to the browser and should only be used server-side:

### Database Credentials
- `POSTGRES_URL` - PostgreSQL connection string
- `POSTGRES_URL_NON_POOLING` - PostgreSQL connection string (non-pooling)
- `POSTGRES_PRISMA_URL` - PostgreSQL connection string (Prisma format)
- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password

### Authentication Secrets
- `JWT_SECRET` - JWT signing secret (CRITICAL)
- `SUPABASE_JWT_SECRET` - Supabase JWT secret (CRITICAL)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (CRITICAL - admin access)

### Storage Credentials
- `S3_ACCESS_KEY_ID` - AWS S3 access key
- `S3_SECRET_ACCESS_KEY` - AWS S3 secret key
- `S3_BUCKET` - S3 bucket name
- `S3_REGION` - S3 region
- `S3_ENDPOINT` - S3 endpoint URL

### Deployment Secrets
- `VERCEL_OIDC_TOKEN` - Vercel OIDC token (auto-set by Vercel)

## Security Rules

1. **Never** use server-side secrets in frontend code
2. **Always** use `VITE_` prefix for frontend variables
3. **Never** commit real secrets to git
4. **Always** use `.env.local` for local development
5. **Always** set production secrets in deployment platform (Vercel, etc.)
6. **Never** use development secrets in production

## Vercel Environment Variables Setup

### Browser Variables (set in Vercel project settings)
- `VITE_SUPABASE_URL` = your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
- `VITE_POSTHOG_KEY` = your PostHog key (optional)
- `VITE_POSTHOG_HOST` = your PostHog host (optional)

### Server Variables (set in Vercel project settings)
- `POSTGRES_URL` = your PostgreSQL connection string
- `JWT_SECRET` = your generated JWT secret
- `SUPABASE_JWT_SECRET` = your Supabase JWT secret
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key
- `S3_ACCESS_KEY_ID` = your AWS access key
- `S3_SECRET_ACCESS_KEY` = your AWS secret key
- `S3_BUCKET` = your S3 bucket name
- `S3_REGION` = your S3 region
- `NODE_ENV` = `production`

## Local Development Setup

1. Copy `.env.example` to `.env.local`
2. Fill in development values (can use insecure values for local dev)
3. Never commit `.env.local`
4. Use different values for production

## Verification

To verify secrets are not exposed to frontend:
1. Run production build: `npm run build`
2. Check built files in `dist/` directory
3. Search for server secrets in built files
4. Ensure only `VITE_` prefixed variables appear in bundle