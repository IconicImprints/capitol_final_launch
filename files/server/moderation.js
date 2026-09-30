import { supabase } from './supabaseClient.js';

const SEVERITY = {
  SAFE: 0,
  MILD_PROFANITY: 1,
  TARGETED_HARASSMENT: 2,
  SEVERE_HATE: 3,
  REPEATED_VIOLATIONS: 4,
  PERSISTENT_ABUSE: 5
};

export const CONTENT_TYPES = {
  ROOM_MESSAGE: 'room_message',
  TEAM_MISSION: 'team_mission',
  USERNAME: 'username',
  DISPLAY_NAME: 'display_name',
  BIO: 'bio',
  PROFILE: 'profile',
  OTHER: 'other'
};

export const VIOLATION_CATEGORIES = {
  RACIST: 'racist',
  HATEFUL: 'hateful',
  HARASSMENT: 'harassment',
  DISCRIMINATORY: 'discriminatory',
  PROFANITY: 'profanity',
  SEVERE: 'severe'
};

export const ACTIONS = {
  ALLOWED: 'allowed',
  REMOVED: 'removed',
  WARNING: 'warning',
  RESTRICTION: 'restriction',
  SUSPENSION: 'suspension',
  BAN: 'ban'
};

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  let normalized = text.toLowerCase();
  normalized = normalized.replace(/[\._\-\*\+@#]/g, ' ');
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
  normalized = normalized.replace(/[0-9]/g, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

async function checkProhibitedTerms(normalizedText, contentType) {
  const { data, error } = await supabase
    .from('prohibited_terms')
    .select('term, category, severity, requires_context')
    .eq('is_active', true);

  if (error) throw error;

  const violations = [];

  for (const row of data || []) {
    const term = row.term.toLowerCase();
    const category = row.category;
    const severity = row.severity;
    const requiresContext = row.requires_context;

    const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const containsMatch = normalizedText.includes(term);
    const wordMatch = wordBoundaryRegex.test(normalizedText);

    if (containsMatch || wordMatch) {
      if (contentType === CONTENT_TYPES.USERNAME) {
        if (normalizedText === term || normalizedText.includes(term)) {
          violations.push({ term: row.term, category, severity, requiresContext, matchType: 'exact' });
        }
      } else {
        violations.push({ term: row.term, category, severity, requiresContext, matchType: wordMatch ? 'word' : 'contains' });
      }
    }
  }

  return violations;
}

function detectObfuscation(text) {
  const obfuscationPatterns = [
    /[0-9]/g,
    /[\._\-\*\+@#]+/g,
    /(.)\1{4,}/g,
    /[a-z][^a-z\s]{2,}[a-z]/gi
  ];

  let obfuscationScore = 0;
  for (const pattern of obfuscationPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      obfuscationScore += matches.length;
    }
  }

  return obfuscationScore > 3;
}

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

  if (hasObfuscation && maxSeverity >= SEVERITY.TARGETED_HARASSMENT) {
    maxSeverity = Math.min(maxSeverity + 1, SEVERITY.PERSISTENT_ABUSE);
  }

  if (contentType === CONTENT_TYPES.USERNAME && maxSeverity >= SEVERITY.SEVERE_HATE) {
    maxSeverity = SEVERITY.TARGETED_HARASSMENT;
  }

  return maxSeverity;
}

async function getUserStrikeCount(userId) {
  const { count, error } = await supabase
    .from('user_strikes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

  if (error) throw error;
  return count || 0;
}

async function getModerationConfig() {
  const { data, error } = await supabase
    .from('moderation_config')
    .select('value')
    .eq('key', 'thresholds')
    .single();

  if (error && error.code !== 'PGRST116') throw error;

  if (!data) {
    return {
      level_2_warning_count: 1,
      level_3_restriction_count: 2,
      level_4_suspension_count: 3,
      level_5_ban_count: 5,
      suspension_duration_hours: 24,
      strike_expiry_days: 30
    };
  }

  return data.value;
}

async function determineAction(severity, userId, contentType) {
  const config = await getModerationConfig();
  const strikeCount = await getUserStrikeCount(userId);

  switch (severity) {
    case SEVERITY.SAFE:
      return ACTIONS.ALLOWED;

    case SEVERITY.MILD_PROFANITY:
      return ACTIONS.ALLOWED;

    case SEVERITY.TARGETED_HARASSMENT:
      if (strikeCount >= config.level_3_restriction_count) {
        return ACTIONS.RESTRICTION;
      }
      return ACTIONS.WARNING;

    case SEVERITY.SEVERE_HATE:
      if (strikeCount >= config.level_4_suspension_count) {
        return ACTIONS.SUSPENSION;
      }
      if (strikeCount >= config.level_3_restriction_count) {
        return ACTIONS.RESTRICTION;
      }
      return ACTIONS.WARNING;

    case SEVERITY.REPEATED_VIOLATIONS:
      return ACTIONS.SUSPENSION;

    case SEVERITY.PERSISTENT_ABUSE:
      if (strikeCount >= config.level_5_ban_count) {
        return ACTIONS.BAN;
      }
      return ACTIONS.SUSPENSION;

    default:
      return ACTIONS.ALLOWED;
  }
}

async function createModerationEvent(data) {
  const id = 'mod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  const { error } = await supabase.from('moderation_events').insert([{
    id,
    user_id: data.user_id,
    content_id: data.content_id || null,
    content_type: data.content_type,
    violation_category: data.violation_category,
    severity: data.severity,
    action_taken: data.action_taken,
    detection_reason: data.detection_reason,
    content_sample: data.content_sample || null,
    automated: data.automated !== false,
    created_at: new Date().toISOString()
  }]);

  if (error) throw error;
  return id;
}

async function createUserStrike(userId, severity, reason, relatedEventId) {
  const config = await getModerationConfig();
  const id = 'strike_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  let expiresAt = null;
  if (severity < SEVERITY.PERSISTENT_ABUSE) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + config.strike_expiry_days);
    expiresAt = expiryDate.toISOString();
  }

  const { error } = await supabase.from('user_strikes').insert([{
    id,
    user_id: userId,
    severity,
    reason,
    related_event_id: relatedEventId || null,
    expires_at: expiresAt,
    is_active: true,
    created_at: new Date().toISOString()
  }]);

  if (error) throw error;
  return id;
}

async function applyModerationAction(userId, action, reason) {
  switch (action) {
    case ACTIONS.SUSPENSION: {
      const config = await getModerationConfig();
      const suspensionEnd = new Date();
      suspensionEnd.setHours(suspensionEnd.getHours() + config.suspension_duration_hours);

      const { error } = await supabase
        .from('users')
        .update({
          is_suspended: true,
          suspension_end: suspensionEnd.toISOString(),
          suspend_reason: reason
        })
        .eq('id', userId);

      if (error) throw error;
      break;
    }

    case ACTIONS.BAN: {
      const { error } = await supabase
        .from('users')
        .update({
          is_banned: true,
          suspend_reason: reason
        })
        .eq('id', userId);

      if (error) throw error;
      break;
    }

    case ACTIONS.RESTRICTION: {
      const { error } = await supabase
        .from('users')
        .update({
          is_suspended: true,
          suspend_reason: reason
        })
        .eq('id', userId);

      if (error) throw error;
      break;
    }
  }
}

export async function moderateContent({
  userId,
  content,
  contentType,
  contentId = null,
  context = {}
}) {
  try {
    const normalizedText = normalizeText(content);
    const violations = await checkProhibitedTerms(normalizedText, contentType);
    const hasObfuscation = detectObfuscation(content);
    const severity = classifySeverity(violations, contentType, hasObfuscation);

    if (severity === SEVERITY.SAFE) {
      return {
        allowed: true,
        severity: SEVERITY.SAFE,
        action: ACTIONS.ALLOWED,
        violations: [],
        reason: 'Content passed moderation checks'
      };
    }

    const action = await determineAction(severity, userId, contentType);
    const violationCategory = violations.length > 0 ? violations[0].category : VIOLATION_CATEGORIES.PROFANITY;

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
      content_sample: content.slice(0, 500),
      automated: true
    });

    if (severity >= SEVERITY.TARGETED_HARASSMENT) {
      await createUserStrike(userId, severity, detectionReason, eventId);
    }

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
    return {
      allowed: true,
      severity: SEVERITY.SAFE,
      action: ACTIONS.ALLOWED,
      violations: [],
      reason: 'Moderation system error - content allowed'
    };
  }
}

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

export async function getRecentModerationEvents(limit = 50) {
  const { data, error } = await supabase
    .from('moderation_events')
    .select('*, users(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getUserModerationHistory(userId) {
  const { data, error } = await supabase
    .from('moderation_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getUserStrikes(userId) {
  const { data, error } = await supabase
    .from('user_strikes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function markFalsePositive(eventId, adminId) {
  const { data: event, error: fetchError } = await supabase
    .from('moderation_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from('moderation_events')
    .update({
      is_false_positive: true,
      reviewed_by_admin: adminId,
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId);

  if (updateError) throw updateError;

  if (event) {
    const { error: strikeError } = await supabase
      .from('user_strikes')
      .update({ is_active: false })
      .eq('related_event_id', eventId);

    if (strikeError) throw strikeError;

    if (event.action_taken === ACTIONS.SUSPENSION || event.action_taken === ACTIONS.RESTRICTION) {
      const { error: userError } = await supabase
        .from('users')
        .update({
          is_suspended: false,
          suspension_end: null,
          suspend_reason: null
        })
        .eq('id', event.user_id);

      if (userError) throw userError;
    }
  }
}

export async function updateProhibitedTerm(term, category, severity, isActive = true, requiresContext = false) {
  const id = 'pt_' + Date.now().toString(36);

  const { error } = await supabase.from('prohibited_terms').upsert([{
    id,
    term: term.toLowerCase(),
    category,
    severity,
    is_active: isActive,
    requires_context: requiresContext,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }], {
    onConflict: 'term'
  });

  if (error) throw error;
}
