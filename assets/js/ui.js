// ui.js - all UI rendering and interactions
// depends on storage.js and models.js

const selCurrentGroup = document.getElementById('selCurrentGroup');
const selCurrentGroupMobile = document.getElementById('selCurrentGroupMobile');
const groupSelects = [selCurrentGroup, selCurrentGroupMobile].filter(Boolean);
const btnAddGroup = document.getElementById('btnAddGroup');
const btnDeleteGroup = document.getElementById('btnDeleteGroup');
const btnRenameGroup = document.getElementById('btnRenameGroup');
const modalAddGroup = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAddGroup'));
const formAddGroup = document.getElementById('formAddGroup');
const inpGroupName = document.getElementById('inpGroupName');
const chkMarkActive = document.getElementById('chkMarkActive');
const btnExportJSON = document.getElementById('btnExportJSON');
const btnImportJSON = document.getElementById('btnImportJSON');
const fileImportJSON = document.getElementById('fileImportJSON');

const badgeGames = document.getElementById('badgeGames');
const badgePlayers = document.getElementById('badgePlayers');

const playersListEl = document.getElementById('playersList');
const btnAddPerson = document.getElementById('btnAddPerson');

const modalPersonEl = document.getElementById('modalPerson');
const modalPerson = bootstrap.Modal.getOrCreateInstance(modalPersonEl);
const formPerson = document.getElementById('formPerson');
const lblPersonModalTitle = document.getElementById('lblPersonModalTitle');
const btnPersonSubmit = document.getElementById('btnPersonSubmit');
const inpPersonId = document.getElementById('inpPersonId');
const inpPersonName = document.getElementById('inpPersonName');
const joinMidway = document.getElementById('joinMidway');
const lblGamesPlayed = document.getElementById('lblGamesPlayed');
const inpStartPoints = document.getElementById('inpStartPoints');
const startPresets = document.getElementById('startPresets');

const logPlayersContainer = document.getElementById('logPlayersContainer');
const formLogGame = document.getElementById('formLogGame');
const btnCheckAll = document.getElementById('btnCheckAll');
const btnSelectLast = document.getElementById('btnSelectLast');
const btnClearAll = document.getElementById('btnClearAll');
const btnSetZero = document.getElementById('btnSetZero');
const inpLogFilter = document.getElementById('inpLogFilter');
const lblLogSummary = document.getElementById('lblLogSummary');
const editBanner = document.getElementById('editBanner');
const lblEditGame = document.getElementById('lblEditGame');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const btnSaveGame = document.getElementById('btnSaveGame');

const historyContainer = document.getElementById('historyContainer');
const btnExportPDF = document.getElementById('btnExportPDF');
const btnClearHistory = document.getElementById('btnClearHistory');

const rankTable = document.getElementById('rankTable');
const rankHint = document.getElementById('rankHint');
const inpMinGames = document.getElementById('inpMinGames');
const minGamesWrap = document.getElementById('minGamesWrap');
const btnCopyRanking = document.getElementById('btnCopyRanking');

let state = loadState();

// In-progress game being logged: survives re-renders (e.g. adding a player mid-way)
// shape: { groupId, selected: { personId: pointsString }, editingGameId?, before? }
// While editing a past game, `before` holds the draft that was in progress so it can be restored.
let logDraft = { groupId: null, selected: {} };

function refreshState() {
  state = loadState();
}

function currentGroup() {
  return state.groups.find(g => g.groupId === state.ui.currentGroupId) || null;
}

/* Groups */
function renderGroups() {
  refreshState();
  // the same group picker is shown in the header (desktop) and on its own row (phones)
  groupSelects.forEach(sel => {
    sel.innerHTML = '';
    if (!state.groups.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No groups yet';
      opt.value = '';
      sel.appendChild(opt);
    }
    state.groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.groupId;
      opt.textContent = `${g.name} (${g.people.length} player${g.people.length === 1 ? '' : 's'} · ${g.games.length} game${g.games.length === 1 ? '' : 's'})`;
      sel.appendChild(opt);
    });
    sel.value = state.ui.currentGroupId || (state.groups[0] && state.groups[0].groupId) || '';
  });
  btnDeleteGroup.disabled = !currentGroup();
  btnRenameGroup.disabled = !currentGroup();

  const group = currentGroup();
  badgeGames.textContent = group ? group.games.length : '';
  badgePlayers.textContent = group ? group.people.length : '';
}

btnAddGroup.addEventListener('click', () => {
  inpGroupName.value = '';
  chkMarkActive.checked = true;
  modalAddGroup.show();
});
document.getElementById('modalAddGroup').addEventListener('shown.bs.modal', () => inpGroupName.focus());

formAddGroup.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = inpGroupName.value.trim();
  try {
    createGroup(name, chkMarkActive.checked);
    modalAddGroup.hide();
    renderAllForCurrent();
  } catch (e) {
    alert(e.message);
  }
});

groupSelects.forEach(sel => sel.addEventListener('change', () => {
  const id = sel.value;
  if (id) { setCurrentGroup(id); renderAllForCurrent(); }
}));

btnRenameGroup.addEventListener('click', () => {
  const group = currentGroup();
  if (!group) return;
  const name = prompt('New group name', group.name);
  if (name === null || name.trim() === group.name) return;
  try {
    renameGroup(group.groupId, name);
    renderAllForCurrent();
    showToast('Group renamed');
  } catch (e) {
    alert(e.message);
  }
});

btnDeleteGroup.addEventListener('click', () => {
  const group = currentGroup();
  if (!group) return;
  const typed = prompt(`This permanently deletes "${group.name}" with all its players and ${group.games.length} games.\nTip: download a backup first.\n\nType the group name to confirm:`);
  if (typed === null) return;
  if (typed.trim() !== group.name) { alert('Name did not match. Nothing was deleted.'); return; }
  deleteGroup(group.groupId);
  renderAllForCurrent();
});

/* Backup */
btnExportJSON.addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`points_game_backup_${stamp}.json`, exportStateJSON());
});

btnImportJSON.addEventListener('click', () => { fileImportJSON.value = ''; fileImportJSON.click(); });

fileImportJSON.addEventListener('change', async () => {
  const file = fileImportJSON.files[0];
  if (!file) return;
  if (!confirm('Restoring replaces ALL current groups with the backup file. Continue?')) return;
  try {
    importStateJSON(await file.text());
    logDraft = { groupId: null, selected: {} };
    renderAllForCurrent();
    alert('Backup restored.');
  } catch (e) {
    alert('Could not restore backup: ' + e.message);
  }
});

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

/* Players UI */
function renderPlayersList() {
  const group = currentGroup();
  playersListEl.innerHTML = '';
  if (!group) { playersListEl.innerHTML = '<div class="text-muted small">Create a group first</div>'; return; }
  if (!group.people.length) { playersListEl.innerHTML = '<div class="text-muted small p-2">No players yet. Click “+ Add Player”.</div>'; return; }

  const stats = computeTotalsAndAverages(group);
  group.people.forEach(p => {
    const st = stats[p.personId];
    const lateJoin = (Number(p.joinedAfterGameId) || 0) > 0;
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex align-items-center gap-2';
    item.innerHTML = `
      <div class="form-check form-switch m-0" title="Active (uncheck if sitting out)">
        <input class="form-check-input chk-person-enabled" data-id="${escapeHtml(p.personId)}" type="checkbox" ${p.enabled ? 'checked' : ''}/>
      </div>
      <div class="flex-grow-1">
        <strong>${escapeHtml(p.name)}</strong> <small class="text-muted players-pid">(${escapeHtml(p.personId)})</small>
        <div class="small text-muted">
          ${st.played} games · total ${st.total}
          ${st.start ? ` · started with ${st.start}` : ''}
          ${lateJoin ? ` · joined after game ${p.joinedAfterGameId}` : ''}
        </div>
      </div>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-secondary btn-edit" data-id="${escapeHtml(p.personId)}">Edit</button>
        <button class="btn btn-sm btn-outline-danger btn-remove" data-id="${escapeHtml(p.personId)}">Remove</button>
      </div>
    `;
    playersListEl.appendChild(item);
  });

  playersListEl.querySelectorAll('.chk-person-enabled').forEach(chk => {
    chk.addEventListener('change', ev => {
      updatePerson(state.ui.currentGroupId, ev.target.dataset.id, { enabled: ev.target.checked });
      renderAllForCurrent();
    });
  });
  playersListEl.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', ev => {
      if (!confirm('Remove player? (their history remains)')) return;
      removePerson(state.ui.currentGroupId, ev.currentTarget.dataset.id);
      renderAllForCurrent();
    });
  });
  playersListEl.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', ev => openPersonModal(ev.currentTarget.dataset.id));
  });
}

/* Add / edit player modal (supports joining mid-way) */
let personModalEditId = null;

function openPersonModal(editId = null) {
  const group = currentGroup();
  if (!group) { alert('Create a group first'); return; }
  personModalEditId = editId;
  const p = editId ? group.people.find(x => x.personId === editId) : null;

  lblPersonModalTitle.textContent = p ? 'Edit Player' : 'Add Player';
  btnPersonSubmit.textContent = p ? 'Save' : 'Add';
  inpPersonName.value = p ? p.name : '';
  inpPersonId.value = p ? p.personId : '';
  inpStartPoints.value = p ? (Number(p.startPoints) || 0) : 0;

  // Mid-way join section: only relevant once games exist (or when editing a late joiner)
  const gamesCount = group.games.length;
  const showJoin = gamesCount > 0 || (p && Number(p.startPoints));
  joinMidway.classList.toggle('d-none', !showJoin);
  lblGamesPlayed.textContent = gamesCount ? `(${gamesCount} game${gamesCount === 1 ? '' : 's'} already played)` : '';

  // Presets based on current totals of players who have played (excluding the one being edited)
  startPresets.innerHTML = '';
  const others = Object.values(computeTotalsAndAverages(group))
    .filter(x => x.played > 0 && x.personId !== editId && group.people.some(pp => pp.personId === x.personId));
  if (others.length) {
    const totals = others.map(x => x.total);
    const presets = [
      ['Start at 0', 0],
      ['Average total', Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)],
      ['Lowest total', Math.min(...totals)],
      ['Highest total', Math.max(...totals)]
    ];
    presets.forEach(([label, val]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm btn-outline-secondary';
      b.textContent = `${label} (${val})`;
      b.addEventListener('click', () => { inpStartPoints.value = val; });
      startPresets.appendChild(b);
    });
  }

  modalPerson.show();
}

modalPersonEl.addEventListener('shown.bs.modal', () => inpPersonName.focus());

btnAddPerson.addEventListener('click', () => openPersonModal());

formPerson.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = inpPersonName.value.trim();
  const pid = inpPersonId.value.trim();
  const startPoints = Number(inpStartPoints.value || 0);
  if (!name) { alert('Provide a name'); return; }
  if (!Number.isFinite(startPoints) || !Number.isInteger(startPoints)) { alert('Starting points must be a whole number'); return; }
  try {
    if (personModalEditId) {
      updatePerson(state.ui.currentGroupId, personModalEditId, { name, personId: pid || personModalEditId, startPoints });
      // keep an in-progress selection linked if the ID changed
      if (pid && pid !== personModalEditId && personModalEditId in logDraft.selected) {
        logDraft.selected[pid] = logDraft.selected[personModalEditId];
        delete logDraft.selected[personModalEditId];
      }
    } else {
      const person = addPerson(state.ui.currentGroupId, pid, name, { startPoints });
      // a player added while logging a game is selected straight away
      if (logDraft.groupId === state.ui.currentGroupId) logDraft.selected[person.personId] = '';
    }
    modalPerson.hide();
    renderAllForCurrent();
  } catch (e) {
    alert(e.message);
  }
});

/* Log Game UI */
function ensureDraftForGroup(group) {
  if (logDraft.groupId !== (group && group.groupId)) {
    logDraft = { groupId: group ? group.groupId : null, selected: {} };
  }
  // drop selections for players that no longer exist
  if (group) {
    Object.keys(logDraft.selected).forEach(id => {
      if (!group.people.some(p => p.personId === id)) delete logDraft.selected[id];
    });
  }
}

function renderLogPlayers() {
  const group = currentGroup();
  ensureDraftForGroup(group);
  logPlayersContainer.innerHTML = '';
  const editing = logDraft.editingGameId != null;
  editBanner.classList.toggle('d-none', !editing);
  lblEditGame.textContent = editing ? `game #${logDraft.editingGameId}` : '';
  btnSaveGame.textContent = editing ? `Update game #${logDraft.editingGameId}` : 'Save Game';
  btnSaveGame.className = editing ? 'btn btn-warning' : 'btn btn-success';
  if (!group) { logPlayersContainer.innerHTML = '<div class="text-muted small">Create a group first</div>'; updateLogSummary(); return; }

  const stats = computeTotalsAndAverages(group);
  // active players first, then those sitting out
  const players = group.people.slice().sort((a, b) => (b.enabled !== false) - (a.enabled !== false));
  const filter = inpLogFilter.value.trim().toLowerCase();

  const grid = document.createElement('div');
  grid.className = 'player-grid';

  players.forEach(p => {
    if (filter && !p.name.toLowerCase().includes(filter) && !p.personId.toLowerCase().includes(filter) && !(p.personId in logDraft.selected)) return;
    const selected = p.personId in logDraft.selected;
    const st = stats[p.personId];
    const tile = document.createElement('div');
    tile.className = 'player-tile' + (selected ? ' selected' : '') + (p.enabled === false ? ' inactive' : '');
    tile.tabIndex = 0;
    tile.dataset.id = p.personId;
    tile.setAttribute('role', 'checkbox');
    tile.setAttribute('aria-checked', selected ? 'true' : 'false');
    tile.innerHTML = `
      <span class="tick">✓</span>
      <div class="pname" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
      <div class="pmeta">Total ${st.total} · ${st.played} games${p.enabled === false ? ' · sitting out' : ''}</div>
      <div class="pts-wrap input-group input-group-sm">
        <button type="button" class="btn btn-outline-secondary btn-sign" title="Flip sign (+/−)">±</button>
        <input type="number" min="-1000" max="1000" step="1" class="form-control inp-pts" placeholder="Points"
               data-id="${escapeHtml(p.personId)}" value="${selected ? escapeHtml(logDraft.selected[p.personId]) : ''}">
      </div>
    `;
    grid.appendChild(tile);
  });

  const addTile = document.createElement('div');
  addTile.className = 'player-tile add-tile';
  addTile.tabIndex = 0;
  addTile.textContent = group.games.length ? '+ Player joins mid-game' : '+ Add player';
  addTile.addEventListener('click', () => openPersonModal());
  addTile.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openPersonModal(); } });
  grid.appendChild(addTile);

  logPlayersContainer.appendChild(grid);

  grid.querySelectorAll('.player-tile:not(.add-tile)').forEach(tile => {
    const id = tile.dataset.id;
    const input = tile.querySelector('.inp-pts');
    tile.addEventListener('click', ev => {
      if (ev.target.closest('.pts-wrap')) return; // clicks in the points box don't toggle
      toggleLogPlayer(id, true);
    });
    tile.addEventListener('keydown', ev => {
      if (ev.target !== tile) return;
      if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggleLogPlayer(id, true); }
    });
    input.addEventListener('input', () => { logDraft.selected[id] = input.value; updateLogSummary(); });
    input.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      // move to the next selected player's points; submit after the last one
      const inputs = Array.from(logPlayersContainer.querySelectorAll('.player-tile.selected .inp-pts'));
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) { next.focus(); next.select(); } else formLogGame.requestSubmit();
    });
    tile.querySelector('.btn-sign').addEventListener('click', () => {
      const v = input.value.trim();
      input.value = v.startsWith('-') ? v.slice(1) : (v ? '-' + v : '-');
      logDraft.selected[id] = input.value;
      input.focus();
      updateLogSummary();
    });
  });

  updateLogSummary();
}

function toggleLogPlayer(id, focusInput) {
  const tile = logPlayersContainer.querySelector(`.player-tile[data-id="${cssEscape(id)}"]`);
  const input = tile && tile.querySelector('.inp-pts');
  if (id in logDraft.selected) {
    delete logDraft.selected[id];
    if (tile) { tile.classList.remove('selected'); tile.setAttribute('aria-checked', 'false'); input.value = ''; }
  } else {
    logDraft.selected[id] = '';
    if (tile) {
      tile.classList.add('selected');
      tile.setAttribute('aria-checked', 'true');
      if (focusInput) input.focus();
    }
  }
  updateLogSummary();
}

function setLogSelection(ids) {
  const prev = logDraft.selected;
  logDraft.selected = {};  // keeps editingGameId / before
  ids.forEach(id => { logDraft.selected[id] = prev[id] !== undefined ? prev[id] : ''; });
  renderLogPlayers();
}

function updateLogSummary() {
  const vals = Object.values(logDraft.selected);
  const n = vals.length;
  const filled = vals.filter(v => String(v).trim() !== '' && String(v).trim() !== '-');
  const sum = filled.reduce((a, v) => a + (Number(v) || 0), 0);
  lblLogSummary.innerHTML = n
    ? `<b>${n}</b> selected · ${filled.length}/${n} scored · sum <span class="${sum > 0 ? 'text-pos' : sum < 0 ? 'text-neg' : ''}">${sum}</span>`
    : 'No players selected';
}

function startEditGame(gameId) {
  const group = currentGroup();
  const game = group && group.games.find(g => Number(g.gameId) === Number(gameId));
  if (!game) return;
  const before = logDraft.editingGameId != null ? logDraft.before : { selected: logDraft.selected };
  const selected = {};
  game.entries.forEach(e => {
    if (e.participated && group.people.some(p => p.personId === e.personId)) selected[e.personId] = String(e.points);
  });
  logDraft = { groupId: group.groupId, selected, editingGameId: game.gameId, before };
  inpLogFilter.value = '';
  renderLogPlayers();
  new bootstrap.Tab(document.querySelector('#tab-log')).show();
}

function stopEditGame() {
  if (logDraft.editingGameId == null) return;
  logDraft = { groupId: logDraft.groupId, selected: (logDraft.before && logDraft.before.selected) || {} };
  renderLogPlayers();
}

btnCancelEdit.addEventListener('click', () => stopEditGame());

btnCheckAll.addEventListener('click', () => {
  const group = currentGroup();
  if (group) setLogSelection(group.people.filter(p => p.enabled !== false).map(p => p.personId));
});
btnClearAll.addEventListener('click', () => setLogSelection([]));
btnSelectLast.addEventListener('click', () => {
  const group = currentGroup();
  if (!group || !group.games.length) { alert('No previous game in this group'); return; }
  const last = group.games.reduce((a, b) => (Number(b.gameId) > Number(a.gameId) ? b : a));
  const ids = last.entries.filter(e => e.participated && group.people.some(p => p.personId === e.personId)).map(e => e.personId);
  setLogSelection(ids);
});
btnSetZero.addEventListener('click', () => {
  Object.keys(logDraft.selected).forEach(id => {
    const v = String(logDraft.selected[id]).trim();
    if (v === '' || v === '-') logDraft.selected[id] = '0';
  });
  renderLogPlayers();
});
inpLogFilter.addEventListener('input', () => renderLogPlayers());

formLogGame.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const group = currentGroup();
  if (!group) { alert('Create a group first'); return; }
  const ids = Object.keys(logDraft.selected);
  if (!ids.length) { alert('Select at least one player'); return; }

  const rows = [];
  for (const p of group.people) {
    const participated = p.personId in logDraft.selected;
    let points = null;
    if (participated) {
      const raw = String(logDraft.selected[p.personId]).trim();
      points = raw === '' ? 0 : Number(raw);
      if (!Number.isInteger(points) || points < -1000 || points > 1000) {
        alert(`Points for ${p.name} must be a whole number between -1000 and 1000`);
        const input = logPlayersContainer.querySelector(`.inp-pts[data-id="${cssEscape(p.personId)}"]`);
        if (input) input.focus();
        return;
      }
    }
    rows.push({ personId: p.personId, participated, points });
  }

  const blanks = ids.filter(id => String(logDraft.selected[id]).trim() === '');
  if (blanks.length && !confirm(`${blanks.length} selected player(s) have no points. Save them as 0?`)) return;

  try {
    if (logDraft.editingGameId != null) {
      const gameId = logDraft.editingGameId;
      const original = group.games.find(g => Number(g.gameId) === Number(gameId));
      // keep entries of players who were removed from the group since this game
      const extra = original ? original.entries.filter(e => !group.people.some(p => p.personId === e.personId)) : [];
      updateGame(group.groupId, gameId, rows.concat(extra));
      stopEditGame();
      renderAllForCurrent();
      showToast(`Game ${gameId} updated`);
      return;
    }
    addGame(group.groupId, rows);
    // keep the same players selected for the next round, clear the points
    Object.keys(logDraft.selected).forEach(id => { logDraft.selected[id] = ''; });
    renderAllForCurrent();
    showToast(`Game ${group.nextGameId} saved`, { label: 'Share', onClick: () => openShareDialog() });
  } catch (e) {
    alert('Failed to save game: ' + e.message);
  }
});

/* History UI */
function getHistoryView() {
  const v = state.ui && state.ui.historyView;
  if (v === 'cards' || v === 'table') return v;
  return window.matchMedia('(max-width: 767.98px)').matches ? 'cards' : 'table';
}

function signedPts(n) { return n > 0 ? '+' + n : String(n); }
function ptsClass(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero'; }

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function renderHistoryStats(group, stats) {
  const el = document.getElementById('historyStats');
  if (!group || !group.games.length) { el.innerHTML = ''; return; }
  const ranked = Object.values(stats).sort((a, b) => (b.total - a.total) || (b.played - a.played));
  const leader = ranked[0];
  const newest = group.games.reduce((a, b) => (new Date(b.timestamp) > new Date(a.timestamp) ? b : a));
  // biggest single-game score
  let best = null;
  group.games.forEach(g => g.entries.forEach(e => {
    if (e.participated && (!best || Number(e.points) > best.points)) best = { points: Number(e.points), personId: e.personId, gameId: g.gameId };
  }));
  const nameOf = id => (stats[id] ? stats[id].name : id);
  el.innerHTML = `
    <div class="hist-stat"><div class="lbl">Games</div><div class="val">${group.games.length}</div></div>
    <div class="hist-stat"><div class="lbl">Leader</div><div class="val gold">👑 ${escapeHtml(leader.name)} · ${leader.total}</div></div>
    <div class="hist-stat"><div class="lbl">Best game</div><div class="val">${best ? `${escapeHtml(nameOf(best.personId))} ${signedPts(best.points)}` : '–'}</div></div>
    <div class="hist-stat"><div class="lbl">Last played</div><div class="val">${escapeHtml(dayLabel(newest.timestamp))}</div></div>`;
}

function renderHistory() {
  const group = currentGroup();
  const view = getHistoryView();
  document.getElementById(view === 'cards' ? 'histViewCards' : 'histViewTable').checked = true;
  historyContainer.innerHTML = '';
  historyContainer.className = view === 'table' ? 'table-responsive-scroll' : '';
  if (!group) { renderHistoryStats(null); historyContainer.innerHTML = '<div class="text-muted small">Create a group first</div>'; return; }
  const stats = computeTotalsAndAverages(group);
  renderHistoryStats(group, stats);
  if (!group.games.length) { historyContainer.innerHTML = '<div class="text-muted small">No games yet</div>'; return; }

  const running = computeRunningTotals(group);
  const games = group.games.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (view === 'cards') renderHistoryCards(group, games, running);
  else renderHistoryTable(group, games, running, stats);

  historyContainer.querySelectorAll('.btn-edit-game').forEach(btn => {
    btn.addEventListener('click', ev => startEditGame(Number(ev.currentTarget.dataset.gameid)));
  });
  historyContainer.querySelectorAll('.btn-delete-game').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const gid = ev.currentTarget.dataset.gameid;
      if (!confirm(`Delete game ${gid}?`)) return;
      try {
        const groupId = state.ui.currentGroupId;
        const removed = deleteGame(groupId, Number(gid));
        if (!removed) { alert('Game not found'); return; }
        if (Number(logDraft.editingGameId) === Number(gid)) stopEditGame();
        renderAllForCurrent();
        showToast(`Game ${gid} deleted`, {
          label: 'Undo',
          onClick: () => { restoreGame(groupId, removed); renderAllForCurrent(); showToast(`Game ${gid} restored`); }
        });
      } catch (err) {
        alert('Failed to delete: ' + (err.message || err));
      }
    });
  });
}

function gameActionsHtml(gm) {
  return `<button class="btn btn-sm btn-outline-secondary btn-edit-game" data-gameid="${gm.gameId}" title="Edit game">✎</button>
    <button class="btn btn-sm btn-outline-danger btn-delete-game" data-gameid="${gm.gameId}" title="Delete game">✕</button>`;
}

function renderHistoryCards(group, games, running) {
  const nameOf = id => (group.people.find(p => p.personId === id) || { name: '(removed)' }).name;
  let lastDay = null;
  games.forEach(gm => {
    const day = dayLabel(gm.timestamp);
    if (day !== lastDay) {
      historyContainer.insertAdjacentHTML('beforeend', `<div class="hist-day">${escapeHtml(day)}</div>`);
      lastDay = day;
    }
    const played = gm.entries.filter(e => e.participated)
      .map(e => ({ id: e.personId, name: nameOf(e.personId), points: Number(e.points) || 0 }))
      .sort((a, b) => b.points - a.points);
    const top = played.length ? played[0].points : null;
    const sat = group.people.filter(p => !gm.entries.some(e => e.personId === p.personId && e.participated)
      && Number(gm.gameId) > (Number(p.joinedAfterGameId) || 0)).map(p => p.name);
    const sum = played.reduce((a, e) => a + e.points, 0);
    const after = running[gm.gameId] || {};
    const chips = played.map(e => `
      <div class="score-chip${e.points === top && played.length > 1 ? ' win' : ''}">
        <span class="nm">${e.points === top && played.length > 1 ? '👑 ' : ''}${escapeHtml(e.name)}</span>
        <span class="vals"><span class="pts ${ptsClass(e.points)}">${signedPts(e.points)}</span><span class="run">score ${after[e.id] !== undefined ? after[e.id] : ''}</span></span>
      </div>`).join('');
    const foot = [
      `${played.length} played · sum ${signedPts(sum)}`,
      sat.length ? `sat out: ${sat.map(escapeHtml).join(', ')}` : '',
      gm.editedAt ? `edited ${escapeHtml(formatLocalDateTimeISO(gm.editedAt))}` : ''
    ].filter(Boolean).join(' · ');
    historyContainer.insertAdjacentHTML('beforeend', `
      <div class="game-card">
        <div class="gc-head">
          <span class="gc-no">#${gm.gameId}</span>
          <span class="gc-time">${escapeHtml(timeLabel(gm.timestamp))}</span>
          <div class="gc-actions">${gameActionsHtml(gm)}</div>
        </div>
        <div class="gc-body">${chips}</div>
        <div class="gc-foot">${foot}</div>
      </div>`);
  });
}

function renderHistoryTable(group, games, running, stats) {
  const hasStart = group.people.some(p => Number(p.startPoints));
  const table = document.createElement('table');
  table.className = 'table table-sm table-bordered table-hover history-table';
  table.innerHTML = `<thead><tr><th>Game</th>${group.people.map(p => `<th>${escapeHtml(p.name)}</th>`).join('')}<th></th></tr></thead>`;

  const tbody = document.createElement('tbody');
  games.forEach(gm => {
    const tr = document.createElement('tr');
    const first = document.createElement('td');
    first.innerHTML = `<b>#${gm.gameId}</b><span class="when">${escapeHtml(formatLocalDateTimeISO(gm.timestamp))}</span>`;
    if (gm.editedAt) first.title = 'Edited ' + formatLocalDateTimeISO(gm.editedAt);
    tr.appendChild(first);
    const mp = {};
    gm.entries.forEach(e => mp[e.personId] = e);
    const playedPts = gm.entries.filter(e => e.participated).map(e => Number(e.points) || 0);
    const top = playedPts.length > 1 ? Math.max(...playedPts) : null;
    const after = running[gm.gameId] || {};
    group.people.forEach(p => {
      const cell = document.createElement('td');
      const e = mp[p.personId];
      if (e && e.participated) {
        const pts = Number(e.points) || 0;
        cell.innerHTML = `<span class="${pts > 0 ? 'text-pos' : pts < 0 ? 'text-neg' : ''}">${signedPts(pts)}</span><span class="run">score ${after[p.personId]}</span>`;
        if (pts === top) cell.classList.add('win');
      } else if (Number(gm.gameId) <= (Number(p.joinedAfterGameId) || 0) && !e) {
        cell.innerHTML = '<span class="text-muted small" title="Not joined yet">–</span>';
      }
      tr.appendChild(cell);
    });
    const actionsCell = document.createElement('td');
    actionsCell.innerHTML = `<div class="d-flex gap-1">${gameActionsHtml(gm)}</div>`;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const tfoot = document.createElement('tfoot');
  const footRow = (label, fn) => {
    const tr = document.createElement('tr');
    tr.className = 'table-light fw-semibold';
    tr.innerHTML = `<td>${label}</td>` + group.people.map(p => `<td>${fn(stats[p.personId])}</td>`).join('') + '<td></td>';
    tfoot.appendChild(tr);
  };
  if (hasStart) footRow('Starting points', s => s.start || '');
  footRow('Total', s => s.total);
  footRow('Average', s => (s.played ? s.average.toFixed(2) : ''));
  table.appendChild(tfoot);
  historyContainer.appendChild(table);
}

document.querySelectorAll('input[name="historyView"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const s = loadState();
    s.ui.historyView = radio.value;
    saveState(s);
    refreshState();
    renderHistory();
  });
});

/* PDF export: styled like the app, with each player's running score after every game */
function loadImageDataUrl(src) {
  return fetch(src).then(r => (r.ok ? r.blob() : null)).then(b => new Promise(resolve => {
    if (!b) return resolve(null);
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(b);
  })).catch(() => null);
}

btnExportPDF.addEventListener('click', async () => {
  refreshState();
  const group = currentGroup();
  if (!group) { alert('Create a group first'); return; }
  if (!window.jspdf || !window.jspdf.jsPDF) { alert('PDF library is not loaded. Check your internet connection and try again.'); return; }

  const GREEN = [6, 58, 37], GOLD = [212, 175, 55], CREAM = [251, 250, 244], INK = [29, 29, 31];
  const POS = [27, 138, 75], NEG = [198, 40, 40], MUTED = [120, 124, 128];
  const stats = computeTotalsAndAverages(group);
  const running = computeRunningTotals(group);
  const hasStart = group.people.some(p => Number(p.startPoints));
  const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const logo = await loadImageDataUrl('assets/img/logo-192.png');

  // header band
  doc.setFillColor(...GREEN); doc.rect(0, 0, W, 84, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 84, W, 3, 'F');
  let tx = 30;
  if (logo) { doc.addImage(logo, 'PNG', 28, 16, 52, 52); tx = 94; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...GOLD);
  doc.text('Points Game', tx, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(255, 255, 255);
  doc.text(group.name, tx, 62);
  doc.setFontSize(10); doc.setTextColor(220, 235, 225);
  doc.text(`${group.games.length} game${group.games.length === 1 ? '' : 's'} · ${group.people.length} player${group.people.length === 1 ? '' : 's'}`, W - 30, 40, { align: 'right' });
  doc.text(`Generated ${formatLocalDateTimeISO(new Date().toISOString())}`, W - 30, 58, { align: 'right' });

  const sectionTitle = (text, y) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...GREEN);
    doc.text(text, 30, y);
    doc.setDrawColor(...GOLD); doc.setLineWidth(1.2); doc.line(30, y + 5, W - 30, y + 5);
  };

  // standings (by total, same rules as the Ranking tab)
  sectionTitle('Standings', 114);
  const ranked = Object.values(stats).sort((a, b) => (b.total - a.total) || (b.played - a.played) || a.name.localeCompare(b.name));
  let prev = null, rank = 0;
  const standBody = ranked.map((r, i) => {
    if (r.total !== prev) { rank = i + 1; prev = r.total; }
    return [String(rank), r.name, String(r.played), ...(hasStart ? [String(r.start || '')] : []), String(r.total), r.played ? r.average.toFixed(2) : '-'];
  });
  const rankFill = { 1: [240, 205, 90], 2: [205, 210, 215], 3: [222, 160, 105] };
  const totalCol = hasStart ? 4 : 3;
  doc.autoTable({
    startY: 126,
    margin: { left: 30, right: 30 },
    head: [['#', 'Player', 'Games', ...(hasStart ? ['Start'] : []), 'Total', 'Average']],
    body: standBody,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 5, textColor: INK, lineColor: [225, 222, 208], lineWidth: .5 },
    headStyles: { fillColor: GREEN, textColor: GOLD, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: CREAM },
    columnStyles: { 0: { halign: 'center', cellWidth: 34, fontStyle: 'bold' }, 1: { fontStyle: 'bold' } },
    didParseCell: (h) => {
      if (h.section !== 'body') return;
      const rk = Number(h.row.raw[0]);
      if (h.column.index === 0 && rankFill[rk]) h.cell.styles.fillColor = rankFill[rk];
      if (h.column.index === totalCol) {
        const v = Number(h.cell.raw);
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.textColor = v > 0 ? POS : v < 0 ? NEG : INK;
      }
    }
  });

  // game history with running totals
  let y = doc.lastAutoTable.finalY + 34;
  if (y > H - 120) { doc.addPage(); y = 50; }
  sectionTitle('Game history', y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text('Each cell: points in that game (green/red), and below it the player\'s score at that point (= running total). Highlighted = game winner. "-" = sat out.', 30, y + 20);

  const n = group.people.length;
  const fontSize = n <= 8 ? 9 : n <= 14 ? 8 : 7;
  const games = group.games.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const winners = {};
  const histBody = games.map(gm => {
    const mp = {};
    gm.entries.forEach(e => mp[e.personId] = e);
    const pts = gm.entries.filter(e => e.participated).map(e => Number(e.points) || 0);
    winners[gm.gameId] = pts.length > 1 ? Math.max(...pts) : null;
    const after = running[gm.gameId] || {};
    return [`#${gm.gameId}`, formatLocalDateTimeISO(gm.timestamp).replace(' ', '\n'),
      ...group.people.map(p => {
        const e = mp[p.personId];
        if (e && e.participated) return `${signedPts(Number(e.points) || 0)}\n= ${after[p.personId]}`;
        if (Number(gm.gameId) <= (Number(p.joinedAfterGameId) || 0) && !e) return '';
        return '-';
      })];
  });
  const foot = [];
  if (hasStart) foot.push(['', 'Start', ...group.people.map(p => String(stats[p.personId].start || ''))]);
  foot.push(['', 'Total', ...group.people.map(p => String(stats[p.personId].total))]);
  foot.push(['', 'Average', ...group.people.map(p => (stats[p.personId].played ? stats[p.personId].average.toFixed(2) : ''))]);

  doc.autoTable({
    startY: y + 30,
    margin: { left: 30, right: 30, bottom: 40 },
    head: [['Game', 'Date', ...group.people.map(p => p.name)]],
    body: histBody,
    foot,
    showFoot: 'lastPage',
    theme: 'grid',
    styles: { fontSize, cellPadding: 4, halign: 'center', valign: 'middle', textColor: INK, lineColor: [225, 222, 208], lineWidth: .5 },
    headStyles: { fillColor: GREEN, textColor: GOLD, fontStyle: 'bold' },
    footStyles: { fillColor: [232, 240, 234], textColor: GREEN, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: CREAM },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 }, 1: { cellWidth: 70, textColor: MUTED, fontSize: fontSize - 1 } },
    didParseCell: (h) => {
      if (h.section !== 'body' || h.column.index < 2) return;
      const raw = String(h.cell.raw || '');
      if (raw === '-') { h.cell.styles.textColor = [170, 170, 170]; return; }
      if (!raw) return;
      const v = Number(raw.split('\n')[0]);
      const gameId = Number(String(h.row.raw[0]).slice(1));
      if (winners[gameId] !== null && v === winners[gameId]) h.cell.styles.fillColor = [255, 243, 196];
      // keep the cell's size, draw the two lines ourselves in didDrawCell
      h.cell.styles.textColor = h.cell.styles.fillColor || [255, 255, 255];
    },
    didDrawCell: (h) => {
      if (h.section !== 'body' || h.column.index < 2) return;
      const raw = String(h.cell.raw || '');
      if (!raw || raw === '-') return;
      const [ptsLine, runLine] = raw.split('\n');
      const v = Number(ptsLine);
      const cx = h.cell.x + h.cell.width / 2, cy = h.cell.y + h.cell.height / 2;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fontSize);
      doc.setTextColor(...(v > 0 ? POS : v < 0 ? NEG : MUTED));
      doc.text(ptsLine, cx, cy - 2, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(fontSize + 1); doc.setTextColor(...INK);
      doc.text(runLine, cx, cy + fontSize - 1, { align: 'center' });
    }
  });

  // page footer
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal');
    doc.text(`${group.name} · Points Game`, 30, H - 18);
    doc.text(`Page ${i} of ${pages}`, W - 30, H - 18, { align: 'right' });
  }

  doc.save(`${group.name.replace(/\s+/g, '_')}_history.pdf`);
});

btnClearHistory.addEventListener('click', () => {
  const group = currentGroup();
  if (!group || !group.games.length) return;
  if (!confirm(`Clear all ${group.games.length} games for this group? Tip: download a backup first.`)) return;
  clearHistory(state.ui.currentGroupId);
  renderAllForCurrent();
});

/* Ranking UI */
function getRankMode() {
  return (state.ui && state.ui.rankMode) === 'average' ? 'average' : 'total';
}

function renderRanking() {
  const group = currentGroup();
  const mode = getRankMode();
  document.getElementById(mode === 'average' ? 'rankModeAvg' : 'rankModeTotal').checked = true;
  const minGames = Math.max(1, Number(state.ui && state.ui.rankMinGames) || 1);
  inpMinGames.value = minGames;
  minGamesWrap.classList.toggle('d-none', mode !== 'average');

  rankTable.innerHTML = '';
  rankingText = '';
  if (!group) { rankTable.innerHTML = '<div class="text-muted small">Create a group first</div>'; rankHint.textContent = ''; return; }

  const arr = Object.values(computeTotalsAndAverages(group));
  const hasStart = arr.some(x => x.start);

  let ranked, unranked = [];
  if (mode === 'average') {
    rankHint.textContent = 'Average = points per game played. Fair for players who joined mid-way or skipped rounds; starting points are not included.';
    ranked = arr.filter(x => x.played >= minGames).sort((a, b) =>
      (b.average - a.average) || (b.played - a.played) || (b.total - a.total) || a.name.localeCompare(b.name));
    unranked = arr.filter(x => x.played < minGames).sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
  } else {
    rankHint.textContent = hasStart ? 'Total = starting points + all game points.' : 'Total = sum of all game points.';
    ranked = arr.sort((a, b) =>
      (b.total - a.total) || (b.played - a.played) || a.name.localeCompare(b.name));
  }
  const key = mode === 'average' ? (r => r.average.toFixed(2)) : (r => r.total);
  const lines = [`${group.name} — ranking by ${mode === 'average' ? 'average' : 'total'} (${group.games.length} games)`];

  const table = document.createElement('table');
  table.className = 'table table-sm table-bordered rank-table';
  const sortedCls = (m) => (mode === m ? ' class="sorted"' : '');
  table.innerHTML = `<thead><tr>
      <th style="width:3rem">#</th><th>Name</th><th>Games</th>
      ${hasStart ? '<th>Start</th>' : ''}
      <th${sortedCls('total')}>Total</th><th${sortedCls('average')}>Average</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');

  // competition ranking: equal scores share a rank (1, 2, 2, 4)
  let prevKey = null, rank = 0;
  ranked.forEach((r, i) => {
    const k = key(r);
    if (k !== prevKey) { rank = i + 1; prevKey = k; }
    tbody.appendChild(rankRow(r, String(rank), hasStart, mode));
    lines.push(`${rank}. ${r.name}: ${mode === 'average' ? r.average.toFixed(2) + ' avg' : r.total + ' pts'} (${r.played} game${r.played === 1 ? '' : 's'})`);
  });
  rankingText = lines.join('\n');
  if (unranked.length) {
    const sep = document.createElement('tr');
    sep.innerHTML = `<td colspan="${hasStart ? 6 : 5}" class="small text-muted bg-light">Not ranked — fewer than ${minGames} game${minGames === 1 ? '' : 's'} played</td>`;
    tbody.appendChild(sep);
    unranked.forEach(r => tbody.appendChild(rankRow(r, '–', hasStart, mode, true)));
  }
  table.appendChild(tbody);
  rankTable.appendChild(table);
}

let rankingText = '';

btnCopyRanking.addEventListener('click', async () => {
  if (!rankingText) return;
  try {
    await navigator.clipboard.writeText(rankingText);
    showToast('Ranking copied');
  } catch (e) {
    prompt('Copy the ranking:', rankingText);
  }
});

function rankRow(r, rankLabel, hasStart, mode, muted = false) {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const tr = document.createElement('tr');
  if (muted) tr.className = 'text-muted';
  const medal = medals[rankLabel] ? `<span class="rank-medal">${medals[rankLabel]}</span>` : rankLabel;
  tr.innerHTML = `
    <td>${medal}</td>
    <td>${escapeHtml(r.name)} <small class="text-muted pid">(${escapeHtml(r.personId)})</small></td>
    <td>${r.played}</td>
    ${hasStart ? `<td>${r.start || ''}</td>` : ''}
    <td${mode === 'total' ? ' class="sorted"' : ''}>${r.total}</td>
    <td${mode === 'average' ? ' class="sorted"' : ''}>${r.played ? r.average.toFixed(2) : '–'}</td>`;
  return tr;
}

document.querySelectorAll('input[name="rankMode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const s = loadState();
    s.ui.rankMode = radio.value;
    saveState(s);
    refreshState();
    renderRanking();
  });
});
inpMinGames.addEventListener('change', () => {
  const s = loadState();
  s.ui.rankMinGames = Math.max(1, parseInt(inpMinGames.value, 10) || 1);
  saveState(s);
  refreshState();
  renderRanking();
});

/* helpers */
function renderAllForCurrent() {
  refreshState();
  renderGroups();
  renderPlayersList();
  renderLogPlayers();
  renderHistory();
  renderRanking();
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]); });
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
}

// action: optional { label, onClick } shown as a button in the toast (e.g. Undo)
function showToast(msg, action = null) {
  document.querySelectorAll('.app-toast').forEach(x => x.remove());
  const el = document.createElement('div');
  el.className = 'toast app-toast align-items-center border-0 position-fixed bottom-0 end-0 m-3 ' + (action ? 'text-bg-dark' : 'text-bg-success');
  el.style.zIndex = 1100;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="d-flex align-items-center"><div class="toast-body">${escapeHtml(msg)}</div>
    ${action ? `<button type="button" class="btn btn-sm btn-warning toast-action">${escapeHtml(action.label)}</button>` : ''}
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.body.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: action ? 8000 : 2000 });
  if (action) el.querySelector('.toast-action').addEventListener('click', () => { t.hide(); action.onClick(); });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

/* initial render */
renderAllForCurrent();
