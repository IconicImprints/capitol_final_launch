// ── Placeholder / compat sample data ───────────────────────────────────────────
// Moved verbatim from App.jsx — no value changes. These are kept for backward
// compatibility; real data comes from buildLeaderboard()/buildPeopleData() etc.

export const ROOMS_INIT = [];

export const LEADERBOARD = []; // kept for compat; real data via buildLeaderboard(me)

// Feed starts empty — only real user activity is shown
export const FEED_INIT = [];

export const BADGES = [
  { icon: "flame",    name: "10-Day Streak", earned: true },
  { icon: "star",     name: "First Goal Done", earned: true },
  { icon: "diamond",  name: "30-Day Streak", earned: false },
  { icon: "bolt",     name: "Elite Room", earned: false },
  { icon: "crown",    name: "Leaderboard #1", earned: false },
  { icon: "trophy",   name: "20 Proofs Straight", earned: false },
];

export const PEOPLE_DATA = []; // kept for compat; real data via buildPeopleData()

export const MEMBER_STATUS_DATA = {};
