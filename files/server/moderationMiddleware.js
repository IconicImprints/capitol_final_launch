/**
 * Moderation Middleware
 * Express middleware for automated content moderation
 */

import { moderateContent, CONTENT_TYPES, ACTIONS } from './moderation.js';

/**
 * Middleware to moderate text content before it's processed
 * Use this for endpoints that accept user-generated text
 */
function moderateText(contentType) {
  return async (req, res, next) => {
    // Skip moderation for admin users
    if (req.user && req.user.is_admin) {
      return next();
    }
    
    try {
      const userId = req.user?.id;
      let contentToModerate = null;
      let contentId = null;
      
      // Extract content based on request body and content type
      switch (contentType) {
        case CONTENT_TYPES.USERNAME:
          contentToModerate = req.body.username;
          contentId = userId;
          break;
        
        case CONTENT_TYPES.DISPLAY_NAME:
          contentToModerate = req.body.display_name;
          contentId = userId;
          break;
        
        case CONTENT_TYPES.BIO:
          contentToModerate = req.body.bio;
          contentId = userId;
          break;
        
        case CONTENT_TYPES.ROOM_MESSAGE:
          contentToModerate = req.body.message || req.body.text;
          contentId = req.body.messageId || req.body.id;
          break;
        
        case CONTENT_TYPES.TEAM_MISSION:
          contentToModerate = req.body.mission || req.body.description || req.body.goal;
          contentId = req.body.missionId || req.body.id;
          break;
        
        default:
          contentToModerate = req.body.content || req.body.text;
          contentId = req.body.id;
      }
      
      // If no content to moderate, proceed
      if (!contentToModerate || typeof contentToModerate !== 'string') {
        return next();
      }
      
      // Run moderation
      const result = await moderateContent({
        userId,
        content: contentToModerate,
        contentType,
        contentId,
        context: { endpoint: req.path }
      });
      
      // Store moderation result on request for later use
      req.moderationResult = result;
      
      // If content is not allowed, block the request
      if (!result.allowed) {
        return res.status(403).json({
          error: result.userMessage || 'Content violates community guidelines',
          moderation: {
            action: result.action,
            severity: result.severity,
            eventId: result.eventId
          }
        });
      }
      
      // Proceed with the request
      next();
      
    } catch (error) {
      console.error('Moderation middleware error:', error);
      // Fail open - allow request if moderation fails
      next();
    }
  };
}

/**
 * Middleware to check if user is suspended or banned
 * This should be used after authentication middleware
 */
function checkAccountStatus(req, res, next) {
  if (!req.user) {
    return next(); // No user, proceed (for optional auth)
  }
  
  if (req.user.is_banned) {
    return res.status(403).json({
      error: 'Account has been banned',
      reason: req.user.suspend_reason || 'Violation of community guidelines'
    });
  }
  
  if (req.user.is_suspended) {
    // Check if suspension has expired
    if (req.user.suspension_end && new Date(req.user.suspension_end) < new Date()) {
      // Suspension expired, allow but could be handled by a separate endpoint
      return next();
    }
    
    return res.status(403).json({
      error: 'Account is temporarily suspended',
      reason: req.user.suspend_reason || 'Violation of community guidelines',
      suspensionEnd: req.user.suspension_end
    });
  }
  
  next();
}

/**
 * Middleware for rate limiting moderation-sensitive endpoints
 */
function createModerationRateLimiter(maxRequests = 10, windowMs = 60000) {
  const requestCounts = new Map();
  
  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [key, data] of requestCounts.entries()) {
      if (data.timestamp < windowStart) {
        requestCounts.delete(key);
      }
    }
    
    // Get current count
    const current = requestCounts.get(userId) || { count: 0, timestamp: now };
    
    if (current.timestamp < windowStart) {
      current.count = 0;
      current.timestamp = now;
    }
    
    current.count++;
    requestCounts.set(userId, current);
    
    if (current.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        retryAfter: Math.ceil((current.timestamp + windowMs - now) / 1000)
      });
    }
    
    next();
  };
}

export {
  moderateText,
  checkAccountStatus,
  createModerationRateLimiter
};
