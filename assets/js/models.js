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
  // returns { personId -> { name, personId, total, played, average } }
  const map = {};
  group.people.forEach(p => {
    map[p.personId] = { personId: p.personId, name: p.name, enabled: !!p.enabled, total: 0, played: 0, average: 0 };
  });

  group.games.forEach(g => {
    g.entries.forEach(e => {
      if (!map[e.personId]) {
        // person removed later: keep a placeholder
        map[e.personId] = { personId: e.personId, name: '(removed)', enabled: false, total: 0, played: 0, average: 0 };
      }
      if (e.participated) {
        const pts = Number(e.points) || 0;
        map[e.personId].total += pts;
        map[e.personId].played += 1;
      }
    });
  });

  Object.values(map).forEach(x => {
    x.average = x.played > 0 ? +(x.total / x.played) : 0;
  });

  return map;
}
