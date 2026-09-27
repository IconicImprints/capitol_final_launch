import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "capitol-data")
  : path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "capitol.json");

const EMPTY = {
  users: {},
  sessions: {},
  rooms: {},
  roomMembers: {},
  proofs: {},
  streaks: {},
  achievements: {},
  userAchievements: {},
  notifications: {},
  follows: {},
  challenges: {},
  closeFriends: {},
  closeFriendRequests: {},
  referrals: {},
  freezeTokens: {},
  waitingQueue: {},
  replacementQueue: {},
  config: {
    inactivityThresholdDays: 3,
    minRoomSize: 3,
    maxRoomSize: 8,
    lastActivityCheck: null,
  },
};

// Determine if we should use Supabase (production) or JSON (local dev)
// Use Supabase whenever it's configured, not just on Vercel
const USE_SUPABASE = isSupabaseConfigured;

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY, null, 2));
}

// JSON-based functions for local development
function loadJsonDb() {
  ensure();
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return { ...EMPTY, ...raw };
  } catch {
    return structuredClone(EMPTY);
  }
}

function saveJsonDb(db) {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Supabase-based functions for production
async function loadSupabaseDb() {
  if (!supabaseAdmin) {
    throw new Error("Supabase not configured but USE_SUPABASE is true");
  }

  const db = structuredClone(EMPTY);

  // Load users
  const { data: users } = await supabaseAdmin.from("users").select("*");
  if (users) {
    for (const user of users) {
      db.users[user.id] = user;
    }
  }

  // Load sessions
  const { data: sessions } = await supabaseAdmin.from("sessions").select("*");
  if (sessions) {
    for (const session of sessions) {
      db.sessions[session.token] = session;
    }
  }

  // Load rooms
  const { data: rooms } = await supabaseAdmin.from("rooms").select("*");
  if (rooms) {
    for (const room of rooms) {
      db.rooms[room.id] = room;
    }
  }

  // Load room members
  const { data: roomMembers } = await supabaseAdmin.from("room_members").select("*");
  if (roomMembers) {
    for (const member of roomMembers) {
      db.roomMembers[member.id] = member;
    }
  }

  // Load proofs
  const { data: proofs } = await supabaseAdmin.from("proofs").select("*");
  if (proofs) {
    for (const proof of proofs) {
      db.proofs[proof.id] = proof;
    }
  }

  // Load streaks
  const { data: streaks } = await supabaseAdmin.from("streaks").select("*");
  if (streaks) {
    for (const streak of streaks) {
      db.streaks[streak.user_id] = streak;
    }
  }

  // Load achievements
  const { data: achievements } = await supabaseAdmin.from("achievements").select("*");
  if (achievements) {
    for (const achievement of achievements) {
      db.achievements[achievement.days] = achievement;
    }
  }

  // Load user achievements
  const { data: userAchievements } = await supabaseAdmin.from("user_achievements").select("*");
  if (userAchievements) {
    for (const ua of userAchievements) {
      db.userAchievements[ua.id] = ua;
    }
  }

  // Load notifications
  const { data: notifications } = await supabaseAdmin.from("notifications").select("*");
  if (notifications) {
    for (const notif of notifications) {
      db.notifications[notif.id] = notif;
    }
  }

  // Load follows
  const { data: follows } = await supabaseAdmin.from("follows").select("*");
  if (follows) {
    for (const follow of follows) {
      db.follows[`${follow.from_user_id}->${follow.to_user_id}`] = follow;
    }
  }

  // Load challenges
  const { data: challenges } = await supabaseAdmin.from("challenges").select("*");
  if (challenges) {
    for (const challenge of challenges) {
      db.challenges[challenge.id] = challenge;
    }
  }

  // Load close friends
  const { data: closeFriends } = await supabaseAdmin.from("close_friends").select("*");
  if (closeFriends) {
    for (const cf of closeFriends) {
      db.closeFriends[cf.id] = cf;
    }
  }

  // Load close friend requests
  const { data: closeFriendRequests } = await supabaseAdmin.from("close_friend_requests").select("*");
  if (closeFriendRequests) {
    for (const cfr of closeFriendRequests) {
      db.closeFriendRequests[cfr.id] = cfr;
    }
  }

  // Load freeze tokens
  const { data: freezeTokens } = await supabaseAdmin.from("freeze_tokens").select("*");
  if (freezeTokens) {
    for (const token of freezeTokens) {
      if (!db.freezeTokens[token.user_id]) {
        db.freezeTokens[token.user_id] = [];
      }
      db.freezeTokens[token.user_id].push(token);
    }
  }

  // Load waiting queue
  const { data: waitingQueue } = await supabaseAdmin.from("waiting_queue").select("*");
  if (waitingQueue) {
    for (const wq of waitingQueue) {
      db.waitingQueue[wq.id] = wq;
    }
  }

  // Load replacement queue
  const { data: replacementQueue } = await supabaseAdmin.from("replacement_queue").select("*");
  if (replacementQueue) {
    for (const rq of replacementQueue) {
      db.replacementQueue[rq.id] = rq;
    }
  }

  // Load config
  const { data: config } = await supabaseAdmin.from("config").select("*").eq("key", "system").single();
  if (config) {
    db.config = config.value;
  }

  return db;
}

async function saveSupabaseDb(db) {
  if (!supabaseAdmin) {
    throw new Error("Supabase not configured but USE_SUPABASE is true");
  }

  // Save users (upsert)
  const users = Object.values(db.users);
  if (users.length > 0) {
    // Ensure xp_awarded_keys is included in the upsert
    const usersWithXPKeys = users.map(u => ({
      ...u,
      xp_awarded_keys: u.xp_awarded_keys || {}
    }));
    await supabaseAdmin.from("users").upsert(usersWithXPKeys, { onConflict: "id" });
  }

  // Save sessions (upsert)
  const sessions = Object.values(db.sessions);
  if (sessions.length > 0) {
    await supabaseAdmin.from("sessions").upsert(sessions, { onConflict: "token" });
  }

  // Save rooms (upsert)
  const rooms = Object.values(db.rooms);
  if (rooms.length > 0) {
    await supabaseAdmin.from("rooms").upsert(rooms, { onConflict: "id" });
  }

  // Save room members (upsert)
  const roomMembers = Object.values(db.roomMembers);
  if (roomMembers.length > 0) {
    await supabaseAdmin.from("room_members").upsert(roomMembers, { onConflict: "id" });
  }

  // Save proofs (upsert)
  const proofs = Object.values(db.proofs);
  if (proofs.length > 0) {
    await supabaseAdmin.from("proofs").upsert(proofs, { onConflict: "id" });
  }

  // Save streaks (upsert)
  const streaks = Object.values(db.streaks);
  if (streaks.length > 0) {
    await supabaseAdmin.from("streaks").upsert(streaks, { onConflict: "user_id" });
  }

  // Save achievements (upsert)
  const achievements = Object.values(db.achievements);
  if (achievements.length > 0) {
    await supabaseAdmin.from("achievements").upsert(achievements, { onConflict: "days" });
  }

  // Save user achievements (upsert)
  const userAchievements = Object.values(db.userAchievements);
  if (userAchievements.length > 0) {
    await supabaseAdmin.from("user_achievements").upsert(userAchievements, { onConflict: "id" });
  }

  // Save notifications (upsert)
  const notifications = Object.values(db.notifications);
  if (notifications.length > 0) {
    await supabaseAdmin.from("notifications").upsert(notifications, { onConflict: "id" });
  }

  // Save follows (upsert)
  const follows = Object.values(db.follows);
  if (follows.length > 0) {
    const followRecords = follows.map(f => ({
      from_user_id: f.from,
      to_user_id: f.to,
      at: f.at
    }));
    await supabaseAdmin.from("follows").upsert(followRecords, { onConflict: "from_user_id,to_user_id" });
  }

  // Save challenges (upsert)
  const challenges = Object.values(db.challenges);
  if (challenges.length > 0) {
    await supabaseAdmin.from("challenges").upsert(challenges, { onConflict: "id" });
  }

  // Save close friends (upsert)
  const closeFriends = Object.values(db.closeFriends);
  if (closeFriends.length > 0) {
    await supabaseAdmin.from("close_friends").upsert(closeFriends, { onConflict: "id" });
  }

  // Save close friend requests (upsert)
  const closeFriendRequests = Object.values(db.closeFriendRequests);
  if (closeFriendRequests.length > 0) {
    await supabaseAdmin.from("close_friend_requests").upsert(closeFriendRequests, { onConflict: "id" });
  }

  // Save freeze tokens (delete and reinsert for simplicity)
  await supabaseAdmin.from("freeze_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const allFreezeTokens = [];
  for (const tokens of Object.values(db.freezeTokens)) {
    allFreezeTokens.push(...tokens);
  }
  if (allFreezeTokens.length > 0) {
    await supabaseAdmin.from("freeze_tokens").insert(allFreezeTokens);
  }

  // Save waiting queue (upsert)
  const waitingQueue = Object.values(db.waitingQueue);
  if (waitingQueue.length > 0) {
    await supabaseAdmin.from("waiting_queue").upsert(waitingQueue, { onConflict: "id" });
  }

  // Save replacement queue (upsert)
  const replacementQueue = Object.values(db.replacementQueue);
  if (replacementQueue.length > 0) {
    await supabaseAdmin.from("replacement_queue").upsert(replacementQueue, { onConflict: "id" });
  }

  // Save config
  await supabaseAdmin.from("config").upsert({ key: "system", value: db.config }, { onConflict: "key" });
}

// Export async functions
export async function loadDb() {
  if (USE_SUPABASE) {
    return await loadSupabaseDb();
  }
  return loadJsonDb();
}

export async function saveDb(db) {
  if (USE_SUPABASE) {
    await saveSupabaseDb(db);
  } else {
    saveJsonDb(db);
  }
}

// Async withDb for Supabase compatibility
export async function withDb(mutator) {
  const db = await loadDb();
  const result = mutator(db);
  await saveDb(db);
  return result;
}

// Synchronous withDb for backward compatibility (JSON only)
// This will fail in production if called - routes must be updated to async
export function withDbSync(mutator) {
  if (USE_SUPABASE) {
    throw new Error("Synchronous withDbSync cannot be used with Supabase. Use async withDb instead.");
  }
  const db = loadJsonDb();
  const result = mutator(db);
  saveJsonDb(db);
  return result;
}
