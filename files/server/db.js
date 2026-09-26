import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
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

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY, null, 2));
}

export function loadDb() {
  ensure();
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return { ...EMPTY, ...raw };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function saveDb(db) {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Synchronous withDb for compatibility with existing code
// This provides basic serialization but is NOT truly atomic for concurrent requests
// For production, consider a proper database with transaction support
export function withDb(mutator) {
  const db = loadDb();
  const result = mutator(db);
  saveDb(db);
  return result;
}
