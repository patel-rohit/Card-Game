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
