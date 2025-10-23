// ui.js - all UI rendering and interactions
// depends on storage.js and models.js

const groupsListEl = document.getElementById('groupsList');
const selCurrentGroup = document.getElementById('selCurrentGroup');
const btnAddGroup = document.getElementById('btnAddGroup');
const modalAddGroup = new bootstrap.Modal(document.getElementById('modalAddGroup'));
const formAddGroup = document.getElementById('formAddGroup');
const inpGroupName = document.getElementById('inpGroupName');
const chkMarkActive = document.getElementById('chkMarkActive');
//const btnOpenGroup = document.getElementById('btnOpenGroup');
//const btnToggleActiveView = document.getElementById('btnToggleActiveView');
//const btnExportAllJSON = document.getElementById('btnExportAllJSON');

const playersListEl = document.getElementById('playersList');
const inpPersonId = document.getElementById('inpPersonId');
const inpPersonName = document.getElementById('inpPersonName');
const btnAddPerson = document.getElementById('btnAddPerson');

const lblCurrentGroupName = document.getElementById('lblCurrentGroupName');

const logPlayersContainer = document.getElementById('logPlayersContainer');
const formLogGame = document.getElementById('formLogGame');
const btnCheckAll = document.getElementById('btnCheckAll');
const btnClearAll = document.getElementById('btnClearAll');
const btnSetZero = document.getElementById('btnSetZero');

const historyContainer = document.getElementById('historyContainer');
const btnExportPDF = document.getElementById('btnExportPDF');
const btnClearHistory = document.getElementById('btnClearHistory');

const rankTotal = document.getElementById('rankTotal');
const rankAvg = document.getElementById('rankAvg');

let state = loadState();

function refreshState() {
  state = loadState();
}

function renderGroups() {
  refreshState();
  groupsListEl.innerHTML = '';
  selCurrentGroup.innerHTML = '';
  state.groups.forEach(g => {
    // groups list with active checkbox
    const div = document.createElement('div');
    div.className = 'd-flex align-items-center mb-1';
    div.innerHTML = `
      <div class="form-check form-switch d-none">
        <input class="form-check-input chk-active-group " data-id="${g.groupId}" type="checkbox" ${g.isActive ? 'checked' : ''}/>
      </div>
      <div class="flex-grow-1 ms-2">${escapeHtml(g.name)}</div>
      <div><button class="btn btn-sm btn-outline-primary btn-open" data-id="${g.groupId}">Open</button></div>
    `;
    groupsListEl.appendChild(div);

    const opt = document.createElement('option');
    opt.value = g.groupId;
    opt.textContent = g.name;
    selCurrentGroup.appendChild(opt);
  });

  selCurrentGroup.value = state.ui.currentGroupId || (state.groups[0] && state.groups[0].groupId) || '';
  attachGroupEvents();
}

function attachGroupEvents() {
  document.querySelectorAll('.chk-active-group').forEach(chk => {
    chk.addEventListener('change', (ev) => {
      const id = ev.target.dataset.id;
      const isActive = ev.target.checked;
      const g = state.groups.find(x => x.groupId === id);
      if (g) { updateGroup(id, { isActive }); refreshState(); renderGroups(); }
    });
  });
  document.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      const id = ev.target.dataset.id;
      setCurrentGroup(id);
      refreshState();
      renderGroups();
      renderAllForCurrent();
    });
  });
}

btnAddGroup.addEventListener('click', () => {
  inpGroupName.value = '';
  chkMarkActive.checked = true;
  modalAddGroup.show();
   setTimeout(() => inpGroupName.focus(), 500); // optional UX improvement
});

formAddGroup.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const name = inpGroupName.value.trim();
  try {
    createGroup(name, chkMarkActive.checked);
    modalAddGroup.hide();
    renderGroups();
    renderAllForCurrent();
  } catch (e) {
    alert(e.message);
  }
});

selCurrentGroup.addEventListener('change', () => {
  const id = selCurrentGroup.value;
  if (id) { setCurrentGroup(id); renderAllForCurrent(); renderGroups(); }
});

// btnToggleActiveView.addEventListener('click', () => {
//   // simple UX: toggle showing only active groups in selector
//   const onlyActive = selCurrentGroup.dataset.onlyActive === '1';
//   selCurrentGroup.dataset.onlyActive = onlyActive ? '0' : '1';
//   // rebuild options
//   selCurrentGroup.innerHTML = '';
//   const filtered = !onlyActive ? state.groups.filter(g => g.isActive) : state.groups;
//   filtered.forEach(g => {
//     const opt = document.createElement('option');
//     opt.value = g.groupId;
//     opt.textContent = g.name;
//     selCurrentGroup.appendChild(opt);
//   });
// });

// btnExportAllJSON.addEventListener('click', () => {
//   const data = JSON.stringify(loadState(), null, 2);
//   downloadTextFile('points_game_export.json', data);
// });

/* Players UI */
function renderPlayersList() {
  refreshState();
  const group = state.groups.find(g => g.groupId === state.ui.currentGroupId);
  playersListEl.innerHTML = '';
  if (!group) { playersListEl.innerHTML = '<div class="text-muted small">No group opened</div>'; return; }
  group.people.forEach(p => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex align-items-center';
    item.innerHTML = `
      <div class="form-check me-2">
        <input class="form-check-input chk-person-enabled" data-id="${p.personId}" type="checkbox" ${p.enabled ? 'checked' : ''}/>
      </div>
      <div class="flex-grow-1">
        <strong>${escapeHtml(p.name)}</strong> <small class="text-muted">(${escapeHtml(p.personId)})</small>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-secondary btn-edit" data-id="${p.personId}">Edit</button>
        <button class="btn btn-sm btn-outline-danger btn-remove" data-id="${p.personId}">Remove</button>
      </div>
    `;
    playersListEl.appendChild(item);
  });

  // events
  document.querySelectorAll('.chk-person-enabled').forEach(chk => {
    chk.addEventListener('change', ev => {
      const pid = ev.target.dataset.id;
      updatePerson(state.ui.currentGroupId, pid, { enabled: ev.target.checked });
      refreshState(); renderAllForCurrent();
    });
  });
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', ev => {
      if (!confirm('Remove person? (history remains)')) return;
      removePerson(state.ui.currentGroupId, ev.target.dataset.id);
      refreshState(); renderAllForCurrent();
    });
  });
  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', ev => {
      const pid = ev.target.dataset.id;
      const g = state.groups.find(x => x.groupId === state.ui.currentGroupId);
      const p = g.people.find(x => x.personId === pid);
      const newName = prompt('New name', p.name);
      if (newName === null) return;
      const newId = prompt('Change ID (leave blank to keep)', p.personId) || p.personId;
      // basic uniqueness check for id
      if (newId.trim().toLowerCase() !== p.personId.trim().toLowerCase() && g.people.find(x=>x.personId.trim().toLowerCase()===newId.trim().toLowerCase())) {
        alert('Duplicate ID in this group');
        return;
      }
      // update (if id changed, remove old and add new)
      if (newId !== p.personId) {
        updatePerson(state.ui.currentGroupId, p.personId, { personId: newId, name: newName });
        // NOTE: simple approach: mutate id directly (we stored by object reference)
      } else {
        updatePerson(state.ui.currentGroupId, p.personId, { name: newName });
      }
      refreshState();
      renderAllForCurrent();
    });
  });
}

btnAddPerson.addEventListener('click', () => {
  const pid = inpPersonId.value.trim();
  const name = inpPersonName.value.trim();
  if (!pid || !name) { alert('Provide ID and name'); return; }
  try {
    addPerson(state.ui.currentGroupId, pid, name);
    inpPersonId.value = ''; inpPersonName.value = '';
    refreshState(); renderAllForCurrent();
  } catch (e) {
    alert(e.message);
  }
});

/* Log Game UI */
function renderLogPlayers() {
  refreshState();
  const group = state.groups.find(g => g.groupId === state.ui.currentGroupId);
  logPlayersContainer.innerHTML = '';
  lblCurrentGroupName.textContent = group ? group.name : '(no group)';
  if (!group) { logPlayersContainer.innerHTML = '<div class="text-muted small">Open a group first</div>'; return; }

  // Only show enabled players
  const players = group.people.slice();
  if (!players.length) { logPlayersContainer.innerHTML = '<div class="text-muted small">No players in this group</div>'; return; }

  const table = document.createElement('table');
  table.className = 'table table-sm table-bordered';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Play</th><th>ID</th><th>Name</th><th>Points</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  players.forEach(p => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="align-middle text-center"><input type="checkbox" class="form-check-input chk-part" data-id="${p.personId}"></td>
      <td class="align-middle">${escapeHtml(p.personId)}</td>
      <td class="align-middle">${escapeHtml(p.name)}</td>
      <td class="align-middle"><input type="number" min="-1000" max="1000" class="form-control form-control-sm small-input inp-pts" data-id="${p.personId}" disabled></td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  logPlayersContainer.appendChild(table);

  // events
  document.querySelectorAll('.chk-part').forEach(chk => {
    chk.addEventListener('change', ev => {
      const id = ev.target.dataset.id;
      const input = document.querySelector(`.inp-pts[data-id="${id}"]`);
      input.disabled = !ev.target.checked;
      if (!ev.target.checked) input.value = '';
    });
  });
}

btnCheckAll.addEventListener('click', () => { document.querySelectorAll('.chk-part').forEach(c=>{ c.checked=true; c.dispatchEvent(new Event('change'))}); });
btnClearAll.addEventListener('click', () => { document.querySelectorAll('.chk-part').forEach(c=>{ c.checked=false; c.dispatchEvent(new Event('change'))}); });
btnSetZero.addEventListener('click', () => { document.querySelectorAll('.chk-part').forEach(_=>{ /* set 0 when checked */ }); document.querySelectorAll('.chk-part').forEach(c=>{ if (c.checked) { const input = document.querySelector(`.inp-pts[data-id="${c.dataset.id}"]`); input.value = '0';}}); });

formLogGame.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const group = state.groups.find(g => g.groupId === state.ui.currentGroupId);
  if (!group) { alert('Open a group'); return; }
  const rows = [];
  document.querySelectorAll('.chk-part').forEach(chk => {
    const id = chk.dataset.id;
    const participated = chk.checked;
    const ptsInput = document.querySelector(`.inp-pts[data-id="${id}"]`);
    const points = participated ? Number(ptsInput.value || 0) : null;
    if (participated) {
      if (!Number.isInteger(points) || points < -1000 || points > 1000) {
        throwAlert(`Points for ${id} must be integer between -1000 and 1000`);
        throw 'validation';
      }
    }
    rows.push({ personId: id, participated, points });
  });

  if (!rows.some(r => r.participated)) { alert('At least one participant'); return; }
  try {
    addGame(group.groupId, rows);
    refreshState();
    renderAllForCurrent();
    // switch to history tab
    const historyTab = new bootstrap.Tab(document.querySelector('#tab-history'));
    historyTab.show();
  } catch (e) {
    alert('Failed to save game: ' + e.message);
  }
});

/* History UI */
function renderHistory() {
  refreshState();
  const group = state.groups.find(g => g.groupId === state.ui.currentGroupId);
  historyContainer.innerHTML = '';
  if (!group) { historyContainer.innerHTML = '<div class="text-muted small">Open a group</div>'; return; }
  // build table
  const table = document.createElement('table');
  table.className = 'table table-sm table-bordered';
  const thead = document.createElement('thead');
  const headerTr = document.createElement('tr');
  headerTr.innerHTML = '<th>Game Id</th><th>Date & Time</th>';
  group.people.forEach(p => {
    const th = document.createElement('th');
    th.textContent = p.name;
    headerTr.appendChild(th);
  });
  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  // sort desc by timestamp (or gameId)
  const games = group.games.slice().sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  games.forEach(gm => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${gm.gameId}</td><td>${formatLocalDateTimeISO(gm.timestamp)}</td>`;
    // make a map for quick lookup
    const mp = {};
    gm.entries.forEach(e => mp[e.personId] = e);
    group.people.forEach(p => {
      const cell = document.createElement('td');
      const e = mp[p.personId];
      cell.textContent = (e && e.participated) ? e.points : '';
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  historyContainer.appendChild(table);
}

btnExportPDF.addEventListener('click', async () => {
  // export current history table to PDF using jsPDF & autotable
  refreshState();
  const group = state.groups.find(g => g.groupId === state.ui.currentGroupId);
  if (!group) { alert('Open a group'); return; }

  const doc = new jspdf.jsPDF('landscape', 'pt', 'a4');
  const title = `History: ${group.name} (${new Date().toLocaleString()})`;
  const columns = [{ header: 'Game Id', dataKey: 'gameId' }, { header: 'Date & Time', dataKey: 'dt' }];
  group.people.forEach(p => columns.push({ header: p.name, dataKey: p.personId }));

  const rows = group.games.slice().sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp)).map(gm => {
    const r = { gameId: gm.gameId, dt: formatLocalDateTimeISO(gm.timestamp) };
    const mp = {};
    gm.entries.forEach(e => mp[e.personId] = e);
    group.people.forEach(p => r[p.personId] = (mp[p.personId] && mp[p.personId].participated) ? String(mp[p.personId].points) : '');
    return r;
  });

  doc.text(title, 40, 40);
  doc.autoTable({
    startY: 60,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => r[c.dataKey] || '')),
    styles: { fontSize: 8 },
    theme: 'striped',
    headStyles: { fillColor: [40, 120, 200] }
  });

  doc.save(`${group.name.replace(/\s+/g,'_')}_history.pdf`);
});

btnClearHistory.addEventListener('click', () => {
  if (!confirm('Clear full history for this group?')) return;
  clearHistory(state.ui.currentGroupId);
  refreshState(); renderAllForCurrent();
});

/* Ranking UI */
function renderRanking() {
  refreshState();
  const group = state.groups.find(g => g.groupId === state.ui.currentGroupId);
  rankTotal.innerHTML = '';
  rankAvg.innerHTML = '';
  if (!group) { rankTotal.innerHTML = '<div class="text-muted small">Open a group</div>'; rankAvg.innerHTML = ''; return; }

  const map = computeTotalsAndAverages(group);
  const arr = Object.values(map);

  // total ranking
  const totalSorted = arr.slice().sort((a,b)=>{
    if (b.total !== a.total) return b.total - a.total;
    if (b.played !== a.played) return b.played - a.played;
    return a.name.localeCompare(b.name);
  });

  const tableTotal = document.createElement('table');
  tableTotal.className = 'table table-sm table-bordered';
  const theadTotal = document.createElement('thead');
  theadTotal.innerHTML = '<tr><th>#</th><th>Name</th><th>ID</th><th>Games</th><th>Total</th></tr>';
  tableTotal.appendChild(theadTotal);
  const tbodyTotal = document.createElement('tbody');
  totalSorted.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.personId)}</td><td>${r.played}</td><td>${r.total}</td>`;
    tbodyTotal.appendChild(tr);
  });
  tableTotal.appendChild(tbodyTotal);
  rankTotal.appendChild(tableTotal);

  // average ranking (exclude 0 games)
  const avgSorted = arr.filter(x=>x.played>0).slice().sort((a,b)=>{
    if (b.average !== a.average) return b.average - a.average;
    if (b.played !== a.played) return b.played - a.played;
    if (b.total !== a.total) return b.total - a.total;
    return a.name.localeCompare(b.name);
  });

  const tableAvg = document.createElement('table');
  tableAvg.className = 'table table-sm table-bordered';
  const theadAvg = document.createElement('thead');
  theadAvg.innerHTML = '<tr><th>#</th><th>Name</th><th>ID</th><th>Games</th><th>Total</th><th>Average</th></tr>';
  tableAvg.appendChild(theadAvg);
  const tbodyAvg = document.createElement('tbody');
  avgSorted.forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.personId)}</td><td>${r.played}</td><td>${r.total}</td><td>${r.average.toFixed(2)}</td>`;
    tbodyAvg.appendChild(tr);
  });
  tableAvg.appendChild(tbodyAvg);
  rankAvg.appendChild(tableAvg);
}

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

function throwAlert(msg) { alert(msg); }

/* initial render */
renderAllForCurrent();
