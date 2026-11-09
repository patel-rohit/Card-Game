// bid.js - "Fill points" from the bid, and the group's scoring rules.
// Only suggestions: points are written into the Log Game boxes when the user presses
// Fill points, can still be changed, and are saved only with Save Game. Saved games are never touched.
// Depends on storage.js (setGroupScoring), models.js (groupScoring, suggestBidPointsFor, DEFAULT_SCORING),
// ui.js (logDraft, currentGroup, refreshState, renderLogPlayers, leaderPanel, inpBid, showToast, escapeHtml, POINTS_LIMIT).

const btnFillPoints = document.getElementById('btnFillPoints');

inpBid.addEventListener('input', () => {
  logDraft.bid = inpBid.value;
  inpBid.classList.remove('need');
});
// Enter in the bid box fills the points instead of saving the game
inpBid.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  ev.preventDefault();
  fillPointsFromBid();
});
btnFillPoints.addEventListener('click', () => fillPointsFromBid());

function fmtPts(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }

// returns true when the points boxes were filled
function fillPointsFromBid() {
  const group = currentGroup();
  if (!group) return false;
  const ids = Object.keys(logDraft.selected);
  if (!logDraft.leaderId || !(logDraft.leaderId in logDraft.selected)) {
    alert('Mark the leader first: tap “Leader” on the player who led this game.');
    const btn = logPlayersContainer.querySelector('.player-tile.selected .btn-leader');
    if (btn) btn.focus();
    return false;
  }
  if (logDraft.leaderResult !== 'won' && logDraft.leaderResult !== 'lost') {
    leaderPanel.classList.add('need');
    alert('Did the leader win or lose? Tap Won or Lost first.');
    leaderPanel.querySelector('.lp-btn').focus();
    return false;
  }
  const rawBid = String(inpBid.value).trim();
  const bid = Number(rawBid);
  if (!rawBid || !/^\d+$/.test(rawBid) || !Number.isInteger(bid) || bid <= 0) {
    inpBid.classList.add('need');
    alert(rawBid ? 'The bid must be a whole number above 0.' : 'Enter the bid first.');
    inpBid.focus();
    return false;
  }
  inpBid.classList.remove('need');
  logDraft.bid = rawBid;

  const sug = suggestBidPointsFor(ids, logDraft.leaderId, logDraft.partnerIds, logDraft.leaderResult, bid, groupScoring(group));
  const tooBig = ids.filter(id => Math.abs(sug[id]) > POINTS_LIMIT);
  if (tooBig.length) {
    alert(`With a bid of ${bid} some points would be outside −${POINTS_LIMIT}…${POINTS_LIMIT}. Nothing was filled.`);
    inpBid.focus();
    return false;
  }
  // ask before replacing points that were already typed
  const typed = v => { const t = String(v == null ? '' : v).trim(); return t !== '' && t !== '-'; };
  const replaced = ids.filter(id => typed(logDraft.selected[id]) && Number(String(logDraft.selected[id]).trim()) !== sug[id]);
  if (replaced.length && !confirm(`${replaced.length} player${replaced.length === 1 ? ' already has' : 's already have'} different points typed in. Replace ${replaced.length === 1 ? 'it' : 'them'} with the suggested points?`)) return false;

  ids.forEach(id => { logDraft.selected[id] = String(sug[id]); });
  renderLogPlayers();
  // brief highlight of the boxes that were filled (no toast: it would cover the Save bar)
  logPlayersContainer.querySelectorAll('.player-tile.selected .inp-pts').forEach(inp => inp.classList.add('just-filled'));
  setTimeout(() => logPlayersContainer.querySelectorAll('.inp-pts.just-filled').forEach(inp => inp.classList.remove('just-filled')), 1600);
  return true;
}

/* ---------- Scoring rules dialog (⋮ menu) ---------- */
const modalScoringEl = document.getElementById('modalScoring');
const modalScoring = bootstrap.Modal.getOrCreateInstance(modalScoringEl);
const formScoring = document.getElementById('formScoring');
const srInputs = Array.from(formScoring.querySelectorAll('.sr-inp'));
const srExample = document.getElementById('srExample');
let scoringGroupId = null;

function fillScoringInputs(rules) {
  srInputs.forEach(inp => { inp.value = rules[inp.dataset.res][inp.dataset.role]; inp.classList.remove('is-invalid'); });
  updateScoringExample();
}

// reads the inputs: { rules, bad: [input…] }
function readScoringInputs() {
  const rules = { won: {}, lost: {} }, bad = [];
  srInputs.forEach(inp => {
    const t = String(inp.value).trim();
    const v = Number(t);
    const okVal = t !== '' && Number.isFinite(v) && v >= -10 && v <= 10 && Number.isInteger(v * 2);
    inp.classList.toggle('is-invalid', !okVal);
    if (!okVal) bad.push(inp);
    rules[inp.dataset.res][inp.dataset.role] = okVal ? v : null;
  });
  return { rules, bad };
}

function updateScoringExample() {
  const { rules, bad } = readScoringInputs();
  const typedBid = Number(String(inpBid.value).trim());
  const bid = Number.isInteger(typedBid) && typedBid > 0 ? typedBid : 150;
  const part = (res, role) => (rules[res][role] === null ? '?' : fmtPts(bidPoints(rules[res][role], bid)));
  const line = res => `Leader <b>${part(res, 'leader')}</b>, Partners <b>${part(res, 'partner')}</b>, Others <b>${part(res, 'other')}</b>`;
  srExample.innerHTML = `<div class="sr-ex-head">Example: bid ${bid}</div>
    <div><span class="sr-tag won">Won</span> ${line('won')}</div>
    <div><span class="sr-tag lost">Lost</span> ${line('lost')}</div>
    ${bad.length ? '<div class="sr-bad">Use numbers from −10 to 10 in steps of 0.5.</div>' : ''}`;
}
srInputs.forEach(inp => inp.addEventListener('input', updateScoringExample));

function openScoringRules() {
  refreshState();
  const group = currentGroup();
  if (!group) { alert('Create a group first'); return; }
  scoringGroupId = group.groupId;
  document.getElementById('lblScoringGroup').textContent = group.name;
  fillScoringInputs(groupScoring(group));
  modalScoring.show();
}
document.getElementById('btnScoringRules').addEventListener('click', openScoringRules);

document.getElementById('btnScoringReset').addEventListener('click', () => fillScoringInputs(DEFAULT_SCORING));

formScoring.addEventListener('submit', ev => {
  ev.preventDefault();
  const { rules, bad } = readScoringInputs();
  if (bad.length) {
    updateScoringExample();
    alert('Each multiplier must be a number from −10 to 10 in steps of 0.5.');
    bad[0].focus();
    return;
  }
  try {
    setGroupScoring(scoringGroupId, rules);
    refreshState();
    modalScoring.hide();
    showToast('Scoring rules saved');
  } catch (e) {
    alert('Could not save the scoring rules: ' + e.message + '\nNothing was changed.');
  }
});
