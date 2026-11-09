// storage.js
// Simple wrapper for localStorage with schema versioning

const STORAGE_KEY = 'points_game_v1';

const BACKUP_KEY = STORAGE_KEY + '_backup';
// copy of the data taken once, right before leaders were first added to old games
const LEADER_BACKUP_KEY = STORAGE_KEY + '_backup_before_leaders';

function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    // Never overwrite data we could not read: keep a copy of the raw value
    // and work on an in-memory empty state until the user saves something.
    console.error('Failed to parse storage; raw data kept in ' + BACKUP_KEY, e);
    try { if (raw) localStorage.setItem(BACKUP_KEY, raw); } catch (_) { /* ignore */ }
    return { groups: [], ui: { currentGroupId: null } };
  }
}

// Fill in defaults for fields added in later versions. Older saved data
// (without these fields) keeps working; nothing existing is removed.
function normalizeState(s) {
  if (!s || typeof s !== 'object') s = {};
  if (!Array.isArray(s.groups)) s.groups = [];
  if (!s.ui || typeof s.ui !== 'object') s.ui = { currentGroupId: null };
  s.groups.forEach(g => {
    if (!Array.isArray(g.people)) g.people = [];
    if (!Array.isArray(g.games)) g.games = [];
    if (!g.nextGameId) g.nextGameId = g.games.reduce((m, x) => Math.max(m, Number(x.gameId) || 0), 0) + 1;
    g.people.forEach(p => {
      if (p.enabled === undefined) p.enabled = true;
      if (p.startPoints === undefined) p.startPoints = 0;
      if (p.joinedAfterGameId === undefined) p.joinedAfterGameId = 0;
    });
    g.games.forEach(gm => { if (!Array.isArray(gm.entries)) gm.entries = []; });
  });
  return s;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createEmptyState() {
  const s = { groups: [], ui: { currentGroupId: null } };
  saveState(s);
  return s;
}

/* group helpers */
function createGroup(name, markActive = false) {
  const state = loadState();
  if (state.groups.find(g => g.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    throw new Error('Duplicate group name');
  }
  const slug = 'g_' + Date.now().toString(36);
  const group = {
    groupId: slug,
    name: name.trim(),
    isActive: !!markActive,
    people: [],
    games: [],
    nextGameId: 1,
    createdAt: new Date().toISOString()
  };
  state.groups.push(group);
  if (markActive) state.ui.currentGroupId = group.groupId;
  if (!state.ui.currentGroupId) state.ui.currentGroupId = group.groupId;
  saveState(state);
  return group;
}

function updateGroup(groupId, patch) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  Object.assign(g, patch);
  saveState(state);
  return g;
}

function renameGroup(groupId, newName) {
  const name = String(newName || '').trim();
  if (!name) throw new Error('Group name cannot be empty');
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  if (state.groups.find(x => x !== g && x.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('Another group already has this name');
  }
  g.name = name;
  saveState(state);
  return g;
}

function deleteGroup(groupId) {
  const state = loadState();
  const idx = state.groups.findIndex(x => x.groupId === groupId);
  if (idx >= 0) state.groups.splice(idx, 1);
  if (state.ui.currentGroupId === groupId) state.ui.currentGroupId = state.groups.length ? state.groups[0].groupId : null;
  saveState(state);
}

// opts.startPoints: points a player starts with when joining mid-way (default 0)
function addPerson(groupId, personId, name, opts = {}) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  personId = (personId || '').trim() || generatePersonId(g, name);
  if (g.people.find(p => p.personId.trim().toLowerCase() === personId.toLowerCase())) {
    throw new Error('Duplicate person id');
  }
  const lastGameId = g.games.reduce((m, x) => Math.max(m, Number(x.gameId) || 0), 0);
  const person = {
    personId,
    name: name.trim(),
    enabled: true,
    startPoints: Number(opts.startPoints) || 0,
    joinedAfterGameId: lastGameId, // games up to this id were played before they joined
    createdAt: new Date().toISOString()
  };
  g.people.push(person);
  saveState(state);
  return person;
}

function generatePersonId(group, name) {
  const base = (name || 'player').trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'player';
  const taken = new Set(group.people.map(p => p.personId.trim().toLowerCase()));
  let id = base, n = 2;
  while (taken.has(id)) id = base + n++;
  return id;
}

function updatePerson(groupId, personId, patch) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const p = g.people.find(x => x.personId === personId);
  if (!p) throw new Error('Person not found');
  const newId = patch.personId !== undefined ? String(patch.personId).trim() : personId;
  if (newId !== personId) {
    if (!newId) throw new Error('ID cannot be empty');
    if (g.people.find(x => x !== p && x.personId.trim().toLowerCase() === newId.toLowerCase())) {
      throw new Error('Duplicate ID in this group');
    }
    // keep history linked to the renamed player
    g.games.forEach(gm => gm.entries.forEach(e => { if (e.personId === personId) e.personId = newId; }));
    g.games.forEach(gm => { if (gm.leader && gm.leader.personId === personId) gm.leader.personId = newId; });
  }
  Object.assign(p, patch, { personId: newId });
  saveState(state);
}

function removePerson(groupId, personId) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const idx = g.people.findIndex(x => x.personId === personId);
  if (idx >= 0) g.people.splice(idx, 1);
  saveState(state);
}

/* games */
// leader (optional): null = no leader in this game, or { personId, result: 'won'|'lost', source }.
// It is only a note of who led; points are stored exactly as given.
function addGame(groupId, entries, leader) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const game = {
    gameId: g.nextGameId,
    timestamp: new Date().toISOString(),
    entries // [{ personId, participated, points }]
  };
  if (leader !== undefined) game.leader = leader;
  g.games.push(game);
  g.nextGameId++;
  saveState(state);
  return game;
}

// Replace the entries of an existing game; its id and timestamp are kept.
// leader: undefined leaves the game's leader as it is; null or an object replaces it.
function updateGame(groupId, gameId, entries, leader) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const game = g.games.find(x => Number(x.gameId) === Number(gameId));
  if (!game) throw new Error('Game not found');
  game.entries = entries;
  if (leader !== undefined) game.leader = leader;
  game.editedAt = new Date().toISOString();
  saveState(state);
  return game;
}

// Put back a game removed with deleteGame (used by Undo).
function restoreGame(groupId, game) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  if (g.games.some(x => Number(x.gameId) === Number(game.gameId))) return;
  g.games.push(game);
  g.games.sort((a, b) => Number(a.gameId) - Number(b.gameId));
  if (g.nextGameId <= Number(game.gameId)) g.nextGameId = Number(game.gameId) + 1;
  saveState(state);
}

function clearHistory(groupId) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  g.games = [];
  g.nextGameId = 1;
  saveState(state);
}

// Record the leader of several old games at once: leaders = { gameId: null | { personId, result, source } }.
// Works on the saved data as it is (no defaults filled in) so nothing but `leader` changes.
// The first time, the data as it was is copied to LEADER_BACKUP_KEY (never overwritten later).
function setGameLeaders(groupId, leaders) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No saved data');
  const data = JSON.parse(raw);
  const g = (data.groups || []).find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  if (localStorage.getItem(LEADER_BACKUP_KEY) === null) localStorage.setItem(LEADER_BACKUP_KEY, raw);
  let count = 0;
  (g.games || []).forEach(gm => {
    if (!Object.prototype.hasOwnProperty.call(leaders, String(gm.gameId))) return;
    if (gm.leader !== undefined) return; // already reviewed (e.g. in another tab): keep it
    const l = leaders[String(gm.gameId)];
    if (l === null) gm.leader = null;
    else if (l && (gm.entries || []).some(e => e.participated && e.personId === l.personId) && (l.result === 'won' || l.result === 'lost')) {
      gm.leader = { personId: l.personId, result: l.result, source: l.source || 'auto' };
    } else return;
    count++;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return count;
}

/* utility */
function setCurrentGroup(groupId) {
  const state = loadState();
  state.ui.currentGroupId = groupId;
  saveState(state);
}

function deleteGame(groupId, gameId) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const idx = g.games.findIndex(x => Number(x.gameId) === Number(gameId));
  if (idx >= 0) {
    const [removed] = g.games.splice(idx, 1);
    // Do NOT decrement nextGameId — keep IDs unique
    saveState(state);
    return removed; // truthy; lets the UI offer Undo
  }
  return false;
}

/* backup */
function exportStateJSON() {
  return JSON.stringify(loadState(), null, 2);
}

// Replaces all data with an exported backup. The current data is kept in
// BACKUP_KEY first so an accidental import can be recovered.
function importStateJSON(text) {
  const parsed = normalizeState(JSON.parse(text));
  if (!parsed.groups.length) throw new Error('Backup file contains no groups');
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) localStorage.setItem(BACKUP_KEY, current);
  if (!parsed.groups.find(g => g.groupId === parsed.ui.currentGroupId)) parsed.ui.currentGroupId = parsed.groups[0].groupId;
  saveState(parsed);
}
