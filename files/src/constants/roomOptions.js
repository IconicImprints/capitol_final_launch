// ── Room creation, onboarding, and goal option lists ───────────────────────────
// Moved verbatim from App.jsx — no value changes.

// ── Goal catalogue — used by auto-match to map goals → room templates ──────────
export const GOAL_CATALOGUE = [
  { key: "saas_mvp",          icon: "saas_mvp",          label: "Ship a SaaS MVP",                 goal: "Ship a SaaS MVP in 30 days",                    days: 30, max: 8 },
  { key: "run_5k",            icon: "run_5k",             label: "Run 5K",                          goal: "Run 5K without stopping",                       days: 21, max: 7 },
  { key: "read_books",        icon: "read_books",         label: "Read 1 book/week",                 goal: "Read 1 book per week for 4 weeks",               days: 28, max: 6 },
  { key: "design_portfolio",  icon: "design_portfolio",   label: "Ship a portfolio",                goal: "Ship a portfolio in 14 days",                   days: 14, max: 6 },
  { key: "mindfulness",       icon: "mindfulness",        label: "Meditation + journaling",         goal: "30-day meditation + journaling streak",         days: 30, max: 5 },
  { key: "write_daily",       icon: "write_daily",        label: "Write 500 words/day",             goal: "Write 500 words every day for 30 days",         days: 30, max: 8 },
  { key: "workout",           icon: "workout",            label: "Daily workout",                   goal: "Work out every day for 30 days",                days: 30, max: 8 },
  { key: "learn_coding",      icon: "learn_coding",       label: "Learn to code",                  goal: "Build 3 projects from scratch",                 days: 60, max: 7 },
  { key: "cold_outreach",     icon: "cold_outreach",      label: "Cold outreach daily",             goal: "Send 10 cold emails every day for 30 days",     days: 30, max: 8 },
  { key: "no_social_media",   icon: "no_social_media",    label: "No social media",                 goal: "Zero social media for 30 days",                 days: 30, max: 8 },
];

export const AI_QUESTIONS = [
  "What exactly is your goal, and why does it matter to you right now — not someday, right now?",
  "How many focused hours per day can you realistically commit? Be honest, not aspirational.",
  "What have you tried before, and why did it fail?",
  "Why shouldn't we kick you the moment you fall behind? Convince me.",
];

// ── Goal creation templates ───────────────────────────────────────────────────
export const GOAL_TEMPLATES = [
  { label: "Workout",            icon: "workout" },
  { label: "Read 20 pages",      icon: "read_books" },
  { label: "Deep work session",  icon: "bolt" },
  { label: "Write 500 words",    icon: "write_daily" },
  { label: "Meditate 10 min",    icon: "mindfulness" },
  { label: "Cold outreach x5",   icon: "cold_outreach" },
  { label: "Review finances",    icon: "stopwatch" },
  { label: "Plan tomorrow",       icon: "cal" },
];

export const ELITE_ROLES = [
  { id: "captain",    label: "Captain",    desc: "Leads the room, pins announcements, can kick members",         color: "#f59e0b", icon: "⚡" },
  { id: "coach",      label: "Coach",      desc: "Guides members, posts daily prompts, reviews proofs",          color: "#818cf8", icon: "🎯" },
  { id: "enforcer",   label: "Enforcer",   desc: "Monitors compliance, flags late submissions, issues warnings", color: "#ef4444", icon: "🛡" },
  { id: "analyst",    label: "Analyst",    desc: "Tracks group stats, posts weekly summaries",                   color: "#10b981", icon: "📊" },
  { id: "motivator",  label: "Motivator",  desc: "Boosts morale, celebrates wins, sends encouragement",         color: "#f97316", icon: "🔥" },
  { id: "member",     label: "Member",     desc: "Standard participant — submit daily proof, support teammates", color: "#6b7280", icon: "👤" },
];
export const AGE_GROUPS = [
  { id: "13-17",  label: "13–17",  desc: "Teens" },
  { id: "18-24",  label: "18–24",  desc: "Young adults" },
  { id: "25-34",  label: "25–34",  desc: "Mid 20s–30s" },
  { id: "35-44",  label: "35–44",  desc: "Mid 30s–40s" },
  { id: "45+",    label: "45+",    desc: "45 and over" },
  { id: "all",    label: "All ages", desc: "Open to everyone" },
];

// ═══════════════════════════════════════════════════════════════════════════
// ── Automatic room name generator word lists ──────────────────────────────────
// Rooms NEVER take free-text names from the user. Names are generated as
// [Goal + Vibe + optional number], 2-4 words, max 20 characters, no emojis or
// special characters — short, clean, instantly readable on mobile cards.
// ═══════════════════════════════════════════════════════════════════════════
export const ROOM_NAME_GOAL_WORDS = [
  "Focus", "Hustle", "Grind", "Build", "Sprint", "Rise", "Glow", "Lock In",
  "Level Up", "Momentum", "Streak", "Daily Win", "Push", "Flow", "Forge",
];
export const ROOM_NAME_VIBE_WORDS = [
  "Squad", "Crew", "Club", "Gang", "Tribe", "Circle", "Zone", "Mode",
  "League", "Pack", "Lab", "Society", "Collective", "Vibes", "Hub",
];

export const AGE_OPTIONS = ["13–17", "18–24", "25–34", "35–44", "45–54", "55+"];
export const INTEREST_OPTIONS = [
  { key: "coding",    icon: "code", label: "Coding / Dev"   },
  { key: "fitness",   icon: "", label: "Fitness"        },
  { key: "writing",   icon: "", label: "Writing"        },
  { key: "design",    icon: "", label: "Design"         },
  { key: "reading",   icon: "", label: "Reading"        },
  { key: "wellness",  icon: "", label: "Wellness"       },
  { key: "business",  icon: "chart", label: "Business"       },
  { key: "music",     icon: "star", label: "Music"          },
  { key: "language",  icon: "globe", label: "Languages"      },
  { key: "art",       icon: "design_portfolio", label: "Art"            },
  { key: "other",     icon: "", label: "Other"          },
];
export const INTEREST_TO_GOAL = {
  coding: "saas_mvp", fitness: "run_5k", writing: "write_daily",
  design: "design_portfolio", reading: "read_books", wellness: "mindfulness",
  business: "cold_outreach", music: "write_daily", language: "read_books",
  art: "design_portfolio", other: null,
};

// ── OnboardingFlow v4 option lists ────────────────────────────────────────────
// Collects: niche, ageRange, primaryGoal, motivation.
export const NICHE_OPTIONS = [
  { value:"coding",  label:"Coding / Building", desc:"Apps, SaaS, side projects" },
  { value:"video",   label:"  Video / Content",   desc:"Editing, YouTube, content" },
  { value:"design",  label:"  Design / UI·UX",    desc:"Figma, branding, visuals" },
  { value:"startup", label:"Startup / Business",desc:"Revenue, growth, clients" },
  { value:"fitness", label:"Fitness",            desc:"Gym, running, habits" },
];

export const AGE_RANGE_OPTIONS = [
  { value:"13_15",   label:"13 – 15" },
  { value:"16_18",   label:"16 – 18" },
  { value:"19_22",   label:"19 – 22" },
  { value:"23_29",   label:"23 – 29" },
  { value:"30_plus", label:"30 +" },
];

export const PRIMARY_GOAL_OPTIONS = [
  { value: "ship_project",   label: "Ship a project",      desc: "Build something real" },
  { value: "build_habit",    label: "  Build a daily habit",  desc: "Consistency over time" },
  { value: "lose_weight",    label: "Lose weight / get fit", desc: "Body transformation" },
  { value: "learn_skill",    label: "Learn a new skill",    desc: "Course, language, cert" },
  { value: "grow_business",  label: "Grow my business",     desc: "Revenue, clients, reach" },
  { value: "other",          label: "  Something else",       desc: "My own goal" },
];
