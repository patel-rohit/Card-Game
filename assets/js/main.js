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
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        // autofocus name field when modal shown
        setTimeout(() => { if (inp) inp.focus(); }, 500);
      } catch (e) {
        console.error('Unable to open Add Group modal on startup:', e);
      }
    }, 250);
  }

  // Ensure UI is rendered in either case
  // (ui.js already calls renderAllForCurrent() initially; call it here to be safe)
  try { renderAllForCurrent(); } catch (e) { console.warn(e); }
});
