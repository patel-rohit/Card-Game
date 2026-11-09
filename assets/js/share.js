// share.js - share the current standings to WhatsApp (as an image or as text)
// depends on storage.js, models.js and ui.js (currentGroup, getRankMode, showToast, escapeHtml)

const modalShareEl = document.getElementById('modalShare');
const modalShare = bootstrap.Modal.getOrCreateInstance(modalShareEl);
const imgSharePreview = document.getElementById('imgSharePreview');
const btnShareImage = document.getElementById('btnShareImage');
const btnShareWhatsApp = document.getElementById('btnShareWhatsApp');
const btnShareCopy = document.getElementById('btnShareCopy');
const lblShareTip = document.getElementById('lblShareTip');

const MEDALS = ['🥇', '🥈', '🥉'];

// Standings in the same order and with the same rules as the Ranking tab.
function buildShareData() {
  refreshState();
  const group = currentGroup();
  if (!group) return null;
  const mode = getRankMode();
  const minGames = Math.max(1, Number(state.ui && state.ui.rankMinGames) || 1);
  const lastGame = buildLastGame(group);
  if (mode === 'leader') {
    // "As Leader" ranking: same order and ranks as the Ranking tab
    const lr = computeLeaderRanking(group, getRankMinLed());
    const rows = lr.ranked.map(r => ({ rank: r.rank, name: r.name, led: r.led, won: r.won, lost: r.lost, pct: r.pct }));
    return { groupName: group.name, mode, minLed: lr.minLed, gamesCount: group.games.length, gamesWithLeader: lr.gamesWithLeader, rows, lastGame };
  }
  const arr = Object.values(computeTotalsAndAverages(group));

  let ranked;
  if (mode === 'average') {
    ranked = arr.filter(x => x.played >= minGames).sort((a, b) =>
      (b.average - a.average) || (b.played - a.played) || (b.total - a.total) || a.name.localeCompare(b.name));
  } else {
    ranked = arr.sort((a, b) => (b.total - a.total) || (b.played - a.played) || a.name.localeCompare(b.name));
  }
  const key = mode === 'average' ? (r => r.average.toFixed(2)) : (r => r.total);
  let prevKey = null, rank = 0;
  const rows = ranked.map((r, i) => {
    const k = key(r);
    if (k !== prevKey) { rank = i + 1; prevKey = k; }
    return { rank, name: r.name, played: r.played, total: r.total, average: r.average };
  });

  return { groupName: group.name, mode, minGames, gamesCount: group.games.length, rows, lastGame };
}

// newest game, highest score first
function buildLastGame(group) {
  let lastGame = null;
  if (group.games.length) {
    const g = group.games.reduce((a, b) => (Number(b.gameId) > Number(a.gameId) ? b : a));
    const nameOf = id => (group.people.find(p => p.personId === id) || { name: id }).name;
    const lead = gameLeader(g);
    lastGame = {
      gameId: g.gameId,
      leader: lead ? { name: nameOf(lead.personId), result: lead.result } : null,
      entries: g.entries.filter(e => e.participated)
        .map(e => ({ name: nameOf(e.personId), points: Number(e.points) || 0 }))
        .sort((a, b) => b.points - a.points)
    };
  }
  return lastGame;
}

function leaderPct(row) { return Math.round(row.pct * 100) + '%'; }

function fmtValue(row, mode) {
  return mode === 'average' ? `${row.average.toFixed(2)} avg` : `${row.total} pts`;
}

function signed(n) { return n > 0 ? '+' + n : String(n); }

function appUrl() {
  return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
}

// WhatsApp formatting: *bold*, _italic_
function buildShareText(d) {
  const lines = [];
  if (d.mode === 'leader') {
    lines.push(`★ *${d.groupName}* — leader ranking`);
    lines.push(`_${d.gamesWithLeader} game${d.gamesWithLeader === 1 ? '' : 's'} with a leader · by win % (min ${d.minLed} led)_`);
    lines.push('');
    d.rows.forEach(r => {
      const badge = r.rank <= 3 ? MEDALS[r.rank - 1] : `${r.rank}.`;
      lines.push(`${badge} ${r.name} — *${leaderPct(r)}* (${r.won}–${r.lost} as leader)`);
    });
  } else {
    lines.push(`🃏 *${d.groupName}* — standings`);
    lines.push(`_After ${d.gamesCount} game${d.gamesCount === 1 ? '' : 's'} · by ${d.mode === 'average' ? 'average' : 'total'}_`);
    lines.push('');
    d.rows.forEach(r => {
      const badge = r.rank <= 3 ? MEDALS[r.rank - 1] : `${r.rank}.`;
      lines.push(`${badge} ${r.name} — *${fmtValue(r, d.mode)}* (${r.played} game${r.played === 1 ? '' : 's'})`);
    });
  }
  if (d.lastGame && d.lastGame.entries.length) {
    lines.push('');
    lines.push(`*Last game #${d.lastGame.gameId}:* ` + d.lastGame.entries.map(e => `${e.name} ${signed(e.points)}`).join(', ')
      + (d.lastGame.leader ? ` · Leader: ${d.lastGame.leader.name} (${d.lastGame.leader.result})` : ''));
  }
  const url = appUrl();
  if (url) { lines.push(''); lines.push(`📲 ${url}`); }
  return lines.join('\n');
}

/* ---------- image (drawn on a canvas, card-table style) ---------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // the picture is still drawn without the logo
    img.src = src;
  });
}

async function drawShareImage(d) {
  try { if (document.fonts && document.fonts.load) await document.fonts.load('700 48px Cinzel'); } catch (e) { /* fallback font */ }

  const W = 1080, PAD = 60, ROW_H = 96, GAP = 14;
  const rows = d.rows.slice(0, 30);
  const lastH = d.lastGame && d.lastGame.entries.length ? 70 + Math.ceil(d.lastGame.entries.length / 3) * 64 : 0;
  const H = 340 + rows.length * (ROW_H + GAP) + lastH + 110;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const serif = "'Cinzel', Georgia, 'Times New Roman', serif";
  const sans = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  // felt + rail
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f7a4c'); bg.addColorStop(1, '#063a25');
  ctx.fillStyle = '#4a2c14'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = bg; roundRect(ctx, 18, 18, W - 36, H - 36, 46); ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,.7)'; ctx.lineWidth = 4; roundRect(ctx, 18, 18, W - 36, H - 36, 46); ctx.stroke();
  const glow = ctx.createRadialGradient(W / 2, 0, 50, W / 2, 0, W * .8);
  glow.addColorStop(0, 'rgba(60,200,130,.35)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(18, 18, W - 36, H - 36);

  // header
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const logo = await loadImage('assets/img/logo-192.png');
  const brandY = 112;
  ctx.fillStyle = '#d4af37'; ctx.font = `700 34px ${serif}`;
  const brand = 'POINTS GAME';
  if (logo) {
    const LS = 84, gap = 18, bw = ctx.measureText(brand).width, x0 = (W - (LS + gap + bw)) / 2;
    ctx.drawImage(logo, x0, brandY - LS + 22, LS, LS);
    ctx.textAlign = 'left'; ctx.fillText(brand, x0 + LS + gap, brandY);
    ctx.textAlign = 'center';
  } else {
    ctx.fillText('♠  ♥  ' + brand + '  ♣  ♦', W / 2, brandY);
  }
  ctx.fillStyle = '#ffffff'; ctx.font = `700 64px ${serif}`;
  ctx.fillText(fitText(ctx, d.groupName, W - PAD * 2), W / 2, 215);
  ctx.fillStyle = 'rgba(232,243,236,.8)'; ctx.font = `400 32px ${sans}`;
  ctx.fillText(d.mode === 'leader'
    ? `★ Leader ranking · ${d.gamesWithLeader} game${d.gamesWithLeader === 1 ? '' : 's'} with a leader`
    : `After ${d.gamesCount} game${d.gamesCount === 1 ? '' : 's'} · ranked by ${d.mode === 'average' ? 'average' : 'total'}`, W / 2, 270);

  // standings as playing cards
  let y = 320;
  const suits = ['♠', '♥', '♣', '♦'];
  rows.forEach((r, i) => {
    const top3 = r.rank <= 3;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.fillStyle = top3 ? '#fffdf2' : '#fbfaf4';
    roundRect(ctx, PAD, y, W - PAD * 2, ROW_H, 18); ctx.fill();
    ctx.restore();
    if (top3) { ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 4; roundRect(ctx, PAD, y, W - PAD * 2, ROW_H, 18); ctx.stroke(); }

    // faint suit watermark
    const suit = suits[i % 4];
    ctx.fillStyle = (suit === '♥' || suit === '♦') ? 'rgba(198,40,40,.08)' : 'rgba(0,0,0,.06)';
    ctx.font = `120px ${sans}`; ctx.textAlign = 'right';
    ctx.fillText(suit, W - PAD - 250, y + ROW_H + 18);

    const mid = y + ROW_H / 2 + 10;
    ctx.textAlign = 'center';
    if (top3) { ctx.fillStyle = '#000'; ctx.font = `52px ${sans}`; ctx.fillText(MEDALS[r.rank - 1], PAD + 60, mid + 4); }
    else { ctx.fillStyle = '#5f6368'; ctx.font = `700 40px ${sans}`; ctx.fillText(String(r.rank), PAD + 60, mid); }

    ctx.textAlign = 'left'; ctx.fillStyle = '#1d1d1f'; ctx.font = `700 42px ${sans}`;
    ctx.fillText(fitText(ctx, r.name, 520), PAD + 120, mid - 8);
    ctx.fillStyle = '#6b6f73'; ctx.font = `400 26px ${sans}`;
    ctx.fillText(d.mode === 'leader'
      ? `led ${r.led} game${r.led === 1 ? '' : 's'} · ${r.won}–${r.lost} (W–L)`
      : `${r.played} game${r.played === 1 ? '' : 's'}`, PAD + 120, mid + 24);

    ctx.textAlign = 'right';
    const val = d.mode === 'leader' ? leaderPct(r) : d.mode === 'average' ? r.average.toFixed(2) : String(r.total);
    const neg = d.mode !== 'leader' && (d.mode === 'average' ? r.average : r.total) < 0;
    ctx.fillStyle = neg ? '#c62828' : (top3 ? '#9a7614' : '#1d1d1f'); ctx.font = `800 48px ${sans}`;
    ctx.fillText(val, W - PAD - 34, mid);
    ctx.fillStyle = '#8a8f94'; ctx.font = `400 22px ${sans}`;
    ctx.fillText(d.mode === 'leader' ? 'won' : d.mode === 'average' ? 'avg' : 'pts', W - PAD - 34, mid + 26);
    y += ROW_H + GAP;
  });

  // last game chips
  if (lastH) {
    y += 20;
    ctx.textAlign = 'left'; ctx.fillStyle = '#d4af37'; ctx.font = `700 32px ${serif}`;
    ctx.fillText(fitText(ctx, `Last game #${d.lastGame.gameId}` + (d.lastGame.leader ? ` · Leader: ${d.lastGame.leader.name} (${d.lastGame.leader.result})` : ''), W - PAD * 2), PAD, y + 20);
    y += 46;
    const colW = (W - PAD * 2 - 2 * 16) / 3;
    d.lastGame.entries.forEach((e, i) => {
      const cx = PAD + (i % 3) * (colW + 16), cy = y + Math.floor(i / 3) * 64;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; roundRect(ctx, cx, cy, colW, 50, 25); ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,.45)'; ctx.lineWidth = 2; roundRect(ctx, cx, cy, colW, 50, 25); ctx.stroke();
      ctx.font = `600 26px ${sans}`; ctx.textAlign = 'left'; ctx.fillStyle = '#e8f3ec';
      ctx.fillText(fitText(ctx, e.name, colW - 120), cx + 20, cy + 34);
      ctx.textAlign = 'right'; ctx.fillStyle = e.points > 0 ? '#6be39b' : e.points < 0 ? '#ff8a80' : '#e8f3ec';
      ctx.fillText(signed(e.points), cx + colW - 20, cy + 34);
    });
    y += Math.ceil(d.lastGame.entries.length / 3) * 64;
  }

  // footer
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,243,236,.6)'; ctx.font = `400 24px ${sans}`;
  ctx.fillText(new Date().toLocaleString(), W / 2, H - 56);

  return new Promise(resolve => c.toBlob(b => resolve({ blob: b, dataUrl: c.toDataURL('image/png') }), 'image/png'));
}

/* ---------- share flow ---------- */
let shareCache = null; // { text, file, dataUrl }

async function openShareDialog() {
  const d = buildShareData();
  if (!d) { alert('Create a group first'); return; }
  if (!d.rows.length) {
    alert(d.mode === 'leader' ? 'Nothing to share yet: no player has led enough games.' : 'Nothing to share yet: no player has enough games.');
    return;
  }
  const text = buildShareText(d);
  shareCache = { text, file: null, dataUrl: '' };
  imgSharePreview.removeAttribute('src');
  lblShareTip.textContent = '';
  modalShare.show();
  // image is prepared now so the Share tap can open the share sheet straight away
  const { blob, dataUrl } = await drawShareImage(d);
  const fileName = `${d.groupName.replace(/[^\w-]+/g, '_')}_${d.mode === 'leader' ? 'leader_ranking' : 'standings'}.png`;
  shareCache.file = new File([blob], fileName, { type: 'image/png' });
  shareCache.dataUrl = dataUrl;
  imgSharePreview.src = dataUrl;
  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [shareCache.file] }));
  lblShareTip.textContent = canShareFiles
    ? 'Tap “Share image”, choose WhatsApp, then pick your group.'
    : 'This browser cannot share images directly: “Share image” saves the picture so you can attach it in WhatsApp.';
}

btnShareImage.addEventListener('click', async () => {
  if (!shareCache || !shareCache.file) return;
  const { file, text, dataUrl } = shareCache;
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

btnShareWhatsApp.addEventListener('click', () => {
  if (!shareCache) return;
  // opens WhatsApp with the message ready; you choose the group there
  window.open('https://wa.me/?text=' + encodeURIComponent(shareCache.text), '_blank', 'noopener');
});

btnShareCopy.addEventListener('click', async () => {
  if (!shareCache) return;
  try {
    await navigator.clipboard.writeText(shareCache.text);
    showToast('Text copied — paste it in WhatsApp');
  } catch (e) {
    prompt('Copy the text:', shareCache.text);
  }
});

document.querySelectorAll('.btn-open-share').forEach(b => b.addEventListener('click', openShareDialog));
