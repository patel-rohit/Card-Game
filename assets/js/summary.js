// summary.js - "Player summary": stats, score chart, last games and what went well / not so well
// Read-only: it never writes game data. Depends on storage.js, models.js, ui.js
// (state, refreshState, currentGroup, showToast, escapeHtml) and share.js (roundRect, fitText, loadImage).

/* ---------- pure computation ---------- */

// Competition ranking by total (ties share a rank: 1, 2, 2, 4), same as the Ranking tab's Total mode.
function rankByTotal(list) {
  const sorted = list.slice().sort((a, b) =>
    (b.total - a.total) || (b.played - a.played) || String(a.name).localeCompare(String(b.name)));
  const ranks = {};
  let prev = null, rank = 0;
  sorted.forEach((r, i) => {
    if (r.total !== prev) { rank = i + 1; prev = r.total; }
    ranks[r.personId] = rank;
  });
  return { ranks, count: sorted.length };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Signed number with a real minus sign, for display (e.g. +20, −19, 0)
function fmtSigned(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
function fmtNum(n) { return n < 0 ? '−' + Math.abs(n) : String(n); }
// average with 2 decimals, '–' when no games were played
function fmtAvg(s) {
  if (!s.played) return '–';
  const t = Math.abs(s.average).toFixed(2);
  return (s.average < 0 && t !== '0.00' ? '−' : '') + t;
}

// Returns a plain object describing one player of a group. Never changes `group`.
function computePlayerSummary(group, personId) {
  if (!group) return null;
  const stats = computeTotalsAndAverages(group);
  const me = stats[personId];
  if (!me) return null;
  const person = group.people.find(p => p.personId === personId) || null;
  const joinedAfter = person ? (Number(person.joinedAfterGameId) || 0) : 0;
  const running = computeRunningTotals(group);
  const games = group.games.slice().sort((a, b) => Number(a.gameId) - Number(b.gameId));

  // per game: who played, top score, winners
  const wins = {};
  Object.keys(stats).forEach(id => { wins[id] = 0; });
  const gameInfo = games.map(g => {
    const played = g.entries.filter(e => e.participated);
    const pts = played.map(e => Number(e.points) || 0);
    const top = played.length >= 2 ? Math.max(...pts) : null;
    const winners = top === null ? [] : played.filter(e => (Number(e.points) || 0) === top).map(e => e.personId);
    winners.forEach(id => { wins[id] = (wins[id] || 0) + 1; });
    const mine = played.find(e => e.personId === personId);
    return { gameId: Number(g.gameId), played, top, winners, mine: mine ? Number(mine.points) || 0 : null };
  });

  // the player's own games, in game order
  const myGames = gameInfo.filter(gi => gi.mine !== null).map(gi => ({
    gameId: gi.gameId,
    points: gi.mine,
    win: gi.winners.includes(personId),
    soleWin: gi.winners.length === 1 && gi.winners[0] === personId,
    after: (running[gi.gameId] || {})[personId]
  }));

  // current rank (Total mode)
  const now = rankByTotal(Object.values(stats));
  const rank = now.ranks[personId];

  // rank after a given game: running totals of the people who were in the group by then
  function rankAfterGame(gameId) {
    const totals = {};
    group.people.forEach(p => {
      if ((Number(p.joinedAfterGameId) || 0) < gameId) totals[p.personId] = Number(p.startPoints) || 0;
    });
    gameInfo.forEach(gi => {
      if (gi.gameId > gameId) return;
      gi.played.forEach(e => {
        if (totals[e.personId] === undefined) totals[e.personId] = 0; // removed later
        totals[e.personId] += Number(e.points) || 0;
      });
    });
    if (totals[personId] === undefined) return null;
    const list = Object.keys(totals).map(id => ({ personId: id, total: totals[id], played: 0, name: id }));
    return rankByTotal(list).ranks[personId];
  }

  const myWins = wins[personId] || 0;
  const otherWins = Object.keys(wins).filter(id => id !== personId).map(id => wins[id]);
  const maxOther = otherWins.length ? Math.max(...otherWins) : 0;

  // chart series
  const series = myGames.map(g => ({ gameId: g.gameId, value: g.after }));
  let peak = null, low = null;
  series.forEach(s => {
    if (!peak || s.value > peak.value) peak = s;
    if (!low || s.value < low.value) low = s;
  });

  // last 5 games of the group since the player joined
  const sinceJoin = gameInfo.filter(gi => gi.gameId > joinedAfter);
  const last5 = sinceJoin.slice(-5).map(gi => (gi.mine === null
    ? { gameId: gi.gameId, out: true }
    : { gameId: gi.gameId, out: false, points: gi.mine, win: gi.winners.includes(personId) }));
  const satOut = person ? sinceJoin.filter(gi => gi.mine === null) : [];

  // longest run of plus / minus games (in the player's own games)
  function longestRun(test) {
    let best = null, cur = null;
    myGames.forEach(g => {
      if (test(g.points)) {
        cur = cur ? { from: cur.from, to: g.gameId, len: cur.len + 1 } : { from: g.gameId, to: g.gameId, len: 1 };
        if (!best || cur.len > best.len) best = cur;
      } else cur = null;
    });
    return best;
  }

  const wentWell = [], notSoWell = [];
  const add = (list, strength, strong, rest) => list.push({ strength, strong, rest, order: list.length });

  if (myGames.length) {
    // best / worst single game (earliest one on a tie)
    const best = myGames.reduce((a, b) => (b.points > a.points ? b : a));
    const worst = myGames.reduce((a, b) => (b.points < a.points ? b : a));
    if (best.points > 0) {
      add(wentWell, best.win ? 70 : 50, `Best game: ${fmtSigned(best.points)}`,
        ` in game #${best.gameId}${best.win ? ' — highest score of that game' : ''}`);
    }
    if (worst.points < 0) add(notSoWell, 65, `Worst game: ${fmtSigned(worst.points)}`, ` in game #${worst.gameId}`);

    // wins
    if (myWins >= 1) {
      const most = myWins > maxOther, joint = myWins === maxOther;
      add(wentWell, most ? 90 : joint ? 80 : 40 + myWins,
        `${myWins} win${myWins === 1 ? '' : 's'}`,
        most && otherWins.length ? ' — most in the group' : joint ? ' — joint most in the group' : '');
    }

    // streaks
    const plus = longestRun(v => v > 0), minus = longestRun(v => v < 0);
    if (plus && plus.len >= 2) add(wentWell, 45 + 5 * plus.len, `${plus.len} plus games in a row`, ` (#${plus.from}–#${plus.to})`);
    if (minus && minus.len >= 2) add(notSoWell, 45 + 5 * minus.len, `${minus.len} minus games in a row`, ` (#${minus.from}–#${minus.to})`);

    // ranking movement: after their first game vs now
    const startRank = rankAfterGame(myGames[0].gameId);
    if (startRank !== null && rank) {
      if (rank < startRank) add(wentWell, 60 + 5 * (startRank - rank), `Climbed from ${ordinal(startRank)} to ${ordinal(rank)}`, ` since game #${myGames[0].gameId}`);
      else if (rank > startRank) add(notSoWell, 60 + 5 * (rank - startRank), `Dropped from ${ordinal(startRank)} to ${ordinal(rank)}`, ` since game #${myGames[0].gameId}`);
    }

    // recent form: last 3 games vs own average
    if (myGames.length >= 4) {
      const last3 = myGames.slice(-3);
      const sum3 = last3.reduce((a, g) => a + g.points, 0);
      if (sum3 / 3 > me.average) add(wentWell, 55, `Last 3 games: ${fmtSigned(sum3)}`, ', above own average');
      else if (sum3 / 3 < me.average) add(notSoWell, 55, `Last 3 games: ${fmtSigned(sum3)}`, ', below own average');
    }
  }
  // games as leader (only games where a leader was recorded)
  const ledGames = games.map(g => gameLeader(g)).filter(l => l && l.personId === personId);
  const led = ledGames.length, ledWon = ledGames.filter(l => l.result === 'won').length, ledLost = led - ledWon;
  if (ledWon >= 1) add(wentWell, 45 + Math.round(40 * ledWon / led), `Won ${ledWon} of ${led}`, ` game${led === 1 ? '' : 's'} as leader`);
  if (ledLost >= 1) add(notSoWell, 45 + Math.round(40 * ledLost / led), `Lost ${ledLost} of ${led}`, ` game${led === 1 ? '' : 's'} as leader`);

  if (satOut.length >= 1) {
    add(notSoWell, 30 + 5 * satOut.length, `Sat out ${satOut.length} game${satOut.length === 1 ? '' : 's'}`,
      satOut.length <= 3 ? ` (${satOut.map(g => '#' + g.gameId).join(', ')})` : '');
  }

  const top3 = list => list.sort((a, b) => (b.strength - a.strength) || (a.order - b.order)).slice(0, 3)
    .map(x => ({ strong: x.strong, rest: x.rest }));

  return {
    personId,
    name: me.name,
    removed: !person,
    groupName: group.name,
    rank,
    rankCount: now.count,
    total: me.total,
    start: me.start,
    average: me.average,
    played: me.played,
    wins: myWins,
    led,
    ledWon,
    ledLost,
    isLeader: rank === 1,
    series,
    peak,
    low,
    last5,
    satOut: satOut.length,
    wentWell: top3(wentWell),
    notSoWell: top3(notSoWell)
  };
}

/* ---------- rendering ---------- */

const modalSummaryEl = document.getElementById('modalSummary');
const modalSummary = bootstrap.Modal.getOrCreateInstance(modalSummaryEl);

const SUMMARY_ICONS = {
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  warn: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/></svg>'
};

function summaryInitial(name) {
  const ch = Array.from(String(name || '?').trim())[0] || '?';
  return ch.toUpperCase();
}

function summaryTotalClass(s) {
  if (s.total < 0) return ' neg';
  if (s.isLeader && s.total > 0) return ' gold';
  return '';
}

function summaryChartHtml(s) {
  if (!s.series.length) return '<div class="ps-chart-empty">No games played yet.</div>';
  if (s.series.length === 1) {
    return `<div class="ps-chart-empty">Only one game so far: score ${escapeHtml(fmtNum(s.series[0].value))} after game #${s.series[0].gameId}.</div>`;
  }
  const W = 320, H = 92, PX = 8, PY = 10;
  const vals = s.series.map(p => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const n = s.series.length;
  const x = i => PX + (i * (W - 2 * PX)) / (n - 1);
  const y = v => PY + ((max - v) * (H - 2 * PY)) / (max - min);
  const pts = s.series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const iPeak = s.series.indexOf(s.peak), iLow = s.series.indexOf(s.low);
  const zero = min < 0 && max > 0
    ? `<line x1="${PX}" x2="${W - PX}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#9aa0a6" stroke-width="1" stroke-dasharray="4 4"/>` : '';
  const last = s.series[n - 1];
  const label = 'Score after each game: ' + s.series.map(p => fmtNum(p.value)).join(', ');
  return `
    <svg class="ps-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">
      ${zero}
      <polyline points="${pts}" fill="none" stroke="#0c6a43" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="4.5" fill="#0c6a43"/>
      <circle cx="${x(iLow).toFixed(1)}" cy="${y(s.low.value).toFixed(1)}" r="5" fill="#ffffff" stroke="#c62828" stroke-width="2"/>
      <circle cx="${x(iPeak).toFixed(1)}" cy="${y(s.peak.value).toFixed(1)}" r="5" fill="#d4af37" stroke="#7a5c10" stroke-width="1.5"/>
    </svg>
    <div class="ps-chart-cap">
      <span>Peak ${escapeHtml(fmtNum(s.peak.value))} (game #${s.peak.gameId})</span>
      <span>Low ${escapeHtml(fmtNum(s.low.value))} (game #${s.low.gameId})</span>
      <span>Now ${escapeHtml(fmtNum(last.value))}</span>
    </div>`;
}

function summaryListHtml(items, emptyText) {
  if (!items.length) return `<div class="ps-item ps-empty">${escapeHtml(emptyText)}</div>`;
  return items.map(it => `<div class="ps-item"><b>${escapeHtml(it.strong)}</b>${escapeHtml(it.rest)}</div>`).join('');
}

function renderPlayerSummary(s) {
  const body = document.getElementById('summaryBody');
  document.getElementById('summaryAvatar').textContent = summaryInitial(s.name);
  document.getElementById('summaryAvatar').classList.toggle('gold', s.rank === 1);
  document.getElementById('summaryName').textContent = s.name;
  document.getElementById('summarySub').textContent = `Rank ${s.rank} of ${s.rankCount} · ${s.groupName}`;

  const range = s.series.length >= 2 ? `#${s.series[0].gameId} → #${s.series[s.series.length - 1].gameId}` : '';
  const chips = s.last5.map(g => {
    if (g.out) return `<span class="ps-chip out" title="Game #${g.gameId}: sat out">out</span>`;
    const cls = g.win ? 'win' : g.points > 0 ? 'pos' : g.points < 0 ? 'neg' : 'zero';
    return `<span class="ps-chip ${cls}" title="Game #${g.gameId}${g.win ? ': win' : ''}">${escapeHtml(fmtSigned(g.points))}</span>`;
  }).join('');

  body.innerHTML = `
    <div class="ps-tiles">
      <div class="ps-tile${s.isLeader && s.total > 0 ? ' lead' : ''}"><div class="v${summaryTotalClass(s)}" data-stat="total">${escapeHtml(fmtNum(s.total))}</div><div class="l">Total</div></div>
      <div class="ps-tile"><div class="v" data-stat="average">${escapeHtml(fmtAvg(s))}</div><div class="l">Average</div></div>
      <div class="ps-tile"><div class="v" data-stat="games">${s.played}</div><div class="l">Games</div></div>
      <div class="ps-tile"><div class="v" data-stat="wins">${s.wins}</div><div class="l">Wins</div></div>
    </div>
    ${s.led ? `<div class="ps-led" data-stat="led">${LEADER_SVG}<span>Led <b>${s.led}</b> game${s.led === 1 ? '' : 's'} · won <b>${s.ledWon}</b> · lost <b>${s.ledLost}</b></span></div>` : ''}
    <div class="ps-card">
      <div class="ps-card-head"><span>Score after each game</span><span class="ps-range">${escapeHtml(range)}</span></div>
      ${summaryChartHtml(s)}
    </div>
    ${s.last5.length ? `<div class="ps-last5"><div class="ps-last5-lbl">Last ${s.last5.length} game${s.last5.length === 1 ? '' : 's'}</div><div class="ps-chips">${chips}</div></div>` : ''}
    <div class="ps-list good">
      <div class="ps-list-head">${SUMMARY_ICONS.check} Went well</div>
      ${summaryListHtml(s.wentWell, 'No standout highlights yet — keep playing')}
    </div>
    <div class="ps-list bad">
      <div class="ps-list-head">${SUMMARY_ICONS.warn} Not so well</div>
      ${summaryListHtml(s.notSoWell, 'Nothing to flag yet')}
    </div>`;
}

/* ---------- share (picture in the card-table style + WhatsApp text) ---------- */

function buildSummaryText(s) {
  const lines = [];
  lines.push(`*${s.name}* — ${s.groupName}`);
  lines.push(`_Rank ${s.rank} of ${s.rankCount} · ${s.played} game${s.played === 1 ? '' : 's'}_`);
  lines.push('');
  lines.push(`Total: *${s.total}* · Average: *${s.played ? s.average.toFixed(2) : '-'}* · Wins: *${s.wins}*`);
  if (s.led) lines.push(`Led: *${s.led}* · won *${s.ledWon}* · lost *${s.ledLost}*`);
  if (s.wentWell.length) { lines.push(''); lines.push('*Went well*'); s.wentWell.forEach(it => lines.push(`+ ${it.strong}${it.rest}`)); }
  if (s.notSoWell.length) { lines.push(''); lines.push('*Not so well*'); s.notSoWell.forEach(it => lines.push(`- ${it.strong}${it.rest}`)); }
  const url = typeof appUrl === 'function' ? appUrl() : '';
  if (url) { lines.push(''); lines.push(url); }
  return lines.join('\n');
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  words.forEach(w => {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxWidth || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  return lines.map(l => fitText(ctx, l, maxWidth));
}

async function drawSummaryImage(s) {
  try { if (document.fonts && document.fonts.load) await document.fonts.load('700 48px Cinzel'); } catch (e) { /* fallback font */ }
  const W = 1080, PAD = 60;
  const serif = "'Cinzel', Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const ITEM_FONT = `400 32px ${sans}`, LINE_H = 42;

  // measure the two lists first so the picture is exactly as tall as needed
  const m = document.createElement('canvas').getContext('2d');
  m.font = ITEM_FONT;
  const listW = W - PAD * 2 - 76 - 40;
  const wrapList = (items, empty) => (items.length ? items : [{ strong: '', rest: empty }])
    .map(it => wrapLines(m, (it.strong ? it.strong : '') + it.rest, listW));
  const good = wrapList(s.wentWell, 'No standout highlights yet — keep playing');
  const bad = wrapList(s.notSoWell, 'Nothing to flag yet');
  const listH = items => 84 + items.reduce((a, l) => a + l.length * LINE_H + 14, 0) + 10;
  const chartH = s.series.length >= 2 ? 300 : 0;
  const H = 520 + chartH + listH(good) + 30 + listH(bad) + 120;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // felt + rail (same as the standings picture)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f7a4c'); bg.addColorStop(1, '#063a25');
  ctx.fillStyle = '#4a2c14'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = bg; roundRect(ctx, 18, 18, W - 36, H - 36, 46); ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,.7)'; ctx.lineWidth = 4; roundRect(ctx, 18, 18, W - 36, H - 36, 46); ctx.stroke();
  const glow = ctx.createRadialGradient(W / 2, 0, 50, W / 2, 0, W * .8);
  glow.addColorStop(0, 'rgba(60,200,130,.35)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(18, 18, W - 36, H - 36);

  // brand
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const logo = await loadImage('assets/img/logo-192.png');
  const brandY = 106, brand = 'POINTS GAME';
  ctx.fillStyle = '#d4af37'; ctx.font = `700 30px ${serif}`;
  if (logo) {
    const LS = 64, gap = 16, bw = ctx.measureText(brand).width, x0 = (W - (LS + gap + bw)) / 2;
    ctx.drawImage(logo, x0, brandY - LS + 16, LS, LS);
    ctx.textAlign = 'left'; ctx.fillText(brand, x0 + LS + gap, brandY);
  } else {
    ctx.fillText(brand, W / 2, brandY);
  }

  // avatar + name + rank
  let y = 150;
  const AV = 112, cx = PAD + AV / 2, cy = y + AV / 2;
  ctx.beginPath(); ctx.arc(cx, cy, AV / 2, 0, Math.PI * 2);
  if (s.rank === 1) {
    const g = ctx.createLinearGradient(0, y, 0, y + AV);
    g.addColorStop(0, '#f6e08f'); g.addColorStop(.55, '#d4af37'); g.addColorStop(1, '#a8841f');
    ctx.fillStyle = g;
  } else ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,.8)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = s.rank === 1 ? '#2a1d04' : '#d4af37'; ctx.font = `700 54px ${serif}`;
  ctx.fillText(summaryInitial(s.name), cx, cy + 19);
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = `700 60px ${serif}`;
  ctx.fillText(fitText(ctx, s.name, W - PAD * 2 - AV - 30), PAD + AV + 30, y + 58);
  ctx.fillStyle = 'rgba(232,243,236,.8)'; ctx.font = `400 30px ${sans}`;
  ctx.fillText(fitText(ctx, `Rank ${s.rank} of ${s.rankCount} · ${s.groupName}`, W - PAD * 2 - AV - 30), PAD + AV + 30, y + 102);

  // stat tiles
  y = 300;
  const tiles = [
    ['Total', fmtNum(s.total), s.total < 0 ? '#ff8a80' : (s.isLeader && s.total > 0 ? '#d4af37' : '#ffffff')],
    ['Average', fmtAvg(s), '#ffffff'],
    ['Games', String(s.played), '#ffffff'],
    ['Wins', String(s.wins), '#ffffff']
  ];
  const TG = 18, TW = (W - PAD * 2 - TG * 3) / 4, TH = 150;
  tiles.forEach(([lbl, val, col], i) => {
    const tx = PAD + i * (TW + TG);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; roundRect(ctx, tx, y, TW, TH, 22); ctx.fill();
    ctx.strokeStyle = i === 0 && s.isLeader && s.total > 0 ? 'rgba(212,175,55,.8)' : 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2; roundRect(ctx, tx, y, TW, TH, 22); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.font = `800 52px ${sans}`;
    ctx.fillText(fitText(ctx, val, TW - 20), tx + TW / 2, y + 78);
    ctx.fillStyle = 'rgba(232,243,236,.75)'; ctx.font = `400 26px ${sans}`;
    ctx.fillText(lbl, tx + TW / 2, y + 120);
  });
  y += TH + 40;

  // chart (cream card)
  if (chartH) {
    const CH = chartH - 30;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#fbfaf4'; roundRect(ctx, PAD, y, W - PAD * 2, CH, 24); ctx.fill(); ctx.restore();
    ctx.textAlign = 'left'; ctx.fillStyle = '#1d1d1f'; ctx.font = `700 28px ${sans}`;
    ctx.fillText('Score after each game', PAD + 28, y + 46);
    const vals = s.series.map(p => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const gx0 = PAD + 40, gx1 = W - PAD - 40, gy0 = y + 76, gy1 = y + CH - 66;
    const n = s.series.length;
    const px = i => gx0 + (i * (gx1 - gx0)) / (n - 1);
    const py = v => gy0 + ((max - v) * (gy1 - gy0)) / (max - min);
    if (min < 0 && max > 0) {
      ctx.save(); ctx.setLineDash([10, 10]); ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx0, py(0)); ctx.lineTo(gx1, py(0)); ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = '#0c6a43'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); s.series.forEach((p, i) => (i ? ctx.lineTo(px(i), py(p.value)) : ctx.moveTo(px(i), py(p.value)))); ctx.stroke();
    const dot = (i, v, fill, stroke) => { ctx.beginPath(); ctx.arc(px(i), py(v), 11, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke(); } };
    dot(n - 1, s.series[n - 1].value, '#0c6a43');
    dot(s.series.indexOf(s.low), s.low.value, '#ffffff', '#c62828');
    dot(s.series.indexOf(s.peak), s.peak.value, '#d4af37', '#7a5c10');
    ctx.fillStyle = '#4a4f54'; ctx.font = `400 24px ${sans}`;
    ctx.textAlign = 'left'; ctx.fillText(`Peak ${fmtNum(s.peak.value)} (game #${s.peak.gameId})`, PAD + 28, y + CH - 24);
    ctx.textAlign = 'center'; ctx.fillText(`Low ${fmtNum(s.low.value)} (game #${s.low.gameId})`, W / 2, y + CH - 24);
    ctx.textAlign = 'right'; ctx.fillText(`Now ${fmtNum(s.series[n - 1].value)}`, W - PAD - 28, y + CH - 24);
    y += chartH;
  }

  // went well / not so well panels
  const panel = (title, lines, border, color, mark) => {
    const h = listH(lines);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; roundRect(ctx, PAD, y, W - PAD * 2, h, 24); ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 3; roundRect(ctx, PAD, y, W - PAD * 2, h, 24); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = color; ctx.font = `700 32px ${sans}`;
    ctx.fillText(title, PAD + 36, y + 56);
    let ly = y + 84 + 32;
    lines.forEach(item => {
      ctx.fillStyle = color; ctx.font = `700 32px ${sans}`; ctx.fillText(mark, PAD + 36, ly);
      ctx.fillStyle = '#e8f3ec'; ctx.font = ITEM_FONT;
      item.forEach(l => { ctx.fillText(l, PAD + 76, ly); ly += LINE_H; });
      ly += 14;
    });
    y += h + 30;
  };
  panel('Went well', good, 'rgba(107,227,155,.55)', '#8ff0b5', '+');
  panel('Not so well', bad, 'rgba(255,171,64,.6)', '#ffc27a', '–');

  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,243,236,.6)'; ctx.font = `400 24px ${sans}`;
  ctx.fillText(new Date().toLocaleString(), W / 2, H - 56);

  return new Promise(resolve => c.toBlob(b => resolve({ blob: b, dataUrl: c.toDataURL('image/png') }), 'image/png'));
}

/* ---------- open / share flow ---------- */
let summaryCache = null; // { s, text, ready: Promise<{file, dataUrl}> }

function openPlayerSummary(personId) {
  refreshState(); // read only: picks up changes made in another tab
  const group = currentGroup();
  const s = computePlayerSummary(group, personId);
  if (!s) { showToast('Player not found'); return; }
  renderPlayerSummary(s);
  const text = buildSummaryText(s);
  // the picture is prepared now so the Share tap can open the share sheet straight away
  const ready = drawSummaryImage(s).then(({ blob, dataUrl }) => ({
    file: new File([blob], `${String(s.name).replace(/[^\w-]+/g, '_')}_summary.png`, { type: 'image/png' }),
    dataUrl
  }));
  summaryCache = { s, text, ready };
  modalSummary.show();
}

document.getElementById('btnSummaryShare').addEventListener('click', async () => {
  if (!summaryCache) return;
  const { text } = summaryCache;
  let img;
  try { img = await summaryCache.ready; } catch (e) { showToast('Could not create the picture'); return; }
  const { file, dataUrl } = img;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // user closed the share sheet
    }
  }
  // fallback: save the picture
  const a = document.createElement('a');
  a.href = dataUrl; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  showToast('Image saved — attach it in your WhatsApp group');
});

// any element with .btn-player-summary[data-id] opens that player's summary
document.addEventListener('click', ev => {
  const btn = ev.target.closest && ev.target.closest('.btn-player-summary');
  if (!btn || !btn.dataset.id) return;
  ev.preventDefault();
  openPlayerSummary(btn.dataset.id);
});
