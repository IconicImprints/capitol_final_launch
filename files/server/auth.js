import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from './database.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
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
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Create session
export async function createSession(userId, ipAddress, userAgent) {
  const token = generateToken(userId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query(
    `INSERT INTO sessions (token, user_id, created_at, expires_at, ip_address, user_agent)
     VALUES ($1, $2, NOW(), $3, $4, $5)`,
    [token, userId, expiresAt, ipAddress, userAgent]
  );

  return token;
}

// Validate session
export async function validateSession(token) {
  const payload = verifyToken(token);
  if (!payload) return null;

  const result = await query(
    `SELECT s.*, u.id, u.username, u.email, u.is_banned, u.is_suspended, u.suspension_end
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );

  if (result.rows.length === 0) return null;

  const session = result.rows[0];

  // Check if user is banned
  if (session.is_banned) {
    return null;
  }

  // Check if user is suspended
  if (session.is_suspended) {
    if (session.suspension_end && new Date(session.suspension_end) > new Date()) {
      return null;
    }
  }

  return session;
}

// Destroy session
export async function destroySession(token) {
  await query('DELETE FROM sessions WHERE token = $1', [token]);
}

// Destroy all user sessions
export async function destroyAllUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

// Clean expired sessions
export async function cleanExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < NOW()');
}

// Start cleanup interval
export function startCleanupInterval() {
  if (!process.env.VERCEL) {
    // Clean expired sessions every hour
    setInterval(cleanExpiredSessions, 60 * 60 * 1000);
  }
}