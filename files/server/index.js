/**
 * Capitol multi-user API — matches the client's existing /api/* contract.
 * JSON-file persistence so every registered account shares one database.
 */
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { loadDb, saveDb, withDb } from "./db.js";
import { isSupabaseConfigured, verifySupabaseAdmin, ensureSupabaseAuthUser } from "./supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "12mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" }[file.mimetype];
      cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
    cb(null, allowed.has(file.mimetype));
  },
});

function uid() {
  return "u_" + crypto.randomBytes(8).toString("hex");
}
function rid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + "_" + crypto.randomBytes(3).toString("hex");
}
function hashPass(password, salt = crypto.randomBytes(8).toString("hex")) {
  const hash = crypto.createHash("sha256").update(salt + ":" + password).digest("hex");
  return { salt, hash };
}
function checkPass(password, salt, hash) {
  return hashPass(password, salt).hash === hash;
}
function tokenFor(userId) {
  return "tok_" + crypto.createHash("sha256").update(userId + ":" + crypto.randomBytes(16).toString("hex")).digest("hex").slice(0, 40);
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, passwordSalt, password, email, ...safe } = u;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    email: undefined, // never expose email in public list
    photo_url: u.photo_url || null,
    avatar_config: u.avatar_config || null,
    banner_url: u.banner_url || "",
    bio: u.bio || "",
    pronouns: u.pronouns || "",
    timezone: u.timezone || "UTC",
    social_links: u.social_links || {},
    is_admin: !!u.is_admin,
    is_banned: !!u.is_banned,
    is_suspended: !!u.is_suspended,
    suspension_end: u.suspension_end || null,
    suspend_reason: u.suspend_reason || null,
    created_at: u.created_at,
    last_seen_at: u.last_seen_at,
    xp: u.xp ?? 0,
    level: u.level ?? 1,
    streak: u.streak ?? 0,
    best_streak: u.best_streak ?? 0,
    missed_days: u.missed_days ?? 0,
    warned: !!u.warned,
    kick_status: u.kick_status || "ok",
    kicked_from_room: !!u.kicked_from_room,
    proofs_count: u.proofs_count ?? 0,
    completed_rooms: u.completed_rooms ?? 0,
    joined_rooms: u.joined_rooms ?? 0,
    join_timestamp: u.join_timestamp || null,
    consistency_score: u.consistency_score ?? 0,
    near_miss_count: u.near_miss_count ?? 0,
    league: u.league || "bronze",
    grace_active: !!u.grace_active,
    grace_start_date: u.grace_start_date || null,
    grace_days_total: u.grace_days_total ?? 0,
    total_grace_used: u.total_grace_used ?? 0,
    last_submit_date: u.last_submit_date || null,
    vulture_claimed: u.vulture_claimed || null,
    onboarding_complete: u.onboarding_complete ? 1 : 0,
    onboarding_questions_complete: u.onboarding_questions_complete ? 1 : 0,
    niche: u.niche || "",
    age_range: u.age_range || "",
    room_joined_at: u.room_joined_at || null,
    onboard_bonus_awarded: u.onboard_bonus_awarded ? 1 : 0,
    safety_accepted: u.safety_accepted ?? null,
    invite_code: u.invite_code || "",
    invites_count: u.invites_count ?? 0,
    burned_at: u.burned_at || null,
    following: u.following || [],
    premium: !!u.premium,
  };
}

/** Self view may include email */
function selfUser(u) {
  const p = publicUser(u);
  if (!p) return null;
  return { ...p, email: u.email || "" };
}

function findUser(db, idOrUsername) {
  if (!idOrUsername) return null;
  if (db.users[idOrUsername]) return db.users[idOrUsername];
  return Object.values(db.users).find(
    (u) => u.username === idOrUsername || u.id === idOrUsername
  ) || null;
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) return res.status(401).json({ error: "Unauthorized" });
  const db = loadDb();
  const sess = db.sessions[tok];
  if (!sess) return res.status(401).json({ error: "Invalid session" });
  const user = db.users[sess.userId];
  if (!user) return res.status(401).json({ error: "User gone" });
  if (user.is_banned) return res.status(403).json({ error: "Banned" });
  req.user = user;
  req.token = tok;
  req.db = db;
  next();
}

function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (tok) {
    const db = loadDb();
    const sess = db.sessions[tok];
    if (sess && db.users[sess.userId]) {
      req.user = db.users[sess.userId];
      req.token = tok;
      req.db = db;
    }
  }
  next();
}

function roomMembers(db, roomId) {
  return Object.values(db.roomMembers).filter((m) => m.roomId === roomId && m.status === "active");
}

function serializeRoom(db, r) {
  const members = roomMembers(db, r.id);
  const memberUsers = members.map((m) => findUser(db, m.userId)).filter(Boolean);
  return {
    id: r.id,
    name: r.name,
    icon: r.icon || "bolt",
    goal: r.goal || "",
    niche: r.niche || "general",
    age_range: r.age_range || null,
    tags: r.tags || [],
    max_members: r.max_members || 8,
    member_count: members.length,
    elite: !!r.elite,
    days: r.days || 30,
    created_at: r.created_at,
    creator_uid: r.creator_uid || null,
    membersList: memberUsers.map((u) => (u.username || "?").slice(0, 2).toUpperCase()),
    memberUids: members.map((m) => m.userId),
  };
}

function calcLevel(xp) {
  if (!xp || xp < 0) return 1;
  let l = 1;
  while (100 * l ** 1.4 <= xp) l++;
  return Math.max(1, l - 1);
}

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  const { displayName, username, email, password } = req.body || {};
  if (!displayName || !username || !email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be 6+ characters" });
  }
  try {
    const result = withDb((db) => {
      if (Object.values(db.users).some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        throw Object.assign(new Error("Username already taken"), { status: 409 });
      }
      if (Object.values(db.users).some((u) => (u.email || "").toLowerCase() === String(email).toLowerCase())) {
        throw Object.assign(new Error("Email already registered"), { status: 409 });
      }
      const id = uid();
      const { salt, hash } = hashPass(password);
      const now = new Date().toISOString();
      const invite = username.toUpperCase().slice(0, 4) + crypto.randomBytes(2).toString("hex").toUpperCase();
      const palette = ["#F5C800", "#A7D8DE", "#C4B5FD", "#F9A8D4", "#86EFAC", "#FDBA74"];
      let avatarHash = 0;
      for (const char of String(username).toLowerCase()) avatarHash = (avatarHash * 31 + char.charCodeAt(0)) >>> 0;
      const user = {
        id,
        username,
        email: String(email).toLowerCase(),
        display_name: String(displayName).trim(),
        passwordSalt: salt,
        passwordHash: hash,
        photo_url: null,
        avatar_config: { background: palette[avatarHash % palette.length], letter: username[0].toUpperCase() },
        banner_url: "",
        bio: "",
        pronouns: "",
        timezone: "UTC",
        social_links: {},
        is_admin: false,
        is_banned: false,
        is_suspended: false,
        suspension_end: null,
        suspend_reason: null,
        created_at: now,
        last_seen_at: now,
        xp: 0,
        level: 1,
        streak: 0,
        best_streak: 0,
        missed_days: 0,
        warned: false,
        kick_status: "ok",
        kicked_from_room: false,
        proofs_count: 0,
        completed_rooms: 0,
        joined_rooms: 0,
        join_timestamp: now,
        consistency_score: 0,
        near_miss_count: 0,
        league: "bronze",
        grace_active: false,
        grace_start_date: null,
        grace_days_total: 0,
        total_grace_used: 0,
        last_submit_date: null,
        vulture_claimed: null,
        onboarding_complete: false,
        onboarding_questions_complete: false,
        niche: "",
        age_range: "",
        room_joined_at: null,
        onboard_bonus_awarded: false,
        safety_accepted: false,
        invite_code: invite,
        invites_count: 0,
        burned_at: null,
        following: [],
        premium: false,
      };
      db.users[id] = user;
      const tok = tokenFor(id);
      db.sessions[tok] = { userId: id, createdAt: now };
      return { token: tok, user: selfUser(user), _sync: { email: user.email, password, username, displayName: user.display_name, id } };
    });
    // Mirror into Auth before responding so client sign-in can succeed immediately.
    const sync = result._sync;
    delete result._sync;
    if (sync) {
      await ensureSupabaseAuthUser({
        email: sync.email,
        password: sync.password,
        metadata: { username: sync.username, display_name: sync.displayName, capitol_id: sync.id },
      }).catch(() => {});
    }
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Signup failed" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });
  const db = loadDb();
  const user = Object.values(db.users).find(
    (u) => (u.email || "").toLowerCase() === String(email).toLowerCase()
  );
  if (!user || !checkPass(password, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.is_banned) return res.status(403).json({ error: "Account banned" });
  const tok = tokenFor(user.id);
  user.last_seen_at = new Date().toISOString();
  db.sessions[tok] = { userId: user.id, createdAt: new Date().toISOString() };
  saveDb(db);
  ensureSupabaseAuthUser({
    email: user.email,
    password,
    metadata: { username: user.username, display_name: user.display_name, capitol_id: user.id },
  }).catch(() => {});
  res.json({ token: tok, user: selfUser(user) });
});

// ── Users ────────────────────────────────────────────────────────────────────
app.get("/api/users/check/:username", (req, res) => {
  const db = loadDb();
  const taken = Object.values(db.users).some(
    (u) => u.username.toLowerCase() === String(req.params.username).toLowerCase()
  );
  res.json({ taken });
});

app.get("/api/users", optionalAuth, (req, res) => {
  const db = loadDb();
  const users = Object.values(db.users)
    .filter((u) => !u.is_banned)
    .map(publicUser);
  res.json({ users });
});

app.get("/api/users/:id", optionalAuth, (req, res) => {
  const db = loadDb();
  const user = findUser(db, req.params.id);
  if (!user || user.is_banned) return res.status(404).json({ error: "Not found" });
  const isSelf = req.user && req.user.id === user.id;
  res.json({ user: isSelf ? selfUser(user) : publicUser(user) });
});

app.patch("/api/users/me", auth, (req, res) => {
  const body = req.body || {};
  for (const key of ["photo_url", "banner_url"]) {
    if (key in body && body[key] != null && /^(blob:|data:)/i.test(String(body[key]))) {
      return res.status(400).json({ error: "Temporary image URLs cannot be saved." });
    }
  }
  const allowed = [
    "display_name", "photo_url", "avatar_config", "banner_url", "bio", "pronouns", "timezone",
    "social_links", "xp", "streak", "level", "missed_days", "last_submit_date",
    "warned", "kick_status", "kicked_from_room", "completed_rooms", "joined_rooms",
    "safety_accepted", "safety_accepted_at", "room_joined_at", "join_timestamp",
    "onboarding_complete", "onboarding_questions_complete", "niche", "age_range",
    "onboard_bonus_awarded", "vulture_claimed", "last_seen_date",
    "grace_used_this_month", "grace_last_month", "grace_active", "grace_start_date",
    "grace_days_total", "burned_at", "following", "premium", "best_streak",
    "proofs_count", "league",
  ];
  withDb((db) => {
    const u = db.users[req.user.id];
    if (!u) return;
    for (const k of allowed) {
      if (k in body) u[k] = body[k];
    }
    if ("xp" in body) u.level = calcLevel(body.xp);
    u.last_seen_at = new Date().toISOString();
    res.json({ user: selfUser(u) });
  });
});

app.post("/api/users/follow/:targetId", auth, (req, res) => {
  withDb((db) => {
    const me = db.users[req.user.id];
    const target = findUser(db, req.params.targetId);
    if (!target) return res.status(404).json({ error: "Not found" });
    if (target.id === me.id) return res.status(400).json({ error: "Cannot follow self" });
    const key = me.id + "->" + target.id;
    db.follows[key] = { from: me.id, to: target.id, at: new Date().toISOString() };
    const init = (target.username || "?").slice(0, 2).toUpperCase();
    if (!Array.isArray(me.following)) me.following = [];
    if (!me.following.includes(init)) me.following.push(init);
    const nid = rid("notif");
    db.notifications[nid] = {
      id: nid,
      user_id: target.id,
      type: "follow",
      read: false,
      created_at: new Date().toISOString(),
      data: JSON.stringify({ fromUid: me.id, fromName: me.display_name, fromUsername: me.username }),
    };
    res.json({ ok: true });
  });
});

app.delete("/api/users/follow/:targetId", auth, (req, res) => {
  withDb((db) => {
    const me = db.users[req.user.id];
    const target = findUser(db, req.params.targetId);
    if (!target) return res.status(404).json({ error: "Not found" });
    delete db.follows[me.id + "->" + target.id];
    const init = (target.username || "?").slice(0, 2).toUpperCase();
    me.following = (me.following || []).filter((x) => x !== init);
    res.json({ ok: true });
  });
});

app.post("/api/users/:id/ban", auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
  withDb((db) => {
    const u = findUser(db, req.params.id);
    if (!u) return res.status(404).json({ error: "Not found" });
    u.is_banned = true;
    res.json({ ok: true });
  });
});

app.post("/api/users/:id/unban", auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
  withDb((db) => {
    const u = findUser(db, req.params.id);
    if (!u) return res.status(404).json({ error: "Not found" });
    u.is_banned = false;
    res.json({ ok: true });
  });
});

app.post("/api/users/:id/suspend", auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
  const hours = Number(req.body?.hours || 24);
  withDb((db) => {
    const u = findUser(db, req.params.id);
    if (!u) return res.status(404).json({ error: "Not found" });
    u.is_suspended = true;
    u.suspension_end = new Date(Date.now() + hours * 3600000).toISOString();
    u.suspend_reason = req.body?.reason || "";
    res.json({ ok: true });
  });
});

// ── Rooms ────────────────────────────────────────────────────────────────────
app.get("/api/rooms", optionalAuth, (req, res) => {
  const db = loadDb();
  const rooms = Object.values(db.rooms).map((r) => serializeRoom(db, r));
  res.json({ rooms });
});

app.post("/api/rooms", auth, (req, res) => {
  const b = req.body || {};
  const result = withDb((db) => {
    const id = rid("room");
    const room = {
      id,
      name: b.name || "Room",
      icon: b.icon || "bolt",
      goal: b.goal || "",
      niche: b.niche || "general",
      age_range: b.ageRange || b.age_range || null,
      tags: b.tags || [],
      max_members: b.maxMembers || b.max || 8,
      elite: !!b.elite,
      days: b.days || 30,
      created_at: new Date().toISOString(),
      creator_uid: req.user.id,
    };
    db.rooms[id] = room;
    const mid = rid("rm");
    db.roomMembers[mid] = {
      id: mid,
      roomId: id,
      userId: req.user.id,
      status: "active",
      joinedAt: new Date().toISOString(),
    };
    const u = db.users[req.user.id];
    if (u) {
      u.room_joined_at = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      u.joined_rooms = (u.joined_rooms || 0) + 1;
    }
    return { room: serializeRoom(db, room) };
  });
  res.json(result);
});

app.post("/api/rooms/:id/join", auth, (req, res) => {
  try {
    withDb((db) => {
      const room = db.rooms[req.params.id];
      if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
      const members = roomMembers(db, room.id);
      if (members.length >= (room.max_members || 8)) {
        throw Object.assign(new Error("Room is full"), { status: 400 });
      }
      // Leave any other active room first (one room at a time)
      for (const m of Object.values(db.roomMembers)) {
        if (m.userId === req.user.id && m.status === "active") m.status = "left";
      }
      const existing = Object.values(db.roomMembers).find(
        (m) => m.roomId === room.id && m.userId === req.user.id
      );
      if (existing) {
        existing.status = "active";
        existing.joinedAt = new Date().toISOString();
      } else {
        const mid = rid("rm");
        db.roomMembers[mid] = {
          id: mid,
          roomId: room.id,
          userId: req.user.id,
          status: "active",
          joinedAt: new Date().toISOString(),
        };
      }
      const u = db.users[req.user.id];
      if (u) {
        u.room_joined_at = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        u.joined_rooms = (u.joined_rooms || 0) + 1;
      }
      res.json({ ok: true, room: serializeRoom(db, room) });
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.post("/api/rooms/:id/leave", auth, (req, res) => {
  withDb((db) => {
    for (const m of Object.values(db.roomMembers)) {
      if (m.roomId === req.params.id && m.userId === req.user.id && m.status === "active") {
        m.status = "left";
      }
    }
    const u = db.users[req.user.id];
    if (u) u.room_joined_at = null;
    
    // Queue replacement if room is below minimum size
    const room = db.rooms[req.params.id];
    if (room) {
      const members = roomMembers(db, room.id);
      const minRoomSize = db.config?.minRoomSize || 3;
      // Only queue if room has at least 1 member (don't queue replacement for empty rooms)
      if (members.length > 0 && members.length < minRoomSize) {
        queueReplacement(db, room.id);
      }
    }
    
    res.json({ ok: true });
  });
});

app.post("/api/rooms/:id/kick", auth, (req, res) => {
  const targetId = req.body?.targetId;
  withDb((db) => {
    const room = db.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: "Not found" });
    const target = findUser(db, targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    for (const m of Object.values(db.roomMembers)) {
      if (m.roomId === room.id && m.userId === target.id && m.status === "active") {
        m.status = "kicked";
      }
    }
    target.kicked_from_room = true;
    target.kick_status = "kicked";
    target.xp = Math.max(0, (target.xp || 0) - 20);
    target.burned_at = new Date().toISOString();
    
    // Queue replacement if room is below minimum size
    const members = roomMembers(db, room.id);
    const minRoomSize = db.config?.minRoomSize || 3;
    // Only queue if room has at least 1 member (don't queue replacement for empty rooms)
    if (members.length > 0 && members.length < minRoomSize) {
      queueReplacement(db, room.id);
    }
    
    res.json({ ok: true });
  });
});

// ── Proofs ───────────────────────────────────────────────────────────────────
app.get("/api/proofs", optionalAuth, (req, res) => {
  const db = loadDb();
  const userId = req.query.userId;
  const limit = Number(req.query.limit || 50);
  let proofs = Object.values(db.proofs);
  if (userId) {
    const u = findUser(db, userId);
    proofs = proofs.filter((p) => p.user_id === userId || (u && p.user_id === u.id));
  }
  proofs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const enriched = proofs.slice(0, limit).map((p) => {
    const owner = findUser(db, p.user_id);
    return {
      ...p,
      user_name: owner?.display_name || "",
      user_photo: owner?.photo_url || null,
    };
  });
  res.json({ proofs: enriched });
});

app.post("/api/proofs", auth, (req, res) => {
  const b = req.body || {};
  const result = withDb((db) => {
    const today = new Date().toISOString().slice(0, 10);
    const u = db.users[req.user.id];
    const existing = Object.values(db.proofs).find((p) => p.user_id === req.user.id && p.date_key === today);
    if (existing) {
      return { proof: existing, stats: { xp: u.xp, level: u.level, streak: u.streak || 0, xpGained: 0 }, duplicate: true };
    }
    const id = rid("proof");
    const dates = new Set(Object.values(db.proofs)
      .filter((p) => p.user_id === req.user.id && p.ai_verdict === "approved")
      .map((p) => p.date_key));
    dates.add(today);
    let newStreak = 0;
    const cursor = new Date(`${today}T00:00:00Z`);
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      newStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    const xpGain = 10 + Math.min(newStreak, 30) * 2;
    const proof = {
      id,
      user_id: req.user.id,
      date_key: today,
      created_at: new Date().toISOString(),
      image_url: b.imageUrl || b.image || null,
      link: b.link || "",
      note: b.note || "",
      streak: newStreak,
      xp_earned: xpGain,
      ai_verdict: "approved",
      room_id: b.roomId || null,
      votes: "{}",
      gesture: b.gesture || null,
    };
    db.proofs[id] = proof;
    u.streak = newStreak;
    u.best_streak = Math.max(u.best_streak || 0, newStreak);
    u.xp = (u.xp || 0) + xpGain;
    u.level = calcLevel(u.xp);
    u.last_submit_date = today;
    u.proofs_count = (u.proofs_count || 0) + 1;
    u.missed_days = 0;
    u.warned = false;
    db.streaks[u.id] = {
      user_id: u.id,
      current_streak: newStreak,
      best_streak: Math.max(u.best_streak || 0, newStreak),
      last_qualifying_date: today,
      updated_at: new Date().toISOString(),
    };
    const milestones = [
      [1, "First Day", "Completed your first qualifying proof."],
      [3, "Early Momentum", "Maintained a 3 day streak."],
      [7, "Weekly Consistency", "Maintained a 7 day streak."],
      [13, "Elite Consistency", "Maintained a 13 day streak."],
    ];
    for (const [days, name, description] of milestones) {
      if (newStreak >= days) {
        const key = `${u.id}:${days}`;
        if (!db.userAchievements[key]) {
          db.achievements[days] = { days, name, description };
          db.userAchievements[key] = { id: key, user_id: u.id, achievement_days: days, unlocked_at: new Date().toISOString() };
        }
      }
    }
    return {
      proof,
      stats: { xp: u.xp, level: u.level, streak: u.streak, xpGained: xpGain },
    };
  });
  res.json(result);
});

// ── Notifications ────────────────────────────────────────────────────────────
app.get("/api/notifications", auth, (req, res) => {
  const db = loadDb();
  const list = Object.values(db.notifications)
    .filter((n) => n.user_id === req.user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ notifications: list });
});

app.post("/api/notifications", auth, (req, res) => {
  const { userId, type, data, eventKey } = req.body || {};
  const target = findUser(loadDb(), userId);
  if (!target) return res.status(404).json({ error: "Not found" });
  // Anyone authenticated can create a notification for another user (friend request etc.)
  // but cannot invent notifications as if from someone else without being themselves.
  const result = withDb((db) => {
    const duplicate = eventKey && Object.values(db.notifications).find((n) => {
      if (n.user_id !== target.id) return false;
      try { return JSON.parse(n.data || "{}").eventKey === eventKey; } catch { return false; }
    });
    if (duplicate) return { notification: duplicate, duplicate: true };
    const id = rid("notif");
    const n = {
      id,
      user_id: target.id,
      type: type || "info",
      read: false,
      created_at: new Date().toISOString(),
      data: JSON.stringify({ ...(data || {}), ...(eventKey ? { eventKey } : {}), fromUid: req.user.id }),
    };
    db.notifications[id] = n;
    return { notification: n };
  });
  res.json(result);
});

app.post("/api/notifications/read", auth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  withDb((db) => {
    for (const id of ids) {
      const n = db.notifications[id];
      if (n && n.user_id === req.user.id) n.read = true;
    }
  });
  res.json({ ok: true });
});

// ── Leaderboard ──────────────────────────────────────────────────────────────
app.get("/api/leaderboard", optionalAuth, (req, res) => {
  const db = loadDb();
  const leaderboard = Object.values(db.users)
    .filter((u) => !u.is_banned)
    .sort((a, b) => (b.xp || 0) - (a.xp || 0))
    .slice(0, 200)
    .map(publicUser);
  res.json({ leaderboard });
});

// ── Challenges ───────────────────────────────────────────────────────────────
app.get("/api/challenges", auth, (req, res) => {
  const db = loadDb();
  const list = Object.values(db.challenges).filter(
    (c) => c.fromUid === req.user.id || c.toUid === req.user.id
  );
  res.json({ challenges: list });
});

app.post("/api/challenges", auth, (req, res) => {
  const { challengedId, durationDays, stakes, message } = req.body || {};
  const target = findUser(loadDb(), challengedId);
  if (!target) return res.status(404).json({ error: "User not found" });
  const result = withDb((db) => {
    const id = rid("chal");
    const c = {
      id,
      fromUid: req.user.id,
      toUid: target.id,
      durationDays: durationDays || 7,
      stakes: stakes || 0,
      message: message || "",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db.challenges[id] = c;
    const nid = rid("notif");
    db.notifications[nid] = {
      id: nid,
      user_id: target.id,
      type: "challenge",
      read: false,
      created_at: new Date().toISOString(),
      data: JSON.stringify({ challengeId: id, fromUid: req.user.id, fromName: req.user.display_name }),
    };
    return { challenge: c };
  });
  res.json(result);
});

app.post("/api/challenges/:id/accept", auth, (req, res) => {
  withDb((db) => {
    const c = db.challenges[req.params.id];
    if (!c || c.toUid !== req.user.id) return res.status(404).json({ error: "Not found" });
    c.status = "accepted";
    res.json({ ok: true });
  });
});

app.post("/api/challenges/:id/decline", auth, (req, res) => {
  withDb((db) => {
    const c = db.challenges[req.params.id];
    if (!c || c.toUid !== req.user.id) return res.status(404).json({ error: "Not found" });
    c.status = "declined";
    res.json({ ok: true });
  });
});

// ── Close friends ────────────────────────────────────────────────────────────
app.get("/api/close-friends", auth, (req, res) => {
  const db = loadDb();
  const friends = Object.values(db.closeFriends)
    .filter((f) => f.a === req.user.id || f.b === req.user.id)
    .map((f) => {
      const otherId = f.a === req.user.id ? f.b : f.a;
      return publicUser(findUser(db, otherId));
    })
    .filter(Boolean);
  res.json({ friends });
});

app.get("/api/close-friends/requests", auth, (req, res) => {
  const db = loadDb();
  const all = Object.values(db.closeFriendRequests);
  const sent = all.filter((r) => r.from === req.user.id && r.status === "pending");
  const received = all.filter((r) => r.to === req.user.id && r.status === "pending");
  res.json({ sent, received });
});

app.post("/api/close-friends/request", auth, (req, res) => {
  const target = findUser(loadDb(), req.body?.targetId);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.id === req.user.id) return res.status(400).json({ error: "Cannot friend self" });
  withDb((db) => {
    const id = rid("cfr");
    db.closeFriendRequests[id] = {
      id,
      from: req.user.id,
      to: target.id,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const nid = rid("notif");
    db.notifications[nid] = {
      id: nid,
      user_id: target.id,
      type: "friend_request",
      read: false,
      created_at: new Date().toISOString(),
      data: JSON.stringify({ requestId: id, fromUid: req.user.id, fromName: req.user.display_name, fromUsername: req.user.username }),
    };
    res.json({ ok: true, requestId: id });
  });
});

app.post("/api/close-friends/respond", auth, (req, res) => {
  const { requestId, accept } = req.body || {};
  withDb((db) => {
    const r = db.closeFriendRequests[requestId];
    if (!r || r.to !== req.user.id) return res.status(404).json({ error: "Not found" });
    r.status = accept ? "accepted" : "declined";
    if (accept) {
      const fid = rid("cf");
      db.closeFriends[fid] = { id: fid, a: r.from, b: r.to, createdAt: new Date().toISOString() };
    }
    res.json({ ok: true });
  });
});

app.delete("/api/close-friends/:friendId", auth, (req, res) => {
  withDb((db) => {
    const friend = findUser(db, req.params.friendId);
    if (!friend) return res.status(404).json({ error: "Not found" });
    for (const [id, f] of Object.entries(db.closeFriends)) {
      if (
        (f.a === req.user.id && f.b === friend.id) ||
        (f.b === req.user.id && f.a === friend.id)
      ) {
        delete db.closeFriends[id];
      }
    }
    res.json({ ok: true });
  });
});

// ── Referrals ────────────────────────────────────────────────────────────────
app.get("/api/referrals/code/:code", (req, res) => {
  const db = loadDb();
  const inviter = Object.values(db.users).find(
    (u) => (u.invite_code || "").toUpperCase() === String(req.params.code).toUpperCase()
  );
  res.json({ inviter: inviter ? publicUser(inviter) : null });
});

app.post("/api/referrals/process", auth, (req, res) => {
  const { inviterId } = req.body || {};
  withDb((db) => {
    const inviter = findUser(db, inviterId);
    if (!inviter || inviter.id === req.user.id) return res.json({ ok: false });
    inviter.invites_count = (inviter.invites_count || 0) + 1;
    inviter.xp = (inviter.xp || 0) + 50;
    inviter.level = calcLevel(inviter.xp);
    res.json({ ok: true, xpBonus: 50, milestoneBonus: 0 });
  });
});

// ── Economy ──────────────────────────────────────────────────────────────────
app.post("/api/economy/xp", auth, (req, res) => {
  const amount = Number(req.body?.amount || 0);
  withDb((db) => {
    const u = db.users[req.user.id];
    u.xp = Math.max(0, (u.xp || 0) + amount);
    u.level = calcLevel(u.xp);
    res.json({ ok: true, xpGained: amount, xp: u.xp, level: u.level });
  });
});

app.get("/api/economy/freeze-tokens", auth, (req, res) => {
  const db = loadDb();
  const tokens = (db.freezeTokens[req.user.id] || []).filter((t) => !t.used);
  res.json({ tokens });
});

app.post("/api/economy/buy-freeze", auth, (req, res) => {
  withDb((db) => {
    const u = db.users[req.user.id];
    const cost = 100;
    if ((u.xp || 0) < cost) return res.status(400).json({ error: "Not enough XP" });
    u.xp -= cost;
    u.level = calcLevel(u.xp);
    if (!db.freezeTokens[u.id]) db.freezeTokens[u.id] = [];
    const t = { id: rid("ft"), used: false, boughtAt: new Date().toISOString() };
    db.freezeTokens[u.id].push(t);
    res.json({ ok: true, token: t });
  });
});

app.post("/api/economy/use-freeze", auth, (req, res) => {
  withDb((db) => {
    const list = db.freezeTokens[req.user.id] || [];
    const t = list.find((x) => !x.used);
    if (!t) return res.status(400).json({ error: "No tokens" });
    t.used = true;
    res.json({ ok: true });
  });
});

// ── Auto-Kick + Auto-Replacement System ──────────────────────────────────────

// Helper: Check if user has submitted proof today for a specific room
function hasProofToday(db, userId, roomId) {
  const today = new Date().toISOString().slice(0, 10);
  return Object.values(db.proofs).some(
    (p) => p.user_id === userId && 
    (p.room_id === roomId || !p.room_id) && 
    p.date_key === today &&
    p.ai_verdict === "approved"
  );
}

// Helper: Get days since last proof for a user in a room
function daysSinceLastProof(db, userId, roomId) {
  const roomProofs = Object.values(db.proofs).filter(
    (p) => p.user_id === userId && 
    (p.room_id === roomId || !p.room_id) &&
    p.ai_verdict === "approved"
  );
  if (roomProofs.length === 0) return 999;
  
  roomProofs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const lastProof = roomProofs[0];
  const lastDate = lastProof.date_key;
  const today = new Date().toISOString().slice(0, 10);
  
  const diff = new Date(today) - new Date(lastDate);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Helper: Find eligible replacement for a room
function findReplacement(db, room) {
  const threshold = db.config?.inactivityThresholdDays || 3;
  const maxRoomSize = db.config?.maxRoomSize || 8;
  
  // Get current room members for comparison
  const currentMembers = roomMembers(db, room.id);
  const currentMemberIds = new Set(currentMembers.map(m => m.userId));
  
  // Find users in waiting queue who match room criteria
  const candidates = Object.values(db.waitingQueue).filter(w => {
    const user = db.users[w.userId];
    if (!user) return false;
    if (currentMemberIds.has(user.id)) return false;
    if (user.is_banned || user.is_suspended) return false;
    
    // Check if user is already in an active room (unless premium)
    const hasActiveRoom = Object.values(db.roomMembers).some(
      m => m.userId === user.id && m.status === "active"
    );
    if (hasActiveRoom && !user.premium) return false;
    
    // Match niche/topic
    if (room.niche && room.niche !== "general" && user.niche !== room.niche) {
      return false;
    }
    
    // Match age range
    if (room.age_range && user.age_range && user.age_range !== room.age_range) {
      return false;
    }
    
    return true;
  });
  
  if (candidates.length === 0) return null;
  
  // Prioritize: same topic, closest age match, longest waiting
  candidates.sort((a, b) => {
    const userA = db.users[a.userId];
    const userB = db.users[b.userId];
    
    // Priority 1: Same topic/niche
    const topicMatchA = room.niche && userA.niche === room.niche;
    const topicMatchB = room.niche && userB.niche === room.niche;
    if (topicMatchA && !topicMatchB) return -1;
    if (!topicMatchA && topicMatchB) return 1;
    
    // Priority 2: Longest time waiting
    const waitTimeA = new Date() - new Date(a.joinedAt);
    const waitTimeB = new Date() - new Date(b.joinedAt);
    return waitTimeB - waitTimeA;
  });
  
  return candidates[0];
}

// Helper: Check and process inactive members for all rooms
function processInactiveMembers(db) {
  const threshold = db.config?.inactivityThresholdDays || 3;
  const now = new Date().toISOString();
  let kickedCount = 0;
  
  // Update last activity check time
  if (!db.config) db.config = {};
  db.config.lastActivityCheck = now;
  
  // Check each room
  for (const room of Object.values(db.rooms)) {
    const members = roomMembers(db, room.id);
    
    for (const member of members) {
      const user = db.users[member.userId];
      if (!user) continue;
      
      const daysSince = daysSinceLastProof(db, user.id, room.id);
      
      // Check if member is inactive
      if (daysSince >= threshold) {
        // Mark member as inactive and remove from room
        member.status = "inactive_kicked";
        member.inactiveSince = now;
        member.inactiveReason = `No proof for ${daysSince} days`;
        
        // Update user status
        user.kicked_from_room = true;
        user.kick_status = "inactive";
        user.burned_at = now;
        user.xp = Math.max(0, (user.xp || 0) - 20);
        
        // Create notification for kicked user
        const nid = rid("notif");
        db.notifications[nid] = {
          id: nid,
          user_id: user.id,
          type: "kick",
          read: false,
          created_at: now,
          data: JSON.stringify({
            reason: `Inactive for ${daysSince} days`,
            roomId: room.id,
            roomName: room.name,
          }),
        };
        
        kickedCount++;
        
        // Queue replacement for this room only if it still has members
        const remainingMembers = roomMembers(db, room.id);
        const minRoomSize = db.config?.minRoomSize || 3;
        if (remainingMembers.length > 0 && remainingMembers.length < minRoomSize) {
          queueReplacement(db, room.id);
        }
      }
    }
  }
  
  return kickedCount;
}

// Helper: Queue a replacement for a room
function queueReplacement(db, roomId) {
  const existing = Object.values(db.replacementQueue).find(r => r.roomId === roomId && r.status === "pending");
  if (existing) return; // Already queued
  
  const id = rid("rep");
  db.replacementQueue[id] = {
    id,
    roomId,
    status: "pending",
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
}

// Helper: Process replacement queue
function processReplacementQueue(db) {
  const processed = [];
  const assignedUserIds = new Set(); // Track users assigned in this batch to prevent duplicates
  
  for (const [id, replacement] of Object.entries(db.replacementQueue)) {
    if (replacement.status !== "pending") continue;
    
    const room = db.rooms[replacement.roomId];
    if (!room) {
      replacement.status = "failed";
      replacement.error = "Room not found";
      continue;
    }
    
    const currentMembers = roomMembers(db, room.id);
    const maxRoomSize = db.config?.maxRoomSize || 8;
    
    // Check if room still needs replacement
    if (currentMembers.length >= maxRoomSize) {
      replacement.status = "completed";
      replacement.reason = "Room full";
      continue;
    }
    
    // Find replacement candidate
    const candidate = findReplacement(db, room);
    if (!candidate) {
      replacement.attempts = (replacement.attempts || 0) + 1;
      // Retry later if under max attempts
      if (replacement.attempts >= 10) {
        replacement.status = "failed";
        replacement.error = "No eligible candidates found after multiple attempts";
      }
      continue;
    }
    
    // Check if candidate was already assigned in this batch (race condition protection)
    if (assignedUserIds.has(candidate.userId)) {
      replacement.attempts = (replacement.attempts || 0) + 1;
      continue;
    }
    
    // Add candidate to room (atomic operation)
    const user = db.users[candidate.userId];
    if (!user) {
      replacement.status = "failed";
      replacement.error = "Candidate user not found";
      continue;
    }
    
    // Double-check user is not already in this room
    const alreadyInRoom = currentMembers.some(m => m.userId === user.id);
    if (alreadyInRoom) {
      replacement.status = "completed";
      replacement.reason = "User already in room";
      continue;
    }
    
    // Remove from waiting queue
    delete db.waitingQueue[candidate.id];
    
    // Leave any other active room first
    for (const m of Object.values(db.roomMembers)) {
      if (m.userId === user.id && m.status === "active") {
        m.status = "left";
      }
    }
    
    // Re-check room capacity after potential concurrent changes
    const updatedMembers = roomMembers(db, room.id);
    if (updatedMembers.length >= maxRoomSize) {
      replacement.status = "completed";
      replacement.reason = "Room became full during processing";
      // Put user back in waiting queue
      const newWaitId = rid("wait");
      db.waitingQueue[newWaitId] = {
        id: newWaitId,
        userId: user.id,
        niche: candidate.niche || user.niche || "",
        ageRange: candidate.ageRange || user.age_range || "",
        joinedAt: new Date().toISOString(),
      };
      continue;
    }
    
    // Add to room
    const mid = rid("rm");
    db.roomMembers[mid] = {
      id: mid,
      roomId: room.id,
      userId: user.id,
      status: "active",
      joinedAt: new Date().toISOString(),
      replacement: true,
    };
    
    // Mark user as assigned to prevent duplicate assignments in this batch
    assignedUserIds.add(user.id);
    
    // Update user
    user.room_joined_at = new Date().toLocaleDateString("en-US", { 
      month: "long", day: "numeric", year: "numeric" 
    });
    user.joined_rooms = (user.joined_rooms || 0) + 1;
    
    // Notify new member
    const nid1 = rid("notif");
    db.notifications[nid1] = {
      id: nid1,
      user_id: user.id,
      type: "room_joined",
      read: false,
      created_at: new Date().toISOString(),
      data: JSON.stringify({
        roomId: room.id,
        roomName: room.name,
        message: "You've been matched into a new room!",
      }),
    };
    
    // Notify existing room members
    for (const member of currentMembers) {
      const nid2 = rid("notif");
      db.notifications[nid2] = {
        id: nid2,
        user_id: member.userId,
        type: "new_member",
        read: false,
        created_at: new Date().toISOString(),
        data: JSON.stringify({
          roomId: room.id,
          roomName: room.name,
          newMemberName: user.display_name,
          message: `${user.display_name} joined your room`,
        }),
      };
    }
    
    replacement.status = "completed";
    replacement.candidateId = user.id;
    processed.push({ roomId: room.id, userId: user.id });
  }
  
  return processed;
}

// API: Add user to waiting queue
app.post("/api/waiting-queue/join", auth, (req, res) => {
  const { niche, ageRange } = req.body || {};
  withDb((db) => {
    // Remove any existing waiting entry
    for (const [id, w] of Object.entries(db.waitingQueue)) {
      if (w.userId === req.user.id) {
        delete db.waitingQueue[id];
      }
    }
    
    const id = rid("wait");
    db.waitingQueue[id] = {
      id,
      userId: req.user.id,
      niche: niche || req.user.niche || "",
      ageRange: ageRange || req.user.age_range || "",
      joinedAt: new Date().toISOString(),
    };
    
    // Try to find immediate match
    for (const room of Object.values(db.rooms)) {
      const members = roomMembers(db, room.id);
      const maxRoomSize = db.config?.maxRoomSize || 8;
      
      if (members.length < maxRoomSize) {
        const candidate = findReplacement(db, room);
        if (candidate && candidate.userId === req.user.id) {
          // Immediate match found
          queueReplacement(db, room.id);
          const result = processReplacementQueue(db);
          if (result.length > 0) {
            return res.json({ 
              ok: true, 
              queued: false, 
              matched: true, 
              roomId: room.id 
            });
          }
        }
      }
    }
    
    res.json({ ok: true, queued: true, waitingId: id });
  });
});

// API: Remove user from waiting queue
app.delete("/api/waiting-queue/leave", auth, (req, res) => {
  withDb((db) => {
    for (const [id, w] of Object.entries(db.waitingQueue)) {
      if (w.userId === req.user.id) {
        delete db.waitingQueue[id];
      }
    }
    res.json({ ok: true });
  });
});

// API: Get waiting queue status
app.get("/api/waiting-queue/status", auth, (req, res) => {
  const db = loadDb();
  const entry = Object.values(db.waitingQueue).find(w => w.userId === req.user.id);
  res.json({ 
    inQueue: !!entry, 
    entry: entry || null,
    queueSize: Object.keys(db.waitingQueue).length 
  });
});

// API: Manual trigger for activity check (admin only)
app.post("/api/admin/check-activity", auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
  
  const result = withDb((db) => {
    const kickedCount = processInactiveMembers(db);
    const replacements = processReplacementQueue(db);
    return { kickedCount, replacementsProcessed: replacements.length };
  });
  
  res.json(result);
});

// API: Get system config (admin only)
app.get("/api/admin/config", auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
  
  const db = loadDb();
  res.json({ config: db.config || {} });
});

// API: Update system config (admin only)
app.patch("/api/admin/config", auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: "Forbidden" });
  
  const { inactivityThresholdDays, minRoomSize, maxRoomSize } = req.body || {};
  
  withDb((db) => {
    if (!db.config) db.config = {};
    if (inactivityThresholdDays !== undefined) db.config.inactivityThresholdDays = inactivityThresholdDays;
    if (minRoomSize !== undefined) db.config.minRoomSize = minRoomSize;
    if (maxRoomSize !== undefined) db.config.maxRoomSize = maxRoomSize;
    res.json({ config: db.config });
  });
});

// Schedule periodic activity check (every hour)
setInterval(() => {
  try {
    withDb((db) => {
      processInactiveMembers(db);
      processReplacementQueue(db);
    });
  } catch (error) {
    console.error("Activity check error:", error);
  }
}, 60 * 60 * 1000); // 1 hour

// ── Images ───────────────────────────────────────────────────────────────────
app.post("/api/images/upload", auth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const url = `/uploads/${encodeURIComponent(req.file.filename)}`;
  res.json({ url });
});

app.get("/api/health", async (_req, res) => {
  const supabase = isSupabaseConfigured
    ? await verifySupabaseAdmin().catch(() => ({ ok: false, reason: "verify_failed" }))
    : { ok: false, reason: "not_configured" };
  res.json({
    ok: true,
    supabase: { configured: isSupabaseConfigured, connected: !!supabase.ok },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Capitol API listening on http://0.0.0.0:${PORT}`);
  if (isSupabaseConfigured) {
    verifySupabaseAdmin()
      .then((r) => console.log(`Supabase: ${r.ok ? "connected" : "unavailable"}`))
      .catch(() => console.log("Supabase: unavailable"));
  } else {
    console.log("Supabase: not configured");
  }
});
