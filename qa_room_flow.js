/**
 * Launch-day room system QA against live API on :3001
 * Backend/DB is source of truth.
 */
const API = 'http://127.0.0.1:3001';

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, ok: res.ok, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

async function signup(prefix) {
  const ts = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const username = (prefix + ts).slice(0, 20);
  const email = `${username}@example.com`;
  const password = 'TestPass123!';
  const r = await req('POST', '/api/auth/signup', {
    body: { displayName: prefix, username, email, password },
  });
  assert(r.status === 200, `signup ${username} failed: ${r.status} ${JSON.stringify(r.data)}`);
  assert(r.data.token, 'signup missing token');
  assert(r.data.user?.invite_code, 'signup missing invite_code');
  assert(r.data.user.safety_accepted === null, 'safety_accepted should be null');
  return { username, email, password, token: r.data.token, user: r.data.user };
}

async function login(email, password) {
  const r = await req('POST', '/api/auth/login', { body: { email, password } });
  assert(r.status === 200, `login failed: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function myRoom(token) {
  return req('GET', '/api/users/me/room', { token });
}

async function createRoom(token, name, maxMembers = 4) {
  return req('POST', '/api/rooms', {
    token,
    body: { name, goal: 'QA goal', niche: 'fitness', maxMembers, days: 30 },
  });
}

async function joinRoom(token, roomId) {
  return req('POST', `/api/rooms/${roomId}/join`, { token });
}

async function leaveRoom(token, roomId) {
  return req('POST', `/api/rooms/${roomId}/leave`, { token });
}

async function kickUser(token, roomId, targetId, reason) {
  return req('POST', `/api/rooms/${roomId}/kick`, {
    token,
    body: { targetId, reason },
  });
}

async function getRoom(token, roomId) {
  return req('GET', `/api/rooms/${roomId}`, { token });
}

async function patchOnboarding(token, userId) {
  // Complete onboarding fields via whatever PATCH exists; fallback to login user check
  return req('PATCH', `/api/users/${userId}`, {
    token,
    body: {
      onboarding_complete: true,
      onboarding_questions_complete: true,
      niche: 'fitness',
      age_range: '18_22',
    },
  });
}

const results = [];
function pass(name) { results.push({ name, ok: true }); console.log('✓', name); }
function fail(name, err) { results.push({ name, ok: false, err: String(err) }); console.error('✗', name, err); }

async function main() {
  console.log('=== CAPITOL ROOM QA ===\n');

  let A, B, C, D, roomId;

  // 1. Signup accounts
  try {
    A = await signup('qaA');
    B = await signup('qaB');
    C = await signup('qaC');
    D = await signup('qaD');
    pass('signup four accounts');
  } catch (e) { fail('signup four accounts', e); return report(); }

  // Login persistence
  try {
    const l = await login(A.email, A.password);
    assert(l.user.id === A.user.id, 'login uid mismatch');
    A.token = l.token;
    pass('login persists account');
  } catch (e) { fail('login persists account', e); }

  // Create room
  try {
    const r = await createRoom(A.token, 'QA Room Alpha', 3);
    assert(r.status === 200, JSON.stringify(r.data));
    roomId = r.data.room.id;
    assert(Number.isInteger(r.data.room.member_count), 'member_count not integer');
    assert(r.data.room.member_count === 1, 'creator should be sole member');
    pass('create room + creator membership');
  } catch (e) { fail('create room + creator membership', e); return report(); }

  // my-room after create
  try {
    const r = await myRoom(A.token);
    assert(r.data.room?.id === roomId, 'my-room missing after create');
    pass('my-room after create');
  } catch (e) { fail('my-room after create', e); }

  // Simulate refresh: re-fetch my-room + room
  try {
    const r1 = await myRoom(A.token);
    const r2 = await getRoom(A.token, roomId);
    assert(r1.data.room?.id === roomId, 'refresh my-room lost');
    assert(r2.data.room?.id === roomId, 'refresh room lost');
    assert(r2.data.membership === 'active', 'membership not active');
    pass('refresh keeps membership');
  } catch (e) { fail('refresh keeps membership', e); }

  // Logout/login membership
  try {
    await req('POST', '/api/auth/logout', { token: A.token });
    const l = await login(A.email, A.password);
    A.token = l.token;
    const r = await myRoom(A.token);
    assert(r.data.room?.id === roomId, 'membership lost after logout/login');
    pass('logout/login keeps membership');
  } catch (e) { fail('logout/login keeps membership', e); }

  // Friend B joins
  try {
    const j = await joinRoom(B.token, roomId);
    assert(j.status === 200 && j.data.ok, JSON.stringify(j.data));
    const r = await myRoom(B.token);
    assert(r.data.room?.id === roomId, 'B my-room wrong');
    const gr = await getRoom(A.token, roomId);
    assert(gr.data.room.member_count === 2, `expected 2 got ${gr.data.room.member_count}`);
    assert(Number.isInteger(gr.data.room.member_count), 'decimal members');
    pass('friend joins room + member count');
  } catch (e) { fail('friend joins room + member count', e); }

  // Leave room
  try {
    const lv = await leaveRoom(B.token, roomId);
    assert(lv.status === 200 && lv.data.ok, JSON.stringify(lv.data));
    const r = await myRoom(B.token);
    assert(!r.data.room, 'B still has room after leave');
    const gr = await getRoom(A.token, roomId);
    assert(gr.data.room.member_count === 1, `after leave expected 1 got ${gr.data.room.member_count}`);
    pass('leave room updates DB');
  } catch (e) { fail('leave room updates DB', e); }

  // Rejoin after leave
  try {
    const j = await joinRoom(B.token, roomId);
    assert(j.status === 200 && j.data.ok, JSON.stringify(j.data));
    const r = await myRoom(B.token);
    assert(r.data.room?.id === roomId, 'rejoin after leave failed');
    pass('leave → rejoin works');
  } catch (e) { fail('leave → rejoin works', e); }

  // Kick B
  try {
    const k = await kickUser(A.token, roomId, B.user.id, 'manual');
    assert(k.status === 200 && k.data.ok, JSON.stringify(k.data));
    const r = await myRoom(B.token);
    assert(!r.data.room, 'B still in room after kick');
    const gr = await getRoom(A.token, roomId);
    assert(gr.data.room.member_count === 1, `after kick expected 1 got ${gr.data.room.member_count}`);
    pass('kick updates DB + member count');
  } catch (e) { fail('kick updates DB + member count', e); }

  // Kick → rejoin (must be allowed; no permanent block; no 20 XP gate)
  try {
    const j = await joinRoom(B.token, roomId);
    assert(j.status === 200 && j.data.ok, `kick→rejoin blocked: ${JSON.stringify(j.data)}`);
    assert(!String(j.data.error || '').toLowerCase().includes('xp'), 'XP rejoin gate present');
    const r = await myRoom(B.token);
    assert(r.data.room?.id === roomId, 'kick→rejoin my-room fail');
    // refresh after rejoin
    const r2 = await myRoom(B.token);
    assert(r2.data.room?.id === roomId, 'refresh after rejoin fail');
    pass('kick → rejoin + refresh');
  } catch (e) { fail('kick → rejoin + refresh', e); }

  // Full room (max 3: A,B already in; add C then D should fail)
  try {
    // ensure A+B in room
    await joinRoom(A.token, roomId);
    await joinRoom(B.token, roomId);
    const jc = await joinRoom(C.token, roomId);
    assert(jc.status === 200 && jc.data.ok, 'C join failed: ' + JSON.stringify(jc.data));
    const gr = await getRoom(A.token, roomId);
    assert(gr.data.room.member_count === 3, `full room count ${gr.data.room.member_count}`);
    const jd = await joinRoom(D.token, roomId);
    assert(jd.status === 400 || !jd.ok, 'D should not join full room');
    assert(String(jd.data.error || '').toLowerCase().includes('full'), 'expected full error: ' + JSON.stringify(jd.data));
    const rd = await myRoom(D.token);
    assert(!rd.data.room, 'D somehow got a room');
    pass('full room capacity enforced');
  } catch (e) { fail('full room capacity enforced', e); }

  // Invalid room
  try {
    const j = await joinRoom(D.token, 'room_does_not_exist_xyz');
    assert(j.status === 404 || !j.ok, 'invalid room should fail');
    pass('invalid room rejected');
  } catch (e) { fail('invalid room rejected', e); }

  // Double-click create
  try {
    const E = await signup('qaE');
    const [r1, r2] = await Promise.all([
      createRoom(E.token, 'Double Create 1', 4),
      createRoom(E.token, 'Double Create 2', 4),
    ]);
    assert(r1.status === 200 && r2.status === 200, 'double create responses');
    const mr = await myRoom(E.token);
    // User should only have ONE active room membership
    // Check DB via my-room — if both creates added memberships without leaving, bug
    assert(mr.data.room, 'E should have a room');
    // Count active memberships via joining another check: get room members from both rooms
    const rooms = [];
    if (r1.data.room?.id) rooms.push(r1.data.room.id);
    if (r2.data.room?.id) rooms.push(r2.data.room.id);
    let activeCount = 0;
    for (const id of rooms) {
      const gr = await getRoom(E.token, id);
      if (gr.data.membership === 'active') activeCount++;
    }
    if (activeCount > 1) {
      throw new Error(`duplicate active memberships after double-create: ${activeCount}`);
    }
    pass('double-click create does not duplicate membership');
  } catch (e) { fail('double-click create does not duplicate membership', e); }

  // Double-click join
  try {
    // Make room with space: kick C to free a slot if needed, or use new room
    const F = await signup('qaF');
    const room = await createRoom(F.token, 'Join Race Room', 4);
    const rid = room.data.room.id;
    const G = await signup('qaG');
    const [j1, j2] = await Promise.all([
      joinRoom(G.token, rid),
      joinRoom(G.token, rid),
    ]);
    assert(j1.ok && j2.ok, `double join should both be ok/idempotent: ${JSON.stringify({j1,j2})}`);
    const gr = await getRoom(F.token, rid);
    assert(gr.data.room.member_count === 2, `double join inflated count to ${gr.data.room.member_count}`);
    const mr = await myRoom(G.token);
    assert(mr.data.room?.id === rid, 'G my-room after double join');
    pass('double-click join is idempotent');
  } catch (e) { fail('double-click join is idempotent', e); }

  // Leave then immediate refresh
  try {
    const H = await signup('qaH');
    const room = await createRoom(H.token, 'Leave Refresh', 4);
    const rid = room.data.room.id;
    await leaveRoom(H.token, rid);
    const mr = await myRoom(H.token);
    assert(!mr.data.room, 'my-room after leave+refresh still set');
    pass('refresh immediately after leave');
  } catch (e) { fail('refresh immediately after leave', e); }

  // Join then immediate refresh
  try {
    const I = await signup('qaI');
    const room = await createRoom(A.token, 'Join Refresh Room', 4);
    // A may already be in another room — join should move them
    const rid = room.data.room.id;
    await joinRoom(I.token, rid);
    const mr = await myRoom(I.token);
    assert(mr.data.room?.id === rid, 'my-room after join+refresh wrong');
    pass('refresh immediately after join');
  } catch (e) { fail('refresh immediately after join', e); }

  // Creating room while already in one — should not leave user in two rooms
  try {
    const J = await signup('qaJ');
    const r1 = await createRoom(J.token, 'First Room', 4);
    const r2 = await createRoom(J.token, 'Second Room', 4);
    assert(r1.status === 200 && r2.status === 200, 'both creates ok');
    let active = 0;
    for (const id of [r1.data.room.id, r2.data.room.id]) {
      const gr = await getRoom(J.token, id);
      if (gr.data.membership === 'active') active++;
    }
    const mr = await myRoom(J.token);
    assert(mr.data.room, 'should have one room');
    assert(active === 1, `user in ${active} rooms after second create`);
    pass('create while in room leaves only one active membership');
  } catch (e) { fail('create while in room leaves only one active membership', e); }

  // Friend-only invite + accept another user's invite abuse
  try {
    const K = await signup('qaK');
    const L = await signup('qaL');
    const M = await signup('qaM');
    const room = await createRoom(K.token, 'Friends Only Room', 4);
    const rid = room.data.room.id;

    // Non-friend invite should be blocked by frontend; backend notification can still be created by raw API.
    // Simulate: M tries to join via K's room without being invited properly — public join still allowed by code?
    // Friend-only is invite UI gate; joining by ID is still allowed unless room is friends-only.
    // Test close-friend request + accept, then invite notification recipient scoping.
    const req1 = await req('POST', '/api/close-friends/request', { token: K.token, body: { targetId: L.user.id } });
    assert(req1.ok, 'friend request failed: ' + JSON.stringify(req1.data));
    const pending = await req('GET', '/api/close-friends/requests', { token: L.token });
    const incoming = (pending.data.incoming || pending.data.received || []).find(r =>
      r.from_user_id === K.user.id || r.fromUserId === K.user.id
    ) || (pending.data.incoming || pending.data.received || pending.data.requests || [])[0];
    // respond if we got a request id
    const requestId = incoming?.id || incoming?.requestId;
    if (requestId) {
      await req('POST', '/api/close-friends/respond', { token: L.token, body: { requestId, accept: true } });
    }

    // K invites L via notification API
    const notif = await req('POST', '/api/notifications', {
      token: K.token,
      body: { userId: L.user.id, type: 'room_joined', data: { roomId: rid, kind: 'room_invite' } },
    });
    // M should not be able to mark L's notification or steal it — notifications are scoped to auth user
    const mNotifs = await req('GET', '/api/notifications', { token: M.token });
    const stolen = (mNotifs.data.notifications || []).some(n =>
      n.data?.roomId === rid && (n.user_id === L.user.id || n.userId === L.user.id)
    );
    assert(!stolen, 'M can see L invite notification');
    pass('friend invite scoped; other user cannot see invite');
  } catch (e) { fail('friend invite scoped; other user cannot see invite', e); }

  // Multi-tab: two my-room fetches agree
  try {
    const N = await signup('qaN');
    const room = await createRoom(N.token, 'Multi Tab Room', 4);
    const [a, b] = await Promise.all([myRoom(N.token), myRoom(N.token)]);
    assert(a.data.room?.id === room.data.room.id && b.data.room?.id === room.data.room.id, 'multi-tab my-room diverge');
    pass('multi-tab my-room consistent');
  } catch (e) { fail('multi-tab my-room consistent', e); }

  // Logout during room activity — membership remains in DB
  try {
    const O = await signup('qaO');
    const room = await createRoom(O.token, 'Logout Room', 4);
    await req('POST', '/api/auth/logout', { token: O.token });
    const loginAgain = await login(O.email, O.password);
    const mr = await myRoom(loginAgain.token);
    assert(mr.data.room?.id === room.data.room.id, 'membership lost after logout mid-activity');
    pass('logout mid-activity keeps DB membership');
  } catch (e) { fail('logout mid-activity keeps DB membership', e); }

  report();
}

function report() {
  console.log('\n=== SUMMARY ===');
  const ok = results.filter(r => r.ok).length;
  const bad = results.filter(r => !r.ok);
  console.log(`${ok}/${results.length} passed`);
  if (bad.length) {
    console.log('FAILURES:');
    bad.forEach(b => console.log(' -', b.name, '::', b.err));
  }
  process.exit(bad.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
