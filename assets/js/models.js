// models.js
// utility functions for date formatting and ranking calculations
function formatLocalDateTimeISO(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hh = String(hours).padStart(2, '0');

  return `${dd}/${mm}/${yyyy} ${hh}:${minutes}:${seconds} ${ampm}`;
}

function computeTotalsAndAverages(group) {
  // returns { personId -> { name, personId, start, gamePoints, total, played, average } }
  // total   = starting points (mid-way joiners) + points from games played
  // average = game points / games played (starting points excluded)
  const map = {};
  const blank = (p) => ({
    personId: p.personId, name: p.name, enabled: p.enabled !== false,
    start: Number(p.startPoints) || 0, gamePoints: 0, total: 0, played: 0, average: 0,
    joinedAfterGameId: Number(p.joinedAfterGameId) || 0
  });
  group.people.forEach(p => { map[p.personId] = blank(p); });

  group.games.forEach(g => {
    g.entries.forEach(e => {
      if (!map[e.personId]) {
        // person removed later: keep a placeholder
        map[e.personId] = blank({ personId: e.personId, name: '(removed)', enabled: false });
      }
      if (e.participated) {
        map[e.personId].gamePoints += Number(e.points) || 0;
        map[e.personId].played += 1;
      }
    });
  });

  Object.values(map).forEach(x => {
    x.total = x.start + x.gamePoints;
    x.average = x.played > 0 ? x.gamePoints / x.played : 0;
  });

  return map;
}

// Running total of every player after each game, in game order.
// returns { gameId -> { personId -> total after that game } } for players who played that game.
// The total starts from the player's starting points (mid-way joiners), like the Total ranking.
function computeRunningTotals(group) {
  const run = {};
  group.people.forEach(p => { run[p.personId] = Number(p.startPoints) || 0; });
  const out = {};
  group.games.slice().sort((a, b) => Number(a.gameId) - Number(b.gameId)).forEach(g => {
    const after = {};
    g.entries.forEach(e => {
      if (!e.participated) return;
      if (run[e.personId] === undefined) run[e.personId] = 0; // removed player
      run[e.personId] += Number(e.points) || 0;
      after[e.personId] = run[e.personId];
    });
    out[g.gameId] = after;
  });
  return out;
}

// Suggest who led an old game, from the saved points only (nothing is changed).
// Rules: one player above 500 -> that player won; else one player below 0 -> that player lost;
// else no leader. Several candidates -> the most extreme one is suggested and marked unclear.
// returns { personId: string|null, result: 'won'|'lost'|null, unclear: boolean }
function suggestLeader(game, nameOf = id => id) {
  const played = (game.entries || []).filter(e => e.participated)
    .map(e => ({ personId: e.personId, points: Number(e.points) || 0 }));
  const byName = (a, b) => String(nameOf(a.personId)).localeCompare(String(nameOf(b.personId)));
  const big = played.filter(e => e.points > 500);
  if (big.length) {
    const pick = big.slice().sort((a, b) => (b.points - a.points) || byName(a, b))[0];
    return { personId: pick.personId, result: 'won', unclear: big.length > 1 };
  }
  const neg = played.filter(e => e.points < 0);
  if (neg.length) {
    const pick = neg.slice().sort((a, b) => (a.points - b.points) || byName(a, b))[0];
    return { personId: pick.personId, result: 'lost', unclear: neg.length > 1 };
  }
  return { personId: null, result: null, unclear: false };
}

// The game's leader when one is recorded, else null (no leader / not reviewed yet).
function gameLeader(game) {
  const l = game && game.leader;
  return l && typeof l === 'object' && l.personId && (l.result === 'won' || l.result === 'lost') ? l : null;
}

// Games each player led: { personId -> { led, won, lost } } (only games with a recorded leader).
function computeLeaderStats(group) {
  const out = {};
  group.games.forEach(g => {
    const l = gameLeader(g);
    if (!l) return;
    const s = out[l.personId] || (out[l.personId] = { led: 0, won: 0, lost: 0 });
    s.led++;
    if (l.result === 'won') s.won++; else s.lost++;
  });
  return out;
}

/* ---------- bid scoring (suggestions only: the user presses "Fill points" and can still edit) ---------- */

// Multipliers of the bid. A group may store its own as `group.scoring`; missing values use these.
const DEFAULT_SCORING = { won: { leader: 2, partner: 1, other: 0 }, lost: { leader: -1, partner: 0, other: 0 } };
const SCORING_ROLES = ['leader', 'partner', 'other'];

// The group's scoring rules with defaults filled in (a new object; the group is not changed).
function groupScoring(group) {
  const s = (group && group.scoring && typeof group.scoring === 'object') ? group.scoring : {};
  const out = {};
  ['won', 'lost'].forEach(res => {
    out[res] = {};
    SCORING_ROLES.forEach(role => {
      const v = s[res] && Number(s[res][role]);
      out[res][role] = (s[res] && s[res][role] !== undefined && s[res][role] !== null && Number.isFinite(v)) ? v : DEFAULT_SCORING[res][role];
    });
  });
  return out;
}

// Whole points for a multiplier of the bid; halves round away from zero so won/lost stay symmetric.
function bidPoints(multiplier, bid) {
  const x = multiplier * bid;
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r; // no -0
}

// Suggested points: { personId -> points } for every id in `ids`.
function suggestBidPointsFor(ids, leaderId, partnerIds, result, bid, scoring) {
  const rules = scoring[result];
  const partners = new Set(partnerIds || []);
  const out = {};
  ids.forEach(id => {
    const role = id === leaderId ? 'leader' : partners.has(id) ? 'partner' : 'other';
    out[id] = bidPoints(rules[role], bid);
  });
  return out;
}

/* ---------- ranking "As Leader" ---------- */

// Every player's record as leader, from games with a recorded leader (in game order).
// returns { ranked, unranked, never, all, gamesWithLeader }; rows: { personId, name, removed, led, won, lost, pct, last5, rank }
function computeLeaderRanking(group, minLed) {
  minLed = Math.max(1, Number(minLed) || 1);
  const rows = {};
  const nameOf = id => { const p = group.people.find(x => x.personId === id); return p ? p.name : '(removed)'; };
  let gamesWithLeader = 0;
  group.games.slice().sort((a, b) => Number(a.gameId) - Number(b.gameId)).forEach(g => {
    const l = gameLeader(g);
    if (!l) return;
    gamesWithLeader++;
    const r = rows[l.personId] || (rows[l.personId] = {
      personId: l.personId, name: nameOf(l.personId), removed: !group.people.some(p => p.personId === l.personId),
      led: 0, won: 0, lost: 0, results: []
    });
    r.led++;
    if (l.result === 'won') r.won++; else r.lost++;
    r.results.push({ gameId: Number(g.gameId), result: l.result });
  });
  const all = Object.values(rows).map(r => Object.assign(r, { pct: r.won / r.led, last5: r.results.slice(-5) }));
  const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || String(a.personId).localeCompare(String(b.personId));
  const order = (a, b) => (b.pct - a.pct) || (b.won - a.won) || (b.led - a.led) || byName(a, b);
  const ranked = all.filter(r => r.led >= minLed).sort(order);
  // competition ranking: the same record (won and led) shares a rank (1, 2, 2, 4)
  let prev = null, rank = 0;
  ranked.forEach((r, i) => {
    const k = r.won + '/' + r.led;
    if (k !== prev) { rank = i + 1; prev = k; }
    r.rank = rank;
  });
  const unranked = all.filter(r => r.led < minLed).sort(order);
  const never = group.people.filter(p => !rows[p.personId])
    .map(p => ({ personId: p.personId, name: p.name, removed: false, led: 0, won: 0, lost: 0, pct: 0, last5: [] }))
    .sort(byName);
  return { ranked, unranked, never, all, gamesWithLeader, minLed };
}

// Highlights for the top of the "As Leader" view (null when there is nothing to show).
function leaderHighlights(lr) {
  const best = lr.ranked[0] || null;
  const most = lr.all.slice().sort((a, b) => (b.led - a.led) || (b.won - a.won) ||
    String(a.name).localeCompare(String(b.name)))[0] || null;
  const toughest = lr.ranked.length >= 2
    ? lr.ranked.slice().sort((a, b) => (a.pct - b.pct) || (b.lost - a.lost) || (b.led - a.led) ||
      String(a.name).localeCompare(String(b.name)))[0]
    : null;
  return { best, most, toughest };
}

function pctLabel(r) { return Math.round(r.pct * 100) + '%'; }
