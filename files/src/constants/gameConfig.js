// ── XP / rank / streak / quest / economy configuration ─────────────────────────
// Moved verbatim from App.jsx — no value changes.

// ── XP rank tiers ────────────────────────────────────────────────────────────
// Thresholds are deliberately spaced out so that early tiers (Newcomer →
// Bronze → Silver) are reachable within days of consistent daily proofs,
// while the top tiers (Diamond, Legend) require sustained, long-term
// consistency. This prevents users from reaching the top ranks too quickly
// and keeps high ranks meaningful.
export const RANK_TIERS=[
  {id:"newcomer",label:"Newcomer",icon:null,minXP:0,     color:"#6b7280"},
  {id:"bronze",  label:"Bronze",  icon:null,minXP:200,   color:"#b45309"},
  {id:"silver",  label:"Silver",  icon:null,minXP:800,   color:"#94a3b8"},
  {id:"gold",    label:"Gold",    icon:null,minXP:2500,  color:"#f59e0b"},
  {id:"diamond", label:"Diamond", icon:null,minXP:7000,  color:"#818cf8"},
  {id:"legend",  label:"Legend",  icon:null,minXP:20000, color:"#10b981"},
];
export const STREAK_BADGES=[
  {days:3, icon:null,label:"3-Day", color:"#f97316"},
  {days:7, icon:null,label:"7-Day", color:"#eab308"},
  {days:14,icon:null,label:"14-Day",color:"#818cf8"},
  {days:30,icon:null,label:"30-Day",color:"#f59e0b"},
  {days:60,icon:null,label:"60-Day",color:"#10b981"},
];
export const DOUBLE_XP_WEEKEND=(()=>{const d=new Date().getDay();return d===0||d===6;})();
export const ELITE_ROOM_XP_MULT=DOUBLE_XP_WEEKEND?2:1;

// Daily cap per "bucket" — the max number of times XP can be awarded for
// actions in that bucket, per user, per day. Prevents loops like
// join-room → leave-room → join-room from farming unlimited XP.
export const XP_DAILY_CAPS = {
  chat_msg: 20,   // ~10 XP/day max from chatting alone
  room_join: 1,   // joining/leaving rooms repeatedly cannot farm XP
  follow: 10,     // following/unfollowing repeatedly cannot farm XP
  badge: 30,      // badges are one-time anyway; generous backstop
  quest: 15,      // daily quests already self-limit; this is a backstop
  vulture: 5,
  room_complete: 3,
  goal: 20,
  bet: 10,
  default: 50,
};
// Minimum time between awards of the SAME reason (ms) — blocks rapid-fire/bot spam.
export const XP_COOLDOWNS = {
  chat_msg: 30000, // 30s between chat XP awards
  follow: 2000,
  goal: 1000,
  bet: 1000,
  default: 500,
};

export const ELIGIBLE_LEAGUES = ["Bronze", "Silver", "Gold", "Elite"];
export const LOWEST_XP_BADGE_DURATION_DAYS = 3;

// ── RECOVERY ZONE SYSTEM (replaces Hall of Shame) ────────────────────────────
// Shows users who lost streaks or dropped rank — neutral framing, no shame.
// Goal: turn failure into motivation via Comeback Missions.
export const COMEBACK_MISSIONS = [
  { id: "cm1", label: "Submit today's proof", xp: 10 },
  { id: "cm2", label: "Drop a message in room chat", xp: 5 },
  { id: "cm3", label: "Check in with a 1-sentence update", xp: 5 },
  { id: "cm4", label: "Post your plan for tomorrow", xp: 5 },
  { id: "cm5", label: "React to a teammate's proof", xp: 5 },
];

// ── XP penalty constants ──────────────────────────────────────────────────────
export const XP_PENALTY_MISS = 5;
export const XP_PENALTY_KICK = 20;
export const SESSION_VOTE_XP_PENALTY = 10;

// ── Onboarding proof bonus window ─────────────────────────────────────────────
// New members get a one-time XP bonus for submitting their first proof within
// this window of joining a room.
export const ONBOARDING_PROOF_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
export const ONBOARDING_XP_BONUS = 25;

// ── Anti-spam / economy constants ─────────────────────────────────────────────
export const PROOF_COOLDOWN_MS = 60 * 1000; // 60 seconds between proof submissions
export const APP_FEE_PCT = 10; // % of a Vulture pot retained as a platform fee
export const POMODORO_SESSION_XP = 5; // flat XP awarded for each completed focus session

export const GOAL_XP = { complete: 30, proof: 50, repeat_bonus: 10 };

// ── Daily Quest Definitions ───────────────────────────────────────────────────
export const DAILY_QUESTS_DEF = [
  { id: "dq_set_goals",  title: "Set Today's Goals", desc: "Create at least 1 goal for today",    icon: "seedling", xp: 25, type: "auto" },
  { id: "dq_pomo_1",     title: "Focus Session",      desc: "Complete 1 Pomodoro session",          icon: "bolt",     xp: 30, type: "auto", antiCheat: true },
  { id: "dq_pomo_3",     title: "Deep Work",          desc: "Complete 3 Pomodoro sessions",         icon: "flame",    xp: 60, type: "auto", antiCheat: true },
  { id: "dq_focus_20",   title: "20 Minutes Focused", desc: "Accumulate 20 focus minutes",          icon: "eye",      xp: 35, type: "auto", antiCheat: true },
  { id: "dq_2goals",     title: "Double Down",        desc: "Complete 2 goals today",               icon: "check",    xp: 50, type: "auto" },
  { id: "dq_all_goals",  title: "Clean Sweep",        desc: "Complete all of today's goals",        icon: "trophy",   xp: 80, type: "auto" },
  { id: "dq_proof",      title: "Show Your Proof",    desc: "Upload proof for a completed goal",    icon: "star",     xp: 40, type: "auto" },
  { id: "dq_streak",     title: "Keep the Streak",    desc: "Submit proof to maintain your streak", icon: "crown",    xp: 45, type: "auto" },
  { id: "dq_join_room",  title: "Join the Arena",     desc: "Join or get matched into a room",      icon: "swords",   xp: 35, type: "auto" },
  { id: "dq_add_friend", title: "Make a Connection",  desc: "Follow a new friend",                  icon: "medal",    xp: 25, type: "auto" },
];
