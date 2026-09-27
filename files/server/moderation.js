/**
 * Capitol Moderation System
 * Automated content moderation for hate speech, harassment, and discriminatory language
 */

import { query, transaction } from './database.js';

// Severity levels
const SEVERITY = {
  SAFE: 0,
  MILD_PROFANITY: 1,
  TARGETED_HARASSMENT: 2,
  SEVERE_HATE: 3,
  REPEATED_VIOLATIONS: 4,
  PERSISTENT_ABUSE: 5
};

// Content types
const CONTENT_TYPES = {
  ROOM_MESSAGE: 'room_message',
  TEAM_MISSION: 'team_mission',
  USERNAME: 'username',
  DISPLAY_NAME: 'display_name',
  BIO: 'bio',
  PROFILE: 'profile',
  OTHER: 'other'
};

// Violation categories
const VIOLATION_CATEGORIES = {
  RACIST: 'racist',
  HATEFUL: 'hateful',
  HARASSMENT: 'harassment',
  DISCRIMINATORY: 'discriminatory',
  PROFANITY: 'profanity',
  SEVERE: 'severe'
};

// Actions that can be taken
const ACTIONS = {
  ALLOWED: 'allowed',
  REMOVED: 'removed',
  WARNING: 'warning',
  RESTRICTION: 'restriction',
  SUSPENSION: 'suspension',
  BAN: 'ban'
};

/**
 * Normalize text for moderation analysis
 * - Convert to lowercase
 * - Remove extra whitespace
 * - Remove common obfuscation patterns
 * - Handle repeated characters
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  let normalized = text.toLowerCase();
  
  // Remove common obfuscation patterns
  // Replace common separator characters with spaces
  normalized = normalized.replace(/[\._\-\*\+@#]/g, ' ');
  
  // Handle repeated characters (e.g., "hiiiitttllleeerrr" -> "hilter")
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
  
  // Remove numbers used for obfuscation (e.g., "h1tl3r" -> "htlr")
  normalized = normalized.replace(/[0-9]/g, '');
  
  // Remove extra whitespace (after other transformations)
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Check if text contains prohibited terms
 */
async function checkProhibitedTerms(normalizedText, contentType) {
  const result = await query(
    `SELECT term, category, severity, requires_context 
     FROM prohibited_terms 
     WHERE is_active = true`
  );
  
  const violations = [];
  
  for (const row of result.rows) {
    const term = row.term.toLowerCase();
    const category = row.category;
    const severity = row.severity;
    const requiresContext = row.requires_context;
    
    // Check for exact match or word boundary match
    const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const containsMatch = normalizedText.includes(term);
    const wordMatch = wordBoundaryRegex.test(normalizedText);
    
    if (containsMatch || wordMatch) {
      // For usernames, only flag if it's an exact match or major component
      if (contentType === CONTENT_TYPES.USERNAME) {
        if (normalizedText === term || normalizedText.includes(term)) {
          violations.push({
            term: row.term,
            category,
            severity,
            requiresContext,
            matchType: 'exact'
          });
        }
      } else {
        violations.push({
          term: row.term,
          category,
          severity,
          requiresContext,
          matchType: wordMatch ? 'word' : 'contains'
        });
      }
    }
  }
  
  return violations;
}

/**
 * Detect obfuscation attempts
 */
function detectObfuscation(text) {
  const obfuscationPatterns = [
    // Leetspeak patterns
    /[0-9]/g,
    // Special characters as separators
    /[\._\-\*\+@#]+/g,
    // Excessive character repetition
    /(.)\1{4,}/g,
    // Random character insertion
    /[a-z][^a-z\s]{2,}[a-z]/gi
  ];
  
  let obfuscationScore = 0;
  for (const pattern of obfuscationPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      obfuscationScore += matches.length;
    }
  }
  
  return obfuscationScore > 3; // Threshold for considering it obfuscated
}

/**
 * Classify violation severity based on detected terms and context
 */
function classifySeverity(violations, contentType, hasObfuscation) {
  if (violations.length === 0) {
    return SEVERITY.SAFE;
  }
  
  let maxSeverity = 0;
  let category = VIOLATION_CATEGORIES.PROFANITY;
  
  for (const violation of violations) {
    if (violation.severity > maxSeverity) {
      maxSeverity = violation.severity;
      category = violation.category;
    }
  }
  
  // Increase severity if obfuscation was used
  if (hasObfuscation && maxSeverity >= SEVERITY.TARGETED_HARASSMENT) {
    maxSeverity = Math.min(maxSeverity + 1, SEVERITY.PERSISTENT_ABUSE);
  }
  
  // For usernames, be more conservative
  if (contentType === CONTENT_TYPES.USERNAME && maxSeverity >= SEVERITY.SEVERE_HATE) {
    maxSeverity = SEVERITY.TARGETED_HARASSMENT; // Don't auto-ban based on username alone
  }
  
  return maxSeverity;
}

/**
 * Get user's current strike count
 */
async function getUserStrikeCount(userId) {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM user_strikes 
     WHERE user_id = $1 AND is_active = true 
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [userId]
  );
  
  return parseInt(result.rows[0].count) || 0;
}

/**
 * Get moderation configuration thresholds
 */
async function getModerationConfig() {
  const result = await query(
    `SELECT value FROM moderation_config WHERE key = 'thresholds'`
  );
  
  if (result.rows.length === 0) {
    // Default thresholds
    return {
      level_2_warning_count: 1,
      level_3_restriction_count: 2,
      level_4_suspension_count: 3,
      level_5_ban_count: 5,
      suspension_duration_hours: 24,
      strike_expiry_days: 30
    };
  }
  
  return result.rows[0].value;
}

/**
 * Determine appropriate action based on severity and user history
 */
async function determineAction(severity, userId, contentType) {
  const config = await getModerationConfig();
  const strikeCount = await getUserStrikeCount(userId);
  
  switch (severity) {
    case SEVERITY.SAFE:
      return ACTIONS.ALLOWED;
    
    case SEVERITY.MILD_PROFANITY:
      // Allow mild profanity unless it's excessive
      return ACTIONS.ALLOWED;
    
    case SEVERITY.TARGETED_HARASSMENT:
      // Remove content and issue warning
      if (strikeCount >= config.level_3_restriction_count) {
        return ACTIONS.RESTRICTION;
      }
      return ACTIONS.WARNING;
    
    case SEVERITY.SEVERE_HATE:
      // Remove content, formal warning, potential restriction
      if (strikeCount >= config.level_4_suspension_count) {
        return ACTIONS.SUSPENSION;
      }
      if (strikeCount >= config.level_3_restriction_count) {
        return ACTIONS.RESTRICTION;
      }
      return ACTIONS.WARNING;
    
    case SEVERITY.REPEATED_VIOLATIONS:
      // Temporary suspension
      return ACTIONS.SUSPENSION;
    
    case SEVERITY.PERSISTENT_ABUSE:
      // Permanent ban
      if (strikeCount >= config.level_5_ban_count) {
        return ACTIONS.BAN;
      }
      return ACTIONS.SUSPENSION;
    
    default:
      return ACTIONS.ALLOWED;
  }
}

/**
 * Create a moderation event record
 */
async function createModerationEvent(data) {
  const id = 'mod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  
  await query(
    `INSERT INTO moderation_events (
      id, user_id, content_id, content_type, violation_category,
      severity, action_taken, detection_reason, content_sample,
      automated, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [
      id,
      data.user_id,
      data.content_id || null,
      data.content_type,
      data.violation_category,
      data.severity,
      data.action_taken,
      data.detection_reason,
      data.content_sample || null,
      data.automated !== false
    ]
  );
  
  return id;
}

/**
 * Create a user strike record
 */
async function createUserStrike(userId, severity, reason, relatedEventId) {
  const config = await getModerationConfig();
  const id = 'strike_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  
  // Calculate expiry date for temporary strikes
  let expiresAt = null;
  if (severity < SEVERITY.PERSISTENT_ABUSE) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + config.strike_expiry_days);
    expiresAt = expiryDate.toISOString();
  }
  
  await query(
    `INSERT INTO user_strikes (
      id, user_id, severity, reason, related_event_id,
      expires_at, is_active, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())`,
    [id, userId, severity, reason, relatedEventId || null]
  );
  
  return id;
}

/**
 * Apply moderation action to user account
 */
async function applyModerationAction(userId, action, reason) {
  switch (action) {
    case ACTIONS.SUSPENSION:
      const config = await getModerationConfig();
      const suspensionEnd = new Date();
      suspensionEnd.setHours(suspensionEnd.getHours() + config.suspension_duration_hours);
      
      await query(
        `UPDATE users 
         SET is_suspended = true, 
             suspension_end = $1,
             suspend_reason = $2
         WHERE id = $3`,
        [suspensionEnd.toISOString(), reason, userId]
      );
      break;
    
    case ACTIONS.BAN:
      await query(
        `UPDATE users 
         SET is_banned = true, 
             suspend_reason = $1
         WHERE id = $2`,
        [reason, userId]
      );
      break;
    
    case ACTIONS.RESTRICTION:
      // Could implement specific restrictions (e.g., cannot send messages)
      // For now, we'll just flag the user
      await query(
        `UPDATE users 
         SET is_suspended = true,
             suspend_reason = $1
         WHERE id = $2`,
        [reason, userId]
      );
      break;
  }
}

/**
 * Main moderation function - analyzes content and takes appropriate action
 */
async function moderateContent({
  userId,
  content,
  contentType,
  contentId = null,
  context = {}
}) {
  try {
    // Normalize the text
    const normalizedText = normalizeText(content);
    
    // Check for prohibited terms
    const violations = await checkProhibitedTerms(normalizedText, contentType);
    
    // Detect obfuscation
    const hasObfuscation = detectObfuscation(content);
    
    // Classify severity
    const severity = classifySeverity(violations, contentType, hasObfuscation);
    
    // If safe, return early
    if (severity === SEVERITY.SAFE) {
      return {
        allowed: true,
        severity: SEVERITY.SAFE,
        action: ACTIONS.ALLOWED,
        violations: [],
        reason: 'Content passed moderation checks'
      };
    }
    
    // Determine appropriate action
    const action = await determineAction(severity, userId, contentType);
    
    // Get violation category
    const violationCategory = violations.length > 0 ? violations[0].category : VIOLATION_CATEGORIES.PROFANITY;
    
    // Create moderation event
    const detectionReason = violations.length > 0 
      ? `Detected ${violations.length} prohibited term(s): ${violations.map(v => v.term).join(', ')}`
      : 'Pattern-based detection';
    
    if (hasObfuscation) {
      detectionReason += ' (obfuscation detected)';
    }
    
    const eventId = await createModerationEvent({
      user_id: userId,
      content_id: contentId,
      content_type: contentType,
      violation_category: violationCategory,
      severity,
      action_taken: action,
      detection_reason: detectionReason,
      content_sample: content.slice(0, 500), // Store sample for review
      automated: true
    });
    
    // Create strike if action is severe
    if (severity >= SEVERITY.TARGETED_HARASSMENT) {
      await createUserStrike(userId, severity, detectionReason, eventId);
    }
    
    // Apply action to user account if needed
    if (action === ACTIONS.SUSPENSION || action === ACTIONS.BAN || action === ACTIONS.RESTRICTION) {
      await applyModerationAction(userId, action, detectionReason);
    }
    
    return {
      allowed: action === ACTIONS.ALLOWED,
      severity,
      action,
      violations,
      reason: detectionReason,
      eventId,
      userMessage: getUserMessage(action, severity)
    };
    
  } catch (error) {
    console.error('Moderation error:', error);
    // Fail open - allow content if moderation system fails
    return {
      allowed: true,
      severity: SEVERITY.SAFE,
      action: ACTIONS.ALLOWED,
      violations: [],
      reason: 'Moderation system error - content allowed'
    };
  }
}

/**
 * Get user-friendly message for moderation action
 */
function getUserMessage(action, severity) {
  switch (action) {
    case ACTIONS.REMOVED:
      return 'Your message was removed because it violated Capitol\'s community rules.';
    case ACTIONS.WARNING:
      return 'Please keep Capitol respectful. Targeted hateful or discriminatory language isn\'t allowed.';
    case ACTIONS.RESTRICTION:
      return 'Your account has been restricted due to repeated violations of community rules.';
    case ACTIONS.SUSPENSION:
      return 'Your account has been temporarily suspended due to serious violations of community rules.';
    case ACTIONS.BAN:
      return 'Your account has been permanently banned due to persistent violations of community rules.';
    default:
      return '';
  }
}

/**
 * Get recent moderation events for admin view
 */
async function getRecentModerationEvents(limit = 50) {
  const result = await query(
    `SELECT me.*, u.username, u.display_name 
     FROM moderation_events me
     LEFT JOIN users u ON me.user_id = u.id
     ORDER BY me.created_at DESC 
     LIMIT $1`,
    [limit]
  );
  
  return result.rows;
}

/**
 * Get user's moderation history
 */
async function getUserModerationHistory(userId) {
  const result = await query(
    `SELECT * FROM moderation_events 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [userId]
  );
  
  return result.rows;
}

/**
 * Get user's active strikes
 */
async function getUserStrikes(userId) {
  const result = await query(
    `SELECT * FROM user_strikes 
     WHERE user_id = $1 AND is_active = true 
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC`,
    [userId]
  );
  
  return result.rows;
}

/**
 * Admin function: Mark moderation event as false positive
 */
async function markFalsePositive(eventId, adminId) {
  await transaction(async (client) => {
    // Update the event
    await client.query(
      `UPDATE moderation_events 
       SET is_false_positive = true, 
           reviewed_by_admin = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [adminId, eventId]
    );
    
    // Get the event details
    const eventResult = await client.query(
      `SELECT * FROM moderation_events WHERE id = $1`,
      [eventId]
    );
    
    if (eventResult.rows.length > 0) {
      const event = eventResult.rows[0];
      
      // Remove associated strike if exists
      await client.query(
        `UPDATE user_strikes 
         SET is_active = false 
         WHERE related_event_id = $1`,
        [eventId]
      );
      
      // Reverse user account action if needed
      if (event.action_taken === ACTIONS.SUSPENSION || event.action_taken === ACTIONS.RESTRICTION) {
        await client.query(
          `UPDATE users 
           SET is_suspended = false, 
               suspension_end = NULL,
               suspend_reason = NULL
           WHERE id = $1`,
          [event.user_id]
        );
      }
    }
  });
}

/**
 * Admin function: Add or update prohibited term
 */
async function updateProhibitedTerm(term, category, severity, isActive = true, requiresContext = false) {
  const id = 'pt_' + Date.now().toString(36);
  
  await query(
    `INSERT INTO prohibited_terms (id, term, category, severity, is_active, requires_context, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (term) 
     DO UPDATE SET 
       category = $3,
       severity = $4,
       is_active = $5,
       requires_context = $6,
       updated_at = NOW()`,
    [id, term.toLowerCase(), category, severity, isActive, requiresContext]
  );
}

export {
  moderateContent,
  getRecentModerationEvents,
  getUserModerationHistory,
  getUserStrikes,
  markFalsePositive,
  updateProhibitedTerm,
  SEVERITY,
  CONTENT_TYPES,
  VIOLATION_CATEGORIES,
  ACTIONS
};
