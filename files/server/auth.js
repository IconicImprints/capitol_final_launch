import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from './database.js';

// JWT Secret Configuration (for compatibility with existing frontend)
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

// Production requires JWT_SECRET - fail fast if missing
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is required in production. Server cannot start without it.');
}

// Development fallback with clear warning
let effectiveJWTSecret = JWT_SECRET;
if (!effectiveJWTSecret && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️  SECURITY WARNING: Using insecure development JWT_SECRET fallback.');
  console.warn('⚠️  This MUST be replaced with a proper JWT_SECRET in production.');
  effectiveJWTSecret = 'dev-secret-key-do-not-use-in-production-insecure';
}

// Password hashing with bcrypt
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Password verification
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Generate JWT token
export function generateToken(userId) {
  return jwt.sign(
    { userId },
    effectiveJWTSecret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, effectiveJWTSecret);
  } catch (error) {
    return null;
  }
}

// Create session (compatibility layer - will be phased out for Supabase Auth)
export async function createSession(userId, ipAddress, userAgent) {
  const token = generateToken(userId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Store session in Supabase for compatibility
  try {
    await supabase.from('sessions').insert([{
      token,
      user_id: userId,
      created_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent
    }]);
  } catch (error) {
    console.error('[Auth] Failed to create session in Supabase:', error);
  }

  return token;
}

// Validate session (compatibility layer)
export async function validateSession(token) {
  const payload = verifyToken(token);
  if (!payload) return null;

  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, users(*)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) return null;

    const session = data;

    // Check if user is banned
    if (session.users?.is_banned) {
      return null;
    }

    // Check if user is suspended
    if (session.users?.is_suspended) {
      if (session.users.suspension_end && new Date(session.users.suspension_end) > new Date()) {
        return null;
      }
    }

    return session;
  } catch (error) {
    console.error('[Auth] Session validation error:', error);
    return null;
  }
}

// Destroy session
export async function destroySession(token) {
  try {
    await supabase.from('sessions').delete().eq('token', token);
  } catch (error) {
    console.error('[Auth] Failed to destroy session:', error);
  }
}

// Destroy all user sessions
export async function destroyAllUserSessions(userId) {
  try {
    await supabase.from('sessions').delete().eq('user_id', userId);
  } catch (error) {
    console.error('[Auth] Failed to destroy user sessions:', error);
  }
}

// Clean expired sessions
export async function cleanExpiredSessions() {
  try {
    await supabase
      .from('sessions')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch (error) {
    console.error('[Auth] Failed to clean expired sessions:', error);
  }
}

// Start cleanup interval
export function startCleanupInterval() {
  if (!process.env.VERCEL) {
    // Clean expired sessions every hour
    setInterval(cleanExpiredSessions, 60 * 60 * 1000);
  }
}

// ============================================================================
// SUPABASE AUTH INTEGRATION
// These functions will eventually replace the custom JWT system
// ============================================================================

// Sign up user with Supabase Auth
export async function supabaseSignUp(email, password, userData) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    });

    if (error) throw error;

    // Create user record in our users table
    if (data.user) {
      await supabase.from('users').insert([{
        id: data.user.id,
        email: email.toLowerCase(),
        username: userData.username,
        display_name: userData.display_name,
        password_hash: await hashPassword(password), // Keep for compatibility
        ...userData
      }]);
    }

    return data;
  } catch (error) {
    console.error('[Auth] Supabase signup error:', error);
    throw error;
  }
}

// Sign in user with Supabase Auth
export async function supabaseSignIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('[Auth] Supabase signin error:', error);
    throw error;
  }
}

// Sign out user from Supabase Auth
export async function supabaseSignOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('[Auth] Supabase signout error:', error);
    throw error;
  }
}

// Get current Supabase user
export async function supabaseGetUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('[Auth] Supabase get user error:', error);
    return null;
  }
}
