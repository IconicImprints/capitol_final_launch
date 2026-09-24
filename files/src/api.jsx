import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";

// ── API Base ─────────────────────────────────────────────────────────────
const _API = (() => {
  const envUrl = import.meta?.env?.VITE_API_URL;
  if (envUrl) return envUrl;
  const host = window.location.hostname;
  const p = window.location.port;
  // Local Vite → talk to API directly; Codespaces / prod → same-origin (Vite proxy or reverse proxy)
  if ((host === "localhost" || host === "127.0.0.1") && (p === "3000" || p === "5173")) {
    return "http://localhost:3001";
  }
  return ""; // same-origin
})();

function _apiOrigin() {
  if (_API) return _API;
  const { protocol, hostname, port } = window.location;
  // Vite preview/dev runs separately from the API in this project. Use the
  // same forwarded host with the API port so uploaded files resolve outside
  // localhost as well as in a local browser.
  if (port === "4173" || port === "5173" || port === "3000") {
    return `${protocol}//${hostname}:3001`;
  }
  return window.location.origin;
}

function _tok() { try { return localStorage.getItem("kd_token") || ""; } catch { return ""; } }
function _h() { const t = _tok(); return t ? { Authorization: "Bearer " + t, "Content-Type": "application/json" } : { "Content-Type": "application/json" }; }
function _j(h) { return h || _h(); }

function _normalizeImageUrl(value) {
  if (!value || typeof value !== "string") return value || null;
  if (value.startsWith("blob:") || value.startsWith("data:")) return null;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.pathname.startsWith("/uploads/") ? parsed.pathname : value;
  } catch {
    return value;
  }
}

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
  if (!(file instanceof File)) throw new Error("Please select an image file.");
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (!allowedTypes.has(file.type)) throw new Error("Use a JPG, PNG, GIF, or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be 8 MB or smaller.");
  const formData = new FormData();
  formData.append("image", file);
  console.info("[Capitol upload] upload started", { name: file.name, type: file.type, size: file.size });
  const res = await fetch(_API + "/api/images/upload", { method: "POST", headers: { Authorization: "Bearer " + _tok() }, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || "Image upload failed.");
  console.info("[Capitol upload] upload result", data);
  const imageUrl = String(data.url);
  if (imageUrl.startsWith("blob:") || imageUrl.startsWith("data:")) {
    throw new Error("The server returned a temporary image URL.");
  }
  // Keep storage paths relative so they use the same origin as the app. The
  // Vite dev/preview proxy and the production reverse proxy both forward
  // /uploads to the backend, avoiding browser-inaccessible localhost URLs.
  const permanentUrl = imageUrl.startsWith("/") ? imageUrl : new URL(imageUrl, _apiOrigin()).pathname;
  console.info("[Capitol upload] storage path and generated URL", { storagePath: imageUrl, url: permanentUrl });
  return permanentUrl;
}

// ── User mapper ──────────────────────────────────────────────────────────
function _mapUser(u) {
  if (!u) return null;
  return {
    uid: u.id || u.uid,
    userId: u.username || u.id,
    displayName: u.display_name || u.displayName || "",
    email: u.email || "",
    photo: _normalizeImageUrl(u.photo_url || u.photo || null),
    avatarConfig: u.avatar_config || u.avatarConfig || null,
    photo_url: _normalizeImageUrl(u.photo_url || null),
    bannerUrl: _normalizeImageUrl(u.banner_url || u.bannerUrl || "") || "",
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
    onboardingComplete: !!(u.onboarding_complete === 1 || u.onboarding_complete === true || u.onboardingComplete === true),
    onboardingQuestionsComplete: !!(u.onboarding_questions_complete === 1 || u.onboarding_questions_complete === true || u.onboardingQuestionsComplete === true),
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
function _newUid() {
  return "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

async function fbSignup({ displayName, userId, email, password, joinedDate }) {
  try {
    const res = await _apiPost("/api/auth/signup", { displayName, username: userId, email, password });
    if (res.token) localStorage.setItem("kd_token", res.token);
    localStorage.setItem("kd_current_uid", res.user?.id || userId);
    localStorage.setItem("kd_session", JSON.stringify(_mapUser(res.user)));
    return { ok: true, user: _mapUser(res.user) };
  } catch (e) {
    const users = _getUsersStore();
    if (Object.values(users).some(u => (u.username || "").toLowerCase() === String(userId).toLowerCase())) {
      return { ok: false, error: "Username already taken" };
    }
    if (Object.values(users).some(u => (u.email || "").toLowerCase() === String(email).toLowerCase())) {
      return { ok: false, error: "Email already registered" };
    }
    const id = _newUid();
    const invite = String(userId).toUpperCase().slice(0, 4) + Math.random().toString(36).slice(2, 6).toUpperCase();
    const palette = ["#F5C800", "#A7D8DE", "#C4B5FD", "#F9A8D4", "#86EFAC", "#FDBA74"];
    let avatarHash = 0;
    for (const char of String(userId).toLowerCase()) avatarHash = (avatarHash * 31 + char.charCodeAt(0)) >>> 0;
    const newUser = {
      id, username: userId, email,
      display_name: displayName, photo_url: null,
      avatar_config: { background: palette[avatarHash % palette.length], letter: String(userId)[0].toUpperCase() },
      xp: 0, level: 1, streak: 0, best_streak: 0, missed_days: 0,
      warned: false, kick_status: "ok", kicked_from_room: false,
      proofs_count: 0, completed_rooms: 0, joined_rooms: 0,
      join_timestamp: joinedDate || new Date().toISOString(),
      consistency_score: 0, near_miss_count: 0,
      league: "bronze", grace_active: false, grace_start_date: null, grace_days_total: 0, total_grace_used: 0,
      last_submit_date: null, vulture_claimed: null,
      onboarding_complete: false, onboarding_questions_complete: false,
      niche: '', age_range: '', room_joined_at: null, onboard_bonus_awarded: false,
      safety_accepted: false, invite_code: invite, invites_count: 0, burned_at: null,
      following: [], premium: false, is_admin: false, is_banned: false, is_suspended: false,
      suspension_end: null, suspend_reason: null, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
      password,
    };
    users[id] = newUser;
    _saveUsersStore(users);
    const token = "local_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    localStorage.setItem("kd_token", token);
    localStorage.setItem("kd_current_uid", id);
    localStorage.setItem("kd_session", JSON.stringify(_mapUser(newUser)));
    return { ok: true, user: _mapUser(newUser) };
  }
}

async function fbLogin({ email, password }) {
  try {
    const res = await _apiPost("/api/auth/login", { email, password });
    if (res.token) localStorage.setItem("kd_token", res.token);
    localStorage.setItem("kd_current_uid", res.user?.id || res.user?.username || "");
    localStorage.setItem("kd_session", JSON.stringify(_mapUser(res.user)));
    return { ok: true, user: _mapUser(res.user) };
  } catch (e) {
    const users = _getUsersStore();
    const user = Object.values(users).find(u => (u.email || "").toLowerCase() === String(email).toLowerCase() && u.password === password);
    if (!user) return { ok: false, error: "Invalid email or password" };
    const token = "local_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    localStorage.setItem("kd_token", token);
    localStorage.setItem("kd_current_uid", user.id || user.username);
    localStorage.setItem("kd_session", JSON.stringify(_mapUser(user)));
    return { ok: true, user: _mapUser(user) };
  }
}

async function fbLogout() {
  try {
    localStorage.removeItem("kd_token");
    localStorage.removeItem("kd_current_uid");
    localStorage.removeItem("kd_session");
  } catch {}
}

async function fbDeleteAccount() {
  try {
    const uid = localStorage.getItem("kd_current_uid") || "";
    const users = _getUsersStore();
    const target = users[uid] || Object.values(users).find(u => u.username === uid);
    if (target) {
      const id = target.id || target.username;
      delete users[id];
      _saveUsersStore(users);
    }
    localStorage.removeItem("kd_token");
    localStorage.removeItem("kd_current_uid");
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function fbCheckUserId(username) {
  try {
    const res = await _apiGet("/api/users/check/" + encodeURIComponent(username));
    return { taken: res.taken };
  } catch {
    const users = _getUsersStore();
    const taken = Object.values(users).some(u => (u.username || "").toLowerCase() === String(username).toLowerCase());
    return { taken };
  }
}

async function fbGetUser(uid) {
  try {
    const res = await _apiGet("/api/users/" + encodeURIComponent(uid));
    return _mapUser(res.user);
  } catch {
    const users = _getUsersStore();
    const user = users[uid] || Object.values(users).find(u => u.username === uid);
    return user ? _mapUser(user) : null;
  }
}

async function fbGetAllUsers() {
  try {
    const res = await _apiGet("/api/users");
    return (res.users || []).map(_mapUser);
  } catch {
    const users = _getUsersStore();
    return Object.values(users).map(_mapUser);
  }
}

async function fbUpdateUser(uid, updates) {
  const body = {};
  const mapped = {
    xp:"xp", streak:"streak", level:"level", missedDays:"missed_days",
    lastSubmitDate:"last_submit_date", lastSubmissionDate:"last_submit_date",
    warned:"warned", kickStatus:"kick_status", kickedFromRoom:"kicked_from_room",
    completedRooms:"completed_rooms", joinedRooms:"joined_rooms",
    displayName:"display_name", photo:"photo_url", avatarConfig:"avatar_config", bio:"bio",
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
    const hasImageUpdate = Object.prototype.hasOwnProperty.call(body, "photo_url")
      || Object.prototype.hasOwnProperty.call(body, "banner_url");
    if (hasImageUpdate) {
      // Image references must be confirmed by the authenticated backend.
      // Falling back to localStorage here creates a false success and loses the
      // image on refresh or login from another device.
      try {
        const result = await _apiPatch("/api/users/me", body);
        console.info("[Capitol upload] database update result", { body, result });
        return true;
      } catch {
        console.error("[Capitol upload] database update failed", body);
        return false;
      }
    }
    let persisted = false;
    try { await _apiPatch("/api/users/me", body); persisted = true; } catch {}
    try {
      const users = _getUsersStore();
      const u = users[uid] || Object.values(users).find(u => u.username === uid);
      if (u) {
        for (const [k, v] of Object.entries(body)) {
          if (k === "display_name") u.display_name = v;
          else if (k === "photo_url") u.photo_url = v;
          else if (k === "banner_url") u.banner_url = v;
          else if (k === "social_links") u.social_links = v;
          else if (k === "safety_accepted_at") u.safety_accepted_at = v;
          else if (k === "onboarding_complete") u.onboarding_complete = v;
          else if (k === "onboarding_questions_complete") u.onboarding_questions_complete = v;
          else if (k === "onboard_bonus_awarded") u.onboard_bonus_awarded = v;
          else if (k === "last_seen_date") u.last_seen_date = v;
          else if (k === "grace_used_this_month") u.grace_used_this_month = v;
          else if (k === "grace_last_month") u.grace_last_month = v;
          else u[k] = v;
        }
        users[u.id || u.username] = u;
        _saveUsersStore(users);
        persisted = true;
      }
    } catch {}
    return persisted;
  }
  return true;
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
  try {
    const res = await _apiPost("/api/rooms", {
      name: data.name, icon: data.icon, goal: data.goal,
      niche: data.niche, ageRange: data.ageRange,
      tags: data.tags, maxMembers: data.max,
      elite: data.elite, days: data.days,
    });
    // Mirror into local store so offline reload still sees it
    try {
      const local = JSON.parse(localStorage.getItem("kd_rooms") || "{}");
      const r = res.room;
      local[r.id] = {
        id: r.id, name: r.name, icon: r.icon, goal: r.goal, niche: r.niche || data.niche,
        ageRange: r.age_range, tags: r.tags || [], max: r.max_members || data.max || 8,
        members: r.member_count || 1, elite: !!r.elite, days: r.days || 30,
        createdAt: r.created_at, membersList: r.membersList || [],
        memberUids: r.memberUids || [], creatorUid: r.creator_uid,
      };
      localStorage.setItem("kd_rooms", JSON.stringify(local));
    } catch {}
    return res.room;
  } catch {
    const uid = localStorage.getItem("kd_current_uid") || null;
    const users = _getUsersStore();
    const me = users[uid] || Object.values(users).find(u => u.id === uid || u.username === uid);
    const id = "room_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const init = ((me?.username || "?") + "").slice(0, 2).toUpperCase();
    const room = {
      id, name: data.name, icon: data.icon || "bolt", goal: data.goal || "",
      niche: data.niche || "general", ageRange: data.ageRange || null,
      tags: data.tags || [], max: data.max || 8, members: 1, elite: !!data.elite,
      days: data.days || 30, createdAt: new Date().toISOString(),
      membersList: [init], memberUids: uid ? [uid] : [], creatorUid: uid,
    };
    const local = (() => { try { return JSON.parse(localStorage.getItem("kd_rooms") || "{}"); } catch { return {}; } })();
    local[id] = room;
    localStorage.setItem("kd_rooms", JSON.stringify(local));
    if (uid) {
      const rp = (() => { try { return JSON.parse(localStorage.getItem("kd_roomParticipants") || "{}"); } catch { return {}; } })();
      const mid = "rm_" + Date.now();
      rp[mid] = { id: mid, roomId: id, userId: uid, status: "active", joinedAt: new Date().toISOString() };
      localStorage.setItem("kd_roomParticipants", JSON.stringify(rp));
    }
    return {
      id: room.id, name: room.name, icon: room.icon, goal: room.goal,
      niche: room.niche, age_range: room.ageRange, tags: room.tags,
      max_members: room.max, member_count: 1, elite: room.elite, days: room.days,
      created_at: room.createdAt, creator_uid: room.creatorUid,
      membersList: room.membersList, memberUids: room.memberUids,
    };
  }
}

async function fbJoinRoom(uid, roomId, init) {
  try {
    await _apiPost("/api/rooms/" + encodeURIComponent(roomId) + "/join");
    return { ok: true };
  } catch (e) {
    try {
      const local = JSON.parse(localStorage.getItem("kd_rooms") || "{}");
      const room = local[roomId];
      if (!room) return { ok: false, error: e.message || "Room not found" };
      if ((room.members || 0) >= (room.max || 8)) return { ok: false, error: "Room is full" };
      const memberUids = Array.isArray(room.memberUids) ? room.memberUids : [];
      if (uid && !memberUids.includes(uid)) memberUids.push(uid);
      const membersList = Array.isArray(room.membersList) ? room.membersList : [];
      if (init && !membersList.includes(init)) membersList.push(init);
      room.memberUids = memberUids;
      room.membersList = membersList;
      room.members = memberUids.length || membersList.length;
      local[roomId] = room;
      localStorage.setItem("kd_rooms", JSON.stringify(local));
      const rp = JSON.parse(localStorage.getItem("kd_roomParticipants") || "{}");
      // leave other rooms
      for (const m of Object.values(rp)) {
        if (m.userId === uid && m.status === "active") m.status = "left";
      }
      const mid = "rm_" + Date.now();
      rp[mid] = { id: mid, roomId, userId: uid, status: "active", joinedAt: new Date().toISOString() };
      localStorage.setItem("kd_roomParticipants", JSON.stringify(rp));
      return { ok: true };
    } catch {
      return { ok: false, error: e.message || "Failed to join" };
    }
  }
}

async function fbLeaveRoom(uid, roomId, init) {
  try {
    await _apiPost("/api/rooms/" + encodeURIComponent(roomId) + "/leave");
    return { ok: true };
  } catch {
    try {
      const local = JSON.parse(localStorage.getItem("kd_rooms") || "{}");
      const room = local[roomId];
      if (room) {
        room.memberUids = (room.memberUids || []).filter(x => x !== uid);
        room.membersList = (room.membersList || []).filter(x => x !== init);
        room.members = Math.max(0, (room.memberUids.length || room.membersList.length));
        local[roomId] = room;
        localStorage.setItem("kd_rooms", JSON.stringify(local));
      }
      const rp = JSON.parse(localStorage.getItem("kd_roomParticipants") || "{}");
      for (const m of Object.values(rp)) {
        if (m.userId === uid && m.roomId === roomId && m.status === "active") m.status = "left";
      }
      localStorage.setItem("kd_roomParticipants", JSON.stringify(rp));
      return { ok: true };
    } catch { return { ok: false, error: "Failed to leave" }; }
  }
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
async function fbGetProofs(uid, limit = 1000) {
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
  } catch {
    try {
      const all = JSON.parse(localStorage.getItem("kd_proofs") || "{}");
      return Object.values(all)
        .filter(p => p.userId === uid || p.user_id === uid)
        .sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0))
        .slice(0, limit)
        .map(p => ({
          id: p.id, userId: p.userId || p.user_id, dateKey: p.dateKey || p.date_key,
          timestamp: p.timestamp || p.created_at || new Date().toISOString(),
          image: p.image || p.image_url, link: p.link, note: p.note,
          streak: p.streak, xpEarned: p.xpEarned || p.xp_earned,
          verified: true, roomId: p.roomId || p.room_id,
          votes: p.votes || {}, gesture: p.gesture,
          userName: p.userName || "", userPhoto: p.userPhoto || null,
        }));
    } catch { return []; }
  }
}

async function fbSubmitProof(data) {
  try {
    const res = await _apiPost("/api/proofs", {
      imageUrl: data.imageUrl || data.image, link: data.link,
      note: data.note, gesture: data.gesture, roomId: data.roomId,
    });
    return { ok: true, proof: res.proof, stats: res.stats };
  } catch (e) {
    try {
      const uid = localStorage.getItem("kd_current_uid") || "";
      const users = _getUsersStore();
      const u = users[uid] || Object.values(users).find(x => x.id === uid || x.username === uid);
      const today = new Date().toISOString().slice(0, 10);
      const all = JSON.parse(localStorage.getItem("kd_proofs") || "{}");
      if (Object.values(all).some(p => (p.userId || p.user_id) === uid && (p.dateKey || p.date_key) === today)) {
        const existing = Object.values(all).find(p => (p.userId || p.user_id) === uid && (p.dateKey || p.date_key) === today);
        return { ok: true, proof: existing, stats: { xp: u?.xp, streak: u?.streak || 0, xpGained: 0 }, duplicate: true };
      }
      const dates = new Set(Object.values(all).filter(p => (p.userId || p.user_id) === uid).map(p => p.dateKey || p.date_key));
      dates.add(today);
      let newStreak = 0;
      const cursor = new Date(`${today}T00:00:00Z`);
      while (dates.has(cursor.toISOString().slice(0, 10))) {
        newStreak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      const xpGain = 10 + Math.min(newStreak, 30) * 2;
      const id = "proof_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
      const proof = {
        id, userId: uid, user_id: uid, dateKey: today, date_key: today,
        timestamp: new Date().toISOString(), created_at: new Date().toISOString(),
        image: data.imageUrl || data.image, image_url: data.imageUrl || data.image,
        link: data.link, note: data.note, streak: newStreak, xpEarned: xpGain, xp_earned: xpGain,
        verified: true, roomId: data.roomId, room_id: data.roomId, votes: {}, gesture: data.gesture,
        userName: u?.display_name || "", userPhoto: u?.photo_url || null,
      };
      all[id] = proof;
      localStorage.setItem("kd_proofs", JSON.stringify(all));
      if (u) {
        u.streak = newStreak;
        u.best_streak = Math.max(u.best_streak || 0, newStreak);
        u.xp = (u.xp || 0) + xpGain;
        u.last_submit_date = today;
        u.proofs_count = (u.proofs_count || 0) + 1;
        users[u.id || u.username] = u;
        _saveUsersStore(users);
      }
      return { ok: true, proof, stats: { xp: u?.xp, streak: newStreak, xpGained: xpGain } };
    } catch {
      return { ok: false, error: e.message };
    }
  }
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
    await _apiPost("/api/notifications", { userId, type, data, eventKey: data?.eventKey });
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
  try { await _apiPost("/api/users/follow/" + encodeURIComponent(targetId)); return { ok: true }; }
  catch {
    try {
      const users = _getUsersStore();
      const me = users[uid] || Object.values(users).find(u => u.id === uid || u.username === uid);
      const target = users[targetId] || Object.values(users).find(u => u.id === targetId || u.username === targetId);
      if (!me || !target) return { ok: false };
      const init = (target.username || "?").slice(0, 2).toUpperCase();
      if (!Array.isArray(me.following)) me.following = [];
      if (!me.following.includes(init)) me.following.push(init);
      users[me.id || me.username] = me;
      _saveUsersStore(users);
      const follows = JSON.parse(localStorage.getItem("kd_follows") || "{}");
      follows[me.id + "->" + target.id] = { from: me.id, to: target.id, at: new Date().toISOString() };
      localStorage.setItem("kd_follows", JSON.stringify(follows));
      return { ok: true };
    } catch { return { ok: false }; }
  }
}

async function fbUnfollowUser(uid, targetId) {
  try { await _apiDel("/api/users/follow/" + encodeURIComponent(targetId)); return { ok: true }; }
  catch {
    try {
      const users = _getUsersStore();
      const me = users[uid] || Object.values(users).find(u => u.id === uid || u.username === uid);
      const target = users[targetId] || Object.values(users).find(u => u.id === targetId || u.username === targetId);
      if (!me) return { ok: false };
      const init = (target?.username || "?").slice(0, 2).toUpperCase();
      me.following = (me.following || []).filter(x => x !== init);
      users[me.id || me.username] = me;
      _saveUsersStore(users);
      const follows = JSON.parse(localStorage.getItem("kd_follows") || "{}");
      if (target) delete follows[me.id + "->" + target.id];
      localStorage.setItem("kd_follows", JSON.stringify(follows));
      return { ok: true };
    } catch { return { ok: false }; }
  }
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
function _getCloseFriendsStore() {
  try { return JSON.parse(localStorage.getItem("kd_close_friends") || "{}"); } catch { return {}; }
}
function _saveCloseFriendsStore(v) {
  try { localStorage.setItem("kd_close_friends", JSON.stringify(v)); } catch {}
}
function _getCloseFriendRequestsStore() {
  try { return JSON.parse(localStorage.getItem("kd_close_friend_requests") || "{}"); } catch { return {}; }
}
function _saveCloseFriendRequestsStore(v) {
  try { localStorage.setItem("kd_close_friend_requests", JSON.stringify(v)); } catch {}
}

async function fbGetCloseFriends() {
  try { const res = await _apiGet("/api/close-friends"); return res.friends || []; }
  catch {
    const uid = localStorage.getItem("kd_current_uid");
    const store = _getCloseFriendsStore();
    const users = _getUsersStore();
    return Object.values(store)
      .filter(f => f.a === uid || f.b === uid)
      .map(f => {
        const other = f.a === uid ? f.b : f.a;
        const u = users[other] || Object.values(users).find(x => x.id === other || x.username === other);
        return u ? _mapUser(u) : null;
      })
      .filter(Boolean);
  }
}

async function fbGetCloseFriendRequests() {
  try { const res = await _apiGet("/api/close-friends/requests"); return res; }
  catch {
    const uid = localStorage.getItem("kd_current_uid");
    const all = Object.values(_getCloseFriendRequestsStore());
    return {
      sent: all.filter(r => r.from === uid && r.status === "pending"),
      received: all.filter(r => r.to === uid && r.status === "pending"),
    };
  }
}

async function fbSendCloseFriendRequest(targetId) {
  try { await _apiPost("/api/close-friends/request", { targetId }); return { ok: true }; }
  catch (e) {
    try {
      const uid = localStorage.getItem("kd_current_uid");
      const users = _getUsersStore();
      const target = users[targetId] || Object.values(users).find(u => u.id === targetId || u.username === targetId);
      if (!target || !uid) return { ok: false, error: e };
      const id = "cfr_" + Date.now();
      const store = _getCloseFriendRequestsStore();
      store[id] = { id, from: uid, to: target.id || target.username, status: "pending", createdAt: new Date().toISOString() };
      _saveCloseFriendRequestsStore(store);
      // Notify target via shared notifs store
      try {
        const notifs = JSON.parse(localStorage.getItem("kd_notifications") || "{}");
        const nid = "notif_" + Date.now();
        notifs[nid] = {
          id: nid, userId: target.id || target.username, recipientId: target.id || target.username,
          type: "friend_request", read: false, createdAt: new Date().toISOString(),
          requestId: id, fromUid: uid,
        };
        localStorage.setItem("kd_notifications", JSON.stringify(notifs));
      } catch {}
      return { ok: true };
    } catch { return { ok: false, error: e }; }
  }
}

async function fbRespondCloseFriendRequest(requestId, accept) {
  try { await _apiPost("/api/close-friends/respond", { requestId, accept }); return { ok: true }; }
  catch {
    try {
      const uid = localStorage.getItem("kd_current_uid");
      const store = _getCloseFriendRequestsStore();
      const r = store[requestId];
      if (!r || r.to !== uid) return { ok: false };
      r.status = accept ? "accepted" : "declined";
      store[requestId] = r;
      _saveCloseFriendRequestsStore(store);
      if (accept) {
        const friends = _getCloseFriendsStore();
        const fid = "cf_" + Date.now();
        friends[fid] = { id: fid, a: r.from, b: r.to, createdAt: new Date().toISOString() };
        _saveCloseFriendsStore(friends);
      }
      return { ok: true };
    } catch { return { ok: false }; }
  }
}

async function fbRemoveCloseFriend(friendId) {
  try { await _apiDel("/api/close-friends/" + encodeURIComponent(friendId)); return { ok: true }; }
  catch {
    try {
      const uid = localStorage.getItem("kd_current_uid");
      const friends = _getCloseFriendsStore();
      for (const [id, f] of Object.entries(friends)) {
        if ((f.a === uid && (f.b === friendId)) || (f.b === uid && (f.a === friendId))) delete friends[id];
      }
      _saveCloseFriendsStore(friends);
      return { ok: true };
    } catch { return { ok: false }; }
  }
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
