// leaders.js - review old games to record who led them (suggested from the saved points).
// It only ever adds the `leader` note to games that have none yet; points are never changed.
// Depends on storage.js (setGameLeaders), models.js (suggestLeader), ui.js (state, currentGroup,
// renderAllForCurrent, showToast, escapeHtml, signedPts, groupSelects).

const LEADER_LATER_KEY = 'points_game_leader_review_later'; // sessionStorage: "Later" was chosen
const modalLeadersEl = document.getElementById('modalLeaders');
const modalLeaders = bootstrap.Modal.getOrCreateInstance(modalLeadersEl);
const leaderReviewList = document.getElementById('leaderReviewList');
const chkLeadersOnlyCheck = document.getElementById('chkLeadersOnlyCheck');

const leaderReview = {
  groupId: null,
  gameIds: [],          // games shown in the dialog
  saved: false,         // closed with Save leaders
  autoShown: new Set(), // groups whose dialog opened by itself during this page load
  bannerHidden: false   // banner closed with × (until the page is loaded again)
};

function laterChosen() {
  try { return sessionStorage.getItem(LEADER_LATER_KEY) === '1'; } catch (e) { return leaderReview.laterInMemory === true; }
}
function rememberLater() {
  leaderReview.laterInMemory = true;
  try { sessionStorage.setItem(LEADER_LATER_KEY, '1'); } catch (e) { /* private mode: kept in memory */ }
}

// games of the group without a leader note (never reviewed)
function unreviewedGames(group) {
  return group ? group.games.filter(g => g.leader === undefined) : [];
}

function updateLeaderReviewBanner() {
  const group = currentGroup();
  const n = unreviewedGames(group).length;
  const show = n > 0 && !leaderReview.bannerHidden && !modalLeadersEl.classList.contains('show');
  document.querySelectorAll('.leader-banner').forEach(el => {
    el.classList.toggle('d-none', !show);
    el.querySelector('.lb-count').textContent = n;
    el.querySelector('.lb-words').textContent = `old game${n === 1 ? ' has' : 's have'} no leader yet`;
  });
}

function leaderRowHtml(group, game) {
  const nameOf = id => (group.people.find(p => p.personId === id) || { name: id + ' (removed)' }).name;
  const sug = suggestLeader(game, nameOf);
  const played = game.entries.filter(e => e.participated)
    .map(e => ({ id: e.personId, name: nameOf(e.personId), points: Number(e.points) || 0 }))
    .sort((a, b) => b.points - a.points);
  const date = new Date(game.timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  const pts = played.map(e => `${escapeHtml(e.name)} <span class="${e.points > 0 ? 'pos' : e.points < 0 ? 'neg' : ''}">${signedPts(e.points)}</span>`).join(' · ');
  const opts = ['<option value="">No leader</option>'].concat(played.map(e =>
    `<option value="${escapeHtml(e.id)}"${e.id === sug.personId ? ' selected' : ''}>${escapeHtml(e.name)} (${signedPts(e.points)})</option>`)).join('');
  const res = sug.result || '';
  return `
    <div class="lr-row${sug.unclear ? ' unclear' : ''}" data-gameid="${escapeHtml(game.gameId)}">
      <div class="lr-head"><span class="lr-no">#${escapeHtml(game.gameId)}</span><span class="lr-date">${escapeHtml(date)}</span>${sug.unclear ? '<span class="lr-check">Check</span>' : ''}</div>
      <div class="lr-pts">${pts || 'nobody played'}</div>
      <div class="lr-ctrls">
        <select class="form-select form-select-sm lr-leader" aria-label="Leader of game #${escapeHtml(game.gameId)}">${opts}</select>
        <select class="form-select form-select-sm lr-result" aria-label="Result of the leader in game #${escapeHtml(game.gameId)}"${sug.personId ? '' : ' disabled'}>
          <option value=""${res ? '' : ' selected'}>Result</option>
          <option value="won"${res === 'won' ? ' selected' : ''}>Won</option>
          <option value="lost"${res === 'lost' ? ' selected' : ''}>Lost</option>
        </select>
      </div>
    </div>`;
}

function openLeaderReview() {
  refreshState();
  const group = currentGroup();
  const games = unreviewedGames(group)
    .slice().sort((a, b) => (new Date(b.timestamp) - new Date(a.timestamp)) || (Number(b.gameId) - Number(a.gameId)));
  if (!games.length) { updateLeaderReviewBanner(); return false; }
  leaderReview.groupId = group.groupId;
  leaderReview.gameIds = games.map(g => g.gameId);
  leaderReview.saved = false;
  leaderReviewList.innerHTML = games.map(g => leaderRowHtml(group, g)).join('');
  const unclear = leaderReviewList.querySelectorAll('.lr-row.unclear').length;
  document.getElementById('lblLeadersCheckCount').textContent = unclear;
  document.getElementById('leadersFilterWrap').classList.toggle('d-none', !unclear);
  chkLeadersOnlyCheck.checked = false;
  applyLeaderFilter();

  const played = {};
  games.forEach(g => { played[g.gameId] = {}; g.entries.forEach(e => { if (e.participated) played[g.gameId][e.personId] = Number(e.points) || 0; }); });
  leaderReviewList.querySelectorAll('.lr-row').forEach(row => {
    const selLeader = row.querySelector('.lr-leader'), selResult = row.querySelector('.lr-result');
    selLeader.addEventListener('change', () => {
      const id = selLeader.value;
      selResult.disabled = !id;
      selResult.classList.remove('need');
      if (!id) { selResult.value = ''; return; }
      // a sensible default from that player's points; the user can change it
      const v = played[row.dataset.gameid][id];
      selResult.value = v > 500 ? 'won' : v < 0 ? 'lost' : '';
    });
    selResult.addEventListener('change', () => selResult.classList.remove('need'));
  });
  document.querySelectorAll('.leader-banner').forEach(el => el.classList.add('d-none'));
  modalLeaders.show();
  return true;
}

function applyLeaderFilter() {
  const only = chkLeadersOnlyCheck.checked;
  leaderReviewList.querySelectorAll('.lr-row').forEach(row => {
    row.classList.toggle('d-none', only && !row.classList.contains('unclear'));
  });
}
chkLeadersOnlyCheck.addEventListener('change', applyLeaderFilter);

document.getElementById('btnLeadersSave').addEventListener('click', () => {
  const leaders = {};
  for (const row of leaderReviewList.querySelectorAll('.lr-row')) {
    const id = row.querySelector('.lr-leader').value;
    const selResult = row.querySelector('.lr-result');
    if (!id) { leaders[row.dataset.gameid] = null; continue; }
    if (selResult.value !== 'won' && selResult.value !== 'lost') {
      chkLeadersOnlyCheck.checked = false; applyLeaderFilter();
      selResult.classList.add('need');
      alert(`Game #${row.dataset.gameid}: did the leader win or lose? Choose Won or Lost.`);
      selResult.focus();
      return;
    }
    leaders[row.dataset.gameid] = { personId: id, result: selResult.value, source: 'auto' };
  }
  try {
    const n = setGameLeaders(leaderReview.groupId, leaders);
    leaderReview.saved = true;
    modalLeaders.hide();
    renderAllForCurrent();
    showToast(`Leaders saved for ${n} game${n === 1 ? '' : 's'}`);
  } catch (e) {
    alert('Could not save the leaders: ' + e.message + '\nNothing was changed.');
  }
});

document.getElementById('btnLeadersLater').addEventListener('click', () => modalLeaders.hide());

// closed without saving (Later, ×, Esc): nothing changes; no automatic dialog again in this session
modalLeadersEl.addEventListener('hidden.bs.modal', () => {
  if (!leaderReview.saved) rememberLater();
  leaderReviewList.innerHTML = '';
  updateLeaderReviewBanner();
});

document.querySelectorAll('.btn-leader-review').forEach(b => b.addEventListener('click', () => openLeaderReview()));
document.querySelectorAll('.btn-leader-banner-close').forEach(b => b.addEventListener('click', () => {
  leaderReview.bannerHidden = true;
  updateLeaderReviewBanner();
}));

// Opens the review by itself at most once per group per page load, only when there are
// unreviewed games, "Later" was not chosen in this session and no other dialog is open.
function maybeOpenLeaderReview() {
  refreshState();
  const group = currentGroup();
  if (!group || laterChosen() || leaderReview.autoShown.has(group.groupId)) { updateLeaderReviewBanner(); return; }
  if (!unreviewedGames(group).length) { updateLeaderReviewBanner(); return; }
  if (document.querySelector('.modal.show')) { updateLeaderReviewBanner(); return; }
  leaderReview.autoShown.add(group.groupId);
  openLeaderReview();
}

groupSelects.forEach(sel => sel.addEventListener('change', () => maybeOpenLeaderReview()));

updateLeaderReviewBanner();
