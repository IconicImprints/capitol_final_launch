import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// CORS configuration
const corsOrigin = process.env.ALLOWED_ORIGINS?.split(',') || ['https://getcapitol.vercel.app'];
app.use(cors({ 
  origin: corsOrigin, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '12mb' }));

// Generate a simple token that includes user data (stateless approach)
function generateToken(userId, userData = {}) {
  const tokenData = {
    userId,
    ...userData,
    exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hour expiry
  };
  const tokenStr = Buffer.from(JSON.stringify(tokenData)).toString('base64url');
  return tokenStr;
}

function decodeToken(token) {
  try {
    const tokenStr = Buffer.from(token, 'base64url').toString('utf-8');
    const tokenData = JSON.parse(tokenStr);
    // Check expiry
    if (tokenData.exp && tokenData.exp < Date.now()) {
      return null;
    }
    return tokenData;
  } catch {
    return null;
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth: Signup
app.post('/api/auth/signup', (req, res) => {
  const { displayName, username, email, password } = req.body;
  const userId = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const token = generateToken(userId);
  
  const user = {
    id: userId,
    username: username || displayName,
    display_name: displayName,
    email: email,
    created_at: new Date().toISOString(),
    xp: 0,
    streak: 0,
    level: 1
  };
  
  res.json({ 
    ok: true, 
    token, 
    user 
  });
});

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // For demo purposes, create user if not exists
  const userId = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const token = generateToken(userId);
  const user = {
    id: userId,
    username: email.split('@')[0],
    display_name: email.split('@')[0],
    email: email,
    created_at: new Date().toISOString(),
    xp: 0,
    streak: 0,
    level: 1
  };
  
  res.json({ ok: true, token, user });
});

// Get all rooms
app.get('/api/rooms', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  // Return rooms stored in token for stateless persistence
  const rooms = tokenData?.rooms || [];
  res.json({ ok: true, rooms });
});

// Get room by ID
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  // Return room from token data
  const room = tokenData?.rooms?.find(r => r.id === roomId);
  if (room) {
    res.json({ ok: true, room });
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Create room
app.post('/api/rooms', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  const { name, icon, goal, niche, ageRange, tags, maxMembers, elite, days, creatorUid } = req.body;
  const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const room = {
    id: roomId,
    name,
    icon: icon || 'bolt',
    goal: goal || '',
    niche: niche || 'general',
    age_range: ageRange || null,
    tags: tags || [],
    max_members: maxMembers || 8,
    elite: !!elite,
    days: days || 30,
    member_count: 0,
    membersList: [],
    creator_uid: creatorUid || null,
    created_at: new Date().toISOString()
  };
  
  // Store room in token data for stateless persistence
  const rooms = tokenData?.rooms || [];
  rooms.push(room);
  
  // Generate new token with updated room data
  const newToken = generateToken(tokenData?.userId, { ...tokenData, rooms });
  
  res.json({ ok: true, room, token: newToken });
});

// Join room
app.post('/api/rooms/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  const { userId } = req.body;
  
  const finalUserId = tokenData?.userId || userId;
  
  // Find and update room in token data
  const rooms = tokenData?.rooms || [];
  const roomIndex = rooms.findIndex(r => r.id === roomId);
  
  if (roomIndex === -1) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // Update room member count
  rooms[roomIndex].member_count = (rooms[roomIndex].member_count || 0) + 1;
  rooms[roomIndex].membersList = rooms[roomIndex].membersList || [];
  rooms[roomIndex].membersList.push(finalUserId);
  
  // Update user's room assignment
  const updatedTokenData = { ...tokenData, rooms, roomId };
  const newToken = generateToken(finalUserId, updatedTokenData);
  
  res.json({ ok: true, room: rooms[roomIndex], token: newToken });
});

// Leave room
app.post('/api/rooms/:roomId/leave', (req, res) => {
  const { roomId } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  const rooms = tokenData?.rooms || [];
  const roomIndex = rooms.findIndex(r => r.id === roomId);
  
  if (roomIndex !== -1) {
    rooms[roomIndex].member_count = Math.max(0, (rooms[roomIndex].member_count || 0) - 1);
    rooms[roomIndex].membersList = (rooms[roomIndex].membersList || []).filter(id => id !== tokenData?.userId);
  }
  
  const updatedTokenData = { ...tokenData, rooms, roomId: null };
  const newToken = generateToken(tokenData?.userId, updatedTokenData);
  
  res.json({ ok: true, token: newToken });
});

// Get user's room
app.get('/api/users/me/room', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  if (!tokenData?.roomId) {
    return res.json({ room: null });
  }
  
  const room = tokenData?.rooms?.find(r => r.id === tokenData.roomId);
  if (room) {
    return res.json({ ok: true, room });
  }
  
  res.json({ room: null });
});

// Get user by ID
app.get('/api/users/:uid', (req, res) => {
  const { uid } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  // Return user data from token
  if (tokenData?.userId === uid) {
    const user = {
      id: tokenData.userId,
      ...tokenData
    };
    delete user.rooms;
    delete user.roomId;
    res.json({ ok: true, user });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Update user
app.patch('/api/users/:uid', (req, res) => {
  const { uid } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  const updates = req.body;
  
  if (tokenData?.userId !== uid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Update token data with user updates
  const updatedTokenData = { ...tokenData, ...updates };
  const newToken = generateToken(uid, updatedTokenData);
  
  res.json({ ok: true, user: updatedTokenData, token: newToken });
});

// Get current user
app.get('/api/users/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  if (tokenData) {
    const user = {
      id: tokenData.userId,
      ...tokenData
    };
    delete user.rooms;
    delete user.roomId;
    res.json({ ok: true, user });
  } else {
    res.json({ ok: true, user: null });
  }
});

// Update current user
app.patch('/api/users/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  const tokenData = decodeToken(token);
  
  if (!tokenData) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const updates = req.body;
  const updatedTokenData = { ...tokenData, ...updates };
  const newToken = generateToken(tokenData.userId, updatedTokenData);
  
  res.json({ ok: true, user: updatedTokenData, token: newToken });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;