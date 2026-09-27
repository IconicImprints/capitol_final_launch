-- Migration: 003_add_grace_columns
-- Description: Add missing grace-related columns to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_used_this_month INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_last_month TEXT DEFAULT '';
