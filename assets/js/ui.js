// ui.js - all UI rendering and interactions
// depends on storage.js and models.js

const selCurrentGroup = document.getElementById('selCurrentGroup');
const btnAddGroup = document.getElementById('btnAddGroup');
const btnDeleteGroup = document.getElementById('btnDeleteGroup');
const modalAddGroup = new bootstrap.Modal(document.getElementById('modalAddGroup'));
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
const modalPerson = new bootstrap.Modal(modalPersonEl);
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

const historyContainer = document.getElementById('historyContainer');
const btnExportPDF = document.getElementById('btnExportPDF');
const btnClearHistory = document.getElementById('btnClearHistory');

const rankTable = document.getElementById('rankTable');
const rankHint = document.getElementById('rankHint');
const inpMinGames = document.getElementById('inpMinGames');
const minGamesWrap = document.getElementById('minGamesWrap');

let state = loadState();

// In-progress game being logged: survives re-renders (e.g. adding a player mid-way)
// shape: { groupId, selected: { personId: pointsString } }
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
  selCurrentGroup.innerHTML = '';
  if (!state.groups.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No groups yet';
    opt.value = '';
    selCurrentGroup.appendChild(opt);
  }
  state.groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.groupId;
    opt.textContent = `${g.name} (${g.people.length} players · ${g.games.length} games)`;
    selCurrentGroup.appendChild(opt);
  });
  selCurrentGroup.value = state.ui.currentGroupId || (state.groups[0] && state.groups[0].groupId) || '';
  btnDeleteGroup.disabled = !currentGroup();

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

selCurrentGroup.addEventListener('change', () => {
  const id = selCurrentGroup.value;
  if (id) { setCurrentGroup(id); renderAllForCurrent(); }
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
        <strong>${escapeHtml(p.name)}</strong> <small class="text-muted">(${escapeHtml(p.personId)})</small>
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
  logDraft.selected = {};
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
    addGame(group.groupId, rows);
    // keep the same players selected for the next round, clear the points
    Object.keys(logDraft.selected).forEach(id => { logDraft.selected[id] = ''; });
    renderAllForCurrent();
    showToast(`Game ${group.nextGameId} saved`);
  } catch (e) {
    alert('Failed to save game: ' + e.message);
  }
});

/* History UI */
function renderHistory() {
  const group = currentGroup();
  historyContainer.innerHTML = '';
  if (!group) { historyContainer.innerHTML = '<div class="text-muted small">Create a group first</div>'; return; }
  if (!group.games.length) { historyContainer.innerHTML = '<div class="text-muted small">No games yet</div>'; return; }

  const stats = computeTotalsAndAverages(group);
  const hasStart = group.people.some(p => Number(p.startPoints));

  const table = document.createElement('table');
  table.className = 'table table-sm table-bordered table-hover history-table';
  const thead = document.createElement('thead');
  const headerTr = document.createElement('tr');
  headerTr.innerHTML = '<th>#</th><th>Date & Time</th>';
  group.people.forEach(p => {
    const th = document.createElement('th');
    th.textContent = p.name;
    headerTr.appendChild(th);
  });
  headerTr.insertAdjacentHTML('beforeend', '<th></th>');
  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const games = group.games.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  games.forEach(gm => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${gm.gameId}</td><td class="small">${formatLocalDateTimeISO(gm.timestamp)}</td>`;
    const mp = {};
    gm.entries.forEach(e => mp[e.personId] = e);
    group.people.forEach(p => {
      const cell = document.createElement('td');
      const e = mp[p.personId];
      if (e && e.participated) {
        cell.textContent = e.points;
        cell.className = e.points > 0 ? 'text-pos' : e.points < 0 ? 'text-neg' : '';
      } else if (Number(gm.gameId) <= (Number(p.joinedAfterGameId) || 0) && !e) {
        cell.innerHTML = '<span class="text-muted small" title="Not joined yet">–</span>';
      }
      tr.appendChild(cell);
    });
    const actionsCell = document.createElement('td');
    actionsCell.innerHTML = `<button class="btn btn-sm btn-outline-danger btn-delete-game" data-gameid="${gm.gameId}" title="Delete game">✕</button>`;
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const tfoot = document.createElement('tfoot');
  const footRow = (label, fn) => {
    const tr = document.createElement('tr');
    tr.className = 'table-light fw-semibold';
    tr.innerHTML = `<td colspan="2">${label}</td>` + group.people.map(p => `<td>${fn(stats[p.personId])}</td>`).join('') + '<td></td>';
    tfoot.appendChild(tr);
  };
  if (hasStart) footRow('Starting points', s => s.start || '');
  footRow('Total', s => s.total);
  footRow('Average', s => (s.played ? s.average.toFixed(2) : ''));
  table.appendChild(tfoot);

  historyContainer.appendChild(table);

  historyContainer.querySelectorAll('.btn-delete-game').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const gid = ev.currentTarget.dataset.gameid;
      if (!confirm(`Delete game ${gid}? This cannot be undone.`)) return;
      try {
        const ok = deleteGame(state.ui.currentGroupId, Number(gid));
        if (!ok) { alert('Game not found'); return; }
        renderAllForCurrent();
      } catch (err) {
        alert('Failed to delete: ' + (err.message || err));
      }
    });
  });
}

btnExportPDF.addEventListener('click', () => {
  refreshState();
  const group = currentGroup();
  if (!group) { alert('Create a group first'); return; }

  const stats = computeTotalsAndAverages(group);
  const doc = new jspdf.jsPDF('landscape', 'pt', 'a4');
  const title = `History: ${group.name} (${new Date().toLocaleString()})`;
  const head = ['Game Id', 'Date & Time', ...group.people.map(p => p.name)];

  const body = group.games.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(gm => {
    const mp = {};
    gm.entries.forEach(e => mp[e.personId] = e);
    return [String(gm.gameId), formatLocalDateTimeISO(gm.timestamp),
      ...group.people.map(p => (mp[p.personId] && mp[p.personId].participated) ? String(mp[p.personId].points) : '')];
  });
  const foot = [];
  if (group.people.some(p => Number(p.startPoints))) foot.push(['', 'Starting points', ...group.people.map(p => String(stats[p.personId].start || ''))]);
  foot.push(['', 'Total', ...group.people.map(p => String(stats[p.personId].total))]);
  foot.push(['', 'Average', ...group.people.map(p => stats[p.personId].played ? stats[p.personId].average.toFixed(2) : '')]);

  doc.text(title, 40, 40);
  doc.autoTable({
    startY: 60,
    head: [head],
    body,
    foot,
    styles: { fontSize: 8 },
    theme: 'striped',
    headStyles: { fillColor: [40, 120, 200] },
    footStyles: { fillColor: [230, 230, 230], textColor: 20 }
  });

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
  });
  if (unranked.length) {
    const sep = document.createElement('tr');
    sep.innerHTML = `<td colspan="${hasStart ? 6 : 5}" class="small text-muted bg-light">Not ranked — fewer than ${minGames} game${minGames === 1 ? '' : 's'} played</td>`;
    tbody.appendChild(sep);
    unranked.forEach(r => tbody.appendChild(rankRow(r, '–', hasStart, mode, true)));
  }
  table.appendChild(tbody);
  rankTable.appendChild(table);
}

function rankRow(r, rankLabel, hasStart, mode, muted = false) {
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const tr = document.createElement('tr');
  if (muted) tr.className = 'text-muted';
  const medal = medals[rankLabel] ? `<span class="rank-medal">${medals[rankLabel]}</span>` : rankLabel;
  tr.innerHTML = `
    <td>${medal}</td>
    <td>${escapeHtml(r.name)} <small class="text-muted">(${escapeHtml(r.personId)})</small></td>
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

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast align-items-center text-bg-success border-0 position-fixed bottom-0 end-0 m-3';
  el.style.zIndex = 1100;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  document.body.appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 2000 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

/* initial render */
renderAllForCurrent();
