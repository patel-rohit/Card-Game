// main.js - app bootstrap logic (replace existing file)
document.addEventListener('DOMContentLoaded', () => {
  // ensure app state exists
  let s = loadState();

  // If no groups exist, prompt user to create one (auto-open Add Group modal)
  if (!s.groups.length) {
    // set default checked, then show modal
    setTimeout(() => {
      try {
        // ensure the modal elements are present
        const modalEl = document.getElementById('modalAddGroup');
        const chk = document.getElementById('chkMarkActive');
        const inp = document.getElementById('inpGroupName');

        if (chk) chk.checked = true;           // default active
        // reuse the instance ui.js created; a second instance could not be closed by the Create button
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        // autofocus name field when modal shown
        setTimeout(() => { if (inp) inp.focus(); }, 500);
      } catch (e) {
        console.error('Unable to open Add Group modal on startup:', e);
      }
    }, 250);
  }

  // Ask the browser to keep our localStorage even when disk space runs low
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }

  setupUpdateCheck();

  // Ensure UI is rendered in either case
  // (ui.js already calls renderAllForCurrent() initially; call it here to be safe)
  try { renderAllForCurrent(); } catch (e) { console.warn(e); }
});

/* Update check: GitHub Pages and phone browsers cache files for a while, so a
   phone can keep showing an old version. We fetch index.html bypassing the
   cache and compare its app-version with the one that is running. */
function setupUpdateCheck() {
  const meta = document.querySelector('meta[name="app-version"]');
  const current = meta ? meta.content : '';
  const bar = document.getElementById('updateBar');
  const lbl = document.getElementById('lblAppVersion');
  if (lbl) lbl.textContent = current ? 'Version ' + current : '';

  async function check(manual) {
    if (location.protocol === 'file:') { if (manual) alert('Update check works only when the app is opened from a website.'); return; }
    try {
      const res = await fetch(location.pathname + '?_=' + Date.now(), { cache: 'no-store' });
      const html = await res.text();
      const m = html.match(/<meta name="app-version" content="([^"]+)"/);
      if (m && m[1] !== current) bar.classList.remove('d-none');
      else if (manual) alert('You are on the latest version' + (current ? ' (' + current + ')' : '') + '.');
    } catch (e) {
      if (manual) alert('Could not check for updates. Are you online?');
    }
  }

  document.getElementById('btnReloadApp').addEventListener('click', () => {
    // load the page again with a fresh URL so the browser fetches new files
    const url = new URL(location.href);
    url.searchParams.set('v', Date.now());
    location.replace(url.toString());
  });
  const btnCheck = document.getElementById('btnCheckUpdate');
  if (btnCheck) btnCheck.addEventListener('click', () => check(true));

  check(false);
  // phones often keep the tab open for days: check again when the app comes back
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(false); });
}
