import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";

// ── API Base ─────────────────────────────────────────────────────────────
const _API = (() => {
  const envUrl = import.meta?.env?.VITE_API_URL;
  if (envUrl) return envUrl;
  const p = window.location.port;
  return p === "3000" || p === "5173" ? "http://localhost:3001" : window.location.origin;
})();

function _tok() { try { return localStorage.getItem("kd_token") || ""; } catch { return ""; } }
function _h() { const t = _tok(); return t ? { Authorization: "Bearer " + t, "Content-Type": "application/json" } : { "Content-Type": "application/json" }; }
function _j(h) { return h || _h(); }

async function _api(method, path, body) {
  const url = _API + path;
  const opts = { method, headers: _j() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}
const _apiGet = (p) => _api("GET", p);
const _apiPost = (p, b) => _api("POST", p, b);
const _apiPatch = (p, b) => _api("PATCH", p, b);
const _apiDel = (p) => _api("DELETE", p);

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(_API + "/api/images/upload", { method: "POST", headers: { Authorization: "Bearer " + _tok() }, body: formData });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.url;
}

// ── User mapper ──────────────────────────────────────────────────────────
function _mapUser(u) {
  if (!u) return null;
  return {
    uid: u.id || u.uid,
    userId: u.username || u.id,
    displayName: u.display_name || u.displayName || "",
    email: u.email || "",
    photo: u.photo_url || u.photo || null,
    photo_url: u.photo_url || null,
    bannerUrl: u.banner_url || u.bannerUrl || "",
    bio: u.bio || "",
    pronouns: u.pronouns || "",
    timezone: u.timezone || "UTC",
    socialLinks: u.social_links || u.socialLinks || {},
    isAdmin: !!u.is_admin,
    isBanned: !!u.is_banned,
    isSuspended: !!u.is_suspended,
    suspensionEnd: u.suspension_end || null,
    suspendReason: u.suspend_reason || null,
    createdAt: u.created_at || u.createdAt || "",
    lastSeenAt: u.last_seen_at || u.lastSeenAt || "",
    // Stats
    xp: u.xp ?? 0,
    level: u.level ?? 1,
    streak: u.streak ?? 0,
    bestStreak: u.best_streak ?? 0,
    missedDays: u.missed_days ?? 0,
    warned: !!u.warned,
    kickStatus: u.kick_status || "ok",
    kickedFromRoom: !!u.kicked_from_room,
    proofsCount: u.proofs_count ?? 0,
    completedRooms: u.completed_rooms ?? 0,
    joinedRooms: u.joined_rooms ?? 0,
    joinTimestamp: u.join_timestamp || null,
    consistencyScore: u.consistency_score ?? 0,
    nearMissCount: u.near_miss_count ?? 0,
    league: u.league || null,
    graceActive: !!u.grace_active,
    graceStartDate: u.grace_start_date || null,
    graceDaysTotal: u.grace_days_total ?? 0,
    totalGraceUsed: u.total_grace_used ?? 0,
    lastSubmitDate: u.last_submit_date || null,
    vultureClaimed: u.vulture_claimed || null,
    onboardingComplete: u.onboarding_complete === 1 || u.onboardingComplete === true ? true : false,
    onboardingQuestionsComplete: u.onboarding_questions_complete === 1 || u.onboardingQuestionsComplete === true ? true : false,
    niche: u.niche || '',
    ageRange: u.age_range || u.ageRange || '',
    roomJoinedAt: u.room_joined_at || u.roomJoinedAt || null,
    onboardBonusAwarded: u.onboard_bonus_awarded === 1 || u.onboardBonusAwarded === true ? true : false,
    safetyAccepted: u.safety_accepted ?? u.safetyAccepted ?? null,
    inviteCode: u.invite_code || u.inviteCode || "",
    invitesCount: u.invites_count ?? 0,
    burnedAt: u.burned_at || u.burnedAt || null,
    following: u.following || [],
    premium: !!u.premium,
  };
}

// ── Auth ─────────────────────────────────────────────────────────────────
async function fbSignup({ displayName, userId, email, password, joinedDate }) {
  try {
    const res = await _apiPost("/api/auth/signup", { displayName, username: userId, email, password });
    if (res.token) localStorage.setItem("kd_token", res.token);
    return { ok: true, user: _mapUser(res.user) };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function fbLogin({ email, password }) {
  try {
    const res = await _apiPost("/api/auth/login", { email, password });
    if (res.token) localStorage.setItem("kd_token", res.token);
    return { ok: true, user: _mapUser(res.user) };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function fbLogout() {
  try { localStorage.removeItem("kd_token"); } catch {}
}

async function fbDeleteAccount() {
  try {
    await _apiDel("/api/users/me");
    localStorage.removeItem("kd_token");
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function fbCheckUserId(username) {
  try {
    const res = await _apiGet("/api/users/check/" + encodeURIComponent(username));
    return { taken: res.taken };
  } catch { return { taken: false }; }
}

// ── Users ────────────────────────────────────────────────────────────────
async function fbGetUser(uid) {
  try {
    const res = await _apiGet("/api/users/" + encodeURIComponent(uid));
    return _mapUser(res.user);
  } catch { return null; }
}

async function fbGetAllUsers() {
  try {
    const res = await _apiGet("/api/users");
    return (res.users || []).map(_mapUser);
  } catch { return []; }
}

async function fbUpdateUser(uid, updates) {
  const body = {};
  const mapped = {
    xp:"xp", streak:"streak", level:"level", missedDays:"missed_days",
    lastSubmitDate:"last_submit_date", lastSubmissionDate:"last_submit_date",
    warned:"warned", kickStatus:"kick_status", kickedFromRoom:"kicked_from_room",
    completedRooms:"completed_rooms", joinedRooms:"joined_rooms",
    displayName:"display_name", photo:"photo_url", bio:"bio",
    pronouns:"pronouns", timezone:"timezone", bannerUrl:"banner_url",
    socialLinks:"social_links", safetyAccepted:"safety_accepted",
    safetyAcceptedAt:"safety_accepted_at", roomJoinedAt:"room_joined_at",
    joinTimestamp:"join_timestamp", onboardingComplete:"onboarding_complete",
    onboardingQuestionsComplete:"onboarding_questions_complete",
    niche:"niche", ageRange:"age_range",
    onboardBonusAwarded:"onboard_bonus_awarded", vultureClaimed:"vulture_claimed",
    lastSeenDate:"last_seen_date", graceUsedThisMonth:"grace_used_this_month",
    graceLastMonth:"grace_last_month",
  };
  for (const [k, v] of Object.entries(updates)) {
    const m = mapped[k];
    if (m) body[m] = v;
  }
  if (Object.keys(body).length) {
    try { await _apiPatch("/api/users/me", body); } catch {}
  }
}

// ── Rooms ────────────────────────────────────────────────────────────────
async function fbGetRooms() {
  try {
    const res = await _apiGet("/api/rooms");
    return (res.rooms || []).map(r => ({
      id: r.id, name: r.name, icon: r.icon || "bolt", goal: r.goal || "",
      niche: r.niche || "general", ageRange: r.age_range || null,
      tags: r.tags || [], max: r.max_members || 8,
      members: r.member_count || 0, elite: !!r.elite,
      days: r.days || 30, createdAt: r.created_at,
      membersList: r.membersList || [],
      creatorUid: r.creator_uid || null,
    }));
  } catch {
    const local = (() => { try { return JSON.parse(localStorage.getItem("kd_rooms") || "{}"); } catch { return {}; } })();
    return Object.values(local).map(r => ({
      id: r.id, name: r.name, icon: r.icon || "bolt", goal: r.goal || "",
      niche: r.niche || "general", ageRange: r.ageRange || null,
      tags: r.tags || [], max: r.max || 8,
      members: r.members || 0, elite: !!r.elite,
      days: r.days || 30, createdAt: r.createdAt,
      membersList: r.membersList || [],
      creatorUid: r.creatorUid || null,
    }));
  }
}

async function fbCreateRoom(data) {
  const res = await _apiPost("/api/rooms", {
    name: data.name, icon: data.icon, goal: data.goal,
    niche: data.niche, ageRange: data.ageRange,
    tags: data.tags, maxMembers: data.max,
    elite: data.elite, days: data.days,
  });
  return res.room;
}

async function fbJoinRoom(uid, roomId, init) {
  try {
    await _apiPost("/api/rooms/" + encodeURIComponent(roomId) + "/join");
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function fbLeaveRoom(uid, roomId, init) {
  try {
    await _apiPost("/api/rooms/" + encodeURIComponent(roomId) + "/leave");
    return { ok: true };
  } catch { return { ok: false, error: "Failed to leave" }; }
}

async function fbKickUser(uid, roomId, targetId, xpPenalty, kickEntry, moderatorId) {
  try {
    await _apiPost("/api/rooms/" + encodeURIComponent(roomId) + "/kick", { targetId, reason: kickEntry?.reason || "" });
    return { ok: true };
  } catch { return { ok: false }; }
}

function fbGetJoinCooldown(uid) {
  try {
    const key = "kd_join_cooldown_" + uid;
    const last = parseInt(localStorage.getItem(key) || "0");
    const cooldown = 60000;
    const elapsed = Date.now() - last;
    return { onCooldown: elapsed < cooldown, remainingMs: Math.max(0, cooldown - elapsed) };
  } catch { return { onCooldown: false, remainingMs: 0 }; }
}

function _getActiveRoomIdForUser(uid) {
  try { return localStorage.getItem("kd_joinedRoomId_" + uid) || null; } catch { return null; }
}

// ── Proofs ───────────────────────────────────────────────────────────────
async function fbGetProofs(uid, limit = 50) {
  try {
    const res = await _apiGet("/api/proofs?userId=" + encodeURIComponent(uid) + "&limit=" + limit);
    return (res.proofs || []).map(p => ({
      id: p.id, userId: p.user_id, dateKey: p.date_key,
      timestamp: p.created_at || new Date().toISOString(),
      image: p.image_url, link: p.link, note: p.note,
      streak: p.streak, xpEarned: p.xp_earned,
      verified: p.ai_verdict === "approved", roomId: p.room_id,
      votes: (() => { try { return JSON.parse(p.votes || "{}"); } catch { return {}; } })(),
      gesture: p.gesture, userName: p.user_name || "", userPhoto: p.user_photo || null,
    }));
  } catch { return []; }
}

async function fbSubmitProof(data) {
  try {
    const res = await _apiPost("/api/proofs", {
      imageUrl: data.imageUrl || data.image, link: data.link,
      note: data.note, gesture: data.gesture, roomId: data.roomId,
    });
    return { ok: true, proof: res.proof, stats: res.stats };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Notifications ────────────────────────────────────────────────────────
async function fbGetNotifications(uid) {
  try {
    const res = await _apiGet("/api/notifications");
    return (res.notifications || []).map(n => ({
      id: n.id, type: n.type, read: !!n.read,
      createdAt: n.created_at || new Date().toISOString(),
      data: (() => { try { return JSON.parse(n.data || "{}"); } catch { return {}; } })(),
    }));
  } catch { return []; }
}

async function fbCreateNotification(userId, type, data) {
  try {
    await _apiPost("/api/notifications", { userId, type, data });
  } catch {}
}

async function fbMarkNotificationRead(ids) {
  try {
    await _apiPost("/api/notifications/read", { ids: Array.isArray(ids) ? ids : [ids] });
  } catch {}
}

// ── Leaderboard ──────────────────────────────────────────────────────────
async function fbGetLeaderboard() {
  try {
    const res = await _apiGet("/api/leaderboard");
    return (res.leaderboard || []).map(_mapUser);
  } catch { return []; }
}

// ── Follow ───────────────────────────────────────────────────────────────
async function fbFollowUser(uid, targetId) {
  try { await _apiPost("/api/users/follow/" + encodeURIComponent(targetId)); return { ok: true }; } catch { return { ok: false }; }
}

async function fbUnfollowUser(uid, targetId) {
  try { await _apiDel("/api/users/follow/" + encodeURIComponent(targetId)); return { ok: true }; } catch { return { ok: false }; }
}

// ── Referral ─────────────────────────────────────────────────────────────
async function fbGetInviterByCode(code) {
  try {
    const res = await _apiGet("/api/referrals/code/" + encodeURIComponent(code));
    return res.inviter ? _mapUser(res.inviter) : null;
  } catch { return null; }
}

async function fbProcessReferral(inviterId, inviteeId) {
  try {
    const res = await _apiPost("/api/referrals/process", { inviterId, inviteeId });
    return { ok: true, xpBonus: res.xpBonus || 0, milestoneBonus: res.milestoneBonus || 0 };
  } catch { return { ok: false }; }
}

// ── Challenges ───────────────────────────────────────────────────────────
async function fbAcceptChallenge(challengeId, uid) {
  try { await _apiPost("/api/challenges/" + encodeURIComponent(challengeId) + "/accept"); } catch {}
}

async function fbDeclineChallenge(challengeId, uid) {
  try { await _apiPost("/api/challenges/" + encodeURIComponent(challengeId) + "/decline"); } catch {}
}

// ── Moderation ───────────────────────────────────────────────────────────
async function fbBanUser(uid, targetId, reason) {
  try { await _apiPost("/api/users/" + encodeURIComponent(targetId) + "/ban", { reason }); } catch {}
}

async function fbUnbanUser(uid, targetId) {
  try { await _apiPost("/api/users/" + encodeURIComponent(targetId) + "/unban"); } catch {}
}

async function fbSuspendUser(uid, targetId, hours, reason) {
  try { await _apiPost("/api/users/" + encodeURIComponent(targetId) + "/suspend", { hours, reason }); } catch {}
}

function fbIsBanned(uid) {
  try { return !!window._kdBanCache?.[uid]; } catch { return false; }
}

function fbIsSuspended(uid) {
  try { return !!window._kdSuspendCache?.[uid]; } catch { return false; }
}

// ── Economy ──────────────────────────────────────────────────────────────
async function fbAwardXP(uid, amount, reason) {
  try {
    const res = await _apiPost("/api/economy/xp", { amount, reason });
    return { ok: true, xpGained: res.xpGained || amount };
  } catch { return { ok: false, xpGained: 0 }; }
}

// ── LocalStorage helpers ─────────────────────────────────────────────────
function lsGet(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function _getUsersStore() {
  try { return JSON.parse(localStorage.getItem("kd_users") || "{}"); } catch { return {}; }
}
function _saveUsersStore(u) {
  try { localStorage.setItem("kd_users", JSON.stringify(u)); } catch {}
}

// ── KDSound ──────────────────────────────────────────────────────────────
const KDSound = {
  _muted: false,
  _ctx: null,
  _initd: false,
  _gestured: false,
  _getCtx() {
    if (!this._gestured) return null;
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    return this._ctx;
  },
  _resume() {
    try {
      const ctx = this._getCtx();
      if (ctx && ctx.state === "suspended") ctx.resume();
    } catch {}
  },
  _play(freq, duration, type, vol) {
    if (this._muted || !this._gestured) return;
    try {
      const ctx = this._getCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") { ctx.resume(); }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  },
  // Initialize on first user gesture to satisfy browser autoplay policy
  init() {
    if (this._initd) return;
    this._initd = true;
    this._gestured = true;
    this._resume();
  },
  setMuted(m) { this._muted = m; try { localStorage.setItem("kd_sound_muted", m ? "1" : "0"); } catch {} },
  isMuted() { return this._muted; },
  notif() { this._play(880, 0.12, "sine", 0.08); setTimeout(() => this._play(1100, 0.1, "sine", 0.06), 100); },
  badge() { this._play(660, 0.1, "sine", 0.1); setTimeout(() => this._play(880, 0.15, "sine", 0.08), 80); },
  xpPing(amount) { this._play(440 + Math.min(amount, 100) * 4, 0.1, "sine", 0.08); },
  levelUp() { this._play(523, 0.15, "sine", 0.12); setTimeout(() => this._play(659, 0.15, "sine", 0.1), 120); setTimeout(() => this._play(784, 0.2, "sine", 0.1), 240); },
  streakPop(s) { this._play(440, 0.08, "triangle", 0.1); setTimeout(() => this._play(554, 0.08, "triangle", 0.08), 80); },
  kick() { this._play(220, 0.3, "sawtooth", 0.06); },
  achievementChime() { this._play(523, 0.12, "sine", 0.1); setTimeout(() => this._play(784, 0.18, "sine", 0.08), 100); },
  achievementFlutter() { for (let i = 0; i < 3; i++) { setTimeout(() => this._play(660 + i * 110, 0.06, "sine", 0.06), i * 50); } },
};

// Create + resume AudioContext only after first user gesture (never before)
if (typeof document !== "undefined") {
  const _initSound = () => { KDSound.init(); document.removeEventListener("click", _initSound); document.removeEventListener("touchstart", _initSound); document.removeEventListener("keydown", _initSound); };
  document.addEventListener("click", _initSound);
  document.addEventListener("touchstart", _initSound);
  document.addEventListener("keydown", _initSound);
}

// ── Wave overlay animation ──────────────────────────────────────────────
function playWave(type) {
  try {
    const el = document.createElement("div");
    el.className = "kd-wave-overlay";
    const colors = { join: "#22c55e", create: "#818cf8", leave: "#ef4444", xp: "#f5c800" };
    el.style.background = "linear-gradient(135deg, " + (colors[type] || "#f5c800") + "88, transparent 80%)";
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch {} }, 700);
  } catch {}
}

// ── The useUserState hook ───────────────────────────────────────────────
function todayStr(tz) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); }
}

function calcLevel(xp) { if (!xp || xp < 0) return 1; let l = 1; while (100 * l ** 1.4 <= xp) l++; return Math.max(1, l - 1); }
function calcLeague(xp) { if (xp >= 10000) return "diamond"; if (xp >= 5000) return "platinum"; if (xp >= 2000) return "gold"; if (xp >= 500) return "silver"; return "bronze"; }
function runDailyStreakCheck(state) {
  if (!state || !state.lastSubmitDate) return state;
  const daysSince = daysBetween(state.lastSubmitDate, todayStr());
  if (daysSince <= 1) return state;
  const missed = daysSince - 1;
  const newMissed = (state.missedDays || 0) + missed;
  const newStreak = Math.max(0, (state.streak || 0) - missed);
  const warned = newMissed >= 2;
  const kicked = newMissed >= 3;
  return { ...state, missedDays: newMissed, streak: newStreak, warned, kickedFromRoom: kicked, kickStatus: kicked ? "kicked" : state.kickStatus };
}
function daysBetween(a, b) {
  try { return Math.round((new Date(b) - new Date(a)) / 86400000); } catch { return 1; }
}
function isStreakAtRisk() {
  try {
    const last = localStorage.getItem("kd_last_submit_date");
    if (!last) return false;
    const tz = localStorage.getItem("kd_timezone") || "UTC";
    const today = todayStr(tz);
    return daysBetween(last, today) >= 1;
  } catch { return false; }
}
function isGoodReminderTime() {
  const h = new Date().getHours();
  return h >= 9 && h <= 22;
}
const XP_PENALTY_KICK_LOCAL = 20;

function useUserState(initial) {
  const [state, rawSet] = useState(initial);
  const ref = useRef(state);
  ref.current = state;

  function submitProof() { rawSet(prev => ({ ...prev, alreadySubmittedToday: true })); }

  function manualSet(update) {
    if (typeof update === "function") {
      rawSet(prev => {
        const next = update(prev);
        ref.current = next;
        return next;
      });
    } else {
      rawSet(prev => {
        const next = { ...prev, ...update };
        ref.current = next;
        return next;
      });
    }
  }

  return { userState: state, submitProof, manualSet };
}

// ── Animation Queue Provider ────────────────────────────────────────────
const AnimationQueueCtx = createContext({ playWave: () => {} });
function AnimationQueueProvider({ children }) {
  const playWaveRef = useRef(playWave);
  return <AnimationQueueCtx.Provider value={{ playWave: playWaveRef.current }}>{children}</AnimationQueueCtx.Provider>;
}
function useAnimationQueue() { return useContext(AnimationQueueCtx); }

// ── Theme Context ────────────────────────────────────────────────────────
const ThemeCtx = createContext({ theme: "default", T: {} });
function useTheme() { return useContext(ThemeCtx); }

function xpProgressPct(xp) {
  if (!xp || xp < 0) return 0;
  let l = 1;
  while (100 * l ** 1.4 <= xp) l++;
  l = Math.max(1, l - 1);
  const current = 100 * l ** 1.4;
  const next = 100 * (l + 1) ** 1.4;
  if (next <= current) return 0;
  return Math.min(100, Math.max(0, ((xp - current) / (next - current)) * 100));
}

function fbSubscribeUser(uid, callback) {
  // Try to load from API immediately
  fbGetUser(uid).then(user => {
    if (user) callback(user);
  });
  // Set up periodic refresh
  const id = setInterval(() => {
    fbGetUser(uid).then(user => {
      if (user) callback(user);
    });
  }, 30000);
  return () => clearInterval(id);
}

// ── Challenges ─────────────────────────────────────────────────────────
async function fbSendChallenge({ fromUid, toUid, durationDays, stakes, message }) {
  try {
    const res = await _apiPost("/api/challenges", { challengedId: toUid, durationDays, stakes, message });
    if (res && res.challenge) return { ok: true, id: res.challenge.id };
    return { ok: false };
  } catch { return { ok: false }; }
}

async function fbGetChallengesForUser(uid) {
  try { const res = await _apiGet("/api/challenges"); return res.challenges || []; } catch { return []; }
}

// ── Close Friends ──────────────────────────────────────────────────────
async function fbGetCloseFriends() {
  try { const res = await _apiGet("/api/close-friends"); return res.friends || []; } catch { return []; }
}

async function fbGetCloseFriendRequests() {
  try { const res = await _apiGet("/api/close-friends/requests"); return res; } catch { return { sent: [], received: [] }; }
}

async function fbSendCloseFriendRequest(targetId) {
  try { await _apiPost("/api/close-friends/request", { targetId }); return { ok: true }; } catch (e) { return { ok: false, error: e }; }
}

async function fbRespondCloseFriendRequest(requestId, accept) {
  try { await _apiPost("/api/close-friends/respond", { requestId, accept }); return { ok: true }; } catch { return { ok: false }; }
}

async function fbRemoveCloseFriend(friendId) {
  try { await _apiDel("/api/close-friends/" + encodeURIComponent(friendId)); return { ok: true }; } catch { return { ok: false }; }
}

// ── Economy / Freeze Tokens ──────────────────────────────────────────
async function fbListFreezeTokens() {
  try { const res = await _apiGet("/api/economy/freeze-tokens"); return res.tokens || []; } catch { return []; }
}
async function fbBuyFreezeToken() {
  try { const res = await _apiPost("/api/economy/buy-freeze"); return res; } catch (e) { return { error: e }; }
}
async function fbUseFreezeToken() {
  try { const res = await _apiPost("/api/economy/use-freeze"); return res; } catch (e) { return { error: e }; }
}

export {
  _API,
  _tok, _h, _api, _apiGet, _apiPost, _apiPatch, _apiDel, _mapUser,
  _getActiveRoomIdForUser,
  _getUsersStore, _saveUsersStore,
  fbSignup, fbLogin, fbLogout, fbDeleteAccount, fbCheckUserId,
  fbGetUser, fbGetAllUsers, fbUpdateUser,
  fbGetRooms, fbCreateRoom, fbJoinRoom, fbLeaveRoom, fbKickUser,
  fbGetProofs, fbSubmitProof,
  fbGetNotifications, fbCreateNotification, fbMarkNotificationRead,
  fbGetLeaderboard,
  fbFollowUser, fbUnfollowUser,
  fbGetInviterByCode, fbProcessReferral,
  fbGetCloseFriends, fbGetCloseFriendRequests, fbSendCloseFriendRequest, fbRespondCloseFriendRequest, fbRemoveCloseFriend,
  fbSendChallenge, fbGetChallengesForUser,
  fbAcceptChallenge, fbDeclineChallenge,
  fbBanUser, fbUnbanUser, fbSuspendUser, fbIsBanned, fbIsSuspended,
  fbGetJoinCooldown, fbAwardXP,
  fbSubscribeUser,
  fbListFreezeTokens, fbBuyFreezeToken, fbUseFreezeToken,
  uploadFile,
  lsGet, lsSet,
  KDSound, playWave,
  useUserState, AnimationQueueProvider, useAnimationQueue,
  todayStr, calcLevel, calcLeague, runDailyStreakCheck, daysBetween,
  isStreakAtRisk, isGoodReminderTime, XP_PENALTY_KICK_LOCAL,
  ThemeCtx, useTheme, xpProgressPct,
};
