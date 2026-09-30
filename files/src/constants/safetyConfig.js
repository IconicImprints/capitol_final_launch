// ── Safety / moderation / anti-raid configuration ──────────────────────────────
// Moved verbatim from App.jsx — no value changes.

export const LS_REPORTS    = "kd_safety_reports";
export const LS_BLOCKS     = "kd_safety_blocks";
export const LS_BANS       = "kd_safety_bans";
export const LS_SUSPENSIONS= "kd_safety_suspensions";
export const LS_AUDIT      = "kd_safety_audit";
export const LS_MOD_NOTES  = "kd_safety_mod_notes";
export const LS_APPEALS    = "kd_safety_appeals";
export const LS_RATE       = "kd_safety_rate";

// ── Anti-raid: repeated join/leave ("room hopping") detection ────────────────
// Raiders often join a room, post, leave, and rejoin a different room
// repeatedly to spread spam or evade per-room rate limits. We log every
// join/leave transition per user and, if a user racks up too many
// transitions in a short window, place them on a temporary room-join
// cooldown (separate from — and in addition to — moderator suspensions).
export const LS_JOIN_LOG       = "kd_safety_join_log";
export const LS_JOIN_COOLDOWN  = "kd_safety_join_cooldown";
export const JOIN_FLOOD_COUNT  = 4;        // N join/leave transitions...
export const JOIN_FLOOD_WINDOW = 600000;   // ...within 10 minutes triggers a cooldown
export const JOIN_COOLDOWN_MS  = 900000;   // 15 minute room-join cooldown once triggered

// ══════════════════════════════════════════════════════════════════════════════
// ANTI-RAID / ANTI-SPAM: mutes, slow mode, room flood + bot-behavior detection
// ══════════════════════════════════════════════════════════════════════════════
export const LS_MUTES      = "kd_safety_mutes";
export const LS_SLOWMODE   = "kd_safety_slowmode";
export const LS_MSG_TIMES  = "kd_safety_msg_times";

// ── Room flood detection (anti-raid) ──────────────────────────────────────────
// Tracks every posted message's timestamp + sender per room. If too many
// messages arrive from too many distinct senders in a short window — the
// signature of a coordinated raid — slow mode is auto-enabled for the room.
export const ROOM_FLOOD_MSG_COUNT  = 12;     // N messages...
export const ROOM_FLOOD_WINDOW_MS  = 15000;  // ...within 15 seconds...
export const ROOM_FLOOD_MIN_SENDERS = 3;     // ...from at least this many distinct senders → raid
export const ROOM_FLOOD_SLOWMODE_SECONDS = 10;
export const ROOM_FLOOD_SLOWMODE_MINUTES = 10;

// ── Bot-like behavior detection ───────────────────────────────────────────────
// Real users can't sustain machine-speed message intervals. If a user's last
// few messages all arrived faster than humanly possible (sub-1s, repeatedly),
// flag them and apply a short mute. This catches scripted/bot flooding even
// when each individual message would pass the per-window rate limit.
export const LS_BOT_TIMES = "kd_safety_bot_times";
export const BOT_MIN_INTERVAL_MS = 1000;  // messages faster than this are suspicious
export const BOT_STRIKE_THRESHOLD = 5;    // this many suspicious-fast messages in a row...
export const BOT_MUTE_MINUTES = 15;       // ...triggers a temporary mute

// ── Public-safe user fields (used by _sanitizeUser) ───────────────────────────
export const _SAFE_PUBLIC_FIELDS = new Set([
  "uid","displayName","userId","niche","ageRange","xp","streak","rank","level",
  "league","badges","photo","bio","createdAt","joinedDate","onboardingComplete",
  "following","followers","premium","inviteCode","invitesCount","completedRooms",
  "joinedRooms","kickStatus","banned","suspended","flaggedForReview"
]);

// ── Grooming / off-platform / PII pattern detection ──────────────────────────
export const _GROOMING_PATTERNS = [
  // Requests for personal info
  /\b(phone\s*number|phone\s*no|whatsapp|snapchat|snap\s*me|kik|telegram|signal|instagram\s*dm|text\s*me|call\s*me|dm\s*me|discord\s*server|add\s*me\s*on)\b/i,
  // Age fishing
  /\b(how\s*old\s*are\s*you|what\s*grade|asl\b|age\s*sex\s*location|are\s*you\s*under\s*18|how\s*young)\b/i,
  // Address / location
  /\b(where\s*do\s*you\s*live|your\s*address|what\s*city|what\s*school|what\s*neighborhood)\b/i,
  // Move off platform
  /\b(let['']s\s*(talk|chat|move)\s*(off|elsewhere|privately|outside)|continue\s*(this\s*)?off|talk\s*privately|better\s*off\s*platform|easier\s*(on|via|through)\s*(whatsapp|snap|discord|telegram|signal|insta))\b/i,
  // Coercion / secrecy
  /\b(don['']t\s*tell\s*(anyone|your\s*(parents|mom|dad))|keep\s*(this\s*)?(between\s*us|secret|quiet)|just\s*between\s*us|our\s*little\s*secret)\b/i,
  // Explicit solicitation (catch-all — exact matches only, not substrings)
  /\b(send\s*(me\s*)?(pics|photos|pictures|nudes?|selfies?)\s*(of\s*you)?|let\s*me\s*see\s*you)\b/i,
];

// ── Report reasons (ReportUserModal) ──────────────────────────────────────────
export const REPORT_REASONS = [
  "Harassment or bullying",
  "Hate speech or slurs",
  "Spam or scam",
  "Fake or impersonation account",
  "Inappropriate behavior",
  "Child safety concern",
  "Grooming",
  "Sharing personal info",
  "Attempting to move off-platform",
  "Sexual content",
  "Threats or violence",
  "Self-harm or suicide",
  "Other",
];

// ── Local chat content filter patterns ────────────────────────────────────────
export const KD_BANNED_PATTERNS = [
  // Harassment / slurs / hate speech (kept intentionally generic — categories only)
  { category: "harassment", re: /\b(kys|kill\s*yourself|go\s*die|you('re|r)?\s*(worthless|pathetic|trash|garbage)|i\s*hope\s*you\s*die|fuck(ing|er|s|e[dr])?\s*(you|off|this|that|it|me|him|her|us|them|up|all|around|head|face|ass)?|mother\s*fuck(er|ing)?|stinky\s*ass|eat\s*sh[i1]t|go\s*fuck)\b/i },
  { category: "slur", re: /\b(retard(ed)?|f[a4]gg?[o0]t|n[i1]gg(er|a)|sp[i1]c|ch[i1]nk|tr[a4]nny|wh[o0]re|sl[u\*]t|b[i1]tch(es|ing)?|p[u\*]ssy|d[i1]ck(head)?|c[u\*]nt|jeet|pajeet)\b/i },
  // Sexual violence terms
  { category: "sexual_violence", re: /\b(rape|raping|rapist|sexual(ly)?\s*assault|molest(ed|ing)?|gang\s*rape|forced\s*sex)\b/i },
  // Self-harm phrases
  { category: "self_harm", re: /\b(i\s*want\s*to\s*die|i'?m\s*going\s*to\s*kill\s*myself|suicid(e|al)|cut(ting)?\s*myself|self\s*harm|end\s*my\s*life)\b/i },
];

// ── Copy-paste / repetitive-message spam detection ───────────────────────────
// Flags messages where a single character or short block is repeated excessively
// (e.g. "aaaaaa...", "asdfasdfasdf...", same long block pasted N times).
export const COPY_PASTE_REPEAT_THRESHOLD = 0.7; // 70%+ identical chars → flagged
export const COPY_PASTE_MIN_LENGTH = 30;         // only check messages this long

// ── Escalating mute durations for repeat spam offenders ─────────────────────
// After a mute expires, if the user is muted again within this window,
// the next mute duration is multiplied by ESCALATION_MULTIPLIER.
export const SPAM_ESCALATION_WINDOW_MS = 3600000; // 1 hour
export const SPAM_ESCALATION_MULTIPLIER = 2;
export const LS_SPAM_STRIKES = "kd_safety_spam_strikes";

// ── Action rate limits (follows, unfollows, room creation, etc.) ────────────
// Each entry: [action_key, max_per_window, window_ms]
export const ACTION_RATE_LIMITS = [
  ["follow",      20, 60000],   // max 20 follows/unfollows per minute
  ["create_room",  5, 60000],   // max 5 room creations per minute
  ["submit_proof", 5, 60000],   // max 5 proof submissions per minute
  ["vote",        30, 60000],   // max 30 proof votes per minute
  ["challenge",   10, 60000],   // max 10 challenges per minute
];

// ── Activity burst detection (anti-raid) ────────────────────────────────────
// Tracks ALL user actions within a short window. If too many actions occur
// across different action types, the user is temporarily rate-limited.
export const LS_ACTIVITY_LOG = "kd_safety_activity_log";
export const ACTIVITY_BURST_WINDOW_MS = 10000;    // 10-second window
export const ACTIVITY_BURST_THRESHOLD = 20;        // 20+ actions → burst detected
export const ACTIVITY_BURST_COOLDOWN_MS = 30000;   // 30s cooldown after burst

// ── Community Safety Guidelines (shared by SafetyView + the post-onboarding gate) ─
export const COMMUNITY_GUIDELINES = [
  ["Be real", "Only submit genuine proof of your work. Faking proofs is cheating and will result in removal."],
  ["Be respectful", "Competitive is good. Cruel is not. No personal insults, slurs, threats, or targeted harassment."],
  ["Keep it on-platform", "Do not solicit contact info or attempt to move conversations off Capitol. This includes sharing phone numbers, social media handles, or messaging app usernames."],
  ["Protect personal information", "Do not share your own or anyone else's address, school, phone number, or location."],
  ["No sexual content", "Zero tolerance. Any sexual content involving minors results in immediate permanent ban and escalation."],
  ["No spam or scams", "No repeated identical messages, unsolicited promotions, fake giveaways, or phishing links."],
  ["No impersonation", "Don't pretend to be another user, a moderator, or a Capitol employee."],
  ["Age-appropriate content", "All content must be appropriate for users aged 13+."],
  ["Respect room rules", "Follow the rules of any room you join. Disrupting rooms or refusing to participate is grounds for removal."],
];
