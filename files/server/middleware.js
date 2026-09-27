import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { validateSession } from './auth.js';

// Security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: false, // Disabled for frontend compatibility
  crossOriginEmbedderPolicy: false,
});

// Rate limiting
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development if needed
    return process.env.NODE_ENV === 'development' && process.env.DISABLE_RATE_LIMIT === 'true';
  },
});

// Stricter rate limiting for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 requests per 15 minutes for auth
  message: 'Too many authentication attempts, please try again later.',
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && process.env.DISABLE_RATE_LIMIT === 'true';
  },
});

// Rate limiting for proof submission
export const proofRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1, // 1 proof per day per user
  message: 'You can only submit one proof per day.',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    if (req.user?.id) {
      return `user_${req.user.id}`;
    }
    // Use the built-in IP key generator for proper IPv6 handling
    return req.ip;
  },
});

// Authentication middleware
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const session = await validateSession(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = session;
    req.token = token;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const session = await validateSession(token);

    if (session) {
      req.user = session;
      req.token = token;
    }
    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    next(); // Continue without auth on error
  }
};

// Admin check middleware
export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// Error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === '23505') { // Unique violation
    return res.status(409).json({ error: 'Resource already exists' });
  }
  
  if (err.code === '23503') { // Foreign key violation
    return res.status(400).json({ error: 'Invalid reference to related resource' });
  }
  
  if (err.code === '23502') { // Not null violation
    return res.status(400).json({ error: 'Missing required field' });
  }

  res.status(500).json({ error: 'Internal server error' });
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
};