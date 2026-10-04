// storage.js
// Simple wrapper for localStorage with schema versioning

const STORAGE_KEY = 'points_game_v1';

const BACKUP_KEY = STORAGE_KEY + '_backup';

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
function addGame(groupId, entries) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const game = {
    gameId: g.nextGameId,
    timestamp: new Date().toISOString(),
    entries // [{ personId, participated, points }]
  };
  g.games.push(game);
  g.nextGameId++;
  saveState(state);
  return game;
}

function clearHistory(groupId) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  g.games = [];
  g.nextGameId = 1;
  saveState(state);
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
    g.games.splice(idx, 1);
    // Do NOT decrement nextGameId — keep IDs unique
    saveState(state);
    return true;
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
