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
