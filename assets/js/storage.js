// storage.js
// Simple wrapper for localStorage with schema versioning

const STORAGE_KEY = 'points_game_v1';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse storage, resetting', e);
    return createEmptyState();
  }
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

function addPerson(groupId, personId, name) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  if (g.people.find(p => p.personId.trim().toLowerCase() === personId.trim().toLowerCase())) {
    throw new Error('Duplicate person id');
  }
  g.people.push({ personId: personId.trim(), name: name.trim(), enabled: true, createdAt: new Date().toISOString() });
  saveState(state);
}

function updatePerson(groupId, personId, patch) {
  const state = loadState();
  const g = state.groups.find(x => x.groupId === groupId);
  if (!g) throw new Error('Group not found');
  const p = g.people.find(x => x.personId === personId);
  if (!p) throw new Error('Person not found');
  Object.assign(p, patch);
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
