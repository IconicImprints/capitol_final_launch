/**
 * Simple test for kick/rejoin functionality using existing users
 */

const API_BASE = 'http://localhost:3001/api';

async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Login failed');
  return data;
}

async function createRoom(token, roomData) {
  const response = await fetch(`${API_BASE}/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(roomData)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Create room failed');
  return data;
}

async function joinRoom(token, roomId) {
  const response = await fetch(`${API_BASE}/rooms/${roomId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Join room failed');
  return data;
}

async function kickMember(token, roomId, targetId, reason) {
  const response = await fetch(`${API_BASE}/rooms/${roomId}/kick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ targetId, reason })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Kick failed');
  return data;
}

async function getRoom(token, roomId) {
  const response = await fetch(`${API_BASE}/rooms/${roomId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Get room failed');
  return data;
}

async function getUserRoom(token) {
  const response = await fetch(`${API_BASE}/users/me/room`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Get user room failed');
  return data;
}

async function signup(username, displayName, email, password) {
  const response = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName, email, password })
  });
  const data = await response.json();
  if (!response.ok) {
    if (data.error && (data.error.includes('already') || data.error.includes('taken'))) {
      console.log('  User already exists, logging in instead...');
      return await login(email, password);
    }
    throw new Error(data.error || 'Signup failed');
  }
  return data;
}

async function main() {
  console.log('=== Testing Kick/Rejoin Functionality ===\n');

  try {
    // Create test users
    console.log('Step 1: Creating User A...');
    const userA = await signup('alice123', 'Alice', 'alice_test@example.com', 'password123');
    console.log('✓ User A ready:', userA.user.username);

    console.log('\nStep 2: Creating User B...');
    const userB = await signup('bob123', 'Bob', 'bob_test@example.com', 'password123');
    console.log('✓ User B ready:', userB.user.username);

    // Step 3: User A creates a room
    console.log('\nStep 3: User A creates a room...');
    const room = await createRoom(userA.token, {
      name: 'Test Room ' + Date.now(),
      goal: 'Test goal',
      maxMembers: 4
    });
    console.log('✓ Room created:', room.room.id, room.room.name);

    // Step 4: User B joins the room
    console.log('\nStep 4: User B joins the room...');
    await joinRoom(userB.token, room.room.id);
    console.log('✓ User B joined the room');

    // Verify User B is in the room
    const roomBeforeKick = await getRoom(userB.token, room.room.id);
    console.log('Room membership before kick:', roomBeforeKick.membership);
    console.log('Room member count before kick:', roomBeforeKick.room.member_count);

    // Step 5: User A kicks User B
    console.log('\nStep 5: User A kicks User B...');
    await kickMember(userA.token, room.room.id, userB.user.id, 'removed');
    console.log('✓ User B kicked from the room');

    // Step 6: Confirm B is no longer an active member
    console.log('\nStep 6: Confirming B is no longer an active member...');
    const roomAfterKick = await getRoom(userB.token, room.room.id);
    console.log('Room membership after kick:', roomAfterKick.membership);
    console.log('Room member count after kick:', roomAfterKick.room.member_count);

    if (roomAfterKick.membership === 'active') {
      throw new Error('FAILED: User B should not be active after being kicked');
    }
    console.log('✓ User B is not an active member');

    // Step 7: B joins the same room again
    console.log('\nStep 7: User B joins the same room again...');
    await joinRoom(userB.token, room.room.id);
    console.log('✓ User B rejoined the room');

    // Step 8: Refresh B's page (check membership via API)
    console.log('\nStep 8: Refreshing B\'s page (checking membership)...');
    const roomAfterRejoin = await getRoom(userB.token, room.room.id);
    console.log('Room membership after rejoin:', roomAfterRejoin.membership);
    console.log('Room member count after rejoin:', roomAfterRejoin.room.member_count);

    if (roomAfterRejoin.membership !== 'active') {
      throw new Error('FAILED: User B should be active after rejoining');
    }
    console.log('✓ User B is now an active member');

    // Step 9: Confirm room member count is correct and an integer
    console.log('\nStep 9: Confirming room member count is correct and an integer...');
    const memberCount = roomAfterRejoin.room.member_count;
    console.log('Member count:', memberCount, 'Type:', typeof memberCount);

    if (!Number.isInteger(memberCount)) {
      throw new Error('FAILED: Member count should be an integer');
    }

    if (memberCount !== 2) {
      throw new Error(`FAILED: Expected 2 members, got ${memberCount}`);
    }
    console.log('✓ Room member count is correct (2) and an integer');

    // Additional verification: Check User B's current room
    console.log('\nAdditional verification: Checking User B\'s current room...');
    const userBRoom = await getUserRoom(userB.token);
    console.log('User B current room:', userBRoom.room ? userBRoom.room.id : 'none');
    
    if (!userBRoom.room || userBRoom.room.id !== room.room.id) {
      throw new Error('FAILED: User B should have the room as their current room');
    }
    console.log('✓ User B has the correct room as their current room');

    console.log('\n=== ALL TESTS PASSED ===');
    console.log('The kick/rejoin functionality is working correctly!');

  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
